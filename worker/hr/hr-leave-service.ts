import {annualLeaveSchedule,annualLeaveLedger,partTimeBase,partTimeEntitlementMinutes,type LedgerPeriod} from "../../shared/hr-annual-leave";
import {clockMinutes} from "../../shared/hr-attendance";
import {leaveDates,leaveMinutes,checkLeaveQuota,type LeaveTypeRule,type LeaveEntry} from "../../shared/hr-leave";
import {compBalances,type CompUse} from "../../shared/hr-overtime";
import {loadCompInputs} from "./hr-comp-service";
import {classifyRoster,type RosterDay} from "../../shared/hr-roster";
import {AuditService} from "../audit/audit-service";
import {HrRosterService} from "./hr-roster-service";
import {HrValidationError,date,integer,object,required} from "./hr-validation";
import type {HrContext} from "./hr-service";

interface Employee {id:number;employee_no:string;name:string;employment_type:"full"|"half"|"casual";store_id:number;seniority_start_date:string}
interface TypeRow {id:number;code:string;name:string;is_active:number;quota_days:number|null;quota_period:string|null;merge_into_type_id:number|null;merge_after_days:number;counts_calendar_days:number;event_quota_options:string|null;requires_reason:number;accepts_proof:number;needs_form:number;comp_kind:string|null}
interface RecordRow {id:number;batch_id:string;employee_id:number;leave_type_id:number;work_date:string;start_time:string|null;end_time:string|null;minutes:number;whole_day:number;reason:string;event_date:string|null;event_quota_days:number|null;cancelled_at:string|null;cancel_reason:string|null}
interface Cell {employee_id:number;work_date:string;kind:string;off_mark:string|null;leave_type_id:number|null;shift_type_id:number|null;store_id:number;hours:number|null}
const iso=(d:Date)=>d.toISOString().slice(0,10);
const ymd=(s:unknown)=>date(s,"date");
const monthEnd=(y:number)=>String(y)+"-12-31";
export class HrLeaveError extends Error{
 constructor(readonly code:"HR_LEAVE_QUOTA"|"HR_COMP_INSUFFICIENT"|"HR_LEAVE_FORM_EXISTS"|"HR_ROSTER_VIOLATION"|"HR_ROSTER_CONSECUTIVE",readonly items:unknown[]){super(code)}
}
export class HrLeaveService{
 constructor(private db:D1Database){}
 private async employee(id:number){
  const row=await this.db.prepare("SELECT id,employee_no,name,employment_type,store_id,seniority_start_date FROM hr_employees WHERE id=?").bind(id).first<Employee>();
  if(!row)throw new HrValidationError("employeeId","員工不存在",404);
  return row;
 }
 async types():Promise<TypeRow[]> {return (await this.db.prepare("SELECT * FROM hr_leave_types ORDER BY sort_order,id LIMIT 100").all<TypeRow>()).results??[];}
 private async records(id:number,from:string,to:string):Promise<RecordRow[]>{
  const records=(await this.db.prepare("SELECT * FROM hr_leave_records WHERE employee_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date,id LIMIT 1501").bind(id,from,to).all<RecordRow>()).results??[];
  if(records.length>1500)throw new HrValidationError("limit","假單歷史資料超過單次安全上限，請縮小期間");
  return records;
 }
 private async comp(id:number,at:string,extra:readonly CompUse[]=[]) {
  const inputs=(await loadCompInputs(this.db,[id])).get(id)!;
  return {balances:compBalances(inputs.credits,[...inputs.uses,...extra],inputs.settlements,at),...inputs};
 }
 /** Punched minutes per day (two in/out pairs) between two dates, for part-time annual leave. */
 private async punchedMinutes(id:number,from:string,to:string):Promise<number>{
  const rows=(await this.db.prepare("SELECT in1,out1,in2,out2 FROM hr_attendance_days WHERE employee_id=? AND work_date BETWEEN ? AND ? LIMIT 800").bind(id,from,to).all<{in1:string|null;out1:string|null;in2:string|null;out2:string|null}>()).results??[];
  if(rows.length>=800)throw new HrValidationError("limit","出勤資料超過單次安全上限");
  const span=(a:string|null,b:string|null)=>a&&b?Math.max(0,clockMinutes(b)-clockMinutes(a)):0;
  return rows.reduce((n,x)=>n+span(x.in1,x.out1)+span(x.in2,x.out2),0);
 }
 /**
  * Annual leave periods with their entitlement in minutes. Full-time: days × 480. Part-time (BD-060 #28):
  * prorated by punched hours in the base period, fixed once the period starts; the super admin may override it.
  */
 private async computeYears(id:number,now:string,persist=true){
  const employee=await this.employee(id);
  const exceptions=(await this.db.prepare("SELECT start_date,end_date FROM hr_seniority_exclusions WHERE employee_id=? ORDER BY start_date LIMIT 100").bind(id).all<{start_date:string;end_date:string}>()).results??[];
  const periods=annualLeaveSchedule(employee.seniority_start_date,exceptions.map(x=>({startDate:x.start_date,endDate:x.end_date})),now);
  const stored=(await this.db.prepare("SELECT id,period_start,notified_on,entitled_minutes,entitled_minutes_override,basis FROM hr_annual_leave_years WHERE employee_id=? ORDER BY period_start LIMIT 80").bind(id).all<{id:number;period_start:string;notified_on:string|null;entitled_minutes:number|null;entitled_minutes_override:number|null;basis:string|null}>()).results??[];
  const byStart=new Map(stored.map(x=>[x.period_start,x]));
  const partTime=employee.employment_type!=="full",ledgerPeriods:LedgerPeriod[]=[],writes:D1PreparedStatement[]=[],basisByStart=new Map<string,string|null>();
  for(const p of periods){
   const row=byStart.get(p.periodStart);
   let minutes=row?.entitled_minutes??null,basis=row?.basis??null;
   if(minutes===null&&p.periodStart<=now){
    if(partTime){
     const base=partTimeBase(p.periodStart,employee.seniority_start_date);
     const worked=await this.punchedMinutes(id,base.from,base.to),result=partTimeEntitlementMinutes(p.days,worked,base.from,base.to);
     minutes=result.minutes;basis=JSON.stringify({from:base.from,to:base.to,workedMinutes:worked,fullMinutes:result.fullMinutes});
    }else minutes=p.days*480;
    writes.push(this.db.prepare("INSERT INTO hr_annual_leave_years(employee_id,period_start,period_end,entitled_days,entitled_minutes,basis) VALUES(?,?,?,?,?,?) ON CONFLICT(employee_id,period_start) DO UPDATE SET entitled_minutes=excluded.entitled_minutes,basis=excluded.basis WHERE hr_annual_leave_years.entitled_minutes IS NULL")
     .bind(id,p.periodStart,p.periodEnd,p.days,minutes,basis));
   }
   basisByStart.set(p.periodStart,basis);
   ledgerPeriods.push({...p,entitledMinutes:row?.entitled_minutes_override??minutes});
  }
  if(persist&&writes.length)await this.db.batch(writes);
  const ids=persist&&writes.length?new Map(((await this.db.prepare("SELECT id,period_start FROM hr_annual_leave_years WHERE employee_id=? LIMIT 80").bind(id).all<{id:number;period_start:string}>()).results??[]).map(x=>[x.period_start,x.id])):new Map(stored.map(x=>[x.period_start,x.id]));
  const recent=await this.records(id,employee.seniority_start_date,now);
  const types=await this.types(),annual=types.find(x=>x.code==="特");
  const active=recent.filter(x=>x.leave_type_id===annual?.id&&!x.cancelled_at).map(x=>({workDate:x.work_date,minutes:x.minutes}));
  return {periods,ledger:annualLeaveLedger(ledgerPeriods,active,now).map(x=>{const row=byStart.get(x.periodStart);
   return {...x,id:ids.get(x.periodStart)??0,notifiedOn:row?.notified_on??null,partTime,overridden:row?.entitled_minutes_override!=null,
    basis:basisByStart.get(x.periodStart)??null}})};
 }
 async detail(id:number,year:number,asOf:string){
  await this.employee(id);
  if(!Number.isInteger(year)||year<2000||year>2200)throw new HrValidationError("year","年度錯誤");
  const types=await this.types(),rows=await this.records(id,String(year)+"-01-01",monthEnd(year));
  const [annual,comp,staged,attachments]=await Promise.all([
   this.computeYears(id,asOf),this.comp(id,asOf),
   this.db.prepare("SELECT s.work_date,s.leave_type_id FROM hr_schedule_days s LEFT JOIN hr_leave_records l ON l.employee_id=s.employee_id AND l.work_date=s.work_date AND l.cancelled_at IS NULL AND l.whole_day=1 WHERE s.employee_id=? AND s.work_date BETWEEN ? AND ? AND s.kind='leave' AND l.id IS NULL LIMIT 400").bind(id,String(year)+"-01-01",monthEnd(year)).all<{work_date:string;leave_type_id:number}>(),
   this.db.prepare("SELECT id,batch_id FROM hr_leave_attachments WHERE batch_id IN (SELECT batch_id FROM hr_leave_records WHERE employee_id=? AND work_date BETWEEN ? AND ?) ORDER BY batch_id,id LIMIT 600").bind(id,String(year)+"-01-01",monthEnd(year)).all<{id:number;batch_id:string}>()
  ]);
  const attachmentIds=new Map<string,number[]>();
  for(const item of attachments.results??[])attachmentIds.set(item.batch_id,[...(attachmentIds.get(item.batch_id)??[]),item.id]);
  const metrics=types.map(t=>({id:t.id,code:t.code,name:t.name,usedMinutes:rows.filter(x=>!x.cancelled_at&&x.leave_type_id===t.id).reduce((n,x)=>n+x.minutes,0),limitMinutes:t.quota_days==null?null:t.quota_days*480}));
  return {employeeId:id,year,records:rows.map(x=>({...x,attachmentCount:attachmentIds.get(x.batch_id)?.length??0,attachmentIds:attachmentIds.get(x.batch_id)??[]})),
   pending:staged.results??[],types,metrics,annual:annual.ledger,comp:comp.balances,compCredits:comp.credits};
 }
 async summary(year:number,storeId:number|undefined,asOf:string){
  if(!Number.isInteger(year)||year<2000||year>2200)throw new HrValidationError("year","年度錯誤");
  const employees=(await this.db.prepare("SELECT e.id,e.employee_no,e.name,e.store_id,e.employment_type,e.seniority_start_date FROM hr_employees e WHERE e.status<>'terminated' AND (? IS NULL OR e.store_id=?) ORDER BY e.employee_no LIMIT 101")
    .bind(storeId??null,storeId??null).all<{id:number;employee_no:string;name:string;store_id:number;employment_type:"full"|"half"|"casual";seniority_start_date:string}>()).results??[];
  if(employees.length>100)throw new HrValidationError("limit","最多 100 人",422);
  const employeeIds=employees.map(x=>x.id);
  if(!employeeIds.length)return {year,types:await this.types(),employees:[],total:0};
  const placeholders=employeeIds.map(()=>"?").join(",");
  const [leaves,staged,compInputs,types]=await Promise.all([
   this.db.prepare("SELECT r.employee_id,r.leave_type_id,r.work_date,r.minutes,r.cancelled_at,t.comp_kind,t.code FROM hr_leave_records r JOIN hr_leave_types t ON t.id=r.leave_type_id WHERE r.employee_id IN ("+placeholders+") AND r.work_date BETWEEN ? AND ? LIMIT 10001").bind(...employeeIds,String(year)+"-01-01",monthEnd(year)).all<Record<string,unknown>>(),
   this.db.prepare("SELECT s.employee_id,s.work_date FROM hr_schedule_days s LEFT JOIN hr_leave_records l ON l.employee_id=s.employee_id AND l.work_date=s.work_date AND l.whole_day=1 AND l.cancelled_at IS NULL WHERE s.employee_id IN ("+placeholders+") AND s.work_date BETWEEN ? AND ? AND s.kind='leave' AND l.id IS NULL LIMIT 5001").bind(...employeeIds,String(year)+"-01-01",monthEnd(year)).all<{employee_id:number;work_date:string}>(),
   loadCompInputs(this.db,employeeIds),this.types()
  ]);
  if((leaves.results??[]).length>10000||(staged.results??[]).length>5000)
    throw new HrValidationError("limit","請假總表資料超過單次安全上限，不能以截斷資料計算");
  // One bounded query per data family for the entire selected team (no per-employee SQL).
  // Annual entitlement and comp balances need history *before* the selected year.
  const cutoff=year===Number(asOf.slice(0,4))?asOf:String(year)+"-12-31";
  const [annualHistory,excludedHistory]=await Promise.all([
   this.db.prepare("SELECT r.employee_id,r.work_date,r.minutes,r.cancelled_at FROM hr_leave_records r JOIN hr_leave_types t ON t.id=r.leave_type_id WHERE t.code='特' AND r.employee_id IN ("+placeholders+") AND r.work_date<=? ORDER BY r.employee_id,r.work_date LIMIT 20000").bind(...employeeIds,cutoff).all<{employee_id:number;work_date:string;minutes:number;cancelled_at:string|null}>(),
   this.db.prepare("SELECT employee_id,start_date,end_date FROM hr_seniority_exclusions WHERE employee_id IN ("+placeholders+") ORDER BY employee_id,start_date LIMIT 4000").bind(...employeeIds).all<{employee_id:number;start_date:string;end_date:string}>()
  ]);
  if((annualHistory.results??[]).length>=20000||(excludedHistory.results??[]).length>=4000)
   throw new HrValidationError("limit","人事歷史資料超過單次查詢安全上限");
  const ids=new Set(employees.map(x=>x.id));
  // Part-time entitlement depends on punched hours, so those few employees go through the per-employee calculation.
  const partTime=new Map(await Promise.all(employees.filter(e=>e.employment_type!=="full").map(async e=>[e.id,(await this.computeYears(e.id,cutoff)).ledger] as const)));
  const overrides=(await this.db.prepare("SELECT employee_id,period_start,entitled_minutes_override FROM hr_annual_leave_years WHERE entitled_minutes_override IS NOT NULL AND employee_id IN ("+placeholders+") LIMIT 4000").bind(...employeeIds).all<{employee_id:number;period_start:string;entitled_minutes_override:number}>()).results??[];
  const each=employees.map(e=>{
   const records=(leaves.results??[]).filter(x=>x.employee_id===e.id&&!x.cancelled_at);
   const used=Object.fromEntries(types.map(t=>[t.code,records.filter(x=>x.leave_type_id===t.id).reduce((n,x)=>n+Number(x.minutes),0)]));
   const pending=(staged.results??[]).filter(x=>x.employee_id===e.id).length;
   const periods=annualLeaveSchedule(e.seniority_start_date,
    (excludedHistory.results??[]).filter(x=>x.employee_id===e.id).map(x=>({startDate:x.start_date,endDate:x.end_date})),cutoff);
   const annual=partTime.get(e.id)??annualLeaveLedger(periods.map(p=>({...p,entitledMinutes:overrides.find(x=>x.employee_id===e.id&&x.period_start===p.periodStart)?.entitled_minutes_override??null})),
    (annualHistory.results??[]).filter(x=>x.employee_id===e.id).map(x=>({workDate:x.work_date,minutes:x.minutes,cancelledAt:x.cancelled_at})),cutoff);
   const annualRemainingDays=annual.at(-1)?.remainingDays??0,annualRemainingMinutes=annual.at(-1)?.remainingMinutes??0;
   const comp=compInputs.get(e.id)!;
   return {id:e.id,employeeNo:e.employee_no,name:e.name,storeId:e.store_id,employmentType:e.employment_type,used,pending,annualRemainingDays,annualRemainingMinutes,
    comp:compBalances(comp.credits,comp.uses,comp.settlements,cutoff)};
  });
  return {year,types,employees:each,total:ids.size};
 }
 async create(raw:unknown,ctx:HrContext){
  const v=object(raw),employeeId=integer(v.employeeId,"employeeId",true),employee=await this.employee(employeeId);
  if(!employee.store_id)throw new HrValidationError("employeeId","員工未設定門市");
  const typeId=integer(v.leaveTypeId,"leaveTypeId",true),types=await this.types(),type=types.find(t=>t.id===typeId);
  if(!type||type.needs_form===0||type.is_active===0)throw new HrValidationError("leaveTypeId","假別不存在、停用或不需建立假單");
  const wholeDay=v.wholeDay===true;
  if(wholeDay&&employee.employment_type!=="full")throw new HrValidationError("wholeDay","半職與兼職僅能請時數");
  const start=ymd(v.from??v.date),end=ymd(v.to??v.date??start);
  const cells=(await this.db.prepare("SELECT s.*,t.code AS leave_code FROM hr_schedule_days s LEFT JOIN hr_leave_types t ON t.id=s.leave_type_id WHERE s.employee_id=? AND s.work_date BETWEEN ? AND ? ORDER BY s.work_date LIMIT 370").bind(employeeId,start,end).all<Cell&{leave_code:string|null}>()).results??[];
  const list=wholeDay?leaveDates({from:start,to:end},cells.map(x=>({date:x.work_date,kind:x.kind,offMark:x.off_mark,leaveCode:x.leave_code})),{countsCalendarDays:!!type.counts_calendar_days}):[start];
  if(!list.length||list.length>120)throw new HrValidationError("dates","沒有可申請日期或範圍太大");
  const existing=(await this.db.prepare("SELECT id,work_date,whole_day,start_time,end_time FROM hr_leave_records WHERE employee_id=? AND cancelled_at IS NULL AND work_date BETWEEN ? AND ? LIMIT 401").bind(employeeId,start,end).all<{id:number;work_date:string;whole_day:number;start_time:string|null;end_time:string|null}>()).results??[];
  if(existing.length>400)throw new HrValidationError("dates","單次檢查既有假單超過安全上限");
  if(wholeDay&&list.some(d=>existing.some(x=>x.work_date===d)))throw new HrLeaveError("HR_LEAVE_FORM_EXISTS",list);
  if(!wholeDay){
   const startTime=typeof v.startTime==="string"?v.startTime:null,endTime=typeof v.endTime==="string"?v.endTime:null;
   const conflict=existing.some(x=>x.work_date===start&&(x.whole_day===1||!startTime||!endTime||!x.start_time||!x.end_time||startTime<x.end_time&&endTime>x.start_time));
   if(conflict)throw new HrLeaveError("HR_LEAVE_FORM_EXISTS",[{date:start,message:"請假時段與既有正式假單重疊"}]);
  }
  const shifts=(await this.db.prepare("SELECT id,start_time,end_time,break_start,break_end FROM hr_shift_types LIMIT 100").all<{id:number;start_time:string;end_time:string;break_start:string|null;break_end:string|null}>()).results??[];
  const minutes=list.map(d=>{
   const cell=cells.find(x=>x.work_date===d),shift=shifts.find(x=>x.id===cell?.shift_type_id);
   return leaveMinutes(employee.employment_type,{date:d,kind:cell?.kind},shift?{startTime:shift.start_time,endTime:shift.end_time,breakStart:shift.break_start,breakEnd:shift.break_end}:null,
    {wholeDay,startTime:v.startTime as string|undefined,endTime:v.endTime as string|undefined,minutes:v.minutes as number|undefined});
  });
  if(type.requires_reason&&!String(v.reason??"").trim())throw new HrValidationError("reason","事假必須填事由");
  if(type.quota_period==="event"&&!v.eventDate)throw new HrValidationError("eventDate","此假別須填事件日期");
  const eventDate=v.eventDate?ymd(v.eventDate):null,eventQuotaDays=v.eventQuotaDays===undefined?null:Number(v.eventQuotaDays);
  if(type.event_quota_options&&(!eventQuotaDays||!type.event_quota_options.split(",").map(Number).includes(eventQuotaDays)))
    throw new HrValidationError("eventQuotaDays","須選擇事件額度天數");
  const prior=await this.records(employeeId,new Date(Date.parse(start+"T00:00:00Z")-732*86400000).toISOString().slice(0,10),end);
  const candidate:LeaveEntry[]=list.map((d,i)=>({leaveTypeId:typeId,workDate:d,minutes:minutes[i],eventDate,eventQuotaDays}));
  const errors=checkLeaveQuota({id:type.id,code:type.code,quotaDays:type.quota_days,quotaPeriod:type.quota_period,eventQuotaOptions:type.event_quota_options},
   types.map(t=>({id:t.id,code:t.code,quotaDays:t.quota_days,quotaPeriod:t.quota_period,mergeIntoTypeId:t.merge_into_type_id,mergeAfterDays:t.merge_after_days,eventQuotaOptions:t.event_quota_options})),
   prior.map(x=>({leaveTypeId:x.leave_type_id,workDate:x.work_date,minutes:x.minutes,eventDate:x.event_date,cancelledAt:x.cancelled_at})),candidate);
  if(errors.length)throw new HrLeaveError("HR_LEAVE_QUOTA",errors);
  if(type.code==="特"){
   const annual=await this.computeYears(employeeId,end,false);
   // Keep anniversary periods independent; never spend the next period's quota early.
   const byPeriod=new Map<string,{available:number;requested:number}>();
   for(let i=0;i<list.length;i++){
    const period=annual.ledger.find(x=>x.periodStart<=list[i]&&x.periodEnd>=list[i]);
    const key=period?.periodStart??"unavailable";
    const quota=byPeriod.get(key)??{available:period?period.remainingMinutes:0,requested:0};
    quota.requested+=minutes[i];byPeriod.set(key,quota);
   }
   const failures=[...byPeriod].filter(([,v])=>v.requested>v.available).map(([period,v])=>({code:"特",period,usedMinutes:v.requested,limitMinutes:v.available,message:period+" 特休剩餘額度不足"}));
   if(failures.length)throw new HrLeaveError("HR_LEAVE_QUOTA",failures);
  }
  // 補 uses the comp balance; an advance names the holiday whose comp time will repay it (BD-060 #29).
  let advanceDate:string|null=null,advanceName:string|null=null;
  if(type.comp_kind){
   if(v.advanceHolidayDate){
    advanceDate=ymd(v.advanceHolidayDate);
    const holiday=await this.db.prepare("SELECT name FROM hr_holidays WHERE date=?").bind(advanceDate).first<{name:string}>();
    if(!holiday)throw new HrValidationError("advanceHolidayDate","預支的日期不在國定假日設定中");
    const granted=await this.db.prepare("SELECT 1 FROM hr_comp_time_grants WHERE employee_id=? AND kind='holiday' AND holiday_date=? LIMIT 1").bind(employeeId,advanceDate).first();
    if(granted)throw new HrValidationError("advanceHolidayDate","這個國定假日的補休已經給予，請直接使用補休");
    advanceName=holiday.name;
   }else{
    const extra=list.map((d,i)=>({workDate:d,minutes:minutes[i]}));
    const after=await this.comp(employeeId,end,extra);
    if(after.balances.deficitMinutes>0){
     const before=compBalances(after.credits,after.uses,after.settlements,end);
     throw new HrLeaveError("HR_COMP_INSUFFICIENT",[{available:Math.max(0,before.balanceMinutes),required:minutes.reduce((a,b)=>a+b,0),message:"補休餘額不足；若要預支，請選擇預支的國定假日"}]);
    }
   }
  }
  // Validate the final schedule before any write; insert required approvals,
  // formal records and schedule changes atomically in the same D1 batch.
  const rosterStatements=wholeDay?await new HrRosterService(this.db).planFormalLeave(
   employee.store_id,employeeId,list,typeId,ctx,v.approve
  ):[];
  const batchId=crypto.randomUUID(),statements:D1PreparedStatement[]=[...rosterStatements];
  for(let i=0;i<list.length;i++){
   const d=list[i];
   statements.push(this.db.prepare("INSERT INTO hr_leave_records(batch_id,employee_id,leave_type_id,work_date,start_time,end_time,minutes,whole_day,reason,event_date,event_quota_days,advance_holiday_date,advance_holiday_name,created_at,created_by) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
    .bind(batchId,employeeId,typeId,d,wholeDay?null:v.startTime??null,wholeDay?null:v.endTime??null,minutes[i],wholeDay?1:0,String(v.reason??"").slice(0,2000),eventDate,eventQuotaDays,advanceDate,advanceName,ctx.now,ctx.actor));
   if(wholeDay){
    const current=cells.find(x=>x.work_date===d);
    if(current?.kind==="leave"&&current.leave_type_id===typeId)continue;
    statements.push(this.db.prepare("INSERT INTO hr_schedule_days(employee_id,store_id,work_date,kind,leave_type_id,note,updated_at,updated_by) VALUES(?,?,?,'leave',?,'',?,?) ON CONFLICT(employee_id,work_date) DO UPDATE SET kind='leave',off_mark=NULL,shift_type_id=NULL,leave_type_id=excluded.leave_type_id,hours=NULL,start_time=NULL,end_time=NULL,marker=NULL,rest_label=NULL,updated_at=excluded.updated_at,updated_by=excluded.updated_by")
     .bind(employeeId,employee.store_id,d,typeId,ctx.now,ctx.actor));
   }
  }
  statements.push(new AuditService(this.db).prepareRecord({entityType:"hr_leave",entityKey:batchId,action:"hr_leave.created",actorEmployeeId:ctx.actor,requestId:ctx.requestId,
   after:{employeeId,typeId,dates:list,minutes,advanceHolidayDate:advanceDate,roster:wholeDay?list:[]}}));
  await this.db.batch(statements);
  return {batchId,days:list.length,minutes:minutes.reduce((a,b)=>a+b,0)};
 }
 async cancel(batchId:string,raw:unknown,ctx:HrContext){
  const reason=required(object(raw).reason,"reason",2000),input=object(raw);
  const all=(await this.db.prepare("SELECT * FROM hr_leave_records WHERE batch_id=? AND cancelled_at IS NULL ORDER BY work_date LIMIT 120").bind(batchId).all<RecordRow>()).results??[];
  if(!all.length)throw new HrValidationError("batchId","找不到可銷假的紀錄",404);
  const dates=Array.isArray(input.dates)?input.dates.map(ymd):all.map(x=>x.work_date);
  const rows=all.filter(x=>dates.includes(x.work_date));if(!rows.length)throw new HrValidationError("dates","銷假日期不在申請內");
  const statements:D1PreparedStatement[]=[];
  for(const row of rows){
   statements.push(this.db.prepare("UPDATE hr_leave_records SET cancelled_at=?,cancelled_by=?,cancel_reason=? WHERE id=? AND cancelled_at IS NULL").bind(ctx.now,ctx.actor,reason,row.id));
   if(row.whole_day)statements.push(this.db.prepare("DELETE FROM hr_schedule_days WHERE employee_id=? AND work_date=? AND kind='leave' AND leave_type_id=?").bind(row.employee_id,row.work_date,row.leave_type_id));
  }
  statements.push(new AuditService(this.db).prepareRecord({entityType:"hr_leave",entityKey:batchId,action:"hr_leave.cancelled",actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{dates:rows.map(x=>x.work_date),reason,roster:rows.filter(x=>x.whole_day).map(x=>x.work_date)}}));
  await this.db.batch(statements);
  return {cancelled:rows.length};
 }
 async years(id:number,asOf:string){return this.computeYears(id,asOf)}
}
