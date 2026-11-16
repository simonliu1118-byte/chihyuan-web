import {calculatePayroll,overtimePay,type PayrollProfile,type PayrollRule,type PayrollInput,type PayrollSalary,type PayrollLeave,type PayrollResult,type PayrollDay,type PayrollCashout} from '../../shared/hr-payroll';
import {annualLeaveSchedule,annualLeaveLedger} from '../../shared/hr-annual-leave';
import {evaluateAttendance,type AttendanceSchedule} from '../../shared/hr-attendance';
import {AuditService} from '../audit/audit-service';
import {HrValidationError,date,integer,object,required,nullableDate} from './hr-validation';
import type {HrContext} from './hr-service';
import {sha256} from './hr-payroll-import';

export function payrollMonth(v:unknown){const s=required(v,'month',7);if(!/^20\d\d-(0[1-9]|1[0-2])$/.test(s))throw new HrValidationError('month','月份須YYYY-MM');return s;}
function number(v:unknown,key:string,max=10_000_000){const n=integer(v,key);if(n>max)throw new HrValidationError(key,'數值超過上限');return n;}
function hours(v:unknown,key:string,max:number){const n=Number(v??0);if(!Number.isFinite(n)||n<0||n>max||!Number.isInteger(n*2))throw new HrValidationError(key,'工時須為半小時倍數且在有效範圍');return n;}
function flag(v:unknown,key:string){if(typeof v!=='boolean')throw new HrValidationError(key,'請明確選擇是否適用');return v;}
export function validatePayrollProfile(raw:unknown):PayrollProfile{
 const v=object(raw),p:PayrollProfile={
  attendanceEnabled:flag(v.attendanceEnabled,'attendanceEnabled'),attendanceAmount:number(v.attendanceAmount,'attendanceAmount'),
  laborEnabled:flag(v.laborEnabled,'laborEnabled'),employmentInsurance:flag(v.employmentInsurance,'employmentInsurance'),laborBasis:number(v.laborBasis,'laborBasis'),
  healthEnabled:flag(v.healthEnabled,'healthEnabled'),healthBasis:number(v.healthBasis,'healthBasis'),dependents:number(v.dependents,'dependents',20),healthAtMonthEnd:flag(v.healthAtMonthEnd,'healthAtMonthEnd'),
  pensionEnabled:flag(v.pensionEnabled,'pensionEnabled'),pensionBasis:number(v.pensionBasis,'pensionBasis'),pensionEmployerRate:Number(v.pensionEmployerRate),pensionSelfRate:Number(v.pensionSelfRate),
  insuredFrom:nullableDate(v.insuredFrom,'insuredFrom'),insuredTo:nullableDate(v.insuredTo,'insuredTo'),
  healthFrom:nullableDate(v.healthFrom,'healthFrom'),healthTo:nullableDate(v.healthTo,'healthTo'),
  pensionFrom:nullableDate(v.pensionFrom,'pensionFrom'),pensionTo:nullableDate(v.pensionTo,'pensionTo'),
  occupationalBasis:number(v.occupationalBasis,'occupationalBasis'),occupationalRate:Number(v.occupationalRate),
  taxResidence:v.taxResidence as PayrollProfile['taxResidence'],taxMethod:'table',taxDependents:number(v.taxDependents,'taxDependents',99),
  taxSalaryKind:v.taxSalaryKind as PayrollProfile['taxSalaryKind'],nhiSupplementCategory:v.nhiSupplementCategory as PayrollProfile['nhiSupplementCategory'],nhiExemptionReference:typeof v.nhiExemptionReference==='string'?v.nhiExemptionReference.trim():'',nhiUnitKey:typeof v.nhiUnitKey==='string'?v.nhiUnitKey.trim():'',
  bonusOpeningYear:v.bonusOpeningYear==null?undefined:number(v.bonusOpeningYear,'bonusOpeningYear',2099),bonusOpeningThrough:nullableDate(v.bonusOpeningThrough,'bonusOpeningThrough')??undefined,bonusOpeningAmount:v.bonusOpeningAmount==null?undefined:number(v.bonusOpeningAmount,'bonusOpeningAmount',1000000000),bonusOpeningReference:typeof v.bonusOpeningReference==='string'?v.bonusOpeningReference.trim():'',
  weeklyHours:hours(v.weeklyHours,'weeklyHours',40),hourlyAllowanceHours:hours(v.hourlyAllowanceHours,'hourlyAllowanceHours',744),
 };
 if(p.taxSalaryKind!=null&&!['primary','secondary'].includes(p.taxSalaryKind)||p.nhiSupplementCategory!=null&&!['own','other','exempt'].includes(p.nhiSupplementCategory))throw new HrValidationError('paymentFacts','所得／補充保費身分不正確');
 if(!['resident','nonresident'].includes(p.taxResidence)||p.taxMethod!=='table')throw new HrValidationError('taxMethod','扣繳身分及方式必填');
 if([p.pensionEmployerRate,p.pensionSelfRate,p.occupationalRate].some(x=>!Number.isFinite(x)||x<0||x>100||Math.abs(x*10000-Math.round(x*10000))>1e-7))throw new HrValidationError('rate','費率格式錯誤');
 if(p.pensionSelfRate>6||p.pensionEnabled&&p.pensionEmployerRate<6)throw new HrValidationError('pension','雇主提繳不得低於6%，自提不得超過6%');
 if(p.insuredTo&&(!p.insuredFrom||p.insuredTo<p.insuredFrom)||p.laborEnabled&&(!p.insuredFrom||p.laborBasis===0)||p.healthEnabled&&(!p.healthFrom||p.healthBasis===0)||p.pensionEnabled&&(!p.pensionFrom||p.pensionBasis===0)||p.healthTo&&(!p.healthFrom||p.healthTo<p.healthFrom)||p.pensionTo&&(!p.pensionFrom||p.pensionTo<p.pensionFrom))throw new HrValidationError('insurance','各保險／提繳日期及基礎金額須完整，不能共用錯誤日期');
 if(p.employmentInsurance&&!p.laborEnabled)throw new HrValidationError('employmentInsurance','此一般受僱者計算設定的就保須搭配勞保');
 if(p.occupationalRate>0&&(!p.insuredFrom||!p.occupationalBasis))throw new HrValidationError('occupationalRate','職災費率啟用時須填日期及投保金額');
 return p;
}
const array=(table:string,cols:string,where:string,order:string,limit:number)=>`json((SELECT json_group_array(json_object(${cols.split(',').map(c=>`'${c}',${c}`).join(',')})) FROM (SELECT ${cols} FROM ${table} WHERE ${where} ORDER BY ${order} LIMIT ${limit})))`;
// One bounded SQL snapshot. The very same SQL executes inside confirmation's transaction,
// so a concurrent change to ANY input cannot confirm an old calculation.
const SOURCE_SQL=`WITH p AS (SELECT ?1 AS eid,?2 AS month,?3 AS last,?4 AS paid)
 SELECT json_object(
 'employee',json((SELECT json_object('id',id,'employee_no',employee_no,'name',name,'hire_date',hire_date,'seniority_start_date',seniority_start_date,'termination_date',termination_date,'employment_type',employment_type,'schedule_mode',schedule_mode,'skip_roster_checks',skip_roster_checks,'store_id',store_id,'revision',revision) FROM hr_employees,p WHERE id=p.eid)),
 'salaries',${array('hr_salary_records,p','id,effective_date,payment_type,base_amount','employee_id=p.eid AND effective_date<=p.last','effective_date,id',501)},
 'allowances',${array('hr_salary_allowances','id,salary_record_id,item_type_id,amount,is_regular','salary_record_id IN (SELECT id FROM hr_salary_records,p WHERE employee_id=p.eid AND effective_date<=p.last)','id',2001)},
 'types',${array('hr_salary_item_types','id,name','1=1','id',201)},
 'profiles',${array('hr_payroll_profiles,p','id,effective_date,settings_json','employee_id=p.eid AND effective_date<=max(p.last,p.paid)','effective_date,id',501)},
 'status',${array('hr_status_changes,p','id,effective_date,next_status','employee_id=p.eid AND effective_date<=p.last','effective_date,id',501)},
 'punches',${array('hr_attendance_days,p','id,work_date,in1,out1,in2,out2,note,revision','employee_id=p.eid AND work_date BETWEEN p.month||\'-01\' AND p.last','work_date',32)},
 'schedules',${array('hr_schedule_days,p','id,work_date,kind,off_mark,rest_label,marker,shift_type_id,leave_type_id,hours,start_time,end_time','employee_id=p.eid AND work_date BETWEEN date(p.month||\'-01\',\'-7 days\') AND p.last','work_date',40)},
 'shifts',${array('hr_shift_types','id,start_time,end_time,break_start,break_end,normal_minutes','1=1','id',201)},
 'leaves',${array('hr_leave_records,p','id,work_date,leave_type_id,minutes,whole_day,start_time,end_time,event_date,event_quota_days,payroll_protection,cancelled_at',"employee_id=p.eid AND (work_date BETWEEN substr(p.month,1,4)||'-01-01' AND p.last OR (leave_type_id IN (SELECT id FROM hr_leave_types WHERE code IN('產','傷')) AND work_date BETWEEN date(p.month||'-01','-120 days') AND date(p.last,'+120 days')))",'work_date,id',3001)},
 'leaveTypes',${array('hr_leave_types','id,code,pay_ratio,counts_calendar_days','1=1','id',201)},
 'overtime',${array('hr_overtime_days,p','id,work_date,minutes,settlement,revision','employee_id=p.eid AND work_date BETWEEN p.month||\'-01\' AND p.last','work_date',32)},
 'holidays',${array('hr_holidays,p','date,name','date BETWEEN p.month||\'-01\' AND p.last','date',40)},
 'reviews',${array('hr_payroll_day_reviews,p','work_date,kind,reason,revision','employee_id=p.eid AND work_date BETWEEN p.month||\'-01\' AND p.last','work_date',32)},
 'settlements',${array(`(SELECT c.id,c.overtime_day_id,c.minutes,c.created_at,o.work_date,o.minutes AS original_minutes,COALESCE(s.rest_label,'') AS rest_label,h.date AS holiday FROM hr_comp_time_settlements c JOIN hr_overtime_days o ON o.id=c.overtime_day_id LEFT JOIN hr_schedule_days s ON s.employee_id=c.employee_id AND s.work_date=o.work_date LEFT JOIN hr_holidays h ON h.date=o.work_date,p WHERE c.employee_id=p.eid AND date(c.created_at,'+8 hours')<=p.last)`,'id,overtime_day_id,minutes,created_at,work_date,original_minutes,rest_label,holiday','1=1','id',501)},
 'annualYears',${array('hr_annual_leave_years,p','id,period_start,entitled_minutes,entitled_minutes_override','employee_id=p.eid','period_start',101)},
 'exclusions',${array('hr_seniority_exclusions,p','start_date,end_date','employee_id=p.eid','start_date',101)},
 'annualUses',${array('hr_leave_records l,p','id,work_date,minutes,cancelled_at',"employee_id=p.eid AND work_date<=p.last AND leave_type_id IN (SELECT id FROM hr_leave_types WHERE code='特')",'work_date,id',5001)},
 'history',${array(`(SELECT r.id,r.month,r.revision,json_extract(r.result_json,'$.wageRates') AS wage_rates,json_extract(r.result_json,'$.overtimeTaxBands') AS tax_bands FROM hr_payroll_runs r,p WHERE r.employee_id=p.eid AND r.status='paid' AND r.month<p.month)`,'id,month,revision,wage_rates,tax_bands','1=1','month,id',501)},
 'consumed',${array(`(SELECT c.source_key,c.minutes,c.amount FROM hr_payroll_consumptions c JOIN hr_payroll_runs r ON r.id=c.run_id,p WHERE c.employee_id=p.eid AND c.active=1 AND r.month!=p.month)`,'source_key,minutes,amount','1=1','source_key',1001)},
 'rules',${array('hr_payroll_rule_versions r,p','id,kind,effective_date,valid_until,source_url,source_hash,payload_json',`effective_date<=max(p.last,p.paid) AND ((kind='tax' AND id=(SELECT v.id FROM hr_payroll_rule_versions v WHERE v.kind='tax' AND v.effective_date<=p.paid ORDER BY v.effective_date DESC,v.id DESC LIMIT 1)) OR (kind!='tax' AND ((effective_date>p.month||'-01' AND effective_date<=p.last) OR id=(SELECT v.id FROM hr_payroll_rule_versions v WHERE v.kind=r.kind AND v.effective_date<=p.month||'-01' ORDER BY v.effective_date DESC,v.id DESC LIMIT 1))))`,'kind,effective_date,id',201)},
 'legalCases',${array('hr_payroll_legal_cases,p','id,kind,event_date,from_date,to_date,monthly_basis,average_daily,offsets_json,reference,is_active','employee_id=p.eid','id',501)},
 'nhiPolicies',${array('hr_payroll_supplement_versions,p','id,effective_date,payload_json,source_url','effective_date<=p.paid','effective_date DESC,id DESC',2)},
 'paidIncome',${array(`(SELECT id,pay_date,json_extract(result_json,'$.regularTaxable') AS regular,json_extract(result_json,'$.bonusGross') AS bonus,json_extract(result_json,'$.taxRegular') AS taxRegular,json_extract(result_json,'$.taxBonus') AS taxBonus,json_extract(result_json,'$.nhiIncome') AS nhiIncome,json_extract(result_json,'$.nhiPremium') AS nhiPremium FROM hr_payroll_runs,p WHERE employee_id=p.eid AND status='paid' AND pay_date<=p.paid AND substr(pay_date,1,4)=substr(p.paid,1,4))`,'id,pay_date,regular,bonus,taxRegular,taxBonus,nhiIncome,nhiPremium','1=1','pay_date,id',501)},
 'corrections',${array(`(SELECT c.id,c.source_run_id,c.kind,c.amount,c.reference,c.reason,c.revision FROM hr_payroll_corrections c,p WHERE c.employee_id=p.eid AND c.target_month=p.month AND c.is_active=1 AND NOT EXISTS(SELECT 1 FROM hr_payroll_correction_uses u JOIN hr_payroll_runs r ON r.id=u.run_id WHERE u.correction_id=c.id AND u.is_active=1 AND r.status='paid'))`,'id,source_run_id,kind,amount,reference,reason,revision','1=1','id',201)},
 'syncBlocks',${array('hr_payroll_sync_state','kind,error','blocking=1','kind',5)}
 ,'wages',${array('hr_minimum_wages,p','effective_date,monthly_amount,hourly_amount','effective_date<=max(p.last,p.paid)','effective_date',101)}
 ) AS body FROM p`;
type Row=Record<string,string|number|null>;
interface RunRow extends Row {id:number;employee_id:number;month:string;pay_date:string;status:'draft'|'confirmed'|'paid'|'void';revision:number;input_json:string;result_json:string;source_json:string}
interface Snapshot {corrections:Row[];nhiPolicies:Row[];paidIncome:Row[];legalCases:Row[];employee:Row|null;salaries:Row[];allowances:Row[];types:Row[];profiles:Row[];status:Row[];punches:Row[];schedules:Row[];shifts:Row[];leaves:Row[];leaveTypes:Row[];overtime:Row[];holidays:Row[];reviews:Row[];settlements:Row[];rules:Row[];syncBlocks:Row[];annualYears:Row[];exclusions:Row[];annualUses:Row[];history:Row[];consumed:Row[];wages:{effective_date:string;monthly_amount:number;hourly_amount:number}[]}
const end=(month:string)=>new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).toISOString().slice(0,10);
export class HrPayrollService {
 constructor(private db:D1Database){}
 private async employee(id:number){const row=await this.db.prepare('SELECT id,employee_no,name,hire_date FROM hr_employees WHERE id=?').bind(id).first<Row>();if(!row)throw new HrValidationError('employeeId','員工不存在',404);return row;}
 async profiles(id:number){await this.employee(id);const rows=(await this.db.prepare('SELECT id,effective_date,settings_json,reason,created_at FROM hr_payroll_profiles WHERE employee_id=? ORDER BY effective_date DESC,id DESC LIMIT 501').bind(id).all<Row>()).results??[];if(rows.length>500)throw new HrValidationError('limit','設定歷史超過單次安全上限');return rows;}
 async saveProfile(id:number,raw:unknown,ctx:HrContext){
  await this.employee(id);const v=object(raw),settings=validatePayrollProfile(v.settings),at=date(v.effectiveDate,'effectiveDate'),reason=required(v.reason,'reason',1000),expected=number(v.expectedId,'expectedId');
  await this.db.batch([
   this.db.prepare("SELECT CASE WHEN COALESCE((SELECT MAX(id) FROM hr_payroll_profiles WHERE employee_id=?),0)=? THEN 1 ELSE json('') END").bind(id,expected),
   this.db.prepare('INSERT INTO hr_payroll_profiles(employee_id,effective_date,settings_json,reason,created_at,created_by) VALUES(?,?,?,?,?,?)').bind(id,at,JSON.stringify(settings),reason,ctx.now,ctx.actor),
   new AuditService(this.db).prepareRecord({entityType:'hr_payroll_profile',entityKey:String(id),action:'hr_payroll_profile.created',actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{effectiveDate:at,reason,settings}}),
  ]);return this.profiles(id);
 }
 private input(raw:unknown):PayrollInput{const v=object(raw),month=payrollMonth(v.month),payDate=date(v.payDate,'payDate'),paidDays=v.paidDays==null?undefined:number(v.paidDays,'paidDays',30),reason=typeof v.reason==='string'?v.reason.trim():'';
  if(paidDays!=null&&!reason)throw new HrValidationError('reason','指定計薪天數須填原因');
  return {employeeId:integer(v.employeeId,'employeeId',true),month,payDate,paidDays,reason,bonusAmount:v.bonusAmount==null?0:number(v.bonusAmount,'bonusAmount',1000000000)};
 }
 private async source(input:PayrollInput){
  const args=[input.employeeId,input.month,end(input.month),input.payDate] as const;
  const row=await this.db.prepare(SOURCE_SQL).bind(...args).first<{body:string}>();if(!row?.body||row.body.length>700000)throw new HrValidationError('source','計薪來源超過安全上限');
  const data=JSON.parse(row.body) as Snapshot;if(!data.employee)throw new HrValidationError('employeeId','員工不存在',404);
  for(const [key,max] of Object.entries({salaries:500,allowances:2000,profiles:500,status:500,types:200,leaveTypes:200,shifts:200,leaves:3000,rules:200,settlements:500,annualYears:100,exclusions:100,annualUses:5000,history:500,consumed:1000,wages:100,legalCases:500,paidIncome:500,corrections:200}))if((data[key as keyof Snapshot] as Row[]).length>max)throw new HrValidationError('limit','計薪來源 '+key+' 超過單次安全上限');
  return {json:row.body,data,args,hash:await sha256(row.body)};
 }
 private compute(input:PayrollInput,s:Snapshot):PayrollResult{
  const e=s.employee!,types=new Map(s.leaveTypes.map(r=>[Number(r.id),r])),punches=new Map(s.punches.map(r=>[String(r.work_date),r])),shifts=new Map(s.shifts.map(r=>[Number(r.id),r])),ot=new Map(s.overtime.map(r=>[String(r.work_date),r])),review=new Map(s.reviews.map(r=>[String(r.work_date),r]));
  const schedules=new Map(s.schedules.map(r=>[String(r.work_date),r])),holidays=new Set(s.holidays.map(r=>String(r.date)));
  const leaves:PayrollLeave[]=s.leaves.map(r=>({...r,id:Number(r.id),work_date:String(r.work_date),minutes:Number(r.minutes),whole_day:Number(r.whole_day),code:String(types.get(Number(r.leave_type_id))?.code??''),pay_ratio:types.get(Number(r.leave_type_id))?.pay_ratio as number|null,payroll_protection:r.payroll_protection as string|null,event_date:r.event_date as string|null,event_quota_days:r.event_quota_days as number|null,cancelled_at:r.cancelled_at as string|null}));
  const firstEligible=String(e.hire_date)>input.month+'-01'?String(e.hire_date):input.month+'-01';
  const profiles=s.profiles.filter(r=>String(r.effective_date)<=firstEligible);const profile=profiles.at(-1);const settings=profile?JSON.parse(String(profile.settings_json)) as PayrollProfile:null;
  const salaries:PayrollSalary[]=s.salaries.map(r=>({id:Number(r.id),effective_date:String(r.effective_date),payment_type:r.payment_type as 'monthly'|'hourly',base_amount:Number(r.base_amount),allowances:s.allowances.filter(a=>a.salary_record_id===r.id).map(a=>({amount:Number(a.amount),is_regular:Number(a.is_regular),item_name:String(s.types.find(t=>t.id===a.item_type_id)?.name??'津貼')}))}));
  const first=Date.parse(input.month+'-01T00:00:00Z'),length=+end(input.month).slice(8),days:PayrollDay[]=[];
  for(let i=0;i<length;i++){
   const at=new Date(first+i*86400000).toISOString().slice(0,10),r=schedules.get(at),p=punches.get(at),shift=shifts.get(Number(r?.shift_type_id)),dayLeaves=s.leaves.filter(l=>l.work_date===at&&!l.cancelled_at);
   const schedule=r?{kind:r.kind,rest_label:r.rest_label,code:types.get(Number(r.leave_type_id))?.code??null,marker:r.marker}:null;
   const calc=evaluateAttendance(r?{kind:r.kind,offMark:r.off_mark,restLabel:r.rest_label,marker:r.marker,leaveCode:schedule?.code} as AttendanceSchedule:null,
    shift?{startTime:String(shift.start_time),endTime:String(shift.end_time),breakStart:shift.break_start as string|null,breakEnd:shift.break_end as string|null,normalMinutes:Number(shift.normal_minutes)}:
    r?.start_time&&r.end_time?{startTime:String(r.start_time),endTime:String(r.end_time),normalMinutes:Math.round(Number(r.hours)*60)}:null,
    {in1:p?.in1 as string|null,out1:p?.out1 as string|null,in2:p?.in2 as string|null,out2:p?.out2 as string|null},
    {noRosterPartTime:e.employment_type==='casual'&&e.schedule_mode==='none',approvedLeave:dayLeaves.map(l=>({wholeDay:l.whole_day===1,startTime:l.start_time as string|null,endTime:l.end_time as string|null}))});
   let consecutive=0;for(let j=0;j<7;j++){const prev=new Date(first+(i-j)*86400000).toISOString().slice(0,10),cell=schedules.get(prev);if(!cell||cell.kind==='off'&&cell.off_mark==='slash')break;consecutive++;}
   const overtime=ot.get(at);
   days.push({date:at,...calc,schedule:schedule as PayrollDay['schedule'],normalMinutes:r?.kind==='off'&&r.off_mark==='slash'?0:shift?Number(shift.normal_minutes):r?.hours?Math.round(Number(r.hours)*60):480,
    holiday:holidays.has(at)&&review.get(at)?.kind!=='holiday_shifted',consecutiveSix:consecutive>=6,
    overtime:overtime?{minutes:Number(overtime.minutes),settlement:String(overtime.settlement)}:null});
  }
  const rules:PayrollRule[]=s.rules.map(r=>({id:Number(r.id),kind:r.kind as PayrollRule['kind'],effective_date:String(r.effective_date),valid_until:String(r.valid_until),source_url:String(r.source_url),source_hash:String(r.source_hash),data:JSON.parse(String(r.payload_json))}));
  const effectiveStatus=s.status.filter(r=>String(r.effective_date)<=input.month+'-01').at(-1);
  const hasUnpaidPeriod=effectiveStatus?.next_status==='leave'||s.status.some(r=>String(r.effective_date)>input.month+'-01'&&r.next_status==='leave');
  const employee={hasUnpaidPeriod,hireDate:String(e.hire_date),terminationDate:e.termination_date as string|null,employmentType:String(e.employment_type)};
  const paymentProfile=s.profiles.filter(p=>String(p.effective_date)<=input.payDate).at(-1),policy=s.nhiPolicies[0];
  const payrollContext={corrections:s.corrections.map(c=>({id:Number(c.id),sourceRunId:Number(c.source_run_id),kind:String(c.kind),amount:Number(c.amount),reference:String(c.reference),reason:String(c.reason)})),requirePaymentFacts:true,paymentProfile:paymentProfile?JSON.parse(String(paymentProfile.settings_json)) as PayrollProfile:undefined,policy:policy?{id:Number(policy.id),effectiveDate:String(policy.effective_date),source:String(policy.source_url),...JSON.parse(String(policy.payload_json))}:null,paidIncome:s.paidIncome.map(p=>({date:String(p.pay_date),regular:Number(p.regular??0),bonus:Number(p.bonus??0),taxRegular:Number(p.taxRegular??0),taxBonus:Number(p.taxBonus??0),nhiIncome:Number(p.nhiIncome??0),nhiPremium:Number(p.nhiPremium??0)})),legalCases:s.legalCases.map(c=>({id:Number(c.id),kind:c.kind as 'maternity'|'occupational',eventDate:String(c.event_date),from:String(c.from_date),to:String(c.to_date),monthlyBasis:Number(c.monthly_basis),averageDaily:Number(c.average_daily),offsets:JSON.parse(String(c.offsets_json)),reference:String(c.reference),active:c.is_active===1})),profiles:s.profiles.map(p=>({effectiveDate:String(p.effective_date),settings:JSON.parse(String(p.settings_json)) as PayrollProfile}))};
  const preliminary=calculatePayroll(input,employee,settings,salaries,days,leaves,rules,[],s.wages,payrollContext);
  const priorRate=(at:string)=>{if(at.startsWith(input.month))return preliminary.wageRates?.find(r=>r.date===at)?.hourly??null;const history=s.history.find(h=>h.month===at.slice(0,7));if(!history?.wage_rates)return null;const rates=JSON.parse(String(history.wage_rates)) as {date:string;hourly:number}[];return rates.find(r=>r.date===at)?.hourly??null;};
  const cashouts:PayrollCashout[]=[],pending:string[]=[],consumed=new Set(s.consumed.map(c=>String(c.source_key)));
  for(const row of s.settlements){const key='comp:'+row.id;if(consumed.has(key))continue;
   const at=String(row.work_date),rate=priorRate(at);if(rate==null){pending.push(at+' 補休結清缺少原加班月份已發薪工資快照');continue;}
   const history=s.history.find(h=>h.month===at.slice(0,7));
   const band=history?.tax_bands?(JSON.parse(String(history.tax_bands)) as NonNullable<PayrollResult['overtimeTaxBands']>).find(b=>b.date===at):null;
   if(!band||band.minutes!==row.original_minutes){pending.push(at+' 補休結清缺少一致的原月份加班／免稅時數快照');continue;}
   const kind=band.kind;
   const before=s.settlements.filter(c=>c.overtime_day_id===row.overtime_day_id&&Number(c.id)<Number(row.id)).reduce((n,c)=>n+Number(c.minutes),0),to=Number(row.original_minutes)-before,from=to-Number(row.minutes);
   if(from<0){pending.push(at+' 補休結清時數超過原加班時數');continue;}
   const amount=overtimePay(rate,to,kind,band.monthly)-overtimePay(rate,from,kind,band.monthly),exempt=overtimePay(rate,Math.min(to,band.exemptMinutes),kind,band.monthly)-overtimePay(rate,Math.min(from,band.exemptMinutes),kind,band.monthly);
   cashouts.push({key,date:at,label:'到期補休轉加班費',minutes:Number(row.minutes),amount,taxExempt:exempt,detail:'依原已發薪工資／加班級距／免稅額度快照，按發生順序補休後結清剩餘後段，不占本月免稅額度'});
  }
  const terminated=typeof e.termination_date==='string'&&e.termination_date<=end(input.month)?e.termination_date:null,cutoff=terminated??end(input.month);
  const periods=annualLeaveSchedule(String(e.seniority_start_date),s.exclusions.map(r=>({startDate:String(r.start_date),endDate:String(r.end_date)})),cutoff).map(p=>{
   const row=s.annualYears.find(y=>y.period_start===p.periodStart),minutes=row?.entitled_minutes_override??row?.entitled_minutes;
   return {...p,entitledMinutes:minutes==null?e.employment_type==='full'?p.days*480:0:Number(minutes)};
  });
  const ledgerAt=terminated??new Date(Date.parse(cutoff+'T00:00:00Z')+86400000).toISOString().slice(0,10);
  const ledger=annualLeaveLedger(periods,s.annualUses.map(r=>({workDate:String(r.work_date),minutes:Number(r.minutes),cancelledAt:r.cancelled_at as string|null})),ledgerAt);
  const statutory=(index:number)=>{const p=periods[index],row=s.annualYears.find(y=>y.period_start===p.periodStart);return e.employment_type==='full'?p.days*480:Number(row?.entitled_minutes??0);};
  const annual=(key:string,at:string,minutes:number,exemptMinutes:number)=>{if(minutes<=0||consumed.has(key))return;const rate=priorRate(at);
   if(rate==null){pending.push(at+' 特休未休工資缺少基準月份已發薪工資快照');return;}
   cashouts.push({key,date:at,label:'特休未休工資',minutes,amount:rate*minutes/60,taxExempt:rate*Math.min(minutes,Math.max(0,exemptMinutes))/60,detail:'依原特休年度終結／離職基準工資及未休分鐘；法定額度內免稅、額外公司額度列應稅，不重複結清'});
  };
  for(let i=0;i<ledger.length;i++){const row=ledger[i];if(row.expiredUnpaidMinutes>0&&i>0)annual('annual:'+ledger[i-1].periodStart,ledger[i-1].periodEnd,row.expiredUnpaidMinutes,statutory(i-1)-ledger[i-1].usedCurrentDays*480-row.usedCarriedDays*480);
   if(terminated&&row.periodStart<=terminated&&row.periodEnd>=terminated){
    if(i>0)annual('annual:'+ledger[i-1].periodStart,ledger[i-1].periodEnd,(row.carriedInDays-row.usedCarriedDays)*480,statutory(i-1)-ledger[i-1].usedCurrentDays*480-row.usedCarriedDays*480);
    annual('annual:'+row.periodStart,terminated,Math.max(0,row.entitledMinutes-row.usedCurrentDays*480),statutory(i)-row.usedCurrentDays*480);
   }
  }
  const result=calculatePayroll(input,employee,settings,salaries,days,leaves,rules,cashouts,s.wages,payrollContext);
  result.issues.push(...pending);
  if(s.paidIncome.some(p=>String(p.pay_date).slice(0,7)===input.payDate.slice(0,7)&&p.regular==null))result.issues.push('同給付月有舊版薪資缺少扣繳累計基準，須先核對，不能將其當0');
  if(terminated&&e.employment_type!=='full'&&periods.some(p=>!p.entitledMinutes))result.issues.push('離職特休結清缺少部分工時歷年固定額度，請先補齊特休年度');
  for(const row of s.syncBlocks)result.issues.push(String(row.kind)+' 官方資料驗證異常，須先處理更新狀態');
  for(const d of days){
   if(d.anomalies.includes('曠職')&&review.get(d.date)?.kind!=='absence')result.issues.push(d.date+' 未打卡須先補正或明確確認曠班');
   if(d.schedule?.rest_label==='regular'&&review.get(d.date)?.kind==='regular_emergency')result.issues=result.issues.filter(x=>x!==d.date+' 例假出勤須另確認法定緊急事由及補假');
  }
  if(e.skip_roster_checks!==1&&e.employment_type!=='casual'&&!s.schedules.some(r=>String(r.work_date).startsWith(input.month)))result.issues.push('本月尚無班表資料');
  if(s.profiles.some(r=>String(r.effective_date)>firstEligible&&String(r.effective_date)<=end(input.month)&&['attendanceEnabled','attendanceAmount','weeklyHours','hourlyAllowanceHours'].some(k=>JSON.parse(String(r.settings_json))[k]!==JSON.parse(String(profile?.settings_json??'{}'))[k])))result.issues.push('月中全勤／約定工時異動須分段核對；投保項目已依生效日自動分段');
  if(hasUnpaidPeriod&&input.paidDays==null)result.issues.push('本月含留職停薪：請確認30天制實際計薪天數及原因，不能預設發整月');
  return result;
 }
 async calculate(raw:unknown,ctx:HrContext){
  const input=this.input(raw),source=await this.source(input),result=this.compute(input,source.data);
  const existing=await this.db.prepare("SELECT id,status,revision FROM hr_payroll_runs WHERE employee_id=? AND month=? AND status!='void'").bind(input.employeeId,input.month).first<{id:number;status:string;revision:number}>();
  if(existing&&existing.status!=='draft')throw new HrValidationError('status','已確認／已發薪紀錄不可直接重算；須先撤回確認',409);
  const stmt=existing?this.db.prepare("UPDATE hr_payroll_runs SET pay_date=?,source_hash=?,source_json=?,input_json=?,result_json=?,revision=revision+1,updated_at=?,updated_by=? WHERE id=? AND revision=? AND status='draft'")
   .bind(input.payDate,source.hash,source.json,JSON.stringify(input),JSON.stringify(result),ctx.now,ctx.actor,existing.id,existing.revision):
   this.db.prepare("INSERT INTO hr_payroll_runs(employee_id,month,pay_date,status,source_hash,source_json,input_json,result_json,created_at,created_by,updated_at,updated_by) VALUES(?,?,?,'draft',?,?,?,?,?,?,?,?)")
   .bind(input.employeeId,input.month,input.payDate,source.hash,source.json,JSON.stringify(input),JSON.stringify(result),ctx.now,ctx.actor,ctx.now,ctx.actor);
  const guard=existing?[this.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM hr_payroll_runs WHERE id=? AND revision=? AND status='draft') THEN 1 ELSE json('') END").bind(existing.id,existing.revision)]:[];
  const writes=await this.db.batch([...guard,stmt,new AuditService(this.db).prepareRecord({entityType:'hr_payroll',entityKey:input.employeeId+'|'+input.month,action:'hr_payroll.calculated',actorEmployeeId:ctx.actor,requestId:ctx.requestId,after:{sourceHash:source.hash,issues:result.issues.length,gross:result.gross,net:result.net}})]);
  if(existing&&!writes[guard.length].meta.changes)throw new HrValidationError('revision','薪資已被其他操作更新',409);
  return this.get(Number(existing?.id??writes[guard.length].meta.last_row_id));
 }
 async get(id:number){const row=await this.db.prepare('SELECT r.*,e.employee_no,e.name FROM hr_payroll_runs r JOIN hr_employees e ON e.id=r.employee_id WHERE r.id=?').bind(id).first<RunRow>();if(!row)throw new HrValidationError('id','薪資紀錄不存在',404);const {source_json,...safe}=row;return {...safe,input:JSON.parse(String(row.input_json)),result:JSON.parse(String(row.result_json)) as PayrollResult};}
 async list(month:string){payrollMonth(month);const result=await this.db.prepare("SELECT r.id,r.employee_id,e.employee_no,e.name,r.month,r.pay_date,r.status,r.revision,r.result_json,r.updated_at FROM hr_payroll_runs r JOIN hr_employees e ON e.id=r.employee_id WHERE r.month=? ORDER BY e.employee_no,r.id LIMIT 201").bind(month).all<Row>();if((result.results??[]).length>200)throw new HrValidationError('limit','本月薪資超過200筆，請縮小範圍');return (result.results??[]).map(r=>({...r,result:JSON.parse(String(r.result_json)) as PayrollResult}));}
 async transition(id:number,raw:unknown,ctx:HrContext){
  const v=object(raw),action=required(v.action,'action'),revision=number(v.revision,'revision'),reason=required(v.reason,'reason',1000);
  const row=await this.db.prepare('SELECT * FROM hr_payroll_runs WHERE id=?').bind(id).first<Row>();if(!row)throw new HrValidationError('id','薪資紀錄不存在',404);
  if(row.revision!==revision)throw new HrValidationError('revision','薪資已更動，請重讀',409);
  const status=action==='confirm'&&row.status==='draft'?'confirmed':action==='pay'&&row.status==='confirmed'?'paid':action==='reopen'&&row.status==='confirmed'?'void':null;
  if(!status)throw new HrValidationError('status','此狀態不能執行指定操作',409);
  const statements:D1PreparedStatement[]=[this.db.prepare("SELECT CASE WHEN EXISTS(SELECT 1 FROM hr_payroll_runs WHERE id=? AND revision=? AND status=?) THEN 1 ELSE json('') END").bind(id,revision,row.status)];
  if(action==='confirm'||action==='pay'){
   const result=JSON.parse(String(row.result_json)) as PayrollResult;if(result.issues.length)throw new HrValidationError('issues','仍有待補／待確認事項，不可確認薪資',409);
   const input=JSON.parse(String(row.input_json)) as PayrollInput,source=await this.source(input);if(source.json!==row.source_json)throw new HrValidationError('source','出勤／設定／級距已異動，請重算後再確認',409);
   statements.push(this.db.prepare(`SELECT CASE WHEN (?5=(${SOURCE_SQL.replace(/ AS body FROM p$/,' FROM p')})) THEN 1 ELSE json('') END`).bind(...source.args,row.source_json));
  }
  statements.push(this.db.prepare("UPDATE hr_payroll_runs SET status=?,revision=revision+1,updated_at=?,updated_by=?,reason=?,confirmed_at=CASE WHEN ?='confirmed' THEN ? ELSE confirmed_at END,paid_at=CASE WHEN ?='paid' THEN ? ELSE paid_at END WHERE id=? AND revision=?")
   .bind(status,ctx.now,ctx.actor,reason,status,ctx.now,status,ctx.now,id,revision));
  if(action==='confirm'){const result=JSON.parse(String(row.result_json)) as PayrollResult;for(const c of result.cashouts??[])statements.push(this.db.prepare('INSERT INTO hr_payroll_consumptions(employee_id,run_id,source_key,minutes,amount,created_at) VALUES(?,?,?,?,?,?)').bind(row.employee_id,id,c.key,c.minutes,c.amount,ctx.now));}
  if(action==='confirm'){const result=JSON.parse(String(row.result_json)) as PayrollResult;for(const correction of result.corrections??[])statements.push(this.db.prepare('INSERT INTO hr_payroll_correction_uses(correction_id,run_id,created_at) VALUES(?,?,?)').bind(correction,id,ctx.now));}
  if(action==='reopen')statements.push(this.db.prepare('UPDATE hr_payroll_correction_uses SET is_active=0 WHERE run_id=? AND is_active=1').bind(id));
  if(action==='reopen')statements.push(this.db.prepare('UPDATE hr_payroll_consumptions SET active=0 WHERE run_id=? AND active=1').bind(id));
  statements.push(new AuditService(this.db).prepareRecord({entityType:'hr_payroll',entityKey:String(id),action:'hr_payroll.'+action,actorEmployeeId:ctx.actor,requestId:ctx.requestId,before:{status:row.status,revision},after:{status,reason,sourceHash:row.source_hash}}));
  await this.db.batch(statements);return this.get(id);
 }
 async reviews(id:number,month:string){await this.employee(id);payrollMonth(month);return (await this.db.prepare('SELECT work_date,kind,reason,revision FROM hr_payroll_day_reviews WHERE employee_id=? AND work_date BETWEEN ? AND ? ORDER BY work_date LIMIT 32').bind(id,month+'-01',end(month)).all()).results??[];}
 async review(id:number,raw:unknown,ctx:HrContext){await this.employee(id);const v=object(raw),at=date(v.date,'date'),kind=required(v.kind,'kind'),reason=required(v.reason,'reason',1000),revision=number(v.revision,'revision');
  if(!['absence','holiday_shifted','regular_emergency'].includes(kind))throw new HrValidationError('kind','確認類別錯誤');
  const before=await this.db.prepare('SELECT kind,reason,revision FROM hr_payroll_day_reviews WHERE employee_id=? AND work_date=?').bind(id,at).first();
  await this.db.batch([
   this.db.prepare("SELECT CASE WHEN COALESCE((SELECT revision FROM hr_payroll_day_reviews WHERE employee_id=? AND work_date=?),0)=? THEN 1 ELSE json('') END").bind(id,at,revision),
   this.db.prepare('INSERT INTO hr_payroll_day_reviews(employee_id,work_date,kind,reason,updated_at,updated_by) VALUES(?,?,?,?,?,?) ON CONFLICT(employee_id,work_date) DO UPDATE SET kind=excluded.kind,reason=excluded.reason,revision=hr_payroll_day_reviews.revision+1,updated_at=excluded.updated_at,updated_by=excluded.updated_by').bind(id,at,kind,reason,ctx.now,ctx.actor),
   new AuditService(this.db).prepareRecord({entityType:'hr_payroll_review',entityKey:id+'|'+at,action:'hr_payroll_review.updated',actorEmployeeId:ctx.actor,requestId:ctx.requestId,before,after:{date:at,kind,reason}}),
  ]);return {saved:true};
 }
}
