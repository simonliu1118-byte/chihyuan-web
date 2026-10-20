import {HrLeaveService,HrLeaveError} from "../hr/hr-leave-service";
import {HrRosterService,HrRosterError} from "../hr/hr-roster-service";
import {HrCompService} from "../hr/hr-comp-service";
import {HrAttendanceService} from "../hr/hr-attendance-service";
import {handleHrPhase2bRoute} from "../http/hr-phase2b-routes";
import {handleHrRoute} from "../http/hr-routes";
import {checkLeaveQuota,leaveMinutes,leaveDates} from "../../shared/hr-leave";
import {compBalances} from "../../shared/hr-overtime";

function check(value:unknown,code:string):asserts value{if(!value)throw Error("ACCEPT_HR2B_"+code);}
const jpeg="/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAA0JCgsKCA0LCgsODg0PEyAVExISEyccHhcgLikxMC4pLSwzOko+MzZGNywtQFdBRkxOUlNSMj5aYVpQYEpRUk//2wBDAQ4ODhMREyYVFSZPNS01T09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT09PT0//wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKcAD//Z";
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
 check(compBalances([], [{kind:"holiday",workDate:"2026-10-02",minutes:480}],[],"2026-10-21").holidayMinutes===-480,"HOLIDAY_ADVANCE");
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
 const attendance=new HrAttendanceService(db);
 await attendance.put(employeeId,"2026-11",{days:[],overtime:[{date:"2026-11-25",minutes:60,settlement:"comp",revision:0}]},ctx);
 const clock=await attendance.get(employeeId,"2026-11");
 check(clock.days.find(x=>x.date==="2026-11-25")?.overtime?.minutes===60,"OVERTIME_WRITTEN");
 const credit=await db.prepare("SELECT id,comp_expires_on FROM hr_overtime_days WHERE employee_id=? AND work_date=?").bind(employeeId,"2026-11-25").first<{id:number;comp_expires_on:string}>();
 check(credit?.comp_expires_on==="2026-12-31","COMP_EXPIRY_NEXT_MONTH");
 const extended=await comp.extend("overtime",credit.id,ctx);
 check(extended.expiresOn==="2027-01-31","OVERTIME_EXTENSION");
 await comp.grant(employeeId,{kind:"holiday",minutes:240,holidayDate:"2026-11-01",holidayName:"測試節日"},ctx);
 const swap=types.find(x=>x.code==="換");check(swap,"SWAP_TYPE");
 await leave.create({employeeId,leaveTypeId:swap.id,date:"2026-11-26",wholeDay:true},ctx);
 const balance=await comp.get(employeeId,"2026-11-28");
 check(balance.balances.holidayMinutes===-240,"HOLIDAY_ADVANCE_OFFSET");
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
 }
 const events=await db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE entity_type='hr_leave'").first<{n:number}>();
 check((events?.n??0)>=3,"LEAVE_AUDIT");
}
