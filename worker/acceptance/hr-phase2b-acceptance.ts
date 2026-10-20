import {HrLeaveService,HrLeaveError} from "../hr/hr-leave-service";
import {HrValidationError} from "../hr/hr-validation";
import {HrService} from "../hr/hr-service";
import {HrRosterService,HrRosterError} from "../hr/hr-roster-service";
import {HrCompService} from "../hr/hr-comp-service";
import {HrAttendanceService} from "../hr/hr-attendance-service";
import {handleHrPhase2bRoute} from "../http/hr-phase2b-routes";
import {handleHrRoute} from "../http/hr-routes";
import {checkLeaveQuota,leaveMinutes,leaveDates} from "../../shared/hr-leave";
import {compBalances} from "../../shared/hr-overtime";

function check(value:unknown,code:string):asserts value{if(!value)throw Error("ACCEPT_HR2B_"+code);}
// Deterministic 1x1 JPEG generated from a synthetic pixel; a real SOF0 segment is required by jpegSize().
const jpeg="/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAsICAoIBwsKCQoNDAsNERwSEQ8PESIZGhQcKSQrKigkJyctMkA3LTA9MCcnOEw5PUNFSElIKzZPVU5GVEBHSEX/2wBDAQwNDREPESESEiFFLicuRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUVFRUX/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKGAD//Z";
export async function acceptHrPhase2b(db:D1Database,hrFiles?:R2Bucket){
 const ctx={actor:1,now:"2026-10-21T01:00:00.000Z",requestId:"accept-hr2b"};
 const leave=new HrLeaveService(db),roster=new HrRosterService(db),comp=new HrCompService(db);
 const types=await leave.types(),personal=types.find(x=>x.code==="事"),sick=types.find(x=>x.code==="病");
 check(personal&&sick,"SEEDED_LEAVE_TYPES");
 check(leaveMinutes("full",null,null,{wholeDay:true})===480,"WHOLE_DAY");
 check(leaveMinutes("half",null,null,{minutes:120})===120,"PART_TIME_HOURS");
 check(leaveDates({from:"2026-10-05",to:"2026-10-07"},[{date:"2026-10-06",kind:"off",offMark:"slash"}],{}).length===2,"OFF_SKIPPED");
 const failures=checkLeaveQuota({id:personal.id,code:"事",quotaDays:14,quotaPeriod:"calendar_year"},[{id:personal.id,code:"事",quotaDays:14,quotaPeriod:"calendar_year"}],
  Array.from({length:14},(_,i)=>({leaveTypeId:personal.id,workDate:"2026-02-"+String(i+1).padStart(2,"0"),minutes:480})),
  [{leaveTypeId:personal.id,workDate:"2026-10-21",minutes:480}]);
 check(failures.some(x=>x.code==="事"),"QUOTA_BLOCK");
 const advanced=compBalances([{id:1,kind:"overtime",minutes:1440,issuedOn:"2026-10-01",expiresOn:"2026-11-30"}],
  [{workDate:"2026-10-02",minutes:480,advanceHolidayDate:"2026-10-10",advanceHolidayName:"國慶日"},{workDate:"2026-10-03",minutes:480}],[],"2026-10-05");
 check(advanced.advanceMinutes===480&&advanced.balanceMinutes===960,"ADVANCE_KEPT_APART");
 const inserted=await db.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,employment_type,schedule_mode,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
  .bind("HR2BTEST001","測試員工乙","active","2025-01-01","2025-01-01",1,"full","shift",ctx.now,ctx.now).run();
 const employeeId=Number(inserted.meta.last_row_id);
 check(employeeId>0,"EMPLOYEE_INSERT");
 const request=await leave.create({employeeId,leaveTypeId:personal.id,from:"2026-11-23",to:"2026-11-24",wholeDay:true,reason:"測試事由"},ctx);
 check(request.days===2,"WHOLE_LEAVE_CREATED");
 const saved=await db.prepare("SELECT work_date,kind,leave_type_id FROM hr_schedule_days WHERE employee_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date").bind(employeeId,"2026-11-23","2026-11-24").all<{work_date:string;kind:string;leave_type_id:number}>();
 check((saved.results??[]).length===2&&(saved.results??[]).every(x=>x.kind==="leave"&&x.leave_type_id===personal.id),"LEAVE_ROSTER_ATOMIC");
 const counts=await db.prepare("SELECT COUNT(*) AS n FROM hr_leave_records WHERE employee_id=? AND cancelled_at IS NULL").bind(employeeId).first<{n:number}>();
 check(counts?.n===2,"FORM_PERSISTED");
 try{await roster.put(1,"2026-11",{changes:[{employeeId,date:"2026-11-23",kind:"off",offMark:"slash"}]},ctx);throw Error("ROSTER_MUTATION_ALLOWED");}
 catch(e){check(e instanceof HrRosterError&&e.code==="HR_LEAVE_FORM_EXISTS","ROSTER_LOCK");}
 const cancel=await leave.cancel(request.batchId,{reason:"測試取消",dates:["2026-11-23"]},ctx);
 check(cancel.cancelled===1,"PARTIAL_CANCEL");
 const removed=await db.prepare("SELECT COUNT(*) AS n FROM hr_schedule_days WHERE employee_id=? AND work_date=?").bind(employeeId,"2026-11-23").first<{n:number}>();
 check(removed?.n===0,"CANCEL_CLEAR_ROSTER");
 const remaining=await db.prepare("SELECT COUNT(*) AS n FROM hr_leave_records WHERE employee_id=? AND cancelled_at IS NULL").bind(employeeId).first<{n:number}>();
 check(remaining?.n===1,"CANCEL_PRESERVES_OTHER_DAY");
 const sickForm=await leave.create({employeeId,leaveTypeId:sick.id,date:"2026-11-25",wholeDay:true},ctx);
 check(sickForm.days===1,"SICK_FORM");
 const casualRow=await db.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,employment_type,schedule_mode,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
  .bind("HR2BTEST002","測試員工丙","active","2025-01-01","2025-01-01",1,"casual","none",ctx.now,ctx.now).run();
 const casualId=Number(casualRow.meta.last_row_id);
 const manual=await leave.create({employeeId:casualId,leaveTypeId:sick.id,date:"2026-11-26",minutes:120},ctx);
 check(manual.days===1&&manual.minutes===120,"CASUAL_MANUAL_MINUTES");
 const attendance=new HrAttendanceService(db);
 await attendance.put(employeeId,"2026-11",{days:[],overtime:[{date:"2026-11-25",minutes:120,settlement:"comp",revision:0}]},ctx);
 const clock=await attendance.get(employeeId,"2026-11");
 check(clock.days.find(x=>x.date==="2026-11-25")?.overtime?.minutes===120,"OVERTIME_WRITTEN");
 const credit=await db.prepare("SELECT id,comp_expires_on FROM hr_overtime_days WHERE employee_id=? AND work_date=?").bind(employeeId,"2026-11-25").first<{id:number;comp_expires_on:string}>();
 check(credit?.comp_expires_on==="2026-12-31","COMP_EXPIRY_NEXT_MONTH");
 const compType=types.find(x=>x.code==="補");check(compType,"COMP_TYPE");
 const compLeave=await leave.create({employeeId,leaveTypeId:compType.id,date:"2026-11-27",startTime:"09:00",endTime:"10:00"},ctx);
 check(compLeave.minutes===60,"COMP_USAGE_CREATED");
 try{
  await leave.create({employeeId,leaveTypeId:compType.id,date:"2026-11-27",startTime:"09:30",endTime:"10:30"},ctx);
  throw Error("OVERLAPPING_PARTIAL_ALLOWED");
 }catch(e){check(e instanceof HrLeaveError&&e.code==="HR_LEAVE_FORM_EXISTS","OVERLAPPING_PARTIAL_BLOCKED");}
 try{
  await leave.create({employeeId,leaveTypeId:personal.id,date:"2026-11-25",startTime:"09:00",endTime:"10:00",reason:"測試重疊"},ctx);
  throw Error("WHOLE_DAY_CONFLICT_ALLOWED");
 }catch(e){check(e instanceof HrLeaveError&&e.code==="HR_LEAVE_FORM_EXISTS","WHOLE_DAY_CONFLICT_BLOCKED");}
 try{
  await attendance.put(employeeId,"2026-11",{days:[],overtime:[{date:"2026-11-25",minutes:120,settlement:"pay",revision:1}]},ctx);
  throw Error("COMP_USED_SWITCH_TO_PAY_ALLOWED");
 }catch(e){check(e instanceof HrValidationError&&e.status===409,"COMP_USED_CANNOT_SWITCH_TO_PAY");}
 const unchanged=await db.prepare("SELECT settlement,minutes,revision FROM hr_overtime_days WHERE id=?").bind(credit.id).first<{settlement:string;minutes:number;revision:number}>();
 check(unchanged?.settlement==="comp"&&unchanged.minutes===120&&unchanged.revision===1,"COMP_REVERSAL_NO_MUTATION");
 const extended=await comp.extend("overtime",credit.id,ctx);
 check(extended.expiresOn==="2027-01-31","OVERTIME_EXTENSION");
 await attendance.put(employeeId,"2026-11",{days:[],overtime:[{date:"2026-11-25",minutes:120,settlement:"comp",note:"延長補休期限後修改備註",revision:1}]},ctx);
 const keptExpiry=await db.prepare("SELECT comp_expires_on,note,revision FROM hr_overtime_days WHERE id=?").bind(credit.id).first<{comp_expires_on:string;note:string;revision:number}>();
 check(keptExpiry?.comp_expires_on==="2027-01-31"&&keptExpiry.note==="延長補休期限後修改備註"&&keptExpiry.revision===2,"EXTENDED_EXPIRY_PRESERVED_ON_EDIT");
 check(types.find(x=>x.code==="換")?.is_active===0,"SWAP_RETIRED");
 try{await leave.create({employeeId,leaveTypeId:compType.id,date:"2026-11-26",wholeDay:true},ctx);throw Error("COMP_OVERDRAWN")}
 catch(e){check(e instanceof HrLeaveError&&e.code==="HR_COMP_INSUFFICIENT","COMP_INSUFFICIENT");}
 await db.prepare("INSERT OR IGNORE INTO hr_holidays(date,name) VALUES('2026-12-25','測試節日')").run();
 await leave.create({employeeId,leaveTypeId:compType.id,date:"2026-11-26",wholeDay:true,advanceHolidayDate:"2026-12-25"},ctx);
 const owed=await comp.get(employeeId,"2026-11-28");
 check(owed.balances.advanceMinutes===480&&owed.balances.balanceMinutes===60,"HOLIDAY_ADVANCE_APART");
 await comp.grant(employeeId,{kind:"holiday",minutes:480,holidayDate:"2026-12-25"},ctx);
 const repaid=await comp.get(employeeId,"2026-12-26");
 check(repaid.balances.advanceMinutes===0&&repaid.balances.credits.some(x=>x.kind==="holiday"&&x.remainingMinutes===0),"HOLIDAY_ADVANCE_REPAID");
 const settled=await comp.settle(credit.id,{...ctx,now:"2027-03-01T00:00:00.000Z"});
 check(settled.settledMinutes===60,"OVERTIME_SETTLEMENT");
 const forbiddenEnv={DB:db,IDENTITY_APPLICATION_ID:"APP_TEST",IDENTITY_WORKSPACE_ID:"workspace-test",IDENTITY:{
  async fetch(){return Response.json({ok:true,principal:{workspaceId:"workspace-test",employeeId:"fake",employeeNo:"9901",displayName:"測試員工甲",
  workspaceRole:"ADMIN",isIdentityAdmin:false,emailVerified:true,isWorkspaceSuperAdmin:false,credentialVersion:1,employeeRevision:1},
   session:{expiresAt:"2999-01-01T00:00:00.000Z"}})}} as unknown as Fetcher};
 const forbidden=await handleHrRoute(new Request("https://acceptance.test/api/business/hr/leave/summary?year=2026",{headers:{cookie:"cyweb_identity_session=cyid_"+"a".repeat(64)}}),forbiddenEnv,"accept-hr2b-auth");
 check(forbidden?.status===403,"SUPER_ADMIN_ONLY");
 if(hrFiles){
  const binary=Uint8Array.from(atob(jpeg),c=>c.charCodeAt(0));
  const response=await handleHrPhase2bRoute(new Request("https://acceptance.test/api/business/hr/leave-requests/"+sickForm.batchId+"/attachments",{
   method:"POST",headers:{"content-type":"image/jpeg"},body:binary
  }),db,ctx,{HR_FILES:hrFiles});
  check(response?.status===200,"JPEG_UPLOAD");
  const ref=await db.prepare("SELECT id,object_key FROM hr_leave_attachments WHERE batch_id=?").bind(sickForm.batchId).first<{id:number;object_key:string}>();
  check(ref?.id,"ATTACHMENT_METADATA");
  const before=await db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE entity_type='hr_leave_attachment'").first<{n:number}>();
  const view=await handleHrPhase2bRoute(new Request("https://acceptance.test/api/business/hr/leave-attachments/"+ref.id),db,ctx,{HR_FILES:hrFiles});
  check(view?.status===200&&view.headers.get("cache-control")==="private, no-store","JPEG_VIEW");
  const after=await db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE entity_type='hr_leave_attachment'").first<{n:number}>();
  check(before?.n===after?.n,"VIEW_NO_AUDIT");
  await new HrService(db).remove(employeeId,{confirmEmployeeNo:"HR2BTEST001"},ctx,hrFiles);
  const remainingFiles=await db.prepare("SELECT COUNT(*) AS n FROM hr_leave_attachments WHERE batch_id=?").bind(sickForm.batchId).first<{n:number}>();
  check(remainingFiles?.n===0&&await hrFiles.get(ref.object_key)===null,"DELETE_R2_AND_METADATA");
 }
 const events=await db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE entity_type='hr_leave'").first<{n:number}>();
 check((events?.n??0)>=3,"LEAVE_AUDIT");
}
