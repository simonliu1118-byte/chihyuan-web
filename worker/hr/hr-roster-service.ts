import {cyclesFor,classifyRoster,type RosterDay,type RosterResult,type RosterViolation} from "../../shared/hr-roster";
import {AuditService} from "../audit/audit-service";
import {evaluateAttendance} from "../../shared/hr-attendance";
import {HrValidationError,date,integer,object,optional} from "./hr-validation";
import type {HrContext} from "./hr-service";
type Emp={id:number;name:string;employee_no:string;employment_type:"full"|"half"|"casual";schedule_mode:"shift"|"hours"|"none";skip_roster_checks:number;roster_sort:number;job_title_id:number|null;job_title_name:string|null};
type Cell={employee_id:number;store_id:number;work_date:string;kind:"shift"|"hours"|"off"|"leave";off_mark:string|null;shift_type_id:number|null;leave_type_id:number|null;hours:number|null;start_time:string|null;end_time:string|null;marker:string|null;rest_label:string|null;note:string};
type Choice={employeeId:number;date:string;kind:"shift"|"hours"|"off"|"leave"|null;offMark?:string|null;shiftTypeId?:number;leaveTypeId?:number;hours?:number;startTime?:string|null;endTime?:string|null;marker?:string|null;note?:string};
type Approval={employeeId:number;kind:"consecutive"|"over_eight";startDate:string;endDate:string;suggestion:string};
const DAY=86400000;
const day=(t:number)=>new Date(t).toISOString().slice(0,10);
function millis(s:string){return Date.parse(date(s,"date")+"T00:00:00Z")}
function currentDate(now:string){return new Date(Date.parse(now)+8*3600000).toISOString().slice(0,10)}
export function monthBounds(month:string,anchor:string){
 if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month))throw new HrValidationError("month","月份須 YYYY-MM");
 const first=month+"-01",end=day(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0));
 const cycles=cyclesFor(anchor,first,end);
 return {first,end,start:cycles[0].start,finish:cycles.at(-1)!.end,cycles};
}
function checkChoice(raw:unknown,employees:Map<number,Emp>,shifts:Set<number>,leaves:Set<number>,month:string):Choice{
 const x=object(raw),employeeId=integer(x.employeeId,"employeeId",true),dateValue=date(x.date,"date");
 const emp=employees.get(employeeId);
 if(!emp)throw new HrValidationError("employeeId","非門市員工");
 if(!dateValue.startsWith(month+"-"))throw new HrValidationError("date","僅允許修改此月份");
 if(x.kind===null)return {employeeId,date:dateValue,kind:null};
 const kind=x.kind as Choice["kind"],marker=x.marker?String(x.marker):undefined,note=optional(x.note,"note",500)??"";
 if(!["shift","hours","off","leave"].includes(String(kind)))throw new HrValidationError("kind","格子類型不正確");
 if(marker&&!["home","booth"].includes(marker))throw new HrValidationError("marker","註記不正確");
 if(emp.schedule_mode==="none"&&(kind!=="off"||x.offMark!=="x"))throw new HrValidationError("kind","不排班兼職只能填 X");
 if(kind==="off"){
  const offMark=x.offMark==="x"?"x":"slash";
  if(offMark==="x"&&emp.employment_type!=="casual")throw new HrValidationError("offMark","X 僅限兼職");
  return {employeeId,date:dateValue,kind,offMark,note};
 }
 if(kind==="shift"){
  if(emp.schedule_mode!=="shift")throw new HrValidationError("kind","此人不使用班別排班");
  const shiftTypeId=integer(x.shiftTypeId,"shiftTypeId",true);
  if(!shifts.has(shiftTypeId))throw new HrValidationError("shiftTypeId","班別不存在或停用");
  return {employeeId,date:dateValue,kind,shiftTypeId,marker,note};
 }
 if(kind==="hours"){
  if(emp.schedule_mode!=="hours")throw new HrValidationError("kind","此人不使用時數排班");
  const hours=Number(x.hours);
  if(!Number.isFinite(hours)||hours<=0||hours>24||hours*4!==Math.trunc(hours*4))throw new HrValidationError("hours","時數須為 0.25 的倍數");
  const startTime=x.startTime?String(x.startTime):null,endTime=x.endTime?String(x.endTime):null;
  if(Boolean(startTime)!==Boolean(endTime))throw new HrValidationError("startTime","起訖時間須一起填寫");
  if(startTime&&endTime){
   if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(endTime)||endTime<=startTime)throw new HrValidationError("startTime","不支援跨午夜時段");
   const minutes=(Number(endTime.slice(0,2))*60+Number(endTime.slice(3)))-(Number(startTime.slice(0,2))*60+Number(startTime.slice(3)));
   if(minutes!==hours*60)throw new HrValidationError("hours","時段與輸入時數不一致");
  }
  return {employeeId,date:dateValue,kind,hours,startTime,endTime,marker,note};
 }
 const leaveTypeId=integer(x.leaveTypeId,"leaveTypeId",true);
 if(!leaves.has(leaveTypeId))throw new HrValidationError("leaveTypeId","假別不存在或停用");
 return {employeeId,date:dateValue,kind:"leave",leaveTypeId,marker,note};
}
function asCell(c:Choice,storeId:number):Cell{
 return {employee_id:c.employeeId,store_id:storeId,work_date:c.date,kind:c.kind as Cell["kind"],off_mark:c.offMark??null,shift_type_id:c.shiftTypeId??null,
  leave_type_id:c.leaveTypeId??null,hours:c.hours??null,start_time:c.startTime??null,end_time:c.endTime??null,marker:c.marker??null,rest_label:null,note:c.note??""};
}
function equal(a:Cell|undefined,b:Choice){if(!a)return b.kind===null;if(b.kind===null)return false;
 return a.kind===b.kind&&a.off_mark===(b.offMark??null)&&a.shift_type_id===(b.shiftTypeId??null)&&a.leave_type_id===(b.leaveTypeId??null)
  &&a.hours===(b.hours??null)&&a.start_time===(b.startTime??null)&&a.end_time===(b.endTime??null)&&a.marker===(b.marker??null)&&a.note===(b.note??"");
}
function rosterDay(d:string,row:Cell|undefined,shifts:Map<number,Record<string,unknown>>,leaves:Map<number,Record<string,unknown>>):RosterDay{
 if(!row)return {date:d,kind:"unscheduled"};
 if(row.kind==="off")return {date:d,kind:"off",offMark:row.off_mark==="x"?"x":"slash",minutes:0};
 if(row.kind==="shift"){const data=shifts.get(row.shift_type_id??0);return {date:d,kind:"shift",minutes:Number(data?.normal_minutes??0),shiftCode:String(data?.code??"")};}
 if(row.kind==="hours")return {date:d,kind:"hours",minutes:Math.round((row.hours??0)*60)};
 return {date:d,kind:"leave",leaveCode:String(leaves.get(row.leave_type_id??0)?.code??""),minutes:0};
}
export class HrRosterError extends Error {
 constructor(readonly code:"HR_ROSTER_VIOLATION"|"HR_ROSTER_CONSECUTIVE"|"HR_LEAVE_FORM_EXISTS",readonly items:unknown[]){super(code)}
}
export class HrRosterService {
 constructor(private db:D1Database){}
 private async read(storeId:number,month:string) {
  const store=await this.db.prepare("SELECT * FROM hr_stores WHERE id=?").bind(storeId).first<Record<string,unknown>>();
  if(!store)throw new HrValidationError("storeId","門市不存在",404);
  const bounds=monthBounds(month,String(store.cycle_anchor_date));
  // One extra fortnight before and week after, so runs and 例假 continue across the loaded range.
  const lookStart=day(millis(bounds.start)-14*DAY),lookEnd=day(millis(bounds.finish)+7*DAY);
  const [e,d,s,l,h,m,a,p]=await Promise.all([
   this.db.prepare("SELECT e.id,e.employee_no,e.name,e.employment_type,e.schedule_mode,e.skip_roster_checks,e.roster_sort,e.job_title_id,j.name AS job_title_name FROM hr_employees e LEFT JOIN hr_job_titles j ON j.id=e.job_title_id WHERE e.store_id=? AND e.status<>'terminated' ORDER BY j.sort_order,e.roster_sort,e.id LIMIT 101").bind(storeId).all<Emp>(),
   this.db.prepare("SELECT * FROM hr_schedule_days WHERE store_id=? AND work_date BETWEEN ? AND ? ORDER BY employee_id,work_date LIMIT 10001").bind(storeId,lookStart,lookEnd).all<Cell>(),
   this.db.prepare("SELECT * FROM hr_shift_types ORDER BY sort_order,id LIMIT 100").all<Record<string,unknown>>(),
   this.db.prepare("SELECT * FROM hr_leave_types ORDER BY sort_order,id LIMIT 100").all<Record<string,unknown>>(),
   this.db.prepare("SELECT date,name FROM hr_holidays WHERE date BETWEEN ? AND ? LIMIT 100").bind(bounds.first,bounds.end).all(),
   this.db.prepare("SELECT notes,rules FROM hr_schedule_months WHERE store_id=? AND month=?").bind(storeId,month).first<{notes:string;rules:string}>(),
   this.db.prepare("SELECT employee_id,kind,start_date,end_date FROM hr_roster_approvals WHERE start_date<=? AND end_date>=? LIMIT 1000").bind(lookEnd,lookStart).all<{employee_id:number;kind:string;start_date:string;end_date:string}>(),
   this.db.prepare("SELECT employee_id,MAX(work_date) AS work_date FROM hr_schedule_days WHERE store_id=? AND rest_label='regular' AND work_date<? GROUP BY employee_id").bind(storeId,lookStart).all<{employee_id:number;work_date:string}>()
  ]);
  const employees=e.results??[],days=d.results??[],shifts=s.results??[],leaveTypes=l.results??[];
  if(employees.length>100||days.length>10000)throw new HrValidationError("limit","門市排班超過 100 人或 10,000 列安全上限");
  const byKey=new Map(days.map(x=>[x.employee_id+"|"+x.work_date,x]));
  const previousRegular=new Map((p.results??[]).map(x=>[x.employee_id,x.work_date]));
  return {store,bounds,lookStart,lookEnd,month,employees,days,shifts,leaveTypes,holidays:h.results??[],notes:m?.notes??"",rules:m?.rules??String(store.rules_template??""),approvals:a.results??[],byKey,previousRegular};
 }
 private evaluate(b:Awaited<ReturnType<HrRosterService["read"]>>,rows:Map<string,Cell>,today:string){
  const start=millis(b.lookStart),end=millis(b.lookEnd),dates=Array.from({length:Math.round((end-start)/DAY)+1},(_,i)=>day(start+i*DAY));
  const inRange=(from:string,to:string)=>to>=b.bounds.start&&from<=b.bounds.finish;
  const shifts=new Map(b.shifts.map(x=>[Number(x.id),x])),leaves=new Map(b.leaveTypes.map(x=>[Number(x.id),x]));
  const classification:Record<string,RosterResult>={},staffing:Record<string,Record<string,number>>={};
  for(const e of b.employees){
   const input=dates.map(d=>rosterDay(d,rows.get(e.id+"|"+d),shifts,leaves));
   const fixedRegularOff=new Set(dates.filter(d=>d<today&&rows.get(e.id+"|"+d)?.rest_label==="regular"));
   const full=classifyRoster(input,b.previousRegular.get(e.id)??null,{anchorMonday:String(b.store.cycle_anchor_date),employmentType:e.employment_type,skipChecks:e.skip_roster_checks===1,scheduleMode:e.schedule_mode,fixedRegularOff});
   // Report only what touches the loaded fortnights; the look-around days only give context.
   const result:RosterResult={...full,violations:full.violations.filter(v=>inRange(v.from,v.to)),
    consecutive:full.consecutive.filter(x=>inRange(x.startDate,x.endDate)),sixthDays:full.sixthDays.filter(d=>inRange(d,d)),overEight:full.overEight.filter(d=>inRange(d,d))};
   classification[String(e.id)]=result;
   for(const x of input)if(x.date>=b.bounds.first&&x.date<=b.bounds.end&&x.shiftCode){
    const count=staffing[x.date]??(staffing[x.date]={});count[x.shiftCode]=(count[x.shiftCode]??0)+1;
   }
  }return {classification,staffing};
 }

 /**
  * Preflight whole-day formal leave against the same classification as roster PUT.
  * The returned statements are deliberately not executed here: the caller puts
  * them in the very same D1 batch as leave records, schedule edits and audit.
  */
 async planFormalLeave(storeId:number,employeeId:number,dates:readonly string[],typeId:number,ctx:HrContext,approvals:unknown):Promise<D1PreparedStatement[]>{
  const at=currentDate(ctx.now),requested=new Set(dates),out:D1PreparedStatement[]=[];
  if(!requested.size)return out;
  const months=[...new Set(dates.map(x=>x.slice(0,7)))].sort();
  const granted=new Set<string>(),seen=new Set<string>(),updatedOff=new Set<string>();
  const provided=Array.isArray(approvals)?approvals.map(object):[];
  if(provided.length>100)throw new HrValidationError("approve","核准筆數超過上限");
  const allow=new Set(provided.map(x=>String(x.employeeId)+"|"+String(x.kind)+"|"+String(x.startDate)+"|"+String(x.endDate)));
  const missing:{employeeId:number;kind:string;startDate:string;endDate:string;suggestion:string}[]=[];
  const violations:(RosterViolation&{employeeId:number})[]=[];
  for(const month of months){
   const b=await this.read(storeId,month);
   if(!b.employees.some(x=>x.id===employeeId))throw new HrValidationError("employeeId","員工不在指定門市");
   const staged=new Map(b.byKey);
   for(const date of dates){
    if(date<b.lookStart||date>b.lookEnd)continue;
    const key=employeeId+"|"+date,current=staged.get(key);
    staged.set(key,{employee_id:employeeId,store_id:storeId,work_date:date,kind:"leave",off_mark:null,shift_type_id:null,leave_type_id:typeId,
     hours:null,start_time:null,end_time:null,marker:null,rest_label:null,note:current?.note??""});
   }
   const result=this.evaluate(b,staged,at).classification[String(employeeId)];
   // A leave form is blocked only by violations it creates, not by problems already in the saved roster.
   const existing=new Set(this.evaluate(b,b.byKey,at).classification[String(employeeId)].violations.map(v=>v.code+"|"+v.from+"|"+v.to));
   for(const v of result.violations)if(v.dates.some(d=>d>=at)&&!existing.has(v.code+"|"+v.from+"|"+v.to)&&!violations.some(x=>x.code===v.code&&x.from===v.from&&x.to===v.to))
     violations.push({...v,employeeId});
   const currentApprovals=new Set(b.approvals.map(x=>x.employee_id+"|"+x.kind+"|"+x.start_date+"|"+x.end_date));
   const needed=[
    ...result.consecutive.filter(x=>x.days===6&&x.endDate>=at).map(x=>({employeeId,kind:"consecutive",startDate:x.startDate,endDate:x.endDate,suggestion:x.suggestion})),
    ...result.overEight.filter(x=>x>=at).map(x=>({employeeId,kind:"over_eight",startDate:x,endDate:x,suggestion:"兼職單日超過八小時須核准"}))
   ];
   for(const x of needed){
    const key=x.employeeId+"|"+x.kind+"|"+x.startDate+"|"+x.endDate;
    if(seen.has(key)||currentApprovals.has(key))continue;
    seen.add(key);
    if(allow.has(key)){
     if(!granted.has(key))out.push(this.db.prepare("INSERT OR IGNORE INTO hr_roster_approvals(employee_id,kind,start_date,end_date,approved_by,approved_at) VALUES(?,?,?,?,?,?)").bind(x.employeeId,x.kind,x.startDate,x.endDate,ctx.actor,ctx.now));
     granted.add(key);
    }else missing.push(x);
   }
   for(const row of b.days){
    if(row.employee_id!==employeeId||row.kind!=="off"||row.work_date<at||requested.has(row.work_date))continue;
    const label=result.labels[row.work_date],rest=label==="regular_off"?"regular":label==="rest_day"?"rest":null;
    const key=employeeId+"|"+row.work_date;
    if(row.rest_label!==rest&&!updatedOff.has(key)){updatedOff.add(key);out.push(this.db.prepare("UPDATE hr_schedule_days SET rest_label=?,updated_at=?,updated_by=? WHERE employee_id=? AND work_date=?").bind(rest,ctx.now,ctx.actor,employeeId,row.work_date));}
   }
  }
  if(violations.length)throw new HrRosterError("HR_ROSTER_VIOLATION",violations);
  if(missing.length)throw new HrRosterError("HR_ROSTER_CONSECUTIVE",missing);
  return out;
 }

 async updateStaff(storeId:number,raw:unknown,ctx:HrContext){
  const v=object(raw),id=integer(v.employeeId,"employeeId",true),sort=integer(v.rosterSort,"rosterSort");
  if(typeof v.skipRosterChecks!=="boolean")throw new HrValidationError("skipRosterChecks","須選擇是否檢核");
  const before=await this.db.prepare("SELECT id,store_id,roster_sort,skip_roster_checks FROM hr_employees WHERE id=? AND store_id=?").bind(id,storeId).first<Record<string,unknown>>();
  if(!before)throw new HrValidationError("employeeId","員工不屬於門市",404);
  const check=v.skipRosterChecks?1:0;
  if(Number(before.roster_sort)===sort&&Number(before.skip_roster_checks)===check)return {saved:true};
  await this.db.batch([
   this.db.prepare("UPDATE hr_employees SET roster_sort=?,skip_roster_checks=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND store_id=?").bind(sort,check,ctx.now,ctx.actor,id,storeId),
   new AuditService(this.db).prepareRecord({entityType:"hr_employee",entityKey:String(id),action:"hr_employee.updated",
     actorEmployeeId:ctx.actor,requestId:ctx.requestId,before:{rosterSort:before.roster_sort,skipRosterChecks:before.skip_roster_checks},
     after:{rosterSort:sort,skipRosterChecks:check}})
  ]);
  return {saved:true};
 }
 async get(storeId:number,month:string){
  const b=await this.read(storeId,month),checked=this.evaluate(b,b.byKey,currentDate(new Date().toISOString()));
  const casualNone=new Set(b.employees.filter(x=>x.employment_type==="casual"&&x.schedule_mode==="none").map(x=>x.id));
  const actualHours:Record<string,Record<string,number>>={};
  if(casualNone.size){
   const rows=await this.db.prepare("SELECT a.employee_id,a.work_date,a.in1,a.out1,a.in2,a.out2 FROM hr_attendance_days a JOIN hr_employees e ON e.id=a.employee_id WHERE e.store_id=? AND a.work_date BETWEEN ? AND ? ORDER BY a.employee_id,a.work_date LIMIT 3101").bind(storeId,b.bounds.first,b.bounds.end).all<{employee_id:number;work_date:string;in1:string|null;out1:string|null;in2:string|null;out2:string|null}>();
   if((rows.results??[]).length>3100)throw new HrValidationError("limit","出勤資料超過安全查詢上限");
   for(const row of rows.results??[])if(casualNone.has(row.employee_id)){
    const group=actualHours[String(row.employee_id)]??(actualHours[String(row.employee_id)]={});
    group[row.work_date]=evaluateAttendance(null,null,row,{noRosterPartTime:true}).workedMinutes/60;
   }
  }
  const leaveForms=(await this.db.prepare("SELECT r.employee_id,r.work_date,r.batch_id,r.whole_day,r.minutes,t.code FROM hr_leave_records r JOIN hr_leave_types t ON t.id=r.leave_type_id WHERE r.cancelled_at IS NULL AND r.work_date BETWEEN ? AND ? AND r.employee_id IN (SELECT id FROM hr_employees WHERE store_id=?) ORDER BY r.id LIMIT 10000").bind(b.bounds.start,b.bounds.finish,storeId).all<{employee_id:number;work_date:string;batch_id:string;whole_day:number;minutes:number;code:string}>()).results??[];
  return {leaveForms,actualHours,store:b.store,month,bounds:b.bounds,employees:b.employees,shifts:b.shifts,leaveTypes:b.leaveTypes,
   holidays:b.holidays,notes:b.notes,rules:b.rules,days:b.days,approvals:b.approvals,...checked};
 }
 async put(storeId:number,month:string,raw:unknown,ctx:HrContext){
  const payload=object(raw),b=await this.read(storeId,month);
  if(!Array.isArray(payload.changes)||payload.changes.length>3100)throw new HrValidationError("changes","最多 3,100 個變動格");
  const members=new Map(b.employees.map(e=>[e.id,e]));
  const shifts=new Set(b.shifts.filter(s=>s.is_active===1).map(s=>Number(s.id)));
  const leaves=new Set(b.leaveTypes.filter(l=>l.is_active===1).map(l=>Number(l.id)));
  const changes=payload.changes.map(x=>checkChoice(x,members,shifts,leaves,month));
  const keys=new Set<string>();
  for(const c of changes){const key=c.employeeId+"|"+c.date;if(keys.has(key))throw new HrValidationError("changes","日期重複");keys.add(key)}
  const changed=changes.filter(c=>!equal(b.byKey.get(c.employeeId+"|"+c.date),c));
  // Cells with a completed whole-day leave form change only through 銷假 (one query for the month, not per cell).
  const formed=new Set(((await this.db.prepare("SELECT r.employee_id,r.work_date FROM hr_leave_records r JOIN hr_employees e ON e.id=r.employee_id WHERE e.store_id=? AND r.cancelled_at IS NULL AND r.whole_day=1 AND r.work_date BETWEEN ? AND ? LIMIT 10001").bind(storeId,b.bounds.first,b.bounds.end).all<{employee_id:number;work_date:string}>()).results??[]).map(x=>x.employee_id+"|"+x.work_date));
  const locked=changed.filter(c=>formed.has(c.employeeId+"|"+c.date));
  if(locked.length)throw new HrRosterError("HR_LEAVE_FORM_EXISTS",locked.map(c=>({employeeId:c.employeeId,date:c.date,message:"已完成假單，請先在假單銷假"})));
  const staged=new Map(b.byKey);for(const c of changed){const key=c.employeeId+"|"+c.date;
   if(c.kind===null)staged.delete(key);else staged.set(key,asCell(c,storeId));
  }
  const at=currentDate(ctx.now),checked=this.evaluate(b,staged,at);
  const violations:(RosterViolation&{employeeId:number})[]=[],pending:Approval[]=[],granted:Approval[]=[];
  const saved=new Set(b.approvals.map(x=>x.employee_id+"|"+x.kind+"|"+x.start_date+"|"+x.end_date));
  const approvals=Array.isArray(payload.approve)?payload.approve.map(object):[];
  if(approvals.length>100)throw new HrValidationError("approve","核准筆數太多");
  const inputKeys=new Set(approvals.map(x=>String(x.employeeId)+"|"+String(x.kind)+"|"+String(x.startDate)+"|"+String(x.endDate)));
  for(const employee of b.employees){
   const result=checked.classification[String(employee.id)];
   for(const violation of result.violations)violations.push({...violation,employeeId:employee.id});
   const need:Approval[]=[
    ...result.consecutive.filter(x=>x.days===6&&x.endDate>=at).map(x=>({employeeId:employee.id,kind:"consecutive" as const,startDate:x.startDate,endDate:x.endDate,suggestion:x.suggestion})),
    ...result.overEight.filter(x=>x>=at).map(x=>({employeeId:employee.id,kind:"over_eight" as const,startDate:x,endDate:x,suggestion:"兼職單日排班超過 8 小時，需主管核准"}))
   ];
   for(const x of need){const key=x.employeeId+"|"+x.kind+"|"+x.startDate+"|"+x.endDate;
    if(saved.has(key))continue;if(inputKeys.has(key))granted.push(x);else pending.push(x);
   }
  }
  // Historical anomalies are returned but never stop retrospective corrections.
  if(violations.some(v=>v.dates.some(d=>d>=at)))throw new HrRosterError("HR_ROSTER_VIOLATION",violations);
  if(pending.length)throw new HrRosterError("HR_ROSTER_CONSECUTIVE",pending);
  const notes=payload.notes===undefined?b.notes:optional(payload.notes,"notes",5000)??"";
  const rules=payload.rules===undefined?b.rules:optional(payload.rules,"rules",5000)??"";
  const stmts:D1PreparedStatement[]=[];
  for(const c of changed){
   if(c.kind===null){stmts.push(this.db.prepare("DELETE FROM hr_schedule_days WHERE employee_id=? AND work_date=?").bind(c.employeeId,c.date));continue;}
   const label=checked.classification[String(c.employeeId)]?.labels[c.date],rest=label==="regular_off"?"regular":label==="rest_day"?"rest":null;
   stmts.push(this.db.prepare("INSERT INTO hr_schedule_days(employee_id,store_id,work_date,kind,off_mark,leave_type_id,shift_type_id,hours,start_time,end_time,marker,rest_label,note,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(employee_id,work_date) DO UPDATE SET store_id=excluded.store_id,kind=excluded.kind,off_mark=excluded.off_mark,leave_type_id=excluded.leave_type_id,shift_type_id=excluded.shift_type_id,hours=excluded.hours,start_time=excluded.start_time,end_time=excluded.end_time,marker=excluded.marker,rest_label=excluded.rest_label,note=excluded.note,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(c.employeeId,storeId,c.date,c.kind,c.offMark??null,c.leaveTypeId??null,c.shiftTypeId??null,c.hours??null,c.startTime??null,c.endTime??null,c.marker??null,rest,c.note??"",ctx.now,ctx.actor));
  }
  for(const row of b.days){const key=row.employee_id+"|"+row.work_date;
   if(keys.has(key)||row.kind!=="off"||row.work_date<at)continue;
   const label=checked.classification[String(row.employee_id)]?.labels[row.work_date];
   const desired=label==="regular_off"?"regular":label==="rest_day"?"rest":null;
   if(row.rest_label!==desired)stmts.push(this.db.prepare("UPDATE hr_schedule_days SET rest_label=?,updated_at=?,updated_by=? WHERE employee_id=? AND work_date=?").bind(desired,ctx.now,ctx.actor,row.employee_id,row.work_date));
  }
  if(notes!==b.notes||rules!==b.rules)stmts.push(this.db.prepare("INSERT INTO hr_schedule_months(store_id,month,notes,rules,updated_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(store_id,month) DO UPDATE SET notes=excluded.notes,rules=excluded.rules,updated_at=excluded.updated_at,updated_by=excluded.updated_by").bind(storeId,month,notes,rules,ctx.now,ctx.actor));
  for(const a of granted)stmts.push(this.db.prepare("INSERT OR IGNORE INTO hr_roster_approvals(employee_id,kind,start_date,end_date,approved_by,approved_at) VALUES(?,?,?,?,?,?)").bind(a.employeeId,a.kind,a.startDate,a.endDate,ctx.actor,ctx.now));
  if(stmts.length){
   stmts.push(new AuditService(this.db).prepareRecord({entityType:"hr_roster",entityKey:storeId+"|"+month,action:"hr_roster.updated",actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{days:changed.map(c=>({employeeId:c.employeeId,date:c.date,kind:c.kind,shiftTypeId:c.shiftTypeId??null,leaveTypeId:c.leaveTypeId??null,hours:c.hours??null})),approved:granted,notesChanged:notes!==b.notes,rulesChanged:rules!==b.rules}}));
   await this.db.batch(stmts);
  }
  return {saved:true,changedDays:changed.length,violations,roster:await this.get(storeId,month)};
 }
}
