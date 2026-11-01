import {activeInMonth,monthlyKey,shiftMonth,type MonthlySettings} from "../../shared/store-monthly";
export type SettingsRecord={version:number;first_month:string|null;generated_through:string|null;stores_json:string;items_json:string};
export async function loadMonthlySettings(db:D1Database):Promise<MonthlySettings>{
 const r=await db.prepare("SELECT * FROM store_monthly_settings WHERE id=1").first<SettingsRecord>();
 return r?{version:r.version,firstMonth:r.first_month,generatedThrough:r.generated_through,stores:JSON.parse(r.stores_json),items:JSON.parse(r.items_json)}:{version:0,firstMonth:null,generatedThrough:null,stores:[],items:[]};
}
export function monthlyGuard(db:D1Database,version:number){return db.prepare("SELECT CASE WHEN COALESCE((SELECT version FROM store_monthly_settings WHERE id=1),0)=? THEN 1 ELSE json('') END").bind(version)}
// Bulk JSON joins avoid a parameter per store/item and an application-level item-count ceiling.
const active=(value:string,month:string)=>`EXISTS(SELECT 1 FROM json_each(${value}) p WHERE json_extract(p.value,'$.from')<=${month} AND (json_extract(p.value,'$.until') IS NULL OR json_extract(p.value,'$.until')>${month}))`;
export function monthlyMaterialization(db:D1Database,months:string[],now:string){
 const json=JSON.stringify(months);
 return [db.prepare(`INSERT OR IGNORE INTO store_monthly_rows(id,month,store_id,store_name,store_order,created_at)
 SELECT m.value||':'||json_extract(s.value,'$.id'),m.value,json_extract(s.value,'$.id'),json_extract(s.value,'$.name'),CAST(s.key AS INTEGER),?
 FROM store_monthly_settings c,json_each(c.stores_json) s,json_each(?) m WHERE c.id=1 AND ${active("json_extract(s.value,'$.periods')","m.value")}`).bind(now,json),
 db.prepare(`INSERT OR IGNORE INTO store_monthly_cells(row_id,item_id,version,completed,completion_date,updated_at)
 SELECT r.id,json_extract(i.value,'$.id'),1,0,NULL,? FROM store_monthly_rows r,store_monthly_settings c,json_each(c.items_json) i
 WHERE c.id=1 AND r.month IN(SELECT value FROM json_each(?)) AND ${active("json_extract(i.value,'$.periods')","r.month")}
 AND ${active("json_extract(i.value,'$.stores.\"'||r.store_id||'\"')","r.month")}`).bind(now,json)];
}
/** Daily cron and page fallback share an idempotent, version-guarded materializer. */
export async function ensureMonthlyRows(db:D1Database,at=new Date().toISOString()):Promise<void>{
 const month=monthlyKey(at);
 for(let retry=0;retry<3;retry++){
  const c=await loadMonthlySettings(db);if(!c.firstMonth||c.generatedThrough&&c.generatedThrough>=month)return;
  const months:string[]=[];for(let m=c.generatedThrough?shiftMonth(c.generatedThrough,1):c.firstMonth;m<=month;m=shiftMonth(m,1))months.push(m);
  try{await db.batch([monthlyGuard(db,c.version),db.prepare("SELECT CASE WHEN COALESCE((SELECT generated_through FROM store_monthly_settings WHERE id=1),'')=? THEN 1 ELSE json('') END").bind(c.generatedThrough??""),...monthlyMaterialization(db,months,at),db.prepare("UPDATE store_monthly_settings SET generated_through=? WHERE id=1").bind(month)]);return}
  catch(e){if(!String(e).includes("malformed JSON"))throw e}
 }
 throw new Error("MONTHLY_GENERATION_CONFLICT");
}
export function firstMonthlyMonth(c:MonthlySettings,month:string){return c.firstMonth??(c.stores.some(s=>activeInMonth(s.periods,month))?month:null)}
