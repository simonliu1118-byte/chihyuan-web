import {requireModuleAccess} from '../auth/guard';
import {identityClient,type IdentityRuntimeEnv} from './auth-routes';
import {success,failure} from './response';
import {AuditService} from '../audit/audit-service';
import {validStoreRequestKey} from '../store/workflow-service';
import {changedFields} from '../../shared/store-history';
import {maintenanceWindow,type MaintenanceMatrixCustomer} from '../../shared/maintenance-matrix';
import {EQUIPMENT_LIMITS as L,equipmentCustomerCode,equipmentSnapshot,validEquipmentDate,validEquipmentMonth,type EquipmentFields,type EquipmentRecord,type MaintenanceVisit} from '../../shared/store-equipment';
const ROOT='/api/business/store/equipment';
class Invalid extends Error{constructor(message:string,public status=422,public code='EQUIPMENT_INVALID'){super(message)}}
type Context={db:D1Database;actor:number;at:string;requestId:string};
type RecordRow={id:number;list_sequence:number;customer_code:string;customer_name:string;brand:string;model:string;sale_date:string;quantity:number;warranty_start:string;warranty_end:string;machines_json:string;maintenance:number;version:number;created_at:string;updated_at:string;months_json:string};
type VisitRow={id:number;customer_code:string;customer_name:string;planned_month:string;completed:number;completion_date:string|null;note:string;version:number;equipment_json:string};
const all=async<T>(db:D1Database,sql:string,...v:unknown[])=>((await db.prepare(sql).bind(...v).all<T>()).results??[]);
const one=async<T>(db:D1Database,sql:string,...v:unknown[])=>db.prepare(sql).bind(...v).first<T>();
const today=(at:string)=>new Date(Date.parse(at)+8*3600000).toISOString().slice(0,10);
const text=(v:unknown,label:string,max:number,required=false)=>{if(v===null||v===undefined)v='';if(typeof v!=='string'||[...v.trim()].length>max)throw new Invalid(label+'不正確');const s=v.trim();if(required&&!s)throw new Invalid(label+'必填');return s};
const object=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=='object'||Array.isArray(v))throw new Invalid('資料格式不正確');return v as Record<string,unknown>};
async function body(r:Request){const reader=r.body?.getReader();if(!reader)throw new Invalid('請提供資料');const chunks:Uint8Array[]=[];let size=0;for(;;){const p=await reader.read();if(p.done)break;size+=p.value.byteLength;if(size>1024*1024){await reader.cancel();throw new Invalid('資料過大',413)}chunks.push(p.value)}const bytes=new Uint8Array(size);let n=0;for(const c of chunks){bytes.set(c,n);n+=c.length}try{return object(JSON.parse(new TextDecoder().decode(bytes)))}catch(e){if(e instanceof Invalid)throw e;throw new Invalid('請提供有效 JSON')}}
const newId=()=>Number.parseInt(crypto.randomUUID().replaceAll('-','').slice(0,13),16);
const expected=(v:Record<string,unknown>)=>{if(!Number.isSafeInteger(v.expectedVersion)||Number(v.expectedVersion)<1)throw new Invalid('版本不正確');return Number(v.expectedVersion)};
const keyOf=(v:Record<string,unknown>)=>{if(!validStoreRequestKey(v.requestKey))throw new Invalid('操作識別不正確');return v.requestKey};
async function hash(path:string,v:Record<string,unknown>){const b=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(JSON.stringify({path,v})));return [...new Uint8Array(b)].map(x=>x.toString(16).padStart(2,'0')).join('')}
function fields(v:Record<string,unknown>,at:string):EquipmentFields{
 const customerCode=equipmentCustomerCode(text(v.customerCode,'客戶編號',L.customerCode)),customerName=text(v.customerName,'客戶名稱',L.customerName,true);
 if([...customerCode].length>L.customerCode)throw new Invalid('客戶編號過長');
 const saleDate=text(v.saleDate,'銷售日期',10,true),warrantyStart=text(v.warrantyStart,'保固起日',10),warrantyEnd=text(v.warrantyEnd,'保固迄日',10);
 if(!validEquipmentDate(saleDate)||saleDate>today(at))throw new Invalid('銷售日期不正確或晚於今天');
 if((warrantyStart&&!validEquipmentDate(warrantyStart))||(warrantyEnd&&!validEquipmentDate(warrantyEnd))||!!warrantyStart!==!!warrantyEnd||(warrantyStart&&warrantyEnd<warrantyStart))throw new Invalid('保固起訖日期不正確');
 if(warrantyStart&&(Number(warrantyEnd.slice(0,4))-Number(warrantyStart.slice(0,4)))*12+Number(warrantyEnd.slice(5,7))-Number(warrantyStart.slice(5,7))>L.months)throw new Invalid('保固期間最多50年');
 if(!Number.isSafeInteger(v.quantity)||Number(v.quantity)<1||Number(v.quantity)>L.quantity)throw new Invalid('數量不正確');const quantity=Number(v.quantity);
 if(!Array.isArray(v.machines)||v.machines.length!==quantity)throw new Invalid('機身資料筆數必須與數量相同');
 const serials=new Set<string>(),machines=v.machines.map(raw=>{const m=object(raw),serialNo=text(m.serialNo,'機身序號',L.serialNo),manufacturedMonth=text(m.manufacturedMonth,'製造年月',7);if(manufacturedMonth&&(!validEquipmentMonth(manufacturedMonth)||manufacturedMonth>today(at).slice(0,7)))throw new Invalid('製造年月不正確');if(serialNo&&serials.has(serialNo.toUpperCase()))throw new Invalid('同筆出機的機身序號不可重複');if(serialNo)serials.add(serialNo.toUpperCase());return {serialNo,manufacturedMonth}});
 if(typeof v.maintenance!=='boolean')throw new Invalid('定期維護設定不正確');
 if(v.maintenance&&!customerCode)throw new Invalid('請先填寫客戶編號，才能啟用定期維護');
 if(!Array.isArray(v.months)||v.months.length>L.months||v.months.some(m=>typeof m!=='string'||!validEquipmentMonth(m))||new Set(v.months).size!==v.months.length)throw new Invalid('預計維護年月不正確');
 const months=(v.months as string[]).slice().sort();
 if(!v.maintenance&&months.length)throw new Invalid('不需維護時不能保留預計月份');
 if(v.maintenance&&(!warrantyStart||!warrantyEnd||!months.length))throw new Invalid('啟用維護請填寫保固起訖並選擇預計月份');
 if(months.some(m=>m<warrantyStart.slice(0,7)||m>warrantyEnd.slice(0,7)))throw new Invalid('預計維護月份須在保固期間內');
 return {customerCode,customerName,brand:text(v.brand,'品牌',L.brand),model:text(v.model,'機型',L.model),saleDate,quantity,warrantyStart,warrantyEnd,machines,maintenance:v.maintenance,months};
}
const recordSelect="SELECT r.*,(SELECT json_group_array(v.planned_month) FROM store_equipment_plans p JOIN store_maintenance_visits v ON v.id=p.visit_id WHERE p.equipment_id=r.id AND p.active=1) months_json FROM store_equipment_records r";
// Machine arrays can be large. Fetch them only for one expanded/edited dispatch.
const recordListSelect=recordSelect.replace('r.*',"r.id,r.list_sequence,r.customer_code,r.customer_name,r.brand,r.model,r.sale_date,r.quantity,r.warranty_start,r.warranty_end,r.maintenance,r.version,r.created_at,r.updated_at,'[]' machines_json");
const visitSelect="SELECT v.*,(SELECT json_group_array(json(p.snapshot_json)) FROM store_equipment_plans p WHERE p.visit_id=v.id AND (p.active=1 OR p.retained=1)) equipment_json FROM store_maintenance_visits v";
const recordJson=(r:RecordRow):EquipmentRecord=>({id:r.id,sequence:r.list_sequence,customerCode:r.customer_code,customerName:r.customer_name,brand:r.brand,model:r.model,saleDate:r.sale_date,quantity:r.quantity,warrantyStart:r.warranty_start,warrantyEnd:r.warranty_end,machines:JSON.parse(r.machines_json),maintenance:!!r.maintenance,months:JSON.parse(r.months_json).sort(),version:r.version,createdAt:r.created_at,updatedAt:r.updated_at});
const visitJson=(r:VisitRow):MaintenanceVisit=>({id:r.id,customerCode:r.customer_code,customerName:r.customer_name,month:r.planned_month,completed:!!r.completed,completionDate:r.completion_date,note:r.note,version:r.version,equipment:JSON.parse(r.equipment_json)});
async function getRecord(c:Context,id:number){const r=await one<RecordRow>(c.db,recordSelect+' WHERE r.id=?',id);if(!r)throw new Invalid('出機紀錄不存在',404);return recordJson(r)}
async function getVisit(c:Context,id:number){const r=await one<VisitRow>(c.db,visitSelect+' WHERE v.id=?',id);if(!r)throw new Invalid('維護排程不存在',404);return visitJson(r)}
async function revision(c:Context){return (await one<{version:number}>(c.db,'SELECT version FROM store_equipment_state WHERE id=1'))?.version??0}
function guards(c:Context,version:number){return [c.db.prepare("SELECT CASE WHEN COALESCE((SELECT version FROM store_equipment_state WHERE id=1),0)=? THEN 1 ELSE json('') END").bind(version),c.db.prepare('INSERT INTO store_equipment_state(id,version) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=version+1')]}
function event(c:Context,type:'equipment'|'visit',id:number,k:string,digest:string,kind:string,before:Record<string,unknown>,after:Record<string,unknown>){return c.db.prepare('INSERT INTO store_equipment_events(equipment_id,visit_id,actor,at,kind,before_json,after_json,request_key,request_hash) VALUES(?,?,?,?,?,?,?,?,?)').bind(type==='equipment'?id:null,type==='visit'?id:null,c.actor,c.at,kind,JSON.stringify(before),JSON.stringify(after),k,digest)}
function audit(c:Context,type:'equipment'|'visit',id:number,action:string,before:Record<string,unknown>,after:Record<string,unknown>){return new AuditService(c.db).prepareRecord({entityType:type==='equipment'?'store_equipment':'store_maintenance',entityKey:String(id),action:(type==='equipment'?'store_equipment':'store_maintenance')+'.'+action,actorEmployeeId:c.actor,occurredAt:c.at,requestId:c.requestId,before,after})}
function summarize(r:EquipmentFields){return {customerCode:r.customerCode,customerName:r.customerName,brand:r.brand,model:r.model,saleDate:r.saleDate,quantity:r.quantity,warrantyStart:r.warrantyStart,warrantyEnd:r.warrantyEnd,maintenance:r.maintenance,months:r.months.join('、'),machines:r.machines.map((m,i)=>(i+1)+':'+m.serialNo+'/'+m.manufacturedMonth).join('；')}}
/** A single guarded batch updates the record, aggregate memberships, history and audit. */
function planWrites(c:Context,r:EquipmentRecord){
 const months=JSON.stringify(r.months),targets=JSON.stringify(r.months.map(month=>({month,id:newId()}))),snapshot=JSON.stringify(equipmentSnapshot(r));
 return [
  // A completed visit cannot silently acquire a newly added dispatch. Undo completion first.
  c.db.prepare("SELECT CASE WHEN NOT EXISTS(SELECT 1 FROM store_maintenance_visits v JOIN json_each(?) m ON m.value=v.planned_month WHERE v.customer_code=? AND v.completed=1 AND NOT EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=v.id AND p.equipment_id=? AND p.active=1)) THEN 1 ELSE json('') END").bind(months,r.customerCode,r.id),
  c.db.prepare("UPDATE store_equipment_plans SET active=0 WHERE equipment_id=? AND visit_id NOT IN(SELECT id FROM store_maintenance_visits WHERE customer_code=? AND planned_month IN(SELECT value FROM json_each(?)))").bind(r.id,r.customerCode,months),
  c.db.prepare("INSERT INTO store_maintenance_visits(id,customer_code,customer_name,planned_month,created_at,created_by,updated_at,updated_by) SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.month'),?,?,?,? FROM json_each(?) WHERE 1 ON CONFLICT(customer_code,planned_month) DO NOTHING").bind(r.customerCode,r.customerName,c.at,c.actor,c.at,c.actor,targets),
  c.db.prepare("UPDATE store_maintenance_visits SET customer_name=CASE WHEN customer_code=? THEN ? ELSE customer_name END,version=version+1,updated_at=?,updated_by=? WHERE completed=0 AND (id IN(SELECT visit_id FROM store_equipment_plans WHERE equipment_id=?) OR (customer_code=? AND planned_month IN(SELECT value FROM json_each(?))))").bind(r.customerCode,r.customerName,c.at,c.actor,r.id,r.customerCode,months),
  c.db.prepare("INSERT INTO store_equipment_plans(equipment_id,visit_id,active,snapshot_json) SELECT ?,v.id,1,json_set(?,'$.sequence',(SELECT list_sequence FROM store_equipment_records WHERE id=?)) FROM store_maintenance_visits v JOIN json_each(?) m ON m.value=v.planned_month WHERE v.customer_code=? ON CONFLICT(equipment_id,visit_id) DO UPDATE SET active=1,snapshot_json=CASE WHEN (SELECT completed FROM store_maintenance_visits WHERE id=excluded.visit_id)=1 THEN store_equipment_plans.snapshot_json ELSE excluded.snapshot_json END").bind(r.id,snapshot,r.id,months,r.customerCode)
 ];
}
export async function handleStoreEquipmentRoute(req:Request,env:IdentityRuntimeEnv,requestId:string,at=new Date().toISOString()):Promise<Response|null>{
 const u=new URL(req.url);if(u.pathname!==ROOT&&!u.pathname.startsWith(ROOT+'/'))return null;
 const provider=identityClient(env);if(!provider)return failure({code:'IDENTITY_UNAVAILABLE',message:'身分服務無法使用'},requestId,503);
 const gate=await requireModuleAccess(provider,env.DB,req,'STORE_REPAIRS');if(!gate.ok)return failure({code:gate.code,message:'沒有售後維修存取權'},requestId,gate.status);
 const c:Context={db:env.DB,actor:gate.member.id,at,requestId},path=u.pathname.slice(ROOT.length),method=req.method;
 try{
  if(method==='GET'&&(path===''||path==='/')){
   const before=u.searchParams.get('before')??String(Number.MAX_SAFE_INTEGER);if(!/^\d+$/.test(before)||!Number.isSafeInteger(Number(before)))throw new Invalid('分頁不正確');
   const q=(u.searchParams.get('q')??'').trim().slice(0,80),like='%'+q.replace(/[\\%_]/g,x=>'\\'+x)+'%';
   const list=await all<RecordRow>(c.db,recordListSelect+" WHERE r.list_sequence<? AND (?='' OR r.customer_code LIKE ? ESCAPE '\\' OR r.customer_name LIKE ? ESCAPE '\\' OR r.brand LIKE ? ESCAPE '\\' OR r.model LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM json_each(r.machines_json) m WHERE json_extract(m.value,'$.serialNo') LIKE ? ESCAPE '\\')) ORDER BY r.list_sequence DESC LIMIT 101",Number(before),q,like,like,like,like,like);
   return success({rows:list.slice(0,100).map(recordJson),nextBefore:list.length>100?list[99].list_sequence:null},requestId);
  }
  if(method==='GET'&&path==='/matrix'){
   const rawYear=u.searchParams.get('year')??today(at).slice(0,4),year=Number(rawYear);
   if(!/^\d{4}$/.test(rawYear)||year<2||year>9998)throw new Invalid('維護年度不正確');
   const window=maintenanceWindow(year),before=u.searchParams.get('before')??'',q=(u.searchParams.get('q')??'').trim().slice(0,80),like='%'+q.replace(/[\\%_]/g,x=>'\\'+x)+'%',open=u.searchParams.get('open')==='1';
   if([...before].length>L.customerCode)throw new Invalid('分頁不正確');
   const relevant="(v.completed=1 OR EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=v.id AND p.active=1))";
   const candidates=await all<{customer_code:string;customer_name:string;active:number;equipment_json:string}>(c.db,`WITH candidates AS (
    SELECT customer_code FROM store_equipment_records WHERE maintenance=1
    UNION SELECT v.customer_code FROM store_maintenance_visits v WHERE ${relevant} AND v.planned_month BETWEEN ? AND ?
    UNION SELECT v.customer_code FROM store_maintenance_visits v WHERE v.completed=1 AND v.completion_date BETWEEN ? AND ?
   ),named AS (SELECT customer_code,COALESCE((SELECT customer_name FROM store_equipment_records r WHERE r.customer_code=candidates.customer_code ORDER BY updated_at DESC,id DESC LIMIT 1),(SELECT customer_name FROM store_maintenance_visits v WHERE v.customer_code=candidates.customer_code ORDER BY updated_at DESC,id DESC LIMIT 1),'') customer_name FROM candidates)
   SELECT n.*,EXISTS(SELECT 1 FROM store_equipment_records r WHERE r.customer_code=n.customer_code AND r.maintenance=1) active,
    (SELECT json_group_array(json_object('id',r.id,'sequence',r.list_sequence,'brand',r.brand,'model',r.model,'quantity',r.quantity,'saleDate',r.sale_date)) FROM store_equipment_records r WHERE r.customer_code=n.customer_code AND r.maintenance=1) equipment_json
   FROM named n WHERE n.customer_code>? AND (?='' OR n.customer_code LIKE ? ESCAPE '\\' OR n.customer_name LIKE ? ESCAPE '\\')
    AND (?=0 OR EXISTS(SELECT 1 FROM store_maintenance_visits v WHERE v.customer_code=n.customer_code AND v.completed=0 AND v.planned_month BETWEEN ? AND ? AND EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=v.id AND p.active=1)))
   ORDER BY n.customer_code LIMIT 51`,window.from,window.to,window.from+'-01',window.to+'-31',before,q,like,like,open?1:0,window.from,window.to);
   const selected=candidates.slice(0,50),codes=JSON.stringify(selected.map(r=>r.customer_code));
   // Two index ranges (planned and actual), rather than a full visit scan or one request per cell.
   const visits=await all<VisitRow>(c.db,`SELECT v.*,'[]' equipment_json FROM store_maintenance_visits v WHERE v.id IN(
    SELECT v.id FROM store_maintenance_visits v WHERE v.customer_code IN(SELECT value FROM json_each(?)) AND ${relevant} AND v.planned_month BETWEEN ? AND ?
    UNION SELECT v.id FROM store_maintenance_visits v WHERE v.customer_code IN(SELECT value FROM json_each(?)) AND v.completed=1 AND v.completion_date BETWEEN ? AND ?
   ) ORDER BY v.planned_month,v.id`,codes,window.from,window.to,codes,window.from+'-01',window.to+'-31');
   // Read retained source summaries once per customer page, not once per monthly cell.
   const retained=await all<{customer_code:string;snapshot_json:string}>(c.db,`SELECT DISTINCT v.customer_code,p.snapshot_json FROM store_equipment_plans p JOIN store_maintenance_visits v ON v.id=p.visit_id WHERE v.id IN(SELECT value FROM json_each(?)) AND p.retained=1`,JSON.stringify(visits.filter(v=>v.completed).map(v=>v.id)));
   const rows:MaintenanceMatrixCustomer[]=selected.map(r=>({customerCode:r.customer_code,customerName:r.customer_name,activeMaintenance:!!r.active,equipment:[...new Map([...retained.filter(p=>p.customer_code===r.customer_code).map(p=>JSON.parse(p.snapshot_json)),...JSON.parse(r.equipment_json)].map(e=>[e.id,e])).values()],visits:visits.filter(v=>v.customer_code===r.customer_code).map(visitJson)}));
   return success({rows,nextBefore:candidates.length>50?selected[49].customer_code:null,centerYear:year},requestId);
  }
  const customerHistory=/^\/customers\/([^/]+)\/history$/.exec(path);
  if(method==='GET'&&customerHistory){
   let code:string;try{code=equipmentCustomerCode(decodeURIComponent(customerHistory[1]))}catch{throw new Invalid('客戶編號不正確')}
   if(!code||[...code].length>L.customerCode)throw new Invalid('客戶編號不正確');
   const cursor=u.searchParams.get('cursor')??String(Number.MAX_SAFE_INTEGER);if(!/^\d+$/.test(cursor)||!Number.isSafeInteger(Number(cursor)))throw new Invalid('分頁不正確');
   const list=await all<{id:number;actor:number;actorName:string;at:string;kind:string;before_json:string;after_json:string;month:string;reason:string}>(c.db,`SELECT e.*,m.display_name actorName,v.planned_month month FROM store_equipment_events e JOIN app_members m ON m.id=e.actor JOIN store_maintenance_visits v ON v.id=e.visit_id WHERE v.customer_code=? AND e.id<? ORDER BY e.id DESC LIMIT 51`,code,Number(cursor));
   return success({rows:list.slice(0,50).map(e=>({id:e.id,actor:e.actor,actorName:e.actorName,at:e.at,kind:e.kind,before:JSON.parse(e.before_json),after:{...JSON.parse(e.after_json),plannedMonth:e.month},reason:e.reason})),nextCursor:list.length>50?list[49].id:null},requestId);
  }
  if(method==='GET'&&path==='/visits'){
   const year=u.searchParams.get('year')??'',before=u.searchParams.get('before')??'9999-12|9007199254740991',parts=before.split('|');
   if(year&&!/^[0-9]{4}$/.test(year)||parts.length!==2||!validEquipmentMonth(parts[0])||!/^\d+$/.test(parts[1])||!Number.isSafeInteger(Number(parts[1])))throw new Invalid('查詢年月或分頁不正確');
   const q=(u.searchParams.get('q')??'').trim().slice(0,80),like='%'+q.replace(/[\\%_]/g,x=>'\\'+x)+'%',open=u.searchParams.get('open')==='1';
   const list=await all<VisitRow>(c.db,visitSelect+" WHERE (v.completed=1 OR EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=v.id AND p.active=1)) AND (v.planned_month,v.id)<(?,?) AND v.planned_month BETWEEN ? AND ? AND (?=0 OR v.completed=0) AND (?='' OR v.customer_code LIKE ? ESCAPE '\\' OR v.customer_name LIKE ? ESCAPE '\\') ORDER BY v.planned_month DESC,v.id DESC LIMIT 101",parts[0],Number(parts[1]),year?year+'-01':'0001-01',year?year+'-12':'9999-12',open?1:0,q,like,like);
   return success({rows:list.slice(0,100).map(visitJson),nextBefore:list.length>100?list[99].planned_month+'|'+list[99].id:null},requestId);
  }
  const match=/^\/(visits\/)?([0-9]+)(\/history)?$/.exec(path);
  if(match&&(!Number.isSafeInteger(Number(match[2]))||Number(match[2])<1))throw new Invalid('紀錄不正確');
  if(method==='GET'&&match){
   const id=Number(match[2]),type=match[1]?'visit':'equipment';if(!Number.isSafeInteger(id)||id<1)throw new Invalid('紀錄不正確');
   if(!match[3])return success(type==='visit'?await getVisit(c,id):await getRecord(c,id),requestId);
   const cursor=u.searchParams.get('cursor')??String(Number.MAX_SAFE_INTEGER);if(!/^\d+$/.test(cursor)||!Number.isSafeInteger(Number(cursor)))throw new Invalid('分頁不正確');
   const column=type==='equipment'?'equipment_id':'visit_id';
   const list=await all<{id:number;actor:number;actorName:string;at:string;kind:string;before_json:string;after_json:string;reason:string}>(c.db,`SELECT e.*,m.display_name actorName FROM store_equipment_events e JOIN app_members m ON m.id=e.actor WHERE e.${column}=? AND e.id<? ORDER BY e.id DESC LIMIT 51`,id,Number(cursor));
   return success({rows:list.slice(0,50).map(e=>({id:e.id,actor:e.actor,actorName:e.actorName,at:e.at,kind:e.kind,before:JSON.parse(e.before_json),after:JSON.parse(e.after_json),reason:e.reason})),nextCursor:list.length>50?list[49].id:null},requestId);
  }
  if(!((method==='POST'&&(path===''||path==='/'))||(method==='PUT'&&match&&!match[3])))throw new Invalid('找不到出機或維護操作',404);
  const v=await body(req),k=keyOf(v),digest=await hash(path,v);
  const prior=await one<{equipment_id:number|null;visit_id:number|null;request_hash:string}>(c.db,'SELECT equipment_id,visit_id,request_hash FROM store_equipment_events WHERE actor=? AND request_key=?',c.actor,k);
  if(prior){if(prior.request_hash!==digest)throw new Invalid('操作識別已用於其他內容',409,'EQUIPMENT_CONFLICT');return success(prior.equipment_id?await getRecord(c,prior.equipment_id):await getVisit(c,prior.visit_id!),requestId)}
  const rev=await revision(c);
  if(match?.[1]){
   const id=Number(match[2]),old=await getVisit(c,id);if(old.version!==expected(v))throw new Invalid('維護資料已變更，請重新整理',409,'EQUIPMENT_CONFLICT');
   if(!old.completed&&!old.equipment.length)throw new Invalid('排程已取消，請重新整理',409);
   if(typeof v.completed!=='boolean')throw new Invalid('維護狀態不正確');
   const date=v.completionDate;if(date!==null&&(typeof date!=='string'||!validEquipmentDate(date)||date>today(at)))throw new Invalid('維護日期不正確或晚於今天');
   if(!v.completed&&date!==null)throw new Invalid('取消完成不能保留日期');
   if(v.completed&&date===null)throw new Invalid('請填寫實際維護日期，不支援無日期');
   const note=text(v.note,'備註',L.note);if(/[\r\n]/.test(note))throw new Invalid('備註請填寫單行');
   const before={completed:old.completed,completionDate:old.completionDate,note:old.note},after={completed:v.completed,completionDate:date,note};
   if(JSON.stringify(before)===JSON.stringify(after))return success(old,requestId);
   const change=changedFields(before,after);
   await c.db.batch([...guards(c,rev),c.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM store_maintenance_visits WHERE id=? AND version=?) THEN 1 ELSE json('') END").bind(id,old.version),...(!old.completed||!v.completed?[c.db.prepare('UPDATE store_equipment_plans SET retained=?*active WHERE visit_id=?').bind(v.completed?1:0,id)]:[]),c.db.prepare('UPDATE store_maintenance_visits SET completed=?,completion_date=?,note=?,version=version+1,updated_at=?,updated_by=? WHERE id=?').bind(v.completed?1:0,date,note,at,c.actor,id),event(c,'visit',id,k,digest,!v.completed?'取消維護登記':old.completed?'修改維護':'登記維護',change.before,change.after),audit(c,'visit',id,'updated',change.before,change.after)]);
   return success(await getVisit(c,id),requestId);
  }
  const f=fields(v,at),old=match?await getRecord(c,Number(match[2])):null;
  if(old&&old.version!==expected(v))throw new Invalid('出機資料已變更，請重新整理',409,'EQUIPMENT_CONFLICT');
  const id=old?.id??newId(),next:EquipmentRecord={...f,id,sequence:old?.sequence??0,version:(old?.version??0)+1,createdAt:old?.createdAt??at,updatedAt:at};
  const values=[f.customerCode,f.customerName,f.brand,f.model,f.saleDate,f.quantity,f.warrantyStart,f.warrantyEnd,JSON.stringify(f.machines),f.maintenance?1:0,at,c.actor];
  const write=old?c.db.prepare('UPDATE store_equipment_records SET customer_code=?,customer_name=?,brand=?,model=?,sale_date=?,quantity=?,warranty_start=?,warranty_end=?,machines_json=?,maintenance=?,updated_at=?,updated_by=?,version=version+1 WHERE id=?').bind(...values,id):c.db.prepare('INSERT INTO store_equipment_records(id,list_sequence,customer_code,customer_name,brand,model,sale_date,quantity,warranty_start,warranty_end,machines_json,maintenance,updated_at,updated_by,created_at,created_by) SELECT ?,(SELECT COALESCE(MAX(list_sequence),0)+1 FROM store_equipment_records),'+values.map(()=>'?').join(',')+',?,?').bind(id,...values,at,c.actor);
  const before=old?summarize(old):{},after=summarize(f),change=changedFields(before,after);
  // Large serial lists stay in the business row; audit records count the change, not a second payload.
  for(const target of [change.before,change.after])for(const field of ['machines','months'])if(typeof target[field]==='string'&&String(target[field]).length>300)target[field]=field==='machines'?'機身資料已調整':'維護月份已調整';
  const batch=[...guards(c,rev)];if(old)batch.push(c.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM store_equipment_records WHERE id=? AND version=?) THEN 1 ELSE json('') END").bind(id,old.version));
  batch.push(write);
  // Sequence comes from INSERT; the snapshot is built in SQL after the record exists.
  const sequence=old?.sequence??0;
  batch.push(...planWrites(c,{...next,sequence}),event(c,'equipment',id,k,digest,old?'修改出機':'建立',old?change.before:{},old?change.after:{}),audit(c,'equipment',id,old?'updated':'created',change.before,change.after));
  await c.db.batch(batch);
  // Equipment IDs, rather than display sequence, link every visit snapshot back to its dispatch.
  return success(await getRecord(c,id),requestId);
 }catch(e){if(e instanceof Invalid)return failure({code:e.code,message:e.message},requestId,e.status);if(/malformed JSON|UNIQUE constraint/.test(String(e)))return failure({code:'EQUIPMENT_CONFLICT',message:'資料已更新，或該月份已登記維護；請重新整理後再操作'},requestId,409);console.error(JSON.stringify({event:'store_equipment.failed',requestId}));return failure({code:'EQUIPMENT_UNAVAILABLE',message:'出機與維護操作失敗'},requestId,500)}
}
