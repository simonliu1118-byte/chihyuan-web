import {HrLeaveService,HrLeaveError} from "../hr/hr-leave-service";
import {HrRosterError} from "../hr/hr-roster-service";
import {HrCompService} from "../hr/hr-comp-service";
import {AuditService} from "../audit/audit-service";
import {HrValidationError,date,integer,object,required} from "../hr/hr-validation";
import type {HrContext} from "../hr/hr-service";
import {success,failure,json} from "./response";
export interface HrFilesEnv { HR_FILES?: R2Bucket }
export async function handleHrPhase2bRoute(request:Request,db:D1Database,ctx:HrContext,env:HrFilesEnv):Promise<Response|null>{
 const url=new URL(request.url),path=url.pathname,id=ctx.requestId;
 const mLeave=/^\/api\/business\/hr\/employees\/(\d+)\/leave$/.exec(path);
 const mCancel=/^\/api\/business\/hr\/leave-requests\/([0-9a-f-]{36})\/cancel$/.exec(path);
 const mUpload=/^\/api\/business\/hr\/leave-requests\/([0-9a-f-]{36})\/attachments$/.exec(path);
 const mAttachment=/^\/api\/business\/hr\/leave-attachments\/(\d+)$/.exec(path);
 const mNotice=/^\/api\/business\/hr\/annual-leave-years\/(\d+)\/notice$/.exec(path);
 const mGrant=/^\/api\/business\/hr\/employees\/(\d+)\/comp-time$/.exec(path);
 const mExtend=/^\/api\/business\/hr\/comp-time\/(overtime|grant)\/(\d+)\/extend$/.exec(path);
 const mSettle=/^\/api\/business\/hr\/comp-time\/overtime\/(\d+)\/settle$/.exec(path);
 const isSummary=path==="/api/business/hr/leave/summary",isCreate=path==="/api/business/hr/leave-requests";
 const setting=path==="/api/business/hr/settings/leave-types";
 if(!mLeave&&!mCancel&&!mUpload&&!mAttachment&&!mNotice&&!mGrant&&!mExtend&&!mSettle&&!isSummary&&!isCreate&&!setting)return null;
 const body=async()=>object(await request.json().catch(()=>null));
 const leave=new HrLeaveService(db);
 try {
  if(setting){
   if(request.method==="GET")return success(await leave.types(),id);
   if(request.method==="POST"||request.method==="PATCH"){
    const v=await body(),itemId=request.method==="PATCH"?integer(v.id,"id",true):null;
    const existing=itemId?await db.prepare("SELECT * FROM hr_leave_types WHERE id=?").bind(itemId).first<Record<string,unknown>>():null;
    if(itemId&&!existing)throw new HrValidationError("id","假別不存在",404);
    const name=required(v.name,"name",100),sort=integer(v.sortOrder??0,"sortOrder"),active=v.isActive===false?0:1;
    const statements:D1PreparedStatement[]=[];
    if(existing?.is_statutory===1)statements.push(db.prepare("UPDATE hr_leave_types SET name=name,sort_order=?,is_active=?,updated_at=? WHERE id=?").bind(sort,active,ctx.now,itemId));
    else if(itemId)statements.push(db.prepare("UPDATE hr_leave_types SET name=?,sort_order=?,is_active=?,quota_days=?,quota_period=?,merge_into_type_id=?,merge_after_days=?,counts_calendar_days=?,event_quota_options=?,requires_reason=?,accepts_proof=?,needs_form=?,comp_kind=?,pay_ratio=?,legal_basis=?,updated_at=? WHERE id=?").bind(name,sort,active,v.quotaDays??null,v.quotaPeriod??null,v.mergeIntoTypeId??null,v.mergeAfterDays??0,v.countsCalendarDays?1:0,v.eventQuotaOptions??null,v.requiresReason?1:0,v.acceptsProof?1:0,v.needsForm===false?0:1,v.compKind??null,v.payRatio??null,v.legalBasis??null,ctx.now,itemId));
    else statements.push(db.prepare("INSERT INTO hr_leave_types(code,name,sort_order,is_statutory,is_active,quota_days,quota_period,merge_into_type_id,merge_after_days,counts_calendar_days,event_quota_options,requires_reason,accepts_proof,needs_form,comp_kind,pay_ratio,legal_basis,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
     .bind(required(v.code,"code",2),name,sort,0,active,v.quotaDays??null,v.quotaPeriod??null,v.mergeIntoTypeId??null,v.mergeAfterDays??0,v.countsCalendarDays?1:0,v.eventQuotaOptions??null,v.requiresReason?1:0,v.acceptsProof?1:0,v.needsForm===false?0:1,v.compKind??null,v.payRatio??null,v.legalBasis??null,ctx.now));
    statements.push(new AuditService(db).prepareRecord({entityType:"hr_setting",entityKey:"leave-types",action:"hr_setting.updated",actorEmployeeId:ctx.actor,requestId:id,after:{id:itemId,name,sort,active}}));
    await db.batch(statements);return success({saved:true},id);
   }
  }
  if(isSummary&&request.method==="GET")return success(await leave.summary(Number(url.searchParams.get("year")),url.searchParams.has("storeId")?integer(Number(url.searchParams.get("storeId")),"storeId",true):undefined,ctx.now.slice(0,10)),id);
  if(mLeave&&request.method==="GET")return success(await leave.detail(Number(mLeave[1]),Number(url.searchParams.get("year")),ctx.now.slice(0,10)),id);
  if(isCreate&&request.method==="POST")return success(await leave.create(await body(),ctx),id);
  if(mCancel&&request.method==="POST")return success(await leave.cancel(mCancel[1],await body(),ctx),id);
  if(mNotice&&request.method==="PATCH"){
   const v=await body(),notifiedOn=date(v.notifiedOn,"notifiedOn"),rowId=Number(mNotice[1]);
   const row=await db.prepare("SELECT * FROM hr_annual_leave_years WHERE id=?").bind(rowId).first<Record<string,unknown>>();
   if(!row)throw new HrValidationError("id","找不到特休年度",404);
   await db.batch([db.prepare("UPDATE hr_annual_leave_years SET notified_on=?,notified_by=? WHERE id=?").bind(notifiedOn,ctx.actor,rowId),
    new AuditService(db).prepareRecord({entityType:"hr_annual_leave",entityKey:String(rowId),action:"hr_annual_leave.notified",actorEmployeeId:ctx.actor,requestId:id,after:{notifiedOn}})]);
   return success({saved:true},id);
  }
  const comp=new HrCompService(db);
  if(mGrant&&request.method==="POST")return success(await comp.grant(Number(mGrant[1]),await body(),ctx),id);
  if(mExtend&&request.method==="POST")return success(await comp.extend(mExtend[1] as "overtime"|"grant",Number(mExtend[2]),ctx),id);
  if(mSettle&&request.method==="POST")return success(await comp.settle(Number(mSettle[1]),ctx),id);
  if(mUpload&&request.method==="POST"){
   if(!env.HR_FILES)return failure({code:"HR_FILES_UNAVAILABLE",message:"附檔儲存尚未設定"},id,503);
   const batch=mUpload[1],records=await db.prepare("SELECT r.employee_id,t.accepts_proof FROM hr_leave_records r JOIN hr_leave_types t ON t.id=r.leave_type_id WHERE r.batch_id=? LIMIT 1").bind(batch).first<{employee_id:number;accepts_proof:number}>();
   if(!records||records.accepts_proof!==1)throw new HrValidationError("batchId","此假單不接受附件");
   const count=(await db.prepare("SELECT COUNT(*) AS n FROM hr_leave_attachments WHERE batch_id=?").bind(batch).first<{n:number}>())?.n??0;
   if(count>=3)throw new HrValidationError("files","每次最多三張");
   const bytes=new Uint8Array(await request.arrayBuffer());
   if(bytes.length===0||bytes.length>1572864||!/^image\/jpeg(?:;|$)/i.test(request.headers.get("content-type")??""))throw new HrValidationError("file","只收 1.5MB 以下 JPEG");
   const size=jpegSize(bytes);
   if(Math.max(size.width,size.height)>2000)throw new HrValidationError("file","圖片長邊不可超過 2000px");
   const key="hr-leave/"+batch+"/"+crypto.randomUUID()+".jpg";
   await env.HR_FILES.put(key,bytes,{httpMetadata:{contentType:"image/jpeg"}});
   try{await db.batch([
    db.prepare("INSERT INTO hr_leave_attachments(batch_id,object_key,content_type,bytes,width,height,grayscale,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?)").bind(batch,key,"image/jpeg",bytes.length,size.width,size.height,request.headers.get("x-grayscale")==="1"?1:0,ctx.now,ctx.actor),
    new AuditService(db).prepareRecord({entityType:"hr_leave_attachment",entityKey:batch,action:"hr_leave_attachment.uploaded",actorEmployeeId:ctx.actor,requestId:id,after:{batchId:batch,bytes:bytes.length,width:size.width,height:size.height}})
   ])}catch(e){await env.HR_FILES.delete(key);throw e}
   return success({uploaded:true},id);
  }
  if(mAttachment&&request.method==="GET"){
   if(!env.HR_FILES)return failure({code:"HR_FILES_UNAVAILABLE",message:"附檔儲存尚未設定"},id,503);
   const row=await db.prepare("SELECT object_key FROM hr_leave_attachments WHERE id=?").bind(Number(mAttachment[1])).first<{object_key:string}>();
   if(!row)throw new HrValidationError("id","附件不存在",404);
   const blob=await env.HR_FILES.get(row.object_key);
   if(!blob)return failure({code:"HR_FILE_MISSING",message:"附件不存在"},id,404);
   return new Response(blob.body,{headers:{"content-type":"image/jpeg","cache-control":"private, no-store","x-content-type-options":"nosniff"}});
  }
  return failure({code:"METHOD_NOT_ALLOWED",message:"不支援此方法"},id,405);
 }catch(e){
  if(e instanceof HrRosterError)return json({ok:false,error:{code:e.code,message:e.code==="HR_ROSTER_VIOLATION"?"新增請假後的排班違反規則":"排班需主管核准",items:e.items},requestId:id},{status:409});
  if(e instanceof HrLeaveError)return json({ok:false,error:{code:e.code,message:"額度不足或班表需要調整",items:e.items},requestId:id},{status:409});
  if(e instanceof HrValidationError)return failure({code:e.status===409?"HR_CONFLICT":"HR_VALIDATION_ERROR",message:e.message,fields:{[e.field]:e.message}},id,e.status);
  return failure({code:"HR_UNAVAILABLE",message:"人事資料處理失敗"},id,500);
 }
}
function jpegSize(bytes:Uint8Array):{width:number;height:number}{
 if(bytes[0]!==0xff||bytes[1]!==0xd8||bytes[bytes.length-2]!==0xff||bytes[bytes.length-1]!==0xd9)throw new HrValidationError("file","圖片不是有效 JPEG");
 let i=2;while(i+9<bytes.length){
  if(bytes[i]!==0xff)break;const marker=bytes[i+1],length=bytes[i+2]*256+bytes[i+3];
  if(length<2||i+2+length>bytes.length)break;
  if([0xc0,0xc1,0xc2,0xc3].includes(marker)){
   const height=bytes[i+5]*256+bytes[i+6],width=bytes[i+7]*256+bytes[i+8];
   if(width>0&&height>0)return {width,height};
  }
  i+=2+length;
 }
 throw new HrValidationError("file","無法讀取 JPEG 尺寸");
}
