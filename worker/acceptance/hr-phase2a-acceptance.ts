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
 try{mondayAnchor("2026-09-29");throw Error("INVALID_ANCHOR_NOT_REJECTED")}catch(e){check(String(e).includes("cycleAnchorDate"),"MONDAY_ONLY")}
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
 const repeat=await roster.put(store,"2026-11",{changes:[]},ctx);
 check(repeat.changedDays===0,"ROSTER_IDEMPOTENT");
 check((await db.prepare("SELECT COUNT(*) AS n FROM hr_roster_approvals WHERE employee_id=?").bind(id).first<{n:number}>())!.n===1,"APPROVAL_PERSISTED");
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
