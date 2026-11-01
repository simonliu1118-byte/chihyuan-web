import {requireModuleAccess} from "../auth/guard";
import {identityClient,type IdentityRuntimeEnv} from "./auth-routes";
import {success,failure} from "./response";
import {AuditService} from "../audit/audit-service";
import {activeInMonth,monthlyKey,shiftMonth,taipeiDate,setMonthlyEnabled,type MonthlyStore,type MonthlyItem,type MonthlySettings,type MonthlyRow,type MonthlyCell} from "../../shared/store-monthly";
import {ensureMonthlyRows,loadMonthlySettings,monthlyGuard,monthlyMaterialization,firstMonthlyMonth} from "../store/monthly-service";

const ROOT="/api/business/store/monthly";
class Invalid extends Error{constructor(message:string,public status=422,public code="MONTHLY_INVALID"){super(message)}}
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=="object"||Array.isArray(v))throw new Invalid("請提供有效資料");return v as Record<string,unknown>};
const nameOf=(v:unknown)=>{if(typeof v!=="string"||!v.trim()||[...v.trim()].length>60)throw new Invalid("名稱必填，最多60字");return v.trim()};
const versionOf=(v:unknown)=>{if(!Number.isSafeInteger(v)||Number(v)<0)throw new Invalid("版本不正確");return Number(v)};
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const query=async<T>(db:D1Database,sql:string,...v:unknown[])=>((await db.prepare(sql).bind(...v).all<T>()).results??[]);
function changedList(raw:unknown,c:MonthlySettings,kind:"stores"|"items",month:string):MonthlyStore[]|MonthlyItem[]{
 if(!Array.isArray(raw))throw new Invalid("設定清單不正確");
 const old=c[kind],seen=new Set<string>(),names=new Set<string>();
 const result=raw.map(value=>{
  const v=object(value);if(typeof v.enabled!=="boolean")throw new Invalid("啟用狀態不正確");
  const name=nameOf(v.name),normalized=name.toLocaleLowerCase();if(names.has(normalized))throw new Invalid("名稱不可重複");names.add(normalized);
  let id:string,prior:MonthlyStore|MonthlyItem|undefined;
  if(v.id!==undefined){if(typeof v.id!=="string"||!uuid.test(v.id)||seen.has(v.id))throw new Invalid("設定識別不正確");id=v.id;prior=old.find(x=>x.id===id);if(!prior)throw new Invalid("設定已變更，請重新載入",409)}else id=crypto.randomUUID();
  seen.add(id);const row:MonthlyStore={id,name,periods:setMonthlyEnabled(prior?.periods??[],v.enabled,month)};
  if(kind==="stores")return row;
  if(!Array.isArray(v.storeIds)||v.storeIds.some(x=>typeof x!=="string"||!c.stores.some(s=>s.id===x))||new Set(v.storeIds).size!==v.storeIds.length)throw new Invalid("適用門市不正確");
  const previous=(prior as MonthlyItem|undefined)?.stores??{},stores:Record<string,ReturnType<typeof setMonthlyEnabled>>={};
  for(const s of c.stores)stores[s.id]=setMonthlyEnabled(previous[s.id]??[],v.storeIds.includes(s.id),month);
  return {...row,stores};
 });
 if(old.some(x=>!seen.has(x.id)))throw new Invalid("既有設定請使用停用，不能刪除歷史");return result;
}
async function requestBody(req:Request){
 // Bounded transport size, not an item-count restriction. Read incrementally before buffering.
 const reader=req.body?.getReader();if(!reader)throw new Invalid("請提供有效資料");const chunks:Uint8Array[]=[];let size=0;
 for(;;){const r=await reader.read();if(r.done)break;size+=r.value.byteLength;if(size>1024*1024){await reader.cancel();throw new Invalid("設定資料過大",413)}chunks.push(r.value)}
 const data=new Uint8Array(size);let offset=0;for(const c of chunks){data.set(c,offset);offset+=c.length}
 try{return object(JSON.parse(new TextDecoder().decode(data)))}catch(e){if(e instanceof Invalid)throw e;throw new Invalid("請提供有效JSON資料")}
}
async function requestHash(path:string,v:Record<string,unknown>){const bytes=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify({path,data:v})));return [...new Uint8Array(bytes)].map(x=>x.toString(16).padStart(2,"0")).join("")}
type RowRecord={id:string;month:string;store_id:string;store_name:string};
type CellRecord={row_id:string;item_id:string;version:number;completed:number;completion_date:string|null};
const cellJson=(c:CellRecord):MonthlyCell=>({itemId:c.item_id,version:c.version,completed:!!c.completed,completionDate:c.completion_date});

export async function handleStoreMonthlyRoute(request:Request,env:IdentityRuntimeEnv,requestId:string,at=new Date().toISOString()):Promise<Response|null>{
 const url=new URL(request.url);if(url.pathname!==ROOT&&!url.pathname.startsWith(ROOT+"/"))return null;
 const provider=identityClient(env);if(!provider)return failure({code:"IDENTITY_UNAVAILABLE",message:"身分服務無法使用"},requestId,503);
 const gate=await requireModuleAccess(provider,env.DB,request,"STORE_MONTHLY_TODOS");if(!gate.ok)return failure({code:gate.code,message:"沒有月度待辦存取權"},requestId,gate.status);
 const db=env.DB,actor=gate.member.id,month=monthlyKey(at),canManage=gate.principal.workspaceRole==="ADMIN"||gate.principal.workspaceRole==="SUPER_ADMIN",path=url.pathname.slice(ROOT.length),method=request.method;
 try{
  // Server-side role check precedes body parsing and every setting mutation.
  if(path.startsWith("/settings")&&method!=="GET"&&!canManage)throw new Invalid("只有管理員以上可以設定門市與項目",403,"ACCESS_DENIED");
  await ensureMonthlyRows(db,at);
  const c=await loadMonthlySettings(db);
  if(method==="GET"&&(path===""||path==="/")){
   const before=url.searchParams.get("before")??month;if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(before)||before>month||before<"0001-01")throw new Invalid("查詢年月不正確");
   const from=shiftMonth(before,-11),records=await query<RowRecord>(db,"SELECT * FROM store_monthly_rows WHERE month BETWEEN ? AND ? ORDER BY month DESC,store_order,store_id",from,before);
   const cells=await query<CellRecord>(db,"SELECT x.* FROM store_monthly_cells x JOIN store_monthly_rows r ON r.id=x.row_id WHERE r.month BETWEEN ? AND ?",from,before);
   const byRow=new Map<string,MonthlyCell[]>();for(const cell of cells){const list=byRow.get(cell.row_id)??[];list.push(cellJson(cell));byRow.set(cell.row_id,list)}
   const rows:MonthlyRow[]=records.map(r=>({id:r.id,month:r.month,storeId:r.store_id,storeName:r.store_name,cells:byRow.get(r.id)??[]}));
   return success({settings:c,rows,nextBefore:c.firstMonth&&from>c.firstMonth?shiftMonth(from,-1):null,canManage,currentMonth:month},requestId);
  }
  const history=/^\/rows\/([^/]+)\/history$/.exec(path);
  if(history&&method==="GET"){
   const rowId=decodeURIComponent(history[1]);if(!await db.prepare("SELECT id FROM store_monthly_rows WHERE id=?").bind(rowId).first())throw new Invalid("月份門市資料不存在",404);
   const cursor=Number(url.searchParams.get("cursor")??0);if(!Number.isSafeInteger(cursor)||cursor<0)throw new Invalid("紀錄游標不正確");
   const events=await query<{id:number;actor_name:string;at:string;kind:string;before_json:string;after_json:string}>(db,"SELECT e.*,m.display_name actor_name FROM store_monthly_events e JOIN app_members m ON m.id=e.actor WHERE row_id=? AND (?=0 OR e.id<?) ORDER BY e.id DESC LIMIT 21",rowId,cursor,cursor);
   return success({rows:events.slice(0,20).map(e=>({id:e.id,actorName:e.actor_name,at:e.at,kind:e.kind,reason:"",before:JSON.parse(e.before_json),after:JSON.parse(e.after_json)})),nextCursor:events.length>20?events[19].id:null},requestId);
  }
  const settings=/^\/settings\/(stores|items)$/.exec(path),cellMatch=/^\/rows\/([^/]+)\/cells\/([^/]+)$/.exec(path);
  if(!(settings&&method==="POST"||cellMatch&&method==="PATCH"))throw new Invalid("找不到月度待辦操作",404);
  const v=await requestBody(request),key=v.requestKey;if(typeof key!=="string"||!uuid.test(key))throw new Invalid("操作識別不正確");
  const hash=await requestHash(path,v),duplicate=await db.prepare("SELECT request_hash FROM store_monthly_events WHERE actor=? AND request_key=?").bind(actor,key).first<{request_hash:string}>();
  if(duplicate){if(duplicate.request_hash!==hash)throw new Invalid("同一操作識別不能重複用於不同內容",409);return success({replayed:true},requestId)}
  const expected=versionOf(v.expectedVersion),audit=new AuditService(db);
  const event=(rowId:string|null,itemId:string|null,kind:string,before:unknown,after:unknown)=>db.prepare("INSERT INTO store_monthly_events(row_id,item_id,actor,at,kind,before_json,after_json,request_key,request_hash) VALUES(?,?,?,?,?,?,?,?,?)").bind(rowId,itemId,actor,at,kind,JSON.stringify(before),JSON.stringify(after),key,hash);
  if(settings){
   if(expected!==c.version)throw new Invalid("設定已被其他人修改，請重新載入",409,"MONTHLY_VERSION_CONFLICT");
   const kind=settings[1] as "stores"|"items",next:MonthlySettings={...c,version:c.version+1};
   if(kind==="stores")next.stores=changedList(v.rows,c,kind,month) as MonthlyStore[];else next.items=changedList(v.rows,c,kind,month) as MonthlyItem[];
   next.firstMonth=firstMonthlyMonth(next,month);next.generatedThrough=next.firstMonth?month:null;
   const stores=JSON.stringify(next.stores),items=JSON.stringify(next.items);if(new TextEncoder().encode(stores+items).byteLength>800_000)throw new Invalid("設定資料過大",413);
   await db.batch([monthlyGuard(db,expected),db.prepare("INSERT INTO store_monthly_settings(id,version,first_month,generated_through,stores_json,items_json,updated_at,updated_by) VALUES(1,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET version=excluded.version,first_month=excluded.first_month,generated_through=excluded.generated_through,stores_json=excluded.stores_json,items_json=excluded.items_json,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(next.version,next.firstMonth,next.generatedThrough,stores,items,at,actor),
    ...monthlyMaterialization(db,[month],at),
    db.prepare("UPDATE store_monthly_rows SET store_name=COALESCE((SELECT json_extract(value,'$.name') FROM json_each(?) WHERE json_extract(value,'$.id')=store_id),store_name),store_order=COALESCE((SELECT CAST(key AS INTEGER) FROM json_each(?) WHERE json_extract(value,'$.id')=store_id),store_order) WHERE month=?").bind(stores,stores,month),
    event(null,null,kind==="stores"?"設定門市":"設定項目",{[kind]:c[kind]},{[kind]:next[kind]}),
    audit.prepareRecord({entityType:"store_monthly_settings",entityKey:"1",action:"store_monthly.settings_updated",actorEmployeeId:actor,occurredAt:at,requestId,metadata:{kind,fromVersion:c.version,toVersion:next.version,requestKey:key}})]);
   return success({version:next.version},requestId);
  }
  const rowId=decodeURIComponent(cellMatch![1]),itemId=decodeURIComponent(cellMatch![2]);
  const cell=await db.prepare("SELECT * FROM store_monthly_cells WHERE row_id=? AND item_id=?").bind(rowId,itemId).first<CellRecord>();if(!cell)throw new Invalid("此月份門市不適用這個項目",404);
  if(expected!==cell.version)throw new Invalid("此待辦已被其他人修改，請重新載入",409,"MONTHLY_VERSION_CONFLICT");
  if(typeof v.completed!=="boolean")throw new Invalid("辦理狀態不正確");let date:string|null=null;
  if(v.completionDate!==null){if(typeof v.completionDate!=="string"||!/^\d{4}-\d{2}-\d{2}$/.test(v.completionDate)||v.completionDate<"0001-01-01")throw new Invalid("日期不正確");const d=new Date(v.completionDate+"T00:00:00Z");if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v.completionDate||v.completionDate>taipeiDate(at))throw new Invalid("請選擇有效日期，不可晚於今天");date=v.completionDate}
  if(!v.completed&&date!==null)throw new Invalid("取消完成不能保留日期");
  const before={itemName:c.items.find(i=>i.id===itemId)?.name??itemId,completed:!!cell.completed,completionDate:cell.completion_date},after={...before,completed:v.completed,completionDate:date};
  if(before.completed===after.completed&&before.completionDate===after.completionDate)return success({unchanged:true},requestId);
  await db.batch([db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM store_monthly_cells WHERE row_id=? AND item_id=? AND version=?) THEN 1 ELSE json('') END").bind(rowId,itemId,expected),
   db.prepare("UPDATE store_monthly_cells SET completed=?,completion_date=?,version=version+1,updated_at=?,updated_by=? WHERE row_id=? AND item_id=?").bind(v.completed?1:0,date,at,actor,rowId,itemId),
   event(rowId,itemId,!v.completed?"取消完成":cell.completed?"修改辦理日期":"確認辦理",before,after),
   audit.prepareRecord({entityType:"store_monthly_row",entityKey:rowId,action:"store_monthly.cell_updated",actorEmployeeId:actor,occurredAt:at,requestId,before,after,metadata:{itemId,requestKey:key}})]);
  return success({version:cell.version+1},requestId);
 }catch(e){
  if(e instanceof Invalid)return failure({code:e.code,message:e.message},requestId,e.status);
  if(/malformed JSON|UNIQUE constraint|MONTHLY_GENERATION_CONFLICT/.test(String(e)))return failure({code:"MONTHLY_VERSION_CONFLICT",message:"資料已變更或操作已送出，請重新載入"},requestId,409);
  console.error(JSON.stringify({event:"store_monthly.failed",requestId}));return failure({code:"MONTHLY_UNAVAILABLE",message:"月度待辦操作失敗"},requestId,500);
 }
}
