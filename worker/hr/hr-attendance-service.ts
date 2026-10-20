import {evaluateAttendance,normalizePunchTime,type AttendanceSchedule,type AttendanceShift,type AttendancePunches} from "../../shared/hr-attendance";
import {AuditService} from "../audit/audit-service";
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
  const [a,s,shiftTypes,leaveTypes]=await Promise.all([
   this.db.prepare("SELECT * FROM hr_attendance_days WHERE employee_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date LIMIT 32").bind(id,from,to).all<Punch>(),
   this.db.prepare("SELECT * FROM hr_schedule_days WHERE employee_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date LIMIT 32").bind(id,from,to).all<Schedule>(),
   this.db.prepare("SELECT * FROM hr_shift_types LIMIT 100").all<Record<string,unknown>>(),
   this.db.prepare("SELECT id,code FROM hr_leave_types LIMIT 100").all<{id:number;code:string}>()
  ]);
  const punch=new Map((a.results??[]).map(x=>[x.work_date,x])),roster=new Map((s.results??[]).map(x=>[x.work_date,x]));
  const shifts=new Map((shiftTypes.results??[]).map(x=>[Number(x.id),x])),leave=new Map((leaveTypes.results??[]).map(x=>[x.id,x.code]));
  const days=dates.map(d=>{
   const p=punch.get(d),r=roster.get(d),shift=r?.shift_type_id?shifts.get(r.shift_type_id):null;
   const schedule:AttendanceSchedule|null=r?{kind:r.kind,offMark:r.off_mark==="x"?"x":"slash",restLabel:r.rest_label as "regular"|"rest"|null,
     marker:r.marker as "home"|"booth"|null,leaveCode:r.leave_type_id?leave.get(r.leave_type_id):null}:null;
   const shiftData:AttendanceShift|null=shift?{startTime:String(shift.start_time),endTime:String(shift.end_time),breakStart:shift.break_start?String(shift.break_start):null,breakEnd:shift.break_end?String(shift.break_end):null,normalMinutes:Number(shift.normal_minutes)}:null;
   return {date:d,schedule:r??null,punches:p??null,...evaluateAttendance(schedule,shiftData,p??{},
     {noRosterPartTime:staff.employment_type==="casual"&&staff.schedule_mode==="none"})};
  });
  const totals={workedMinutes:days.reduce((n,x)=>n+x.workedMinutes,0),lateCount:days.filter(x=>x.lateMinutes>0).length,
   lateMinutes:days.reduce((n,x)=>n+x.lateMinutes,0),missingCard:days.filter(x=>x.anomalies.includes("缺卡")).length,
   absent:days.filter(x=>x.anomalies.includes("曠職")).length};
  return {employeeId:id,storeId:staff.store_id,month,days,totals};
 }
 async put(id:number,month:string,input:unknown,ctx:HrContext){
  await this.staff(id);monthDates(month);
  const raw=object(input),submitted=Array.isArray(raw.days)?raw.days:null;
  if(!submitted||submitted.length>31)throw new HrValidationError("days","一次最多 31 天");
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
  if(updates.length){
   const stmts:D1PreparedStatement[]=[];
   for(const item of updates){
    const r=item.after;
    if(item.before)stmts.push(this.db.prepare("UPDATE hr_attendance_days SET in1=?,out1=?,in2=?,out2=?,note=?,revision=revision+1,updated_at=?,updated_by=? WHERE employee_id=? AND work_date=? AND revision=?").bind(r.in1,r.out1,r.in2,r.out2,r.note,ctx.now,ctx.actor,id,item.date,item.before.revision));
    else stmts.push(this.db.prepare("INSERT INTO hr_attendance_days(employee_id,work_date,in1,out1,in2,out2,source,note,revision,updated_at,updated_by) VALUES(?,?,?,?,?,?,?,?,?,?,?)").bind(id,item.date,r.in1,r.out1,r.in2,r.out2,"manual",r.note,1,ctx.now,ctx.actor));
   }
   stmts.push(new AuditService(this.db).prepareRecord({entityType:"hr_attendance",entityKey:id+"|"+month,action:"hr_attendance.updated",
     actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{days:updates.map(x=>({date:x.date,before:x.before?{in1:x.before.in1,out1:x.before.out1,in2:x.before.in2,out2:x.before.out2}:null,
       after:{in1:x.after.in1,out1:x.after.out1,in2:x.after.in2,out2:x.after.out2}}))}}));
   const results=await this.db.batch(stmts);
   if(results.slice(0,-1).some(r=>r.meta?.changes!==1))throw new HrValidationError("revision","更新版本衝突",409);
  }
  return {saved:true,changedDays:updates.length,attendance:await this.get(id,month)};
 }
 async anomalies(storeId:number,month:string){
  monthDates(month);
  const data=await this.db.prepare("SELECT id,employee_no,name FROM hr_employees WHERE store_id=? AND status<>'terminated' ORDER BY id LIMIT 101").bind(storeId).all<{id:number;employee_no:string;name:string}>();
  if((data.results??[]).length>100)throw new HrValidationError("limit","超過單門市 100 人安全上限");
  const output:{employeeId:number;employeeNo:string;name:string;date:string;anomalies:string[]}[]=[];
  for(const e of data.results??[]){
   const r=await this.get(e.id,month);
   for(const item of r.days)if(item.anomalies.length)output.push({employeeId:e.id,employeeNo:e.employee_no,name:e.name,date:item.date,anomalies:item.anomalies});
  }return output;
 }
}
