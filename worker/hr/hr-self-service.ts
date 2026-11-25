import {HrService} from "./hr-service";
import {HrLeaveService} from "./hr-leave-service";
import {HrAttendanceService} from "./hr-attendance-service";
import {HrValidationError} from "./hr-validation";
import type {PayrollProfile,PayrollResult} from "../../shared/hr-payroll";

/**
 * 我的資料 (V0.21.1): one employee reads only the HR row bound to their own account. Every read is keyed by
 * the bound row, never by a request parameter, and only display fields leave the Worker: no admin notes,
 * reasons, previous-employer salaries, employer contributions or other employees. A payslip appears from the month it
 * is paid (user 2026-11-16: in November the one paid in November), once confirmed or paid.
 */
type Row=Record<string,unknown>;
const text=(v:unknown)=>typeof v==="string"&&v?v:null;
const pick=(row:Row,keys:readonly string[])=>Object.fromEntries(keys.map(k=>[k,row[k]??null]));

export class HrSelfService {
 constructor(private db:D1Database){}
 async employeeOf(memberId:number):Promise<number|null>{
  return (await this.db.prepare("SELECT id FROM hr_employees WHERE member_id=?").bind(memberId).first<{id:number}>())?.id??null;
 }
 /** The bound employee's own full ID number. Keyed by the bound row only; writes no access audit (the person is reading their own record). */
 async nationalId(id:number):Promise<{nationalId:string|null}>{
  const row=await this.db.prepare("SELECT national_id FROM hr_employee_current WHERE id=?").bind(id).first<{national_id:string|null}>();
  return {nationalId:row?.national_id??null};
 }
 async profile(id:number,today:string){
  const e=await new HrService(this.db).get(id);
  const names=await this.db.prepare("SELECT s.name AS store_name,j.name AS job_title FROM hr_employee_current e LEFT JOIN hr_stores s ON s.id=e.store_id LEFT JOIN hr_job_titles j ON j.id=e.job_title_id WHERE e.id=?").bind(id)
   .first<{store_name:string|null;job_title:string|null}>();
  const salaries=(e.salaryRecords as Row[]??[]).map(r=>({effectiveDate:String(r.effective_date),paymentType:r.payment_type as "monthly"|"hourly",baseAmount:Number(r.base_amount),
   allowances:((r.allowances as Row[])??[]).map(a=>({name:String(a.item_name??""),amount:Number(a.amount),regular:a.is_regular===1}))}));
  const profileRow=await this.db.prepare("SELECT effective_date,settings_json FROM hr_payroll_profiles WHERE employee_id=? AND effective_date<=? ORDER BY effective_date DESC,id DESC LIMIT 1").bind(id,today)
   .first<{effective_date:string;settings_json:string}>();
  let insurance=null;
  if(profileRow){const p=JSON.parse(profileRow.settings_json) as PayrollProfile;
   insurance={effectiveDate:profileRow.effective_date,laborEnabled:p.laborEnabled,employmentInsurance:p.employmentInsurance,laborBasis:p.laborBasis,
    healthEnabled:p.healthEnabled,healthBasis:p.healthBasis,dependents:p.dependents,pensionEnabled:p.pensionEnabled,pensionBasis:p.pensionBasis,
    pensionEmployerRate:p.pensionEmployerRate,pensionSelfRate:p.pensionSelfRate,taxDependents:p.taxDependents};}
  const runs=(await this.db.prepare("SELECT month,pay_date,status,result_json FROM hr_payroll_runs WHERE employee_id=? AND status IN('confirmed','paid') AND substr(pay_date,1,7)<=? ORDER BY pay_date DESC,month DESC,id DESC LIMIT 24").bind(id,today.slice(0,7))
   .all<{month:string;pay_date:string;status:string;result_json:string}>()).results??[];
  const payslips=runs.map(r=>{const x=JSON.parse(r.result_json) as PayrollResult;
   return {month:r.month,payDate:r.pay_date,status:r.status as "confirmed"|"paid",gross:x.gross,deductions:x.deductions,net:x.net,
    lines:x.lines.filter(l=>l.kind!=="employer"&&l.amount!==0).map(l=>({kind:l.kind as "earning"|"deduction",label:l.label,amount:l.amount,date:l.date||null}))};});
  return {
   employee:{...pick(e,["employee_no","name","status","gender","birth_date","mobile","phone","mailing_address","registered_address","hire_date","seniority_start_date","employment_type","schedule_mode","nationalIdMasked"]),
    store_name:text(names?.store_name),job_title:text(names?.job_title)},
   contacts:((e.contacts as Row[])??[]).map(c=>pick(c,["name","relationship","phone"])),
   statusChanges:((e.statusChanges as Row[])??[]).filter(c=>c.is_creation!==true).map(c=>pick(c,["effective_date","previous_status","next_status"])),
   salaries,insurance,payslips
  };
 }
 async leave(id:number,year:number,today:string){
  const d=await new HrLeaveService(this.db).detail(id,year,today);
  const names=new Map(d.types.map(t=>[t.id,t.name]));
  return {year,
   metrics:d.metrics.filter(m=>m.usedMinutes>0||m.limitMinutes!=null).map(m=>({name:m.name,code:m.code,usedMinutes:m.usedMinutes,limitMinutes:m.limitMinutes})),
   annual:d.annual.map(a=>({periodStart:a.periodStart,periodEnd:a.periodEnd,entitledMinutes:a.entitledMinutes,remainingMinutes:a.remainingMinutes})),
   comp:{balanceMinutes:d.comp.balanceMinutes,credits:d.comp.credits.filter(c=>c.remainingMinutes>0&&!c.expired).map(c=>({expiresOn:c.expiresOn,remainingMinutes:c.remainingMinutes,expiringSoon:c.expiringSoon}))},
   records:d.records.filter(r=>!r.cancelled_at).map(r=>({workDate:r.work_date,type:names.get(r.leave_type_id)??"",minutes:r.minutes,wholeDay:r.whole_day===1,startTime:r.start_time,endTime:r.end_time}))};
 }
 async attendance(id:number,monthValue:string){
  const a=await new HrAttendanceService(this.db).get(id,monthValue);
  return {month:monthValue,totals:a.totals,days:a.days.map(x=>({date:x.date,code:x.schedule?.code??null,kind:x.schedule?.kind??null,
   in1:x.punches?.in1??null,out1:x.punches?.out1??null,in2:x.punches?.in2??null,out2:x.punches?.out2??null,
   workedMinutes:x.workedMinutes,lateMinutes:x.lateMinutes,earlyMinutes:x.earlyMinutes,anomalies:x.anomalies,overtimeMinutes:x.overtime?.minutes??0}))};
 }
}
export function selfYear(value:string|null,today:string){
 const y=value==null?Number(today.slice(0,4)):Number(value);
 if(!Number.isInteger(y)||y<2000||y>2200)throw new HrValidationError("year","年度錯誤");return y;
}
