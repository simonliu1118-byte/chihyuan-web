import {requireModuleAccess} from "../auth/guard";
import {identityClient,type IdentityRuntimeEnv} from "./auth-routes";
import {success,failure} from "./response";
import {AuditService} from "../audit/audit-service";
import {inspectJpeg,putJpegWithRecords,JpegUploadError} from "../files/jpeg-upload";
import {normalizeStoreContacts} from "../../shared/phone";
import {normalizePhone,type Honorific} from "../../shared/store";
import {STORE_EDIT_REASONS} from "../../shared/store";
import {STORE_REPAIR_PRODUCTS,STORE_REPAIR_CARRIERS,STORE_REPAIR_CANCEL_REASONS,STORE_REPAIR_PHOTO_LIMIT,STORE_REPAIR_PRINT_LIMITS,type StoreRepairPrintSettings,STORE_REPAIR_STEPS,repairStepLocked,repairStepApplicable,nextRepairStep,canUndoRepairClosure,repairHistoryPresentation,type StoreRepair,type StoreRepairStatus,type StoreRepairStep,type StoreRepairCarrier,type StoreRepairInspectResult,type StoreRepairReturnMethod} from "../../shared/store-repairs";
import {storeVersionGuard,storeEvent,validStoreRequestKey} from "../store/workflow-service";
const ROOT="/api/business/store/repairs";
type Context={db:D1Database;actor:number;at:string;requestId:string};
class Invalid extends Error{constructor(message:string,public status=422,public code="STORE_REPAIR_INVALID"){super(message)}}
type Row={id:number;list_sequence:number;received_date:string;customer_code:string;customer_name:string;honorific:Honorific;mobile:string;phone:string;line_name:string;product_kind:StoreRepair["productKind"];product_text:string;serial_no:string;fault:string;purchase_date:string|null;accessories:string;note:string;status:StoreRepairStatus;inspect_result:StoreRepairInspectResult;inspect_problem:string;cancelled:number;cancelled_at:string|null;cancel_reason:string;send_carrier:StoreRepairCarrier|"";send_tracking:string;sent_at:string|null;return_method:StoreRepairReturnMethod;return_carrier:StoreRepairCarrier|"";return_tracking:string;inspected_date:string|null;sent_date:string|null;repaired_date:string|null;notified_date:string|null;returned_date:string|null;notified_at:string|null;closed_at:string|null;version:number;created_at:string;updated_at:string;photo_count?:number};
const dateColumns:Record<StoreRepairStep,keyof Row>={INSPECTED:"inspected_date",SENT:"sent_date",REPAIRED:"repaired_date",NOTIFIED:"notified_date",RETURNED:"returned_date"};
const today=(at:string)=>new Date(Date.parse(at)+8*3600000).toISOString().slice(0,10);
const text=(v:unknown,label:string,max:number,required=false)=>{if(v===undefined||v===null)v="";if(typeof v!=="string"||[...v.trim()].length>max)throw new Invalid(label+"不正確");const s=v.trim();if(required&&!s)throw new Invalid(label+"必填");return s};
const date=(v:unknown,label:string,at:string,optional=false):string|null=>{
 if(optional&&(v===null||v===""))return null;
 const s=text(v,label,10,true);if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw new Invalid(label+"不正確");
 const d=new Date(s+"T00:00:00Z");if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==s||s>today(at))throw new Invalid(label+"不得晚於今天");return s;
};
const obj=(v:unknown):Record<string,unknown>=>{if(!v||typeof v!=="object"||Array.isArray(v))throw new Invalid("請提供有效資料");return v as Record<string,unknown>};
const body=async(r:Request)=>{try{return obj(await r.json())}catch(e){if(e instanceof Invalid)throw e;throw new Invalid("請提供有效 JSON")}};
const rows=async<T>(db:D1Database,sql:string,...args:unknown[])=>((await db.prepare(sql).bind(...args).all<T>()).results??[]);
const one=async<T>(db:D1Database,sql:string,...args:unknown[])=>db.prepare(sql).bind(...args).first<T>();
const key=(v:Record<string,unknown>)=>{const k=text(v.requestKey,"操作識別",80,true);if(!validStoreRequestKey(k))throw new Invalid("操作識別不正確");return k};
const version=(v:Record<string,unknown>)=>{if(!Number.isSafeInteger(v.expectedVersion)||Number(v.expectedVersion)<1)throw new Invalid("版本不正確");return Number(v.expectedVersion)};
const shipping=(v:Record<string,unknown>,prefix:"send"|"return")=>{
 const carrier=v.carrier;
 if(typeof carrier!=="string"||!(carrier in STORE_REPAIR_CARRIERS))throw new Invalid("請選擇物流");
 const tracking=text(v.tracking,"寄送編號／註記",120,carrier!=="SELF");
 return {carrier:carrier as StoreRepairCarrier,tracking};
};
const fields=(v:Record<string,unknown>,at:string)=>{
 const name=text(v.customerName,"客戶姓名",40,true),kind=v.productKind;
 if(typeof kind!=="string"||!(kind in STORE_REPAIR_PRODUCTS))throw new Invalid("請選擇送修類別");
 const honorific=v.honorific??"";if(!["","MR","MS"].includes(String(honorific)))throw new Invalid("稱謂不正確");
 const mobile=normalizePhone(text(v.mobile,"手機",30)),phone=normalizePhone(text(v.phone,"電話",30)),lineName=text(v.lineName,"LINE 名稱",60);
 if(!mobile&&!phone&&!lineName)throw new Invalid("連絡電話或 LINE 至少填寫一項");
 if([mobile,phone].some(n=>n&&!/^\d{6,20}$/.test(n)))throw new Invalid("電話格式不正確");
 const normalized=normalizeStoreContacts(phone,mobile);
 return {receivedDate:date(v.receivedDate,"送修日期",at)!,customerCode:text(v.customerCode,"客戶編號",40),customerName:name,honorific:honorific as Honorific,phone:normalized.phone,mobile:normalized.mobile,lineName,
  productKind:kind as StoreRepair["productKind"],productText:text(v.productText,kind==="OTHER"?"產品名稱":"產品型號",120,true),serialNo:text(v.serialNo,"產品機號",60),fault:text(v.fault,"故障狀況",300,true),purchaseDate:date(v.purchaseDate,"購買日期",at,true),accessories:text(v.accessories,"配件備註",300),note:text(v.note,"備註",300)};
};
const json=(o:Row):StoreRepair=>({id:o.id,sequence:o.list_sequence,photoCount:o.photo_count,receivedDate:o.received_date,customerCode:o.customer_code,customerName:o.customer_name,honorific:o.honorific,mobile:o.mobile,phone:o.phone,lineName:o.line_name,productKind:o.product_kind,productText:o.product_text,serialNo:o.serial_no,fault:o.fault,purchaseDate:o.purchase_date,accessories:o.accessories,note:o.note,status:o.status,inspectResult:o.inspect_result,inspectProblem:o.inspect_problem,cancelled:!!o.cancelled,cancelledAt:o.cancelled_at,cancelReason:o.cancel_reason,sentAt:o.sent_at,notifiedAt:o.notified_at,closedAt:o.closed_at,sendCarrier:o.send_carrier,sendTracking:o.send_tracking,returnMethod:o.return_method,returnCarrier:o.return_carrier,returnTracking:o.return_tracking,dates:{INSPECTED:o.inspected_date,SENT:o.sent_date,REPAIRED:o.repaired_date,NOTIFIED:o.notified_date,RETURNED:o.returned_date},version:o.version,createdAt:o.created_at,updatedAt:o.updated_at});
const get=async(c:Context,id:number)=>{const r=await one<Row>(c.db,"SELECT * FROM store_repairs WHERE id=?",id);if(!r)throw new Invalid("維修單不存在",404);return r};
const audit=(c:Context,id:number,action:string,before:unknown,after:unknown)=>new AuditService(c.db).prepareRecord({entityType:"store_repair",entityKey:String(id),action,actorEmployeeId:c.actor,occurredAt:c.at,requestId:c.requestId,before:before as Record<string,unknown>,after:after as Record<string,unknown>});
const event=(c:Context,id:number,k:string,kind:string,before:unknown,after:unknown,reason="")=>storeEvent(c.db,"store_repair_events","repair_id",id,c.actor,c.at,kind,before,after,reason,k);
const guard=(c:Context,o:Row)=>storeVersionGuard(c.db,"store_repairs",o.id,o.version);
function validateOrder(o:Row,step:StoreRepairStep,newDate:string|null){
 let last=o.received_date;
 for(const key of STORE_REPAIR_STEPS){
  const d=key===step?newDate:o[dateColumns[key]] as string|null;
  if(d&&d<last)throw new Invalid("進度日期不可早於先前步驟");
  if(d)last=d;
 }
}
function reason(v:Record<string,unknown>,allowed:readonly string[]){
 const kind=text(v.reasonKind,"理由類別",40,true);
 if(!allowed.includes(kind))throw new Invalid("理由類別不正確");
 const detail=text(v.reason,"補充說明",240,kind==="其他");
 return detail?kind+"："+detail:kind;
}
export async function handleStoreRepairRoute(req:Request,env:IdentityRuntimeEnv & {HR_FILES?:R2Bucket},requestId:string):Promise<Response|null>{
 const u=new URL(req.url);if(u.pathname!==ROOT&&!u.pathname.startsWith(ROOT+"/"))return null;
 const provider=identityClient(env);if(!provider)return failure({code:"IDENTITY_UNAVAILABLE",message:"身分服務無法使用"},requestId,503);
 const gate=await requireModuleAccess(provider,env.DB,req,"STORE_REPAIRS");if(!gate.ok)return failure({code:gate.code,message:"沒有門市售後維修存取權"},requestId,gate.status);
 const c:Context={db:env.DB,actor:gate.member.id,at:new Date().toISOString(),requestId},path=u.pathname.slice(ROOT.length),method=req.method;
 try{
  if((path===""||path==="/")&&method==="GET"){
   const q=(u.searchParams.get("q")??"").trim().slice(0,60),like="%"+q.replace(/[\\%_]/g,m=>"\\"+m)+"%",digits=normalizePhone(q);
   const list=await rows<Row>(c.db,"SELECT *,(SELECT COUNT(*) FROM store_repair_photos p WHERE p.repair_id=store_repairs.id) photo_count FROM store_repairs WHERE (?='' OR customer_code LIKE ? ESCAPE '\\' OR customer_name LIKE ? ESCAPE '\\' OR phone LIKE ? ESCAPE '\\' OR mobile LIKE ? ESCAPE '\\' OR line_name LIKE ? ESCAPE '\\' OR product_text LIKE ? ESCAPE '\\' OR serial_no LIKE ? ESCAPE '\\' OR fault LIKE ? ESCAPE '\\' OR send_tracking LIKE ? ESCAPE '\\' OR return_tracking LIKE ? ESCAPE '\\') ORDER BY list_sequence DESC LIMIT 501",q,like,like,"%"+digits+"%","%"+digits+"%",like,like,like,like,like,like);
   if(list.length>500)throw new Invalid("符合條件超過500筆，請縮小搜尋",409);
   return success(list.map(json),requestId);
  }
  if((path===""||path==="/")&&method==="POST"){
   const v=await body(req),f=fields(v,c.at),k=key(v);
   const duplicate=await one<{repair_id:number}>(c.db,"SELECT repair_id FROM store_repair_events WHERE actor=? AND request_key=? AND kind='建立'",c.actor,k);
   if(duplicate)return success(json(await get(c,duplicate.repair_id)),requestId);
   const id=Number.parseInt(crypto.randomUUID().replaceAll("-","").slice(0,13),16);
   // The display number is taken inside the INSERT, so two simultaneous creations cannot collide.
   const values=[id,f.receivedDate,f.customerCode,f.customerName,f.honorific,f.mobile,f.phone,f.lineName,f.productKind,f.productText,f.serialNo,f.fault,f.purchaseDate,f.accessories,f.note,c.at,c.actor,c.at,c.actor];
   const insert=c.db.prepare("INSERT INTO store_repairs(id,list_sequence,received_date,customer_code,customer_name,honorific,mobile,phone,line_name,product_kind,product_text,serial_no,fault,purchase_date,accessories,note,created_at,created_by,updated_at,updated_by) SELECT ?,(SELECT COALESCE(MAX(list_sequence),0)+1 FROM store_repairs),"+values.slice(1).map(()=>"?").join(",")).bind(...values);
   await c.db.batch([insert,event(c,id,k,"建立",{},f),audit(c,id,"store_repair.created",{},f)]);
   return success(json(await get(c,id)),requestId);
  }
  if(path==="/print-settings"){
   const current=await one<StoreRepairPrintSettings>(c.db,"SELECT title,contact,notes,card_title cardTitle,card_footer cardFooter,version FROM store_repair_print_settings WHERE id=1")??{title:"",contact:"",notes:"",cardTitle:"",cardFooter:"",version:0};
   if(method==="GET")return success(current,requestId);
   if(method!=="PUT")throw new Invalid("找不到維修操作",404);
   const v=await body(req);if(v.expectedVersion!==current.version)throw new Invalid("列印設定已被其他人修改，請重新載入",409,"STORE_REPAIR_CONFLICT");
   const lines=(raw:unknown,label:string,max:number,count:number)=>{const value=text(raw,label,max);const rows=value.split(/\r?\n/).map(x=>x.trim()).filter(Boolean);if(rows.length>count)throw new Invalid(label+"最多"+count+"行");return rows.join("\n")};
   const next={title:text(v.title,"標題",STORE_REPAIR_PRINT_LIMITS.title),contact:lines(v.contact,"聯絡資訊",STORE_REPAIR_PRINT_LIMITS.contact,STORE_REPAIR_PRINT_LIMITS.contactLines),
    notes:lines(v.notes,"注意事項",STORE_REPAIR_PRINT_LIMITS.notes,STORE_REPAIR_PRINT_LIMITS.noteLines),
    cardTitle:text(v.cardTitle,"資訊卡標題",STORE_REPAIR_PRINT_LIMITS.cardTitle),cardFooter:lines(v.cardFooter,"資訊卡下方文字",STORE_REPAIR_PRINT_LIMITS.cardFooter,STORE_REPAIR_PRINT_LIMITS.cardFooterLines),version:current.version+1};
   const write=current.version===0
    ?c.db.prepare("INSERT INTO store_repair_print_settings(id,title,contact,notes,card_title,card_footer,version,updated_at,updated_by) VALUES(1,?,?,?,?,?,1,?,?)").bind(next.title,next.contact,next.notes,next.cardTitle,next.cardFooter,c.at,c.actor)
    :c.db.prepare("UPDATE store_repair_print_settings SET title=?,contact=?,notes=?,card_title=?,card_footer=?,version=?,updated_at=?,updated_by=? WHERE id=1 AND version=?").bind(next.title,next.contact,next.notes,next.cardTitle,next.cardFooter,next.version,c.at,c.actor,current.version);
   const [result]=await c.db.batch([write,new AuditService(c.db).prepareRecord({entityType:"store_repair_print_settings",entityKey:"1",action:"store_repair.print_settings_updated",actorEmployeeId:c.actor,occurredAt:c.at,requestId,metadata:{fromVersion:current.version,toVersion:next.version}})]);
   if(!result.meta.changes)throw new Invalid("列印設定已被其他人修改，請重新載入",409,"STORE_REPAIR_CONFLICT");
   return success(next,requestId);
  }
  const photoRoute=/^\/(\d+)\/photos(?:\/(\d+))?$/.exec(path);
  if(photoRoute){
   const repairId=Number(photoRoute[1]),photoId=photoRoute[2]?Number(photoRoute[2]):null;
   await get(c,repairId);
   const bucket=env.HR_FILES;
   if(!bucket)return failure({code:"REPAIR_FILES_UNAVAILABLE",message:"附檔儲存尚未設定"},requestId,503);
   type Photo={id:number;repair_id:number;object_key:string;bytes:number;width:number;height:number;created_at:string;created_by:number};
   const findPhoto=()=>one<Photo>(c.db,"SELECT * FROM store_repair_photos WHERE id=? AND repair_id=?",photoId,repairId);
   if(method==="GET"&&photoId===null){
    const list=await rows<Photo>(c.db,"SELECT * FROM store_repair_photos WHERE repair_id=? ORDER BY id ASC LIMIT ?",repairId,STORE_REPAIR_PHOTO_LIMIT);
    return success(list.map(x=>({id:x.id,bytes:x.bytes,width:x.width,height:x.height,createdAt:x.created_at})),requestId);
   }
   if(method==="GET"&&photoId!==null){
    const photo=await findPhoto();if(!photo)throw new Invalid("照片不存在",404);
    const blob=await bucket.get(photo.object_key);
    if(!blob)return failure({code:"REPAIR_PHOTO_MISSING",message:"照片不存在"},requestId,404);
    return new Response(blob.body,{headers:{"content-type":"image/jpeg","cache-control":"private, no-store","x-content-type-options":"nosniff"}});
   }
   if(method==="POST"&&photoId===null){
    const bytes=new Uint8Array(await req.arrayBuffer());
    let dimensions:{width:number;height:number};
    try{dimensions=inspectJpeg(bytes,req.headers.get("content-type"),1048576)}catch(e){if(e instanceof JpegUploadError)throw new Invalid(e.message);throw e}
    const count=(await one<{n:number}>(c.db,"SELECT COUNT(*) n FROM store_repair_photos WHERE repair_id=?",repairId))?.n??0;
    if(count>=STORE_REPAIR_PHOTO_LIMIT)throw new Invalid("每張維修單最多"+STORE_REPAIR_PHOTO_LIMIT+"張照片",409);
    const objectKey="store-repairs/"+repairId+"/"+crypto.randomUUID()+".jpg";
    const info={repairId,bytes:bytes.length,...dimensions};
    const duplicateGuard=c.db.prepare("SELECT CASE WHEN (SELECT COUNT(*) FROM store_repair_photos WHERE repair_id=?)<? THEN 1 ELSE json('') END").bind(repairId,STORE_REPAIR_PHOTO_LIMIT);
    await putJpegWithRecords(bucket,c.db,objectKey,bytes,[
     duplicateGuard,
     c.db.prepare("INSERT INTO store_repair_photos(repair_id,object_key,bytes,width,height,created_at,created_by) VALUES(?,?,?,?,?,?,?)").bind(repairId,objectKey,bytes.length,dimensions.width,dimensions.height,c.at,c.actor),
     event(c,repairId,crypto.randomUUID(),"上傳維修單照片",{},info),
     audit(c,repairId,"store_repair.photo_uploaded",{},info)
    ]);
    return success({uploaded:true},requestId);
   }
   if(method==="DELETE"&&photoId!==null){
    const photo=await findPhoto();if(!photo)throw new Invalid("照片不存在",404);
    const info={repairId,photoId,bytes:photo.bytes};
    await c.db.batch([
      c.db.prepare("DELETE FROM store_repair_photos WHERE id=? AND repair_id=?").bind(photoId,repairId),
      event(c,repairId,crypto.randomUUID(),"刪除維修單照片",info,{}),
      audit(c,repairId,"store_repair.photo_deleted",info,{})
    ]);
    await bucket.delete(photo.object_key);
    return success({deleted:true},requestId);
   }
   throw new Invalid("操作方法不正確",404);
  }
  const m=/^\/(\d+)(?:\/(status|date|history))?$/.exec(path);
  if(!m)throw new Invalid("找不到維修操作",404);
  const id=Number(m[1]),o=await get(c,id);
  if(m[2]==="history"&&method==="GET"){
   const cursor=Number(u.searchParams.get("cursor")??0);if(!Number.isSafeInteger(cursor)||cursor<0)throw new Invalid("游標不正確");
   const list=await rows<{id:number;at:string;kind:string;actor_name:string;before_json:string;after_json:string;reason:string}>(c.db,"SELECT e.*,m.display_name actor_name FROM store_repair_events e JOIN app_members m ON m.id=e.actor WHERE repair_id=?"+(cursor?" AND e.id<?":"")+" ORDER BY e.id DESC LIMIT 21",...(cursor?[id,cursor]:[id]));
   return success({rows:list.slice(0,20).map(e=>repairHistoryPresentation({id:e.id,actorName:e.actor_name,at:e.at,kind:e.kind,before:JSON.parse(e.before_json),after:JSON.parse(e.after_json),reason:e.reason})),nextCursor:list.length>20?list[19].id:null},requestId);
  }
  if(method==="GET"&&!m[2])return success(json(o),requestId);
  if(!(method==="PATCH"&&!m[2]||method==="POST"&&m[2]==="status"||method==="PATCH"&&m[2]==="date"))throw new Invalid("操作方法不正確",404);
  const v=await body(req),k=key(v);
  const duplicate=await one<{id:number}>(c.db,"SELECT id FROM store_repair_events WHERE actor=? AND request_key=?",c.actor,k);
  if(duplicate)return success(json(await get(c,id)),requestId);
  if(version(v)!==o.version)throw new Invalid("維修單已被修改，請重新載入",409,"STORE_REPAIR_CONFLICT");
  let before:unknown=json(o),after:Record<string,unknown>={},kind="",eventReason="";
  if(!m[2]&&method==="PATCH"){
   if(o.status==="RETURNED")throw new Invalid("結案不能修改");
   const f=fields(v,c.at);if(o.status!=="RECEIVED")eventReason=reason(v,STORE_EDIT_REASONS);
   const stmt=c.db.prepare("UPDATE store_repairs SET received_date=?,customer_code=?,customer_name=?,honorific=?,mobile=?,phone=?,line_name=?,product_kind=?,product_text=?,serial_no=?,fault=?,purchase_date=?,accessories=?,note=?,version=version+1,updated_at=?,updated_by=? WHERE id=?").bind(f.receivedDate,f.customerCode,f.customerName,f.honorific,f.mobile,f.phone,f.lineName,f.productKind,f.productText,f.serialNo,f.fault,f.purchaseDate,f.accessories,f.note,c.at,c.actor,id);
   after={...json(o),...f};kind="修改維修";
   await c.db.batch([guard(c,o),stmt,event(c,id,k,kind,before,after,eventReason),audit(c,id,"store_repair.edited",before,after)]);
  }else if(m[2]==="date"){
   const step=v.step as StoreRepairStep,current=json(o);
   if(!STORE_REPAIR_STEPS.includes(step))throw new Invalid("不能修改該日期",409);
   if(repairStepLocked(current,step))throw new Invalid("下一步已登記，不能修改",409);
   if(!repairStepApplicable(current,step)||o.status==="RETURNED"&&!canUndoRepairClosure(current,Date.parse(c.at))||!(o[dateColumns[step]]||STORE_REPAIR_STEPS.indexOf(step)<=STORE_REPAIR_STEPS.indexOf(o.status as StoreRepairStep)))throw new Invalid("不能修改該日期",409);
   const day=date(v.milestoneDate,"辦理日期",c.at,true);validateOrder(o,step,day);
   const column=dateColumns[step],changes:Record<string,unknown>={[column]:day};
   const eventBefore:Record<string,unknown>={step,date:o[column]};after={step,date:day};kind="修改日期";
   if(step==="NOTIFIED")changes.notified_at=o.notified_at??c.at;
   if(step==="SENT")changes.sent_at=o.sent_at??c.at;
   if(step==="INSPECTED"&&v.inspectResult!==undefined){
    if(v.inspectResult!=="GOOD"&&v.inspectResult!=="BAD")throw new Invalid("檢測結果不正確");
    if(v.inspectResult!==o.inspect_result&&o.cancelled)throw new Invalid("已進入下一步，不能改檢測結果",409);
    changes.inspect_result=v.inspectResult;changes.inspect_problem=v.inspectResult==="BAD"?text(v.inspectProblem,"補充說明",200):"";
    Object.assign(eventBefore,{inspectResult:o.inspect_result,inspectProblem:o.inspect_problem});Object.assign(after,{inspectResult:changes.inspect_result,inspectProblem:changes.inspect_problem});
   }
   if(step==="SENT"&&v.shipping!==undefined){
    const shipment=shipping(obj(v.shipping),"send");changes.send_carrier=shipment.carrier;changes.send_tracking=shipment.tracking;
    Object.assign(eventBefore,{carrier:STORE_REPAIR_CARRIERS[o.send_carrier as StoreRepairCarrier]??o.send_carrier,tracking:o.send_tracking});
    Object.assign(after,{carrier:STORE_REPAIR_CARRIERS[shipment.carrier],tracking:shipment.tracking});
   }
   if(step==="RETURNED"&&(v.returnMethod!==undefined||v.shipping!==undefined)){
    const method=v.returnMethod??o.return_method;if(method!=="PICKUP"&&method!=="SHIPPING")throw new Invalid("請選擇歸還方式");
    changes.return_method=method;changes.return_carrier="";changes.return_tracking="";
    if(method==="SHIPPING"){const shipment=shipping(obj(v.shipping??{carrier:o.return_carrier,tracking:o.return_tracking}),"return");changes.return_carrier=shipment.carrier;changes.return_tracking=shipment.tracking}
    Object.assign(eventBefore,{returnMethod:o.return_method==="SHIPPING"?"寄送":"自取",carrier:STORE_REPAIR_CARRIERS[o.return_carrier as StoreRepairCarrier]??o.return_carrier,tracking:o.return_tracking});
    Object.assign(after,{returnMethod:method==="SHIPPING"?"寄送":"自取",carrier:STORE_REPAIR_CARRIERS[changes.return_carrier as StoreRepairCarrier]??"",tracking:changes.return_tracking});
   }
   const keys=Object.keys(changes),sql="UPDATE store_repairs SET "+keys.map(x=>x+"=?").join(",")+",version=version+1,updated_at=?,updated_by=? WHERE id=?";
   await c.db.batch([guard(c,o),c.db.prepare(sql).bind(...keys.map(x=>changes[x]),c.at,c.actor,id),event(c,id,k,kind,eventBefore,after),audit(c,id,"store_repair.date",before,after)]);
  }else{
   const action=String(v.action??"advance");
   const current=json(o);
   if(action==="advance"){
    const step=nextRepairStep(current);
    if(!step||v.step!==step)throw new Invalid("沒有指定的下一步",409);
    const day=date(v.milestoneDate,"辦理日期",c.at,true);validateOrder(o,step,day);
    const changes:Record<string,unknown>={[dateColumns[step]]:day,status:step};
    if(step==="INSPECTED"){
     if(v.inspectResult!=="GOOD"&&v.inspectResult!=="BAD")throw new Invalid("請選擇檢測結果");
     changes.inspect_result=v.inspectResult;changes.inspect_problem=v.inspectResult==="BAD"?text(v.inspectProblem,"補充說明",200):"";
    }
    if(step==="SENT"){
     const s=shipping(obj(v.shipping),"send");changes.send_carrier=s.carrier;changes.send_tracking=s.tracking;changes.sent_at=c.at;
    }
    if(step==="NOTIFIED")changes.notified_at=c.at;
    if(step==="RETURNED"){
     const method=v.returnMethod;if(method!=="PICKUP"&&method!=="SHIPPING")throw new Invalid("請選擇歸還方式");
     changes.return_method=method;
     if(method==="SHIPPING"){const s=shipping(obj(v.shipping),"return");changes.return_carrier=s.carrier;changes.return_tracking=s.tracking}
     else {changes.return_carrier="";changes.return_tracking=""}
     changes.closed_at=c.at;
    }
    after=changes;kind="推進";
    const keys=Object.keys(changes);const sql="UPDATE store_repairs SET "+keys.map(x=>x+"=?").join(",")+",version=version+1,updated_at=?,updated_by=? WHERE id=?";
    await c.db.batch([guard(c,o),c.db.prepare(sql).bind(...keys.map(x=>changes[x]),c.at,c.actor,id),event(c,id,k,kind,before,after),audit(c,id,"store_repair.advanced",before,after)]);
   }else if(action==="cancel"){
    if(o.status==="RETURNED"||o.cancelled)throw new Invalid("目前不可取消維修",409);
    eventReason=reason(v,STORE_REPAIR_CANCEL_REASONS);after={cancelled:true,cancelReason:eventReason,cancelledAt:c.at};kind="取消維修";
    await c.db.batch([guard(c,o),c.db.prepare("UPDATE store_repairs SET cancelled=1,cancel_reason=?,cancelled_at=?,version=version+1,updated_at=?,updated_by=? WHERE id=?").bind(eventReason,c.at,c.at,c.actor,id),event(c,id,k,kind,before,after,eventReason),audit(c,id,"store_repair.cancelled",before,after)]);
   }else if(action==="undoCancel"){
    if(!o.cancelled||o.status==="NOTIFIED"||o.status==="RETURNED")throw new Invalid("通知後不能撤回取消",409);
    after={cancelled:false,cancelReason:"",cancelledAt:null};kind="撤回取消";
    await c.db.batch([guard(c,o),c.db.prepare("UPDATE store_repairs SET cancelled=0,cancel_reason='',cancelled_at=NULL,version=version+1,updated_at=?,updated_by=? WHERE id=?").bind(c.at,c.actor,id),event(c,id,k,kind,before,after),audit(c,id,"store_repair.cancel_undone",before,after)]);
   }else if(action==="undoClose"){
    if(!canUndoRepairClosure(current,Date.parse(c.at)))throw new Invalid("結案已超過五分鐘，不能撤回",409);
    after={status:"NOTIFIED",returned_date:null,closed_at:null,return_method:"",return_carrier:"",return_tracking:""};kind="撤回結案";
    await c.db.batch([guard(c,o),c.db.prepare("UPDATE store_repairs SET status='NOTIFIED',returned_date=NULL,closed_at=NULL,return_method='',return_carrier='',return_tracking='',version=version+1,updated_at=?,updated_by=? WHERE id=?").bind(c.at,c.actor,id),event(c,id,k,kind,before,after),audit(c,id,"store_repair.closure_undone",before,after)]);
   }else if(action==="rollback"){
    if(o.status==="RECEIVED"||o.status==="RETURNED")throw new Invalid("此階段不能退回",409);
    eventReason=text(v.reason,"退回理由",300,true);
    const events=await rows<{before_json:string;after_json:string}>(c.db,"SELECT before_json,after_json FROM store_repair_events WHERE repair_id=? AND kind='推進' ORDER BY id DESC LIMIT 30",id);
    const origin=events.map(e=>({before:JSON.parse(e.before_json) as StoreRepair,after:JSON.parse(e.after_json) as Record<string,unknown>})).find(e=>e.after.status===o.status);
    if(!origin)throw new Invalid("找不到前一階段紀錄",409);
    const previous=origin.before;
    const step=origin.after.status as StoreRepairStep;
    const changes:Record<string,unknown>={status:previous.status,[dateColumns[step]]:null};
    if(step==="INSPECTED"){changes.inspect_result="";changes.inspect_problem=""}
    if(step==="SENT"){changes.send_carrier="";changes.send_tracking="";changes.sent_at=null}
    if(step==="NOTIFIED")changes.notified_at=null;
    after=changes;kind="退回上一步";
    const keys=Object.keys(changes);const sql="UPDATE store_repairs SET "+keys.map(x=>x+"=?").join(",")+",version=version+1,updated_at=?,updated_by=? WHERE id=?";
    await c.db.batch([guard(c,o),c.db.prepare(sql).bind(...keys.map(x=>changes[x]),c.at,c.actor,id),event(c,id,k,kind,before,after,eventReason),audit(c,id,"store_repair.rollback",before,after)]);
   }else throw new Invalid("請選擇維修操作");
  }
  return success(json(await get(c,id)),requestId);
 }catch(e){
  if(e instanceof Invalid)return failure({code:e.code,message:e.message},requestId,e.status);
  if(String(e).includes("malformed JSON")||String(e).includes("UNIQUE constraint"))return failure({code:"STORE_REPAIR_CONFLICT",message:"資料已變更，請重新載入"},requestId,409);
  console.error(JSON.stringify({event:"store_repair.failed",requestId}));return failure({code:"STORE_REPAIR_UNAVAILABLE",message:"維修操作失敗"},requestId,500);
 }
}
