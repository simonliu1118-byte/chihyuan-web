import {evaluateAttendance,normalizePunchTime,type AttendanceSchedule,type AttendanceShift,type AttendancePunches} from "../../shared/hr-attendance";
import {AuditService} from "../audit/audit-service";
import {HrCompService} from "./hr-comp-service";
import {overtimeSuggestion,overtimeWarnings,nextMonthEnd} from "../../shared/hr-overtime";
import {HrValidationError,date,integer,object,optional} from "./hr-validation";
import type {HrContext} from "./hr-service";
interface Staff {id:number;store_id:number|null;employment_type:string;schedule_mode:string}
interface Punch {work_date:string;in1:string|null;out1:string|null;in2:string|null;out2:string|null;revision:number;note:string;source:string}
interface Schedule {work_date:string;kind:AttendanceSchedule["kind"];off_mark:string|null;rest_label:string|null;marker:string|null;shift_type_id:number|null;leave_type_id:number|null;hours:number|null}
function monthDates(month:string) {
 if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(month))throw new HrValidationError("month","月份須 YYYY-MM");
 const start=Date.parse(month+"-01T00:00:00Z"),last=new Date(Date.UTC(Number(month.slice(0,4)),Number(month.slice(5,7)),0)).getUTCDate();
 return Array.from({length:last},(_,i)=>new Date(start+i*86400000).toISOString().slice(0,10));
}
export class HrAttendanceService {
 constructor(private db:D1Database){}
 private async staff(id:number){
  const row=await this.db.prepare("SELECT id,store_id,employment_type,schedule_mode FROM hr_employees WHERE id=?").bind(id).first<Staff>();
  if(!row)throw new HrValidationError("employeeId","員工不存在",404);return row;
 }
 async get(id:number,month:string){
  const staff=await this.staff(id),dates=monthDates(month),from=dates[0],to=dates.at(-1)!;
  const [a,s,shiftTypes,leaveTypes,overtimeData,holidays]=await Promise.all([
   this.db.prepare("SELECT * FROM hr_attendance_days WHERE employee_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date LIMIT 32").bind(id,from,to).all<Punch>(),
   this.db.prepare("SELECT * FROM hr_schedule_days WHERE employee_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date LIMIT 32").bind(id,from,to).all<Schedule>(),
   this.db.prepare("SELECT * FROM hr_shift_types LIMIT 100").all<Record<string,unknown>>(),
   this.db.prepare("SELECT id,code FROM hr_leave_types LIMIT 100").all<{id:number;code:string}>(),
   this.db.prepare("SELECT id,work_date,minutes,settlement,revision,note FROM hr_overtime_days WHERE employee_id=? AND work_date BETWEEN ? AND ? LIMIT 32").bind(id,from,to).all<{id:number;work_date:string;minutes:number;settlement:string;revision:number;note:string}>(),
   this.db.prepare("SELECT date FROM hr_holidays WHERE date BETWEEN ? AND ? LIMIT 35").bind(from,to).all<{date:string}>()
  ]);
  const punch=new Map((a.results??[]).map(x=>[x.work_date,x])),roster=new Map((s.results??[]).map(x=>[x.work_date,x]));
  const shifts=new Map((shiftTypes.results??[]).map(x=>[Number(x.id),x])),leave=new Map((leaveTypes.results??[]).map(x=>[x.id,x.code]));
  const overtime=new Map((overtimeData.results??[]).map(x=>[x.work_date,x]));
  const holidaysSet=(holidays.results??[]).map(x=>x.date);
  const days=dates.map(d=>{
   const p=punch.get(d),r=roster.get(d),shift=r?.shift_type_id?shifts.get(r.shift_type_id):null;
   const schedule:AttendanceSchedule|null=r?{kind:r.kind,offMark:r.off_mark==="x"?"x":"slash",restLabel:r.rest_label as "regular"|"rest"|null,
     marker:r.marker as "home"|"booth"|null,leaveCode:r.leave_type_id?leave.get(r.leave_type_id):null}:null;
   const shiftData:AttendanceShift|null=shift?{startTime:String(shift.start_time),endTime:String(shift.end_time),breakStart:shift.break_start?String(shift.break_start):null,breakEnd:shift.break_end?String(shift.break_end):null,normalMinutes:Number(shift.normal_minutes)}:null;
   const result=evaluateAttendance(schedule,shiftData,p??{}, {noRosterPartTime:staff.employment_type==="casual"&&staff.schedule_mode==="none"});
   const suggestion=overtimeSuggestion({workDate:d,workedMinutes:result.workedMinutes,out1:p?.out1,out2:p?.out2,
    employmentType:staff.employment_type as "full"|"half"|"casual",marker:r?.marker??null,hasPunch:!!(p?.in1||p?.in2)},
    shiftData?{endTime:shiftData.endTime,normalMinutes:shiftData.normalMinutes}:null,holidaysSet,r?.rest_label==="regular"?"regular_off":r?.kind==="off"?"rest_day":null);
   return {overtimeSuggestion:suggestion,overtime:overtime.get(d)??null,date:d,schedule:r?{...r,code:shift?String(shift.code):r.leave_type_id?leave.get(r.leave_type_id)??null:null}:null,punches:p??null,...result};
  });
  const totals={workedMinutes:days.reduce((n,x)=>n+x.workedMinutes,0),lateCount:days.filter(x=>x.lateMinutes>0).length,
   lateMinutes:days.reduce((n,x)=>n+x.lateMinutes,0),missingCard:days.filter(x=>x.anomalies.includes("缺卡")).length,
   absent:days.filter(x=>x.anomalies.includes("曠職")).length};
  const overtimeMinutes=days.reduce((n,d)=>n+(d.overtime?.minutes??0),0);
  const warnings=overtimeWarnings(days.map(d=>({date:d.date,workedMinutes:d.workedMinutes,normalMinutes:Math.max(0,d.workedMinutes-(d.overtime?.minutes??0)),overtimeMinutes:d.overtime?.minutes??0})));
  return {employeeId:id,storeId:staff.store_id,month,days,totals:{...totals,overtimeMinutes},overtimeWarnings:warnings};
 }
 async put(id:number,month:string,input:unknown,ctx:HrContext){
  await this.staff(id);monthDates(month);
  const raw=object(input),submitted=Array.isArray(raw.days)?raw.days:null;
  if(!submitted||submitted.length>31)throw new HrValidationError("days","一次最多 31 天");
  const overtimeInputs=Array.isArray(raw.overtime)?raw.overtime:[];
  if(overtimeInputs.length>31)throw new HrValidationError("overtime","一次最多 31 天");
  const seen=new Set<string>(),updates:{date:string;before:Punch|null;after:Punch}[]=[];
  for(const item of submitted){
   const d=object(item),workDate=date(d.date,"date");
   if(!workDate.startsWith(month+"-")||seen.has(workDate))throw new HrValidationError("date","日期不屬此月份或重複");
   seen.add(workDate);
   const before=await this.db.prepare("SELECT * FROM hr_attendance_days WHERE employee_id=? AND work_date=?").bind(id,workDate).first<Punch>();
   const revision=integer(d.revision??0,"revision");
   if((before?.revision??0)!==revision)throw new HrValidationError("revision","紀錄已更動，請重新整理",409);
   const value=(key:keyof AttendancePunches)=>!d[key]?null:normalizePunchTime(String(d[key]));
   const in1=value("in1"),out1=value("out1"),in2=value("in2"),out2=value("out2"),note=optional(d.note,"note",1000)??"";
   evaluateAttendance(null,null,{in1,out1,in2,out2});
   if(!before&&!in1&&!out1&&!in2&&!out2&&!note)continue;
   if(before&&before.in1===in1&&before.out1===out1&&before.in2===in2&&before.out2===out2&&before.note===note)continue;
   updates.push({date:workDate,before:before??null,after:{work_date:workDate,in1,out1,in2,out2,revision:revision+1,note,source:"manual"}});
  }
  const overtimeUpdates:{date:string;minutes:number;settlement:"pay"|"comp";note:string;expiresOn:string|null;before:{id:number;revision:number;minutes:number;settlement:string;comp_expires_on:string|null}|null}[]=[];
  const overtimeDates=new Set<string>();
  let compAccount:Awaited<ReturnType<HrCompService["get"]>>|null=null;
  for(const item of overtimeInputs){
   const x=object(item),d=date(x.date,"date"),minutes=integer(x.minutes??0,"minutes"),settlement=x.settlement;
   if(!d.startsWith(month+"-")||minutes<0||minutes%30||minutes>1440||!(settlement==="pay"||settlement==="comp"))throw new HrValidationError("overtime","加班分鐘及結算方式錯誤");
   if(overtimeDates.has(d))throw new HrValidationError("overtime","加班日期重複");
   overtimeDates.add(d);
   const before=await this.db.prepare("SELECT id,revision,minutes,settlement,comp_expires_on FROM hr_overtime_days WHERE employee_id=? AND work_date=?").bind(id,d).first<{id:number;revision:number;minutes:number;settlement:string;comp_expires_on:string|null}>();
   if(Number(x.revision??0)!==(before?.revision??0))throw new HrValidationError("revision","加班紀錄已異動",409);
   if(before?.settlement==="comp"&&(settlement!=="comp"||minutes<before.minutes)){
    compAccount??=await new HrCompService(this.db).get(id,"9999-12-31");
    const credit=compAccount.balances.credits.find(x=>x.kind==="overtime"&&x.id===before.id);
    const alreadyUsed=before.minutes-(credit?.remainingMinutes??0);
    if(alreadyUsed>0&&(settlement!=="comp"||minutes<alreadyUsed))
     throw new HrValidationError("minutes","此筆補休已有使用或結清，不得取消或減至已使用時數以下",409);
   }
   if(!before&&minutes===0)continue;
   if(before?.minutes===minutes&&before.settlement===settlement)continue;
   const expiresOn=settlement==="comp"?(before?.settlement==="comp"?before.comp_expires_on??nextMonthEnd(d):nextMonthEnd(d)):null;
   overtimeUpdates.push({date:d,minutes,settlement,note:String(x.note??"").slice(0,500),expiresOn,before:before??null});
  }
  if(updates.length||overtimeUpdates.length){
   const stmts:D1PreparedStatement[]=[];
   for(const item of updates){
    const r=item.after;
    if(item.before){
     // The guard runs inside the same D1 batch transaction. A revision conflict
     // aborts the *whole* batch, including the audit record and other edits.
     stmts.push(this.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM hr_attendance_days WHERE employee_id=? AND work_date=? AND revision=?) THEN 1 ELSE json('') END AS valid_revision").bind(id,item.date,item.before.revision));
     stmts.push(this.db.prepare("UPDATE hr_attendance_days SET in1=?,out1=?,in2=?,out2=?,note=?,revision=revision+1,updated_at=?,updated_by=? WHERE employee_id=? AND work_date=? AND revision=?").bind(r.in1,r.out1,r.in2,r.out2,r.note,ctx.now,ctx.actor,id,item.date,item.before.revision));
    }
    else stmts.push(this.db.prepare("INSERT INTO hr_attendance_days(employee_id,work_date,in1,out1,in2,out2,source,note,revision,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(id,item.date,r.in1,r.out1,r.in2,r.out2,"manual",r.note,1,ctx.now,ctx.actor));
   }
   for(const overtime of overtimeUpdates){
    if(overtime.before){
     stmts.push(this.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM hr_overtime_days WHERE employee_id=? AND work_date=? AND revision=?) THEN 1 ELSE json('') END").bind(id,overtime.date,overtime.before.revision));
     stmts.push(this.db.prepare("UPDATE hr_overtime_days SET minutes=?,settlement=?,comp_expires_on=?,note=?,revision=revision+1,updated_at=?,updated_by=? WHERE employee_id=? AND work_date=? AND revision=?").bind(overtime.minutes,overtime.settlement,overtime.expiresOn,overtime.note,ctx.now,ctx.actor,id,overtime.date,overtime.before.revision));
    }else stmts.push(this.db.prepare("INSERT INTO hr_overtime_days(employee_id,work_date,minutes,settlement,comp_expires_on,note,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?)").bind(id,overtime.date,overtime.minutes,overtime.settlement,overtime.expiresOn,overtime.note,ctx.now,ctx.actor));
   }
   if(overtimeUpdates.length)stmts.push(new AuditService(this.db).prepareRecord({entityType:"hr_overtime",entityKey:id+"|"+month,action:"hr_overtime.updated",actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{days:overtimeUpdates.map(x=>({date:x.date,minutes:x.minutes,settlement:x.settlement}))}}));
   if(updates.length)stmts.push(new AuditService(this.db).prepareRecord({entityType:"hr_attendance",entityKey:id+"|"+month,action:"hr_attendance.updated",
     actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{days:updates.map(x=>({date:x.date,before:x.before?{in1:x.before.in1,out1:x.before.out1,in2:x.before.in2,out2:x.before.out2}:null,
       after:{in1:x.after.in1,out1:x.after.out1,in2:x.after.in2,out2:x.after.out2}}))}}));
   await this.db.batch(stmts);
  }
  return {saved:true,changedDays:updates.length,attendance:await this.get(id,month)};
 }
 async anomalies(storeId:number,month:string){
  const dates=monthDates(month),from=dates[0],to=dates.at(-1)!;
  const [employees,attendance,schedules,types,leaveTypes]=await Promise.all([
   this.db.prepare("SELECT id,employee_no,name,employment_type,schedule_mode FROM hr_employees WHERE store_id=? AND status<>'terminated' ORDER BY id LIMIT 101").bind(storeId).all<{id:number;employee_no:string;name:string;employment_type:string;schedule_mode:string}>(),
   this.db.prepare("SELECT a.*,e.store_id FROM hr_attendance_days a JOIN hr_employees e ON e.id=a.employee_id WHERE e.store_id=? AND a.work_date BETWEEN ? AND ? LIMIT 3101").bind(storeId,from,to).all<Punch&{employee_id:number}>(),
   this.db.prepare("SELECT * FROM hr_schedule_days WHERE store_id=? AND work_date BETWEEN ? AND ? LIMIT 3101").bind(storeId,from,to).all<Schedule&{employee_id:number}>(),
   this.db.prepare("SELECT * FROM hr_shift_types LIMIT 100").all<Record<string,unknown>>(),
   this.db.prepare("SELECT id,code FROM hr_leave_types LIMIT 100").all<{id:number;code:string}>()
  ]);
  if((employees.results??[]).length>100||(attendance.results??[]).length>3100||(schedules.results??[]).length>3100)
   throw new HrValidationError("limit","門市員工或出勤超過安全查詢上限");
  const punches=new Map((attendance.results??[]).map(x=>[x.employee_id+"|"+x.work_date,x]));
  const rosters=new Map((schedules.results??[]).map(x=>[x.employee_id+"|"+x.work_date,x]));
  const shifts=new Map((types.results??[]).map(x=>[Number(x.id),x]));
  const leave=new Map((leaveTypes.results??[]).map(x=>[x.id,x.code]));
  const result:{employeeId:number;employeeNo:string;name:string;date:string;anomalies:string[]}[]=[];
  for(const employee of employees.results??[])for(const day of dates){
   const p=punches.get(employee.id+"|"+day),r=rosters.get(employee.id+"|"+day);
   const row=r?.shift_type_id?shifts.get(r.shift_type_id):null;
   const scheduled:AttendanceSchedule|null=r?{kind:r.kind,offMark:r.off_mark==="x"?"x":"slash",
    restLabel:r.rest_label as "regular"|"rest"|null,marker:r.marker as "home"|"booth"|null,
    leaveCode:r.leave_type_id?leave.get(r.leave_type_id):null}:null;
   const shift:AttendanceShift|null=row?{startTime:String(row.start_time),endTime:String(row.end_time),
    breakStart:row.break_start?String(row.break_start):null,breakEnd:row.break_end?String(row.break_end):null,
    normalMinutes:Number(row.normal_minutes)}:null;
   const anomalies=evaluateAttendance(scheduled,shift,p??{},{noRosterPartTime:employee.employment_type==="casual"&&employee.schedule_mode==="none"}).anomalies;
   if(anomalies.length)result.push({employeeId:employee.id,employeeNo:employee.employee_no,name:employee.name,date:day,anomalies});
  }
  return result;
 }
}
