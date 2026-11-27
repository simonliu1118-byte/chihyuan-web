import {HrRosterService,HrRosterError,monthBounds} from "../hr/hr-roster-service";
import {HrAttendanceService} from "../hr/hr-attendance-service";
import {HrSettingsService,mondayAnchor,shiftPayload} from "../hr/hr-settings-service";
import {handleHrRoute} from "../http/hr-routes";
import {classifyRoster,cyclesFor} from "../../shared/hr-roster";
import {evaluateAttendance,normalizePunchTime} from "../../shared/hr-attendance";
function check(v:unknown,code:string):asserts v{if(!v)throw Error("ACCEPT_HR2A_"+code)}
export async function acceptHrPhase2a(db:D1Database){
 const ctx={actor:1,now:"2026-10-20T03:00:00.000Z",requestId:"accept-hr2a"},store=1;
 const names=(await db.prepare("SELECT name FROM hr_stores").all<{name:string}>()).results??[];
 check(names.some(x=>x.name==="志遠高雄門市"),"DEFAULT_STORE");
 check((await db.prepare("SELECT COUNT(*) AS n FROM hr_job_titles").first<{n:number}>())!.n>=5,"JOB_TITLES");
 check((await db.prepare("SELECT COUNT(*) AS n FROM hr_shift_types").first<{n:number}>())!.n>=6,"SHIFTS");
 check((await db.prepare("SELECT COUNT(*) AS n FROM hr_leave_types").first<{n:number}>())!.n>=17,"LEAVES");
 try{mondayAnchor("2026-09-29");throw Error("INVALID_ANCHOR_NOT_REJECTED")}catch(e){check(e instanceof Error && e.message.includes("星期一"),"MONDAY_ONLY")}
 check(shiftPayload({code:"早",name:"早",startTime:"09:00",endTime:"17:30",breakStart:"13:00",breakEnd:"13:30"}).normalMinutes===480,"SHIFT_MINUTES");
 check(cyclesFor("2026-09-28","2026-10-01","2026-10-31")[0].start==="2026-09-28","CYCLE_CROSS_MONTH");
 const dates=Array.from({length:7},(_,i)=>new Date(Date.UTC(2026,10,2+i)).toISOString().slice(0,10));
 const checks=classifyRoster(dates.map((date,i)=>({date,kind:i===6?"off":"shift",offMark:i===6?"slash":undefined,minutes:i===6?0:480})),null,{anchorMonday:"2026-09-28",employmentType:"full"});
 check(checks.consecutive[0]?.days===6,"SIX_DAYS");
 check(classifyRoster(dates.map(date=>({date,kind:"shift",minutes:480})),null,{anchorMonday:"2026-09-28"}).violations.some(x=>x.code==="CONSECUTIVE_7"),"SEVEN_BLOCK");
 check(normalizePunchTime("905")==="09:05","PUNCH_9_05");
 check(evaluateAttendance({kind:"shift"},{startTime:"09:00",endTime:"17:30",breakStart:"13:00",breakEnd:"13:30",normalMinutes:480},{in1:"09:05",out1:"17:15"}).lateMinutes===5,"LATE");
 const result=await db.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,employment_type,schedule_mode,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)")
  .bind("HR2ATEST001","測試員工甲","active","2025-01-01","2025-01-01",store,"full","shift",ctx.now,ctx.now).run();
 const id=Number(result.meta.last_row_id);
 check(id>0,"EMPLOYEE_INSERT");
 const roster=new HrRosterService(db);
 const initial=await roster.get(store,"2026-10");
 check(initial.bounds.start==="2026-09-28"&&initial.bounds.finish==="2026-11-08","ROSTER_BOUNDS");
 check(initial.classificationContext.start<initial.bounds.start&&initial.classificationContext.end>initial.bounds.finish&&!!initial.classificationContext.asOf,"ROSTER_DRAFT_CONTEXT");
 await roster.updateStaff(store,{staff:[{employeeId:id,rosterSort:2,skipRosterChecks:true}]},ctx);
 const updated=await roster.get(store,"2026-10");
 check(updated.employees.find(x=>x.id===id)?.roster_sort===2&&updated.employees.find(x=>x.id===id)?.skip_roster_checks===1,"STAFF_BATCH_UPDATE");
 try{await roster.updateStaff(store,{staff:[{employeeId:id,rosterSort:3,skipRosterChecks:false},{employeeId:999999999,rosterSort:0,skipRosterChecks:false}]},ctx);throw Error("STAFF_INVALID_NOT_REJECTED")}catch(e){check(e instanceof Error&&e.message.includes("不屬於門市"),"STAFF_BATCH_ATOMIC")}
 check((await roster.get(store,"2026-10")).employees.find(x=>x.id===id)?.roster_sort===2,"STAFF_BATCH_NO_PARTIAL_WRITE");
 await roster.updateStaff(store,{staff:[{employeeId:id,rosterSort:0,skipRosterChecks:false}]},ctx);
 // Different titles must be reorderable: store-specific roster_sort is the primary ordering key.
 const title=await db.prepare("SELECT id FROM hr_job_titles ORDER BY sort_order,id LIMIT 1").first<{id:number}>();
 check(title?.id,"STAFF_TITLE_EXISTS");
 const other=await db.prepare("INSERT INTO hr_employees(employee_no,name,status,hire_date,seniority_start_date,store_id,job_title_id,employment_type,schedule_mode,skip_roster_checks,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)")
  .bind("HR2ATEST002","測試員工乙","active","2025-01-01","2025-01-01",store,title.id,"casual","none",1,ctx.now,ctx.now).run();
 const otherId=Number(other.meta.last_row_id);
 const members=(await roster.get(store,"2026-10")).employees;
 check(members.find(x=>x.id===id)?.job_title_id!==members.find(x=>x.id===otherId)?.job_title_id,"STAFF_DISTINCT_TITLES");
 await roster.updateStaff(store,{staff:[{employeeId:id,rosterSort:1,skipRosterChecks:false},{employeeId:otherId,rosterSort:0,skipRosterChecks:true}]},ctx);
 const firstOrder=(await roster.get(store,"2026-10")).employees.map(x=>x.id);
 check(firstOrder.indexOf(otherId)<firstOrder.indexOf(id),"STAFF_CROSS_TITLE_ORDER");
 await roster.updateStaff(store,{staff:[{employeeId:id,rosterSort:0,skipRosterChecks:false},{employeeId:otherId,rosterSort:1,skipRosterChecks:true}]},ctx);
 const secondOrder=(await roster.get(store,"2026-10")).employees.map(x=>x.id);
 check(secondOrder.indexOf(id)<secondOrder.indexOf(otherId),"STAFF_CROSS_TITLE_REVERSE");
 const shift=await db.prepare("SELECT id FROM hr_shift_types WHERE code='早'").first<{id:number}>();
 check(shift?.id,"SHIFT_EXISTS");
 const seven=dates.map(date=>({employeeId:id,date,kind:"shift",shiftTypeId:shift!.id}));
 try{await roster.put(store,"2026-11",{changes:seven},ctx);throw Error("SEVEN_NOT_BLOCKED")}
 catch(e){check(e instanceof HrRosterError&&e.code==="HR_ROSTER_VIOLATION","SEVEN_BLOCK_AT_SAVE")}
 const six=dates.map((date,i)=>i===6?{employeeId:id,date,kind:"off",offMark:"slash"}:{employeeId:id,date,kind:"shift",shiftTypeId:shift!.id});
 let approvals:{employeeId:number;kind:string;startDate:string;endDate:string}[]=[];
 try{await roster.put(store,"2026-11",{changes:six},ctx);throw Error("SIX_NOT_GATED")}
 catch(e){check(e instanceof HrRosterError&&e.code==="HR_ROSTER_CONSECUTIVE","SIX_APPROVAL_GATE");approvals=e.items as typeof approvals}
 check(approvals.length===1&&approvals[0].kind==="consecutive","SIX_APPROVAL_ITEMS");
 const saved=await roster.put(store,"2026-11",{changes:six,approve:approvals},ctx);
 check(saved.changedDays===7,"ROSTER_CHANGED_SEVEN");
 check(saved.roster.classification[String(id)].labels["2026-11-08"]==="off","PARTIAL_MONTH_OFF_PENDING");
 check((await db.prepare("SELECT rest_label FROM hr_schedule_days WHERE employee_id=? AND work_date=?").bind(id,"2026-11-08").first<{rest_label:string|null}>())?.rest_label===null,"PARTIAL_MONTH_OFF_UNCLASSIFIED");
 const repeat=await roster.put(store,"2026-11",{changes:[]},ctx);
 check(repeat.changedDays===0,"ROSTER_IDEMPOTENT");
 check((await db.prepare("SELECT COUNT(*) AS n FROM hr_roster_approvals WHERE employee_id=?").bind(id).first<{n:number}>())!.n===1,"APPROVAL_PERSISTED");
 const feb=Array.from({length:28},(_,i)=>({employeeId:id,date:"2027-02-"+String(i+1).padStart(2,"0"),...(i%7>=5?{kind:"off",offMark:"slash"}:{kind:"shift",shiftTypeId:shift!.id})}));
 const partialMonth=await roster.put(store,"2027-02",{changes:feb.slice(0,27)},ctx);
 check(partialMonth.roster.classification[String(id)].labels["2027-02-07"]==="off","MONTH_GATE_BEFORE_LAST_DAY");
 const completeMonth=await roster.put(store,"2027-02",{changes:feb.slice(27)},ctx);
 check(completeMonth.roster.classification[String(id)].labels["2027-02-07"]==="regular_off","MONTH_GATE_AFTER_LAST_DAY");
 check((await db.prepare("SELECT rest_label FROM hr_schedule_days WHERE employee_id=? AND work_date=?").bind(id,"2027-02-07").first<{rest_label:string|null}>())?.rest_label==="regular","MONTH_GATE_PERSISTED");
 await roster.updateStaff(store,{staff:[{employeeId:id,rosterSort:0,skipRosterChecks:true}]},ctx);
 const unchecked=await roster.put(store,"2027-03",{changes:[{employeeId:id,date:"2027-03-01",kind:"off",offMark:"slash"}]},ctx);
 check(unchecked.roster.classification[String(id)].labels["2027-03-01"]==="off","UNCHECKED_NEUTRAL_OFF");
 check((await db.prepare("SELECT rest_label FROM hr_schedule_days WHERE employee_id=? AND work_date=?").bind(id,"2027-03-01").first<{rest_label:string|null}>())?.rest_label===null,"UNCHECKED_OFF_UNCLASSIFIED");
 check((await roster.get(store,"2027-02")).classification[String(id)].labels["2027-02-07"]==="off","UNCHECKED_HIDE_OLD_CLASSIFICATION");
 check((await db.prepare("SELECT rest_label FROM hr_schedule_days WHERE employee_id=? AND work_date=?").bind(id,"2027-02-07").first<{rest_label:string|null}>())?.rest_label==="regular","UNCHECKED_PRESERVE_HISTORY");
 await roster.updateStaff(store,{staff:[{employeeId:id,rosterSort:0,skipRosterChecks:false}]},ctx);
 const attendance=new HrAttendanceService(db);
 const write=await attendance.put(id,"2026-11",{days:[{date:"2026-11-02",in1:"0905",out1:"17:15",revision:0}]},ctx);
 check(write.changedDays===1,"ATTENDANCE_WRITTEN");
 const read=await attendance.get(id,"2026-11");
 check(read.days.find(x=>x.date==="2026-11-02")?.lateMinutes===5,"ATTENDANCE_LATE");
 let conflict=false;
 try{await attendance.put(id,"2026-11",{days:[{date:"2026-11-02",in1:"09:05",out1:"17:00",revision:0}]},ctx)}
 catch{conflict=true}check(conflict,"ATTENDANCE_REVISION");
 const settings=new HrSettingsService(db);
 check((await settings.list("stores")).length>=1,"SETTINGS_READ");
 await settings.write("stores",{name:"合成排序門市",cycleAnchorDate:"2026-09-28",sortOrder:999},ctx);
 for(const kind of ["stores","job-titles","shift-types"] as const){
  const before=await settings.list(kind);
  check(before.length>=2,"LOOKUP_REORDER_FIXTURE_"+kind);
  const ids=before.map(x=>Number(x.id)).reverse();
  await settings.reorder(kind,{ids},ctx);
  check((await settings.list(kind)).map(x=>x.id).join()===ids.join(),"LOOKUP_REORDER_"+kind);
  let rejected=false;
  try{await settings.reorder(kind,{ids:ids.map(()=>ids[0])},ctx)}catch{rejected=true}
  check(rejected&&(await settings.list(kind)).map(x=>x.id).join()===ids.join(),"LOOKUP_REORDER_ATOMIC_"+kind);
  await settings.reorder(kind,{ids:before.map(x=>x.id)},ctx);
 }
 await db.prepare("DELETE FROM hr_stores WHERE name=?").bind("合成排序門市").run();
 await settings.saveHoliday({date:"2099-12-25",name:"合成假日",note:"合成備註"},ctx);
 await settings.saveHoliday({date:"2099-01-01",name:"合成假日二"},ctx);
 const holidays=await settings.holidays(2099);
 check(holidays[0]?.date==="2099-01-01"&&holidays[1]?.note==="合成備註","HOLIDAY_DATE_ORDER_NOTE");
 await settings.saveHoliday({date:"2099-12-25",name:"合成假日",note:"已更新"},ctx);
 check((await settings.holidays(2099))[1]?.note==="已更新","HOLIDAY_NOTE_UPDATE");
 await settings.deleteHoliday("2099-12-25",ctx);await settings.deleteHoliday("2099-01-01",ctx);
 const env={DB:db,IDENTITY_APPLICATION_ID:"APP_TEST",IDENTITY_WORKSPACE_ID:"workspace-test",IDENTITY:{
  async fetch(){return Response.json({ok:true,principal:{workspaceId:"workspace-test",employeeId:"hr2a-test",employeeNo:"9911",
    displayName:"測試員工乙",workspaceRole:"ADMIN",isIdentityAdmin:false,emailVerified:true,isWorkspaceSuperAdmin:false,
    credentialVersion:1,employeeRevision:1},session:{expiresAt:"2999-01-01T00:00:00.000Z"}})}} as unknown as Fetcher};
 const res=await handleHrRoute(new Request("https://worker.test/api/business/hr/settings/stores",
  {headers:{cookie:"cyweb_identity_session=cyid_"+"a".repeat(64)}}),env,"hr2a-permission");
 check(res?.status===403,"ADMIN_FORBIDDEN");
 const evt=await db.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE entity_type IN ('hr_roster','hr_attendance')").first<{n:number}>();
 check((evt?.n??0)>=2,"AUDIT_EVENTS");
}
