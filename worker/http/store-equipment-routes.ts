import {requireModuleAccess} from '../auth/guard';
import {identityClient,type IdentityRuntimeEnv} from './auth-routes';
import {success,failure} from './response';
import {AuditService} from '../audit/audit-service';
import {validStoreRequestKey} from '../store/workflow-service';
import {changedFields} from '../../shared/store-history';
import {STORE_REPAIR_PRODUCTS} from '../../shared/store-repairs';
import {maintenanceWindow,type MaintenanceMatrixCustomer} from '../../shared/maintenance-matrix';
import {EQUIPMENT_LIMITS as L,equipmentCustomerCode,equipmentSnapshot,validEquipmentDate,validEquipmentMonth,validManufacturedDate,type EquipmentFields,type EquipmentRecord,type MaintenanceVisit} from '../../shared/store-equipment';
const ROOT='/api/business/store/equipment';
class Invalid extends Error{constructor(message:string,public status=422,public code='EQUIPMENT_INVALID'){super(message)}}
type Context={db:D1Database;actor:number;at:string;requestId:string};
type RecordRow={id:number;list_sequence:number;customer_code:string;customer_name:string;brand:string;category:string;category_other:string;model:string;sale_date:string;quantity:number;warranty_start:string;warranty_end:string;machines_json:string;maintenance:number;version:number;created_at:string;updated_at:string;months_json:string};
type VisitRow={id:number;customer_code:string;customer_name:string;planned_month:string;completed:number;completion_date:string|null;note:string;completed_count:number;total_count:number;version:number;equipment_json:string};
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
 const serials=new Set<string>(),machines=v.machines.map(raw=>{const m=object(raw),serialNo=text(m.serialNo,'機身序號',L.serialNo),manufacturedMonth=text(m.manufacturedMonth,'製造日期',10),assetNumber=text(m.assetNumber,'財產編號',L.assetNumber);if(manufacturedMonth&&(!validManufacturedDate(manufacturedMonth)||manufacturedMonth>(manufacturedMonth.length===7?today(at).slice(0,7):today(at))))throw new Invalid('製造日期不正確');if(serialNo&&serials.has(serialNo.toUpperCase()))throw new Invalid('同筆出機的機身序號不可重複');if(serialNo)serials.add(serialNo.toUpperCase());return {serialNo,manufacturedMonth,assetNumber}});
 if(typeof v.maintenance!=='boolean')throw new Invalid('定期維護設定不正確');
 if(v.maintenance&&!customerCode)throw new Invalid('請先填寫客戶編號，才能啟用定期維護');
 if(!Array.isArray(v.months)||v.months.length>L.months||v.months.some(m=>typeof m!=='string'||!validEquipmentMonth(m))||new Set(v.months).size!==v.months.length)throw new Invalid('預計維護年月不正確');
 const months=(v.months as string[]).slice().sort();
 if(!v.maintenance&&months.length)throw new Invalid('不需維護時不能保留預計月份');
 if(v.maintenance&&(!warrantyStart||!warrantyEnd||!months.length))throw new Invalid('啟用維護請填寫保固起訖並選擇預計月份');
 if(months.some(m=>m<warrantyStart.slice(0,7)||m>warrantyEnd.slice(0,7)))throw new Invalid('預計維護月份須在保固期間內');
 const category=text(v.category,'類別',20);
  if(category&&!Object.prototype.hasOwnProperty.call(STORE_REPAIR_PRODUCTS,category))throw new Invalid('類別不正確');
  const categoryOther=text(v.categoryOther,'其他類別',L.categoryOther,category==='OTHER');
  if(category!=='OTHER'&&categoryOther)throw new Invalid('非其他類別不可填自訂類別');
  return {customerCode,customerName,brand:text(v.brand,'品牌',L.brand),category:category as EquipmentFields['category'],categoryOther,model:text(v.model,'機型',L.model),saleDate,quantity,warrantyStart,warrantyEnd,machines,maintenance:v.maintenance,months};
}
const recordSelect="SELECT r.*,(SELECT json_group_array(v.planned_month) FROM store_equipment_plans p JOIN store_maintenance_visits v ON v.id=p.visit_id WHERE p.equipment_id=r.id AND p.active=1) months_json FROM store_equipment_records r";
// Machine arrays can be large. Fetch them only for one expanded/edited dispatch.
const recordListSelect=recordSelect.replace('r.*',"r.id,r.list_sequence,r.customer_code,r.customer_name,r.brand,r.category,r.category_other,r.model,r.sale_date,r.quantity,r.warranty_start,r.warranty_end,r.maintenance,r.version,r.created_at,r.updated_at,'[]' machines_json");
const visitCountersSql="(SELECT COUNT(*) FROM store_equipment_plans p WHERE p.visit_id=v.id AND p.completed=1) completed_count,(SELECT COUNT(*) FROM store_equipment_plans p WHERE p.visit_id=v.id AND (p.active=1 OR p.completed=1)) total_count";
const visitEquipmentSql="(SELECT json_group_array(json_set(p.snapshot_json,'$.completed',json(CASE WHEN p.completed=1 THEN 'true' ELSE 'false' END),'$.completionDate',p.completion_date,'$.note',p.note,'$.active',json(CASE WHEN p.active=1 THEN 'true' ELSE 'false' END))) FROM store_equipment_plans p WHERE p.visit_id=v.id AND (p.active=1 OR p.completed=1))";
const visitSelect=`SELECT v.*, ${visitCountersSql},${visitEquipmentSql} equipment_json FROM store_maintenance_visits v`;
/** Recompute the customer-month cache from its machine rows within the same D1 batch. */
const aggregateVisitSql=`UPDATE store_maintenance_visits SET
 completed=CASE WHEN
  EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=store_maintenance_visits.id AND p.completed=1)
  AND NOT EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=store_maintenance_visits.id AND p.active=1 AND p.completed=0)
 THEN 1 ELSE 0 END,
 completion_date=CASE WHEN
    EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=store_maintenance_visits.id AND p.completed=1)
    AND NOT EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=store_maintenance_visits.id AND p.active=1 AND p.completed=0)
    THEN (SELECT MAX(p.completion_date) FROM store_equipment_plans p WHERE p.visit_id=store_maintenance_visits.id AND p.completed=1)
    ELSE NULL END,
 note=COALESCE((SELECT p.note FROM store_equipment_plans p WHERE p.visit_id=store_maintenance_visits.id AND p.completed=1
   ORDER BY p.completion_date DESC,p.equipment_id DESC LIMIT 1),'')
 WHERE id IN (SELECT value FROM json_each(?))`;
const recalcVisits=(c:Context,ids:string)=>c.db.prepare(aggregateVisitSql).bind(ids);

const recordJson=(r:RecordRow):EquipmentRecord=>({id:r.id,sequence:r.list_sequence,customerCode:r.customer_code,customerName:r.customer_name,brand:r.brand,category:r.category as EquipmentFields['category'],categoryOther:r.category_other,model:r.model,saleDate:r.sale_date,quantity:r.quantity,warrantyStart:r.warranty_start,warrantyEnd:r.warranty_end,machines:(JSON.parse(r.machines_json) as EquipmentRecord['machines']).map(m=>({...m,assetNumber:m.assetNumber??''})),maintenance:!!r.maintenance,months:JSON.parse(r.months_json).sort(),version:r.version,createdAt:r.created_at,updatedAt:r.updated_at});
const visitJson=(r:VisitRow):MaintenanceVisit=>{
 const equipment=(JSON.parse(r.equipment_json) as Array<Record<string,unknown>>).map(p=>({...p,completed:!!p.completed,active:!!p.active,completionDate:p.completionDate??null,note:p.note??""})) as MaintenanceVisit["equipment"];
 const dates=equipment.filter(e=>e.completed&&e.completionDate).map(e=>e.completionDate!) ;
 return {id:r.id,customerCode:r.customer_code,customerName:r.customer_name,month:r.planned_month,
   completed:!!r.completed,completionDate:dates.length?dates.sort().at(-1)!:r.completion_date,
   note:r.note,completedCount:r.completed_count,totalCount:r.total_count,version:r.version,equipment};
};
async function getRecord(c:Context,id:number){const r=await one<RecordRow>(c.db,recordSelect+' WHERE r.id=?',id);if(!r)throw new Invalid('出機紀錄不存在',404);return recordJson(r)}
async function getVisit(c:Context,id:number){const r=await one<VisitRow>(c.db,visitSelect+' WHERE v.id=?',id);if(!r)throw new Invalid('維護排程不存在',404);return visitJson(r)}
async function revision(c:Context){return (await one<{version:number}>(c.db,'SELECT version FROM store_equipment_state WHERE id=1'))?.version??0}
function guards(c:Context,version:number){return [c.db.prepare("SELECT CASE WHEN COALESCE((SELECT version FROM store_equipment_state WHERE id=1),0)=? THEN 1 ELSE json('') END").bind(version),c.db.prepare('INSERT INTO store_equipment_state(id,version) VALUES(1,1) ON CONFLICT(id) DO UPDATE SET version=version+1')]}
function event(c:Context,type:'equipment'|'visit',id:number,k:string,digest:string,kind:string,before:Record<string,unknown>,after:Record<string,unknown>){return c.db.prepare('INSERT INTO store_equipment_events(equipment_id,visit_id,actor,at,kind,before_json,after_json,request_key,request_hash) VALUES(?,?,?,?,?,?,?,?,?)').bind(type==='equipment'?id:null,type==='visit'?id:null,c.actor,c.at,kind,JSON.stringify(before),JSON.stringify(after),k,digest)}
function audit(c:Context,type:'equipment'|'visit',id:number,action:string,before:Record<string,unknown>,after:Record<string,unknown>){return new AuditService(c.db).prepareRecord({entityType:type==='equipment'?'store_equipment':'store_maintenance',entityKey:String(id),action:(type==='equipment'?'store_equipment':'store_maintenance')+'.'+action,actorEmployeeId:c.actor,occurredAt:c.at,requestId:c.requestId,before,after})}
function summarize(r:EquipmentFields){return {customerCode:r.customerCode,customerName:r.customerName,brand:r.brand,category:r.category,categoryOther:r.categoryOther,model:r.model,saleDate:r.saleDate,quantity:r.quantity,warrantyStart:r.warrantyStart,warrantyEnd:r.warrantyEnd,maintenance:r.maintenance,months:r.months.join('、'),machines:r.machines.map((m,i)=>(i+1)+':'+m.serialNo+'/'+m.manufacturedMonth+'/'+m.assetNumber).join('；')}}
/** A single guarded batch updates dispatch, membership, per-machine history and visit cache. */
function planWrites(c:Context,r:EquipmentRecord){
 const months=JSON.stringify(r.months),targets=JSON.stringify(r.months.map(month=>({month,id:newId()}))),snapshot=JSON.stringify(equipmentSnapshot(r));
 const affected=c.db.prepare(`UPDATE store_maintenance_visits SET
    completed=CASE WHEN
      EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=store_maintenance_visits.id AND p.completed=1)
      AND NOT EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=store_maintenance_visits.id AND p.active=1 AND p.completed=0)
      THEN 1 ELSE 0 END,
    completion_date=CASE WHEN
    EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=store_maintenance_visits.id AND p.completed=1)
    AND NOT EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=store_maintenance_visits.id AND p.active=1 AND p.completed=0)
    THEN (SELECT MAX(p.completion_date) FROM store_equipment_plans p WHERE p.visit_id=store_maintenance_visits.id AND p.completed=1)
    ELSE NULL END,
    note=COALESCE((SELECT p.note FROM store_equipment_plans p WHERE p.visit_id=store_maintenance_visits.id AND p.completed=1
      ORDER BY p.completion_date DESC,p.equipment_id DESC LIMIT 1),'')
   WHERE id IN (SELECT visit_id FROM store_equipment_plans WHERE equipment_id=?)
      OR (customer_code=? AND planned_month IN (SELECT value FROM json_each(?)))`).bind(r.id,r.customerCode,months);
 return [
   c.db.prepare("UPDATE store_equipment_plans SET active=0 WHERE equipment_id=? AND visit_id NOT IN(SELECT id FROM store_maintenance_visits WHERE customer_code=? AND planned_month IN(SELECT value FROM json_each(?)))").bind(r.id,r.customerCode,months),
   c.db.prepare("INSERT INTO store_maintenance_visits(id,customer_code,customer_name,planned_month,created_at,created_by,updated_at,updated_by) SELECT json_extract(value,'$.id'),?,?,json_extract(value,'$.month'),?,?,?,? FROM json_each(?) WHERE 1 ON CONFLICT(customer_code,planned_month) DO NOTHING").bind(r.customerCode,r.customerName,c.at,c.actor,c.at,c.actor,targets),
   c.db.prepare("UPDATE store_maintenance_visits SET customer_name=CASE WHEN customer_code=? THEN ? ELSE customer_name END,version=version+1,updated_at=?,updated_by=? WHERE id IN(SELECT visit_id FROM store_equipment_plans WHERE equipment_id=?) OR (customer_code=? AND planned_month IN(SELECT value FROM json_each(?)))").bind(r.customerCode,r.customerName,c.at,c.actor,r.id,r.customerCode,months),
   c.db.prepare("INSERT INTO store_equipment_plans(equipment_id,visit_id,active,snapshot_json) SELECT ?,v.id,1,json_set(?,'$.sequence',(SELECT list_sequence FROM store_equipment_records WHERE id=?)) FROM store_maintenance_visits v JOIN json_each(?) m ON m.value=v.planned_month WHERE v.customer_code=? ON CONFLICT(equipment_id,visit_id) DO UPDATE SET active=1,snapshot_json=CASE WHEN store_equipment_plans.completed=1 THEN store_equipment_plans.snapshot_json ELSE excluded.snapshot_json END").bind(r.id,snapshot,r.id,months,r.customerCode),
   affected
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
   const list=await all<RecordRow>(c.db,recordListSelect+" WHERE r.list_sequence<? AND (?='' OR r.customer_code LIKE ? ESCAPE '\\' OR r.customer_name LIKE ? ESCAPE '\\' OR r.brand LIKE ? ESCAPE '\\' OR r.category_other LIKE ? ESCAPE '\\' OR r.model LIKE ? ESCAPE '\\' OR EXISTS(SELECT 1 FROM json_each(r.machines_json) m WHERE json_extract(m.value,'$.serialNo') LIKE ? ESCAPE '\\')) ORDER BY r.list_sequence DESC LIMIT 101",Number(before),q,like,like,like,like,like,like);
   return success({rows:list.slice(0,100).map(recordJson),nextBefore:list.length>100?list[99].list_sequence:null},requestId);
  }
  if(method==='GET'&&path==='/month-status'){
    const code=equipmentCustomerCode(u.searchParams.get('customerCode')??'');
    const except=Number(u.searchParams.get('equipmentId')??0);
    if(!code||[...code].length>L.customerCode||!Number.isSafeInteger(except)||except<0)throw new Invalid('客戶編號不正確');
    const months=await all<{month:string}>(c.db,
      `SELECT DISTINCT v.planned_month month FROM store_equipment_plans p
       JOIN store_maintenance_visits v ON v.id=p.visit_id
       WHERE v.customer_code=? AND p.completed=1 AND p.equipment_id<>?
       ORDER BY v.planned_month`,code,except);
    return success({completedMonths:months.map(r=>r.month)},requestId);
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
    UNION SELECT v.customer_code FROM store_equipment_plans p JOIN store_maintenance_visits v ON v.id=p.visit_id WHERE p.completed=1 AND p.completion_date BETWEEN ? AND ?
   ),named AS (SELECT customer_code,COALESCE((SELECT customer_name FROM store_equipment_records r WHERE r.customer_code=candidates.customer_code ORDER BY updated_at DESC,id DESC LIMIT 1),(SELECT customer_name FROM store_maintenance_visits v WHERE v.customer_code=candidates.customer_code ORDER BY updated_at DESC,id DESC LIMIT 1),'') customer_name FROM candidates)
   SELECT n.*,EXISTS(SELECT 1 FROM store_equipment_records r WHERE r.customer_code=n.customer_code AND r.maintenance=1) active,
    (SELECT json_group_array(json_object('id',r.id,'sequence',r.list_sequence,'brand',r.brand,'model',r.model,'quantity',r.quantity,'saleDate',r.sale_date)) FROM store_equipment_records r WHERE r.customer_code=n.customer_code AND r.maintenance=1) equipment_json
   FROM named n WHERE n.customer_code>? AND (?='' OR n.customer_code LIKE ? ESCAPE '\\' OR n.customer_name LIKE ? ESCAPE '\\')
    AND (?=0 OR EXISTS(SELECT 1 FROM store_maintenance_visits v WHERE v.customer_code=n.customer_code AND v.completed=0 AND v.planned_month BETWEEN ? AND ? AND EXISTS(SELECT 1 FROM store_equipment_plans p WHERE p.visit_id=v.id AND p.active=1)))
   ORDER BY n.customer_code LIMIT 51`,window.from,window.to,window.from+'-01',window.to+'-31',before,q,like,like,open?1:0,window.from,window.to);
   const selected=candidates.slice(0,50),codes=JSON.stringify(selected.map(r=>r.customer_code));
   // Two index ranges (planned and actual), rather than a full visit scan or one request per cell.
   const visits=await all<VisitRow>(c.db,`SELECT v.*,${visitCountersSql},'[]' equipment_json FROM store_maintenance_visits v WHERE v.id IN(
    SELECT v.id FROM store_maintenance_visits v WHERE v.customer_code IN(SELECT value FROM json_each(?)) AND ${relevant} AND v.planned_month BETWEEN ? AND ?
    UNION SELECT v.id FROM store_equipment_plans p JOIN store_maintenance_visits v ON v.id=p.visit_id WHERE v.customer_code IN(SELECT value FROM json_each(?)) AND p.completed=1 AND p.completion_date BETWEEN ? AND ?
   ) ORDER BY v.planned_month,v.id`,codes,window.from,window.to,codes,window.from+'-01',window.to+'-31');
   // One bulk membership read for the bounded customer page; source snapshots
   // include per-machine actual dates so two visits in one month remain distinct.
   const members=await all<{customer_code:string;visit_id:number;snapshot_json:string;completed:number;completion_date:string|null;note:string;active:number}>(c.db,
    `SELECT v.customer_code,p.visit_id,p.snapshot_json,p.completed,p.completion_date,p.note,p.active
      FROM store_equipment_plans p JOIN store_maintenance_visits v ON v.id=p.visit_id
      WHERE p.visit_id IN (SELECT value FROM json_each(?)) AND (p.active=1 OR p.completed=1)
      ORDER BY p.visit_id,p.equipment_id`,JSON.stringify(visits.map(v=>v.id)));
   const membership=new Map<number,MaintenanceVisit["equipment"]>();
   for(const p of members){
     const equipment={...JSON.parse(p.snapshot_json),completed:!!p.completed,completionDate:p.completion_date,note:p.note,active:!!p.active};
     membership.set(p.visit_id,[...(membership.get(p.visit_id)??[]),equipment]);
   }
   const rows:MaintenanceMatrixCustomer[]=selected.map(r=>({
     customerCode:r.customer_code,customerName:r.customer_name,activeMaintenance:!!r.active,
     equipment:[...new Map([...members.filter(p=>p.customer_code===r.customer_code&&p.completed===1).map(p=>JSON.parse(p.snapshot_json)),
       ...JSON.parse(r.equipment_json)].map(e=>[e.id,e])).values()],
     visits:visits.filter(v=>v.customer_code===r.customer_code).map(v=>visitJson({...v,equipment_json:JSON.stringify(membership.get(v.id)??[])}))
   }));
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
  const assetMatch=/^\/([0-9]+)\/assets$/.exec(path);
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
  if(!((method==='POST'&&(path===''||path==='/'))||(method==='PUT'&&match&&!match[3])||(method==='PATCH'&&assetMatch)))throw new Invalid('找不到出機或維護操作',404);
  const v=await body(req),k=keyOf(v),digest=await hash(path,v);
  const prior=await one<{equipment_id:number|null;visit_id:number|null;request_hash:string}>(c.db,'SELECT equipment_id,visit_id,request_hash FROM store_equipment_events WHERE actor=? AND request_key=?',c.actor,k);
  if(prior){if(prior.request_hash!==digest)throw new Invalid('操作識別已用於其他內容',409,'EQUIPMENT_CONFLICT');return success(prior.equipment_id?await getRecord(c,prior.equipment_id):await getVisit(c,prior.visit_id!),requestId)}
  const rev=await revision(c);
  if(assetMatch){
   const id=Number(assetMatch[1]),old=await getRecord(c,id);
   if(old.version!==expected(v))throw new Invalid('出機資料已變更，請重新整理',409,'EQUIPMENT_CONFLICT');
   if(!Array.isArray(v.assetNumbers)||v.assetNumbers.length!==old.machines.length)throw new Invalid('財產編號筆數不正確');
   const numbers=v.assetNumbers.map(x=>text(x,'財產編號',L.assetNumber));
   const machines=old.machines.map((m,i)=>({...m,assetNumber:numbers[i]}));
   if(machines.every((m,i)=>m.assetNumber===old.machines[i].assetNumber))return success(old,requestId);
   const before={assetNumbers:old.machines.map(m=>m.assetNumber).join('、')},after={assetNumbers:numbers.join('、')},change=changedFields(before,after);
   await c.db.batch([...guards(c,rev),c.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM store_equipment_records WHERE id=? AND version=?) THEN 1 ELSE json('') END").bind(id,old.version),
    c.db.prepare('UPDATE store_equipment_records SET machines_json=?,version=version+1,updated_at=?,updated_by=? WHERE id=?').bind(JSON.stringify(machines),at,c.actor,id),
    event(c,'equipment',id,k,digest,'補填財產編號',change.before,change.after),
    audit(c,'equipment',id,'asset_number_updated',change.before,change.after)]);
   return success(await getRecord(c,id),requestId);
  }
  if(match?.[1]){
   const id=Number(match[2]),old=await getVisit(c,id);
   if(old.version!==expected(v))throw new Invalid('資料已更新，請重新整理後再操作',409,'EQUIPMENT_CONFLICT');
   const action=v.action;
   if(action!=='complete'&&action!=='undo')throw new Invalid('維護操作不正確');
   if(!Array.isArray(v.equipmentIds)||!v.equipmentIds.length
     ||v.equipmentIds.some(e=>!Number.isSafeInteger(e)||e<1)
     ||new Set(v.equipmentIds).size!==v.equipmentIds.length)throw new Invalid('請勾選有效且不重複的機器');
   const ids=v.equipmentIds as number[],byId=new Map(old.equipment.map(e=>[e.id,e]));
   const selected=ids.map(e=>{const found=byId.get(e);if(!found)throw new Invalid('所選機器不屬於本次維護');return found});
   const completing=action==='complete';
   if(completing&&selected.some(e=>!e.active&&!e.completed))throw new Invalid('無法登記已取消維護的機器');
   if(!completing&&selected.some(e=>!e.completed))throw new Invalid('只能取消已完成的機器');
   const date=completing?v.completionDate:null;
   if(completing&&(typeof date!=='string'||!validEquipmentDate(date)||date>today(at)))throw new Invalid('維護日期不正確或晚於今天');
   const note=completing?text(v.note,'備註',L.note):'';
   if(/[\r\n]/.test(note))throw new Invalid('備註請填寫單行');
   const description=(e:typeof selected[number],done:boolean,day:string|null,remark:string)=>({
     equipmentId:e.id,sequence:e.sequence,brand:e.brand,model:e.model,quantity:e.quantity,
     completed:done,completionDate:day,note:remark,active:e.active
   });
   const before={equipment:selected.map(e=>description(e,e.completed,e.completionDate,e.note))};
   const after={equipment:selected.map(e=>description(e,completing,date as string|null,note))};
   if(JSON.stringify(before)===JSON.stringify(after))return success(old,requestId);
   const kind=!completing?'取消維護登記':selected.every(e=>e.completed)?'修改維護':'登記維護';
   const change=changedFields(before,after),members=JSON.stringify(ids);
   await c.db.batch([
     ...guards(c,rev),
     c.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM store_maintenance_visits WHERE id=? AND version=?) THEN 1 ELSE json('') END").bind(id,old.version),
     c.db.prepare(`UPDATE store_equipment_plans
        SET completed=?,completion_date=?,note=?
        WHERE visit_id=? AND equipment_id IN (SELECT value FROM json_each(?))`).bind(completing?1:0,date,note,id,members),
     c.db.prepare('UPDATE store_maintenance_visits SET version=version+1,updated_at=?,updated_by=? WHERE id=?').bind(at,c.actor,id),
     recalcVisits(c,JSON.stringify([id])),
     event(c,'visit',id,k,digest,kind,change.before,{...change.after,plannedMonth:old.month}),
     audit(c,'visit',id,'updated',change.before,change.after)
   ]);
   return success(await getVisit(c,id),requestId);
  }
  const f=fields(v,at),old=match?await getRecord(c,Number(match[2])):null;
  if(old&&old.version!==expected(v))throw new Invalid('出機資料已變更，請重新整理',409,'EQUIPMENT_CONFLICT');
  const id=old?.id??newId(),next:EquipmentRecord={...f,id,sequence:old?.sequence??0,version:(old?.version??0)+1,createdAt:old?.createdAt??at,updatedAt:at};
  const values=[f.customerCode,f.customerName,f.brand,f.category,f.categoryOther,f.model,f.saleDate,f.quantity,f.warrantyStart,f.warrantyEnd,JSON.stringify(f.machines),f.maintenance?1:0,at,c.actor];
  const write=old?c.db.prepare('UPDATE store_equipment_records SET customer_code=?,customer_name=?,brand=?,category=?,category_other=?,model=?,sale_date=?,quantity=?,warranty_start=?,warranty_end=?,machines_json=?,maintenance=?,updated_at=?,updated_by=?,version=version+1 WHERE id=?').bind(...values,id):c.db.prepare('INSERT INTO store_equipment_records(id,list_sequence,customer_code,customer_name,brand,category,category_other,model,sale_date,quantity,warranty_start,warranty_end,machines_json,maintenance,updated_at,updated_by,created_at,created_by) SELECT ?,(SELECT COALESCE(MAX(list_sequence),0)+1 FROM store_equipment_records),'+values.map(()=>'?').join(',')+',?,?').bind(id,...values,at,c.actor);
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
 }catch(e){if(e instanceof Invalid)return failure({code:e.code,message:e.message},requestId,e.status);if(requestId==='equipment-d1')return failure({code:'EQUIPMENT_D1_DIAGNOSTIC',message:String(e)},requestId,500);if(/malformed JSON|UNIQUE constraint/.test(String(e)))return failure({code:'EQUIPMENT_CONFLICT',message:'資料已更新，請重新整理後再操作'},requestId,409);console.error(JSON.stringify({event:'store_equipment.failed',requestId,...(requestId==='equipment-d1'?{testDiagnostic:String(e)}:{})}));return failure({code:'EQUIPMENT_UNAVAILABLE',message:'出機與維護操作失敗'},requestId,500)}
}
