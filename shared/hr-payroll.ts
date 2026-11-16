import {paymentTaxes,type PaymentTaxContext} from './hr-payroll-supplement';
import {legalCalendarPay,type PayrollLegalCase} from './hr-payroll-legal';
import {payrollInsurance,type EffectivePayrollProfile} from './hr-payroll-insurance';
/** Payroll values are computed by the Worker. UI imports types only. */
export type RuleKind='labor'|'pension'|'health'|'tax';
export interface PayrollProfile {
 attendanceEnabled:boolean;attendanceAmount:number;
 laborEnabled:boolean;employmentInsurance:boolean;laborBasis:number;
 healthEnabled:boolean;healthBasis:number;dependents:number;healthAtMonthEnd:boolean;
 pensionEnabled:boolean;pensionBasis:number;pensionEmployerRate:number;pensionSelfRate:number;
 insuredFrom:string|null;insuredTo:string|null;
 healthFrom?:string|null;healthTo?:string|null;pensionFrom?:string|null;pensionTo?:string|null;
 occupationalBasis:number;occupationalRate:number;
 taxResidence:'resident'|'nonresident';taxMethod:'table';taxDependents:number;
 taxSalaryKind?:'primary'|'secondary';nhiSupplementCategory?:'own'|'other'|'exempt';nhiExemptionReference?:string;nhiUnitKey?:string;
 bonusOpeningYear?:number;bonusOpeningThrough?:string;bonusOpeningAmount?:number;bonusOpeningReference?:string;
 weeklyHours?:number;hourlyAllowanceHours?:number;
}
export interface PayrollRule {
 id:number;kind:RuleKind;effective_date:string;valid_until:string;source_url:string;source_hash:string;
 data:LaborTable|PensionTable|HealthTable|TaxTable;
}
export interface LaborTable {rows:{basis:number;laborRate:number;employmentRate:number;worker:number;employer:number}[];minimum:number}
export interface PensionTable {amounts:number[]}
export interface HealthTable {rows:{basis:number;worker:number[];employer:number}[]}
export interface TaxTable {rows:{from:number;to:number;amounts:number[]}[];nonresidentThreshold:number;nonMonthlyThreshold?:number}
export interface PayrollSalary {id:number;effective_date:string;payment_type:'monthly'|'hourly';base_amount:number;allowances:{amount:number;item_name:string;is_regular:number}[]}
export interface PayrollLeave {id:number;work_date:string;code:string;minutes:number;whole_day:number;pay_ratio:number|null;payroll_protection:string|null;event_date:string|null;event_quota_days:number|null;cancelled_at:string|null}
export interface PayrollDay {
 date:string;workedMinutes:number;lateMinutes:number;earlyMinutes:number;anomalies:string[];
 normalMinutes:number;holiday:boolean;consecutiveSix:boolean;
 schedule:{kind:string;rest_label:string|null;code:string|null;marker?:string|null}|null;
 overtime:{minutes:number;settlement:string}|null;
}
export interface PayrollCorrection {id:number;sourceRunId:number;kind:string;amount:number;reason:string;reference:string}
export interface PayrollContext extends PaymentTaxContext {profiles?:readonly EffectivePayrollProfile[];legalCases?:readonly PayrollLegalCase[];corrections?:readonly PayrollCorrection[]}
export interface PayrollInput {employeeId:number;month:string;payDate:string;paidDays?:number;reason?:string;bonusAmount?:number}
export interface PayrollCashout {key:string;date:string;label:string;minutes:number;amount:number;taxExempt:number;detail:string}
export interface PayrollLine {date:string;label:string;amount:number;minutes?:number;detail:string;kind:'earning'|'deduction'|'employer'}
export interface PayrollResult {
 employeeId:number;month:string;payDate:string;gross:number;deductions:number;net:number;employer:number;
 nhiPolicyVersion?:{id:number;effectiveDate:string;source:string};
 corrections?:number[];nhiPremium?:number;regularTaxable?:number;bonusGross?:number;taxRegular?:number;taxBonus?:number;nhiIncome?:number;nhiUnitKey?:string;
 attendanceAmount:number;lines:PayrollLine[];issues:string[];ruleVersions:{id:number;kind:RuleKind;source:string}[];
 wageRates?:{date:string;hourly:number}[];cashouts?:{key:string;minutes:number;amount:number}[];
 overtimeTaxBands?:{date:string;minutes:number;exemptMinutes:number;kind:'ordinary'|'rest'|'holiday'|'regular';monthly:boolean}[];
}
const finite=(n:number)=>Number.isFinite(n)&&n>=0;
/** Whole-yuan deductions truncate; additions round up so fractions cannot underpay a worker. */
const down=(n:number)=>Math.max(0,Math.floor(n+1e-8)),up=(n:number)=>Math.max(0,Math.ceil(n-1e-8)),round=(n:number)=>Math.max(0,Math.floor(n+0.5+1e-8));
export function insuranceDays(from:string,to:string|null,month:string):number {
 const last=new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).toISOString().slice(0,10);
 const a=from>month+'-01'?from:month+'-01',b=to&&to<last?to:last;
 if(a>b)return 0;
 const start=Math.min(30,+a.slice(8)),end=b===last?30:Math.min(30,+b.slice(8));
 return Math.max(0,end-start+1);
}
export function overtimePay(hourly:number,minutes:number,kind:'ordinary'|'rest'|'holiday'|'regular',monthly=true):number {
 const first=Math.min(minutes,120),next=Math.min(Math.max(0,minutes-120),kind==='rest'?360:120);
 if(kind==='holiday'||kind==='regular') {
  const normal=minutes>0?(monthly?8:Math.min(8,minutes/60)):0;
  const extra=Math.max(0,minutes-480);
  return hourly*(normal+(kind==='regular'?extra/30:Math.min(extra,120)/60*4/3+Math.max(0,extra-120)/60*5/3));
 }
 return hourly*(first*4/3+next*5/3+Math.max(0,minutes-first-next)*(kind==='rest'?8/3:2))/60;
}
export function selectRule(rules:readonly PayrollRule[],kind:RuleKind,at:string):PayrollRule|null {
 return [...rules].filter(r=>r.kind===kind&&r.effective_date<=at).sort((a,b)=>b.effective_date.localeCompare(a.effective_date)||b.id-a.id)
  .find(r=>r.valid_until>=at)??null;
}
export function calculatePayroll(input:PayrollInput,employee:{hireDate:string;terminationDate:string|null;employmentType?:string;hasUnpaidPeriod?:boolean},profile:PayrollProfile|null,
 salaries:readonly PayrollSalary[],days:readonly PayrollDay[],leaves:readonly PayrollLeave[],rules:readonly PayrollRule[],cashouts:readonly PayrollCashout[]=[],minimumWages:readonly {effective_date:string;monthly_amount:number;hourly_amount:number}[]=[],context:PayrollContext={}):PayrollResult {
 const issues:string[]=[],lines:PayrollLine[]=[],refs=new Map<number,PayrollRule>();
 const add=(kind:PayrollLine['kind'],label:string,amount:number,detail:string,date='',minutes?:number)=>{
  if(!finite(amount)){issues.push(label+'金額無效');return;}
  lines.push({kind,label,amount:kind==='deduction'?down(amount):kind==='employer'?round(amount):up(amount),detail,date,minutes});
 };
 const need=(kind:RuleKind,at:string)=>{const r=selectRule(rules,kind,at);if(!r)issues.push(kind+' 缺少適用日期 '+at+' 的官方表');else refs.set(r.id,r);return r;};
 const salaryAt=(date:string)=>[...salaries].filter(s=>s.effective_date<=date).sort((a,b)=>b.effective_date.localeCompare(a.effective_date)||b.id-a.id)[0];
 const last=new Date(Date.UTC(+input.month.slice(0,4),+input.month.slice(5),0)).toISOString().slice(0,10),lastEligible=employee.terminationDate&&employee.terminationDate<last?employee.terminationDate:last,current=salaryAt(lastEligible);
 const paidDays=days.filter(d=>d.date.startsWith(input.month)&&d.date>=employee.hireDate&&(!employee.terminationDate||d.date<=employee.terminationDate)).sort((a,b)=>a.date.localeCompare(b.date));
 if(employee.hireDate>last||employee.terminationDate&&employee.terminationDate<input.month+'-01')issues.push('此月份不在員工任職期間');
 if(!profile)issues.push('請先新增本月有效的薪資計算／投保設定');
 if(!current)issues.push('缺少已生效的薪資主檔紀錄');
 if(!current||!profile)return {employeeId:input.employeeId,month:input.month,payDate:input.payDate,gross:0,deductions:0,net:0,employer:0,attendanceAmount:0,lines,issues,ruleVersions:[]};
 const firstEligible=employee.hireDate>input.month+'-01'?employee.hireDate:input.month+'-01';
 if(!salaryAt(firstEligible))issues.push('本月前段缺少已生效薪資主檔紀錄');
 if(employee.terminationDate?.startsWith(input.month)&&input.payDate>employee.terminationDate)issues.push('離職應即結清工資，請核對實際給付日期，不套一般次月發薪日');
 const statusInMonth=employee.hireDate>input.month+'-01'||!!employee.terminationDate&&employee.terminationDate<last;
 if((statusInMonth||salaries.some(s=>s.effective_date>input.month+'-01'&&s.effective_date<=last))&&input.paidDays==null)
  issues.push('未滿月／月中調薪：請確認計薪天數及原因後重算');
 const eligibleDays=insuranceDays(employee.hireDate,employee.terminationDate,input.month);
 if(input.paidDays!=null&&input.paidDays<eligibleDays&&!employee.hasUnpaidPeriod)issues.push('手填計薪天數少於任職期間30天制天數，且無留職停薪依據，請核對避免少發工資');
 const workedNormal=paidDays.reduce((sum,d)=>sum+Math.max(0,Math.min(d.normalMinutes,d.workedMinutes-(d.overtime?.minutes??0))),0);
 if(input.paidDays!=null&&input.paidDays*480<workedNormal)issues.push('手填計薪天數少於已記錄正常出勤工時，請先核對');
 const factor=(input.paidDays??30)/30;
 const actualLeaves=[...leaves].filter(l=>!l.cancelled_at).sort((a,b)=>a.work_date.localeCompare(b.work_date)||a.id-b.id);
 const inMonth=actualLeaves.filter(l=>l.work_date.startsWith(input.month)&&l.work_date>=employee.hireDate&&(!employee.terminationDate||l.work_date<=employee.terminationDate));
 if(actualLeaves.some(l=>l.work_date.startsWith(input.month)&&!inMonth.includes(l)))issues.push('本月假單超出任職期間，請先核對假單');
 let sickMinutes=0,attendanceZero=false;
 for(const l of actualLeaves){
  const sick=l.code==='病'||l.code==='院'||l.payroll_protection==='pregnancy_rest';
  if(l.work_date.startsWith(input.month)){
   if((l.code==='事'&&!l.payroll_protection)||l.code==='曠')attendanceZero=true;
   if(sick&&!l.payroll_protection)sickMinutes+=l.minutes;
  }
 }
 for(const d of paidDays){if(d.lateMinutes>=6||d.earlyMinutes>0||d.anomalies.includes('曠職'))attendanceZero=true;
  if(d.anomalies.includes('缺卡'))issues.push(d.date+' 缺卡須先補正出勤');
  if(d.schedule?.kind==='leave'&&!['國','颱'].includes(d.schedule.code??'')&&!inMonth.some(l=>l.work_date===d.date))issues.push(d.date+' 排班假尚未完成正式假單');
 }
 const attendance=profile.attendanceEnabled?(attendanceZero?0:Math.max(0,profile.attendanceAmount*factor-profile.attendanceAmount*sickMinutes/14400)):0;
 if(attendance>0)add('earning','全勤',attendance,`30天基準；普通病假 ${sickMinutes} 分鐘按比例，生理／法定保護假不扣`);
 else if(profile.attendanceEnabled)lines.push({date:'',kind:'earning',label:'全勤',amount:0,detail:attendanceZero?'遲到達6分鐘／早退／一般事假／曠班，當月全勤不發':'本月無全勤金額'});
 // A partial month's paid allowance is prorated; its contractual monthly wage component is not halved a second time for hourly rates.
 const rateAttendance=profile.attendanceEnabled&&!attendanceZero?Math.max(0,profile.attendanceAmount-profile.attendanceAmount*sickMinutes/14400):0;
 if(salaries.some(s=>s.allowances.some(a=>a.item_name==='全勤')))issues.push('薪資主檔已有同名全勤津貼，請先核對與本頁全勤設定，避免重複發給或跳過扣發規則');
 const regularAllowances=current.allowances.reduce((n,a)=>n+a.amount,0);
 const weeklyRatio=employee.employmentType&&employee.employmentType!=='full'?Math.min(1,(profile.weeklyHours??0)/40):1;
 if(current.payment_type==='monthly'&&weeklyRatio===0)issues.push('半職／兼職月薪需填約定每週正常工時');
 const minimumRow=[...minimumWages].filter(w=>w.effective_date<=input.month+'-01').sort((a,b)=>b.effective_date.localeCompare(a.effective_date))[0];
 const minimum=minimumRow?.monthly_amount??(selectRule(rules,'labor',input.month+'-01')?.data as LaborTable|undefined)?.minimum??0;
 if(current.payment_type==='hourly'){
  if(!minimumRow)issues.push('缺少本月適用的官方每小時最低工資');
  else if(current.base_amount<minimumRow.hourly_amount)issues.push('主檔時薪低於本月法定最低工資，請先調整主檔');
 }
 const monthlyWage=Math.max(current.base_amount+regularAllowances+up(rateAttendance),minimum*weeklyRatio);
 const divisor=240*(weeklyRatio||1);
 const rateAt=(date:string)=>{const s=salaryAt(date);if(!s)return 0;
  return s.payment_type==='monthly'?Math.max(s.base_amount+s.allowances.reduce((n,a)=>n+a.amount,0)+up(rateAttendance),minimum*weeklyRatio)/divisor:s.base_amount+(profile.hourlyAllowanceHours?(s.allowances.reduce((n,a)=>n+a.amount,0)+up(attendance))/profile.hourlyAllowanceHours:0);
 };

 const baseByDate=new Map<string,number>();
 if(current.payment_type==='monthly'){
  const start=input.month+'-01',stop=last,ordered=[...salaries].filter(s=>s.effective_date<=stop).sort((a,b)=>a.effective_date.localeCompare(b.effective_date)||a.id-b.id);
  const segments:{salary:PayrollSalary;days:number;from:string;to:string}[]=[];
  for(let i=0;i<ordered.length;i++){
   const s=ordered[i],next=ordered[i+1];if(next&&next.effective_date<=start)continue;
   const from=[start,employee.hireDate,s.effective_date].sort().at(-1)!,to=[stop,employee.terminationDate??stop,next?new Date(Date.parse(next.effective_date+'T00:00:00Z')-86400000).toISOString().slice(0,10):stop].sort()[0];
   if(from>to)continue;segments.push({salary:s,days:insuranceDays(from,to,input.month),from,to});
  }
  const sumDays=segments.reduce((n,s)=>n+s.days,0),adjust=sumDays?((input.paidDays??sumDays)/sumDays):0;
  for(const segment of segments){
   const count=(Date.parse(segment.to)-Date.parse(segment.from))/86400000+1;
   for(let at=Date.parse(segment.from);at<=Date.parse(segment.to);at+=86400000)baseByDate.set(new Date(at).toISOString().slice(0,10),(segment.salary.base_amount+segment.salary.allowances.reduce((n,a)=>n+a.amount,0))*segment.days/30*adjust/count);
   if(segment.salary.payment_type!=='monthly'){issues.push('月中月薪／時薪方式異動須先核對分段計薪');continue;}
   add('earning','本薪',segment.salary.base_amount*segment.days/30*adjust,`${segment.from}～${segment.to}，30天制 ${segment.days} 天`,segment.from);
   for(const a of segment.salary.allowances)add('earning',a.item_name,a.amount*segment.days/30*adjust,'取該段生效主檔津貼',segment.from);
  }
 }else{
  let regularMinutes=0,regularPay=0;
  for(const d of paidDays){
   if(d.date<employee.hireDate||employee.terminationDate&&d.date>employee.terminationDate)continue;
   if(d.schedule?.kind==='off'&&d.schedule.rest_label==='rest')continue;
   if(d.schedule?.kind==='off'&&d.schedule.rest_label==='regular')continue;
   const minutes=Math.max(0,d.workedMinutes-(d.overtime?.minutes??0))+(d.lateMinutes>0&&d.lateMinutes<=5?d.lateMinutes:0);
   const salary=salaryAt(d.date);if(salary?.payment_type!=='hourly')issues.push('月中月薪／時薪方式異動須先核對分段計薪');
   regularMinutes+=minutes;regularPay+=(salary?.base_amount??0)*minutes/60;
  }
  add('earning','時薪工資',regularPay,'依當日生效時薪與正常工時，不將加班時數再付一次本薪','',regularMinutes);
  // 國定假日 for hourly staff (user 2026-11-16): a scheduled workday keeps its usual pay (照給); working it is paid again on top via 加班 (加倍).
  let holidayMinutes=0,holidayPay=0;
  for(const d of paidDays){
   if(!d.holiday)continue;
   const kind=d.schedule?.kind;
   if(kind==='shift'||kind==='hours'){holidayMinutes+=d.normalMinutes;holidayPay+=(salaryAt(d.date)?.base_amount??0)*d.normalMinutes/60;}
   else if(kind==='leave'&&d.schedule?.code==='國')issues.push(d.date+' 國定假日：請在排班填時薪人員原應工作時數，以照給當日工資');
  }
  if(holidayPay)add('earning','國定假日工資',holidayPay,'原應工作日照給當日工資；出勤另依加班加倍','',holidayMinutes);
  for(const a of current.allowances)add('earning',a.item_name,a.amount*factor,'主檔本期月額津貼，未滿月按已確認30天制天數折算；不是每小時重複乘上津貼');
  if((regularAllowances||profile.attendanceEnabled)&&!profile.hourlyAllowanceHours)issues.push('時薪津貼／全勤須填約定月正常工時，作為加班工資分攤基礎');
 }
 let wageLoss=0,sickYtd=0,physYtd=0;
 for(const l of actualLeaves){
  let ratio=1;
  if(l.code==='病'||l.code==='院'||l.payroll_protection==='pregnancy_rest'){
   const paid=Math.min(l.minutes,Math.max(0,14400-sickYtd));sickYtd+=l.minutes;ratio=0.5*paid/l.minutes;
  }else if(l.code==='生'){
   const extra=Math.min(l.minutes,Math.max(0,physYtd+l.minutes-1440));physYtd+=l.minutes;sickYtd+=extra;ratio=0.5;
  }else if(l.code==='事'||l.code==='家')ratio=0;
  else if(l.code==='產'||l.code==='傷')continue;
  else if(!['特','婚','喪','檢','陪','公','國','補','換','獎'].includes(l.code)){
   if(l.pay_ratio==null)issues.push(l.work_date+' '+l.code+' 尚未設定給薪比例');else ratio=l.pay_ratio;
  }
  if(inMonth.includes(l)){
   const amount=rateAt(l.work_date)*l.minutes/60;
   if(current.payment_type==='monthly')wageLoss+=amount*(1-ratio);
   else if(ratio>0)add('earning',l.code+'假工資',amount*ratio,'法定給薪；與實際出勤分開',l.work_date,l.minutes);
  }
 }
 const calendar=legalCalendarPay(input.month,employee.hireDate,profile,salaries,actualLeaves,context.legalCases??[],baseByDate,paidDays.length?attendance/paidDays.length:0,s=>issues.push(s),paidDays);
 for(const a of calendar.adjustments)add(a.kind,a.label,a.amount,a.detail);
 if(wageLoss)add('deduction','請假未給工資',wageLoss,'逐假別依法給薪，月底合計後捨去不足一元');
 let lateLoss=0,earlyLoss=0,absentLoss=0,otTotal=0,taxExemptOvertime=0,taxOvertimeMinutes=0;
 const overtimeTaxBands:NonNullable<PayrollResult['overtimeTaxBands']>=[];
 for(const d of paidDays){
  if(d.date<employee.hireDate||employee.terminationDate&&d.date>employee.terminationDate)continue;
  const hourRate=rateAt(d.date);
  if(d.workedMinutes>720)issues.push(d.date+' 工時超過已驗證每日12小時範圍，須核對法定例外');
  if(current.payment_type==='monthly'){
   lateLoss+=d.lateMinutes>=6?hourRate*d.lateMinutes/60:0;
   earlyLoss+=hourRate*d.earlyMinutes/60;
   if(d.anomalies.includes('曠職'))absentLoss+=hourRate*Math.max(0,d.normalMinutes-inMonth.filter(l=>l.work_date===d.date).reduce((n,l)=>n+l.minutes,0))/60;
  }
  const ot=d.overtime;
  const kind=d.schedule?.rest_label==='regular'?'regular':d.schedule?.rest_label==='rest'?'rest':d.holiday?'holiday':d.consecutiveSix?'rest':'ordinary';
  const eligible=ot?.minutes?(kind==='holiday'||kind==='regular'?Math.min(ot.minutes,720):Math.min(ot.minutes,Math.max(0,720-d.normalMinutes),Math.max(0,2760-taxOvertimeMinutes))):0;
  if(ot?.minutes){
   if(kind!=='holiday'&&kind!=='regular'){taxOvertimeMinutes+=ot.minutes;if(taxOvertimeMinutes>2760)issues.push('延長工時超過已驗證每月46小時範圍，須核對勞資會議同意及三個月138小時條件');}
   overtimeTaxBands.push({date:d.date,minutes:ot.minutes,exemptMinutes:!d.consecutiveSix||d.schedule?.rest_label==='rest'||d.holiday?eligible:0,kind,monthly:salaryAt(d.date)?.payment_type==='monthly'});
  }
  if(d.overtime?.settlement==='comp'&&(d.holiday||d.schedule?.rest_label==='regular'))issues.push(d.date+' 國定假日／例假出勤不可逕以一般加班補休沖抵，須確認日型及合法調移');
  if(ot?.settlement==='pay'&&ot.minutes){
   if(kind==='regular')issues.push(d.date+' 例假出勤須另確認法定緊急事由及補假');
   const r=rateAt(d.date);
   const fee=overtimePay(r,ot.minutes,kind,current.payment_type==='monthly');otTotal+=fee;
   if(kind==='holiday'||kind==='regular')taxExemptOvertime+=overtimePay(r,eligible,kind,current.payment_type==='monthly');
   else {
    // Company consecutive-six premiums are not automatically statutory tax-exempt overtime.
    if(!d.consecutiveSix||d.schedule?.rest_label==='rest')taxExemptOvertime+=overtimePay(r,eligible,kind,current.payment_type==='monthly');
   }
   lines.push({date:d.date,kind:'earning',label:'加班明細',amount:0,minutes:ot.minutes,detail:`${kind}；本筆未舍入 ${fee.toFixed(6)} 元，合計於加班費列`});
  }else if(d.workedMinutes>0&&(d.holiday||d.schedule?.rest_label==='rest'||d.schedule?.rest_label==='regular')&&(!d.overtime||d.overtime.minutes<d.workedMinutes))issues.push(d.date+' 假日出勤須完整確認加班時數及結算方式');
  else if(d.overtime==null&&d.workedMinutes>d.normalMinutes&&d.normalMinutes>0)issues.push(d.date+' 可能加班，請先在出勤確認加班費／補休');
 }
 if(current.payment_type==='monthly'){
  add('deduction','遲到未給工資',lateLoss,'單次6分鐘起按全部分鐘，1～5分鐘不扣');
  add('deduction','早退未給工資',earlyLoss,'無寬限，按實際分鐘');
  add('deduction','曠班未給工資',absentLoss,'扣除已核准假單，避免重扣');
 }
 if(otTotal)add('earning','加班費',otTotal,'依當日薪資與平日／休息日／假日日型分段，月底合計後進位至元');
 if(current.payment_type==='monthly'){
  const table=need('labor',input.month+'-01')?.data as LaborTable|undefined;
  if(table?.minimum){
   const wage=lines.filter(l=>l.kind==='earning'&&!['加班費','加班明細'].includes(l.label)).reduce((n,l)=>n+l.amount,0);
   const permitted=(wageLoss+calendar.permittedLoss+lateLoss+earlyLoss+absentLoss)/Math.max(monthlyWage,1);
   const floor=Math.max(0,minimum*weeklyRatio*(factor-permitted));
   const after=wage-down(wageLoss)-down(calendar.permittedLoss)-down(lateLoss)-down(earlyLoss)-down(absentLoss);
   if(after<up(floor))add('earning','最低工資補足',up(floor)-after,'不因薪資結構／全勤扣發而低於法定最低工資扣除合法未給工資後之餘額');
  }
 }
 const self=payrollInsurance(input.month,context.profiles??[{effectiveDate:firstEligible,settings:profile}],rules,add,s=>issues.push(s),need,insuranceDays);
 const earned=()=>lines.filter(l=>l.kind==='earning').reduce((n,l)=>n+l.amount,0),deducted=()=>lines.filter(l=>l.kind==='deduction').reduce((n,l)=>n+l.amount,0);
 for(const c of cashouts)add('earning',c.label,c.amount,c.detail,c.date,c.minutes);
 const exemptOvertime=Math.min(up(otTotal),up(taxExemptOvertime))+cashouts.reduce((n,c)=>n+Math.min(up(c.amount),up(c.taxExempt)),0);
 for(const c of context.corrections??[])if(c.kind==='salary_topup')add('earning','前期工資補發',c.amount,`原已發薪#${c.sourceRunId}；${c.reason}；${c.reference}`);
 const bonus=input.bonusAmount??0;if(bonus)add('earning','非每月給付獎金',bonus,'本次實際發放獎金，與固定月額津貼分開');
 const taxable=Math.max(0,earned()-bonus-deducted()+lines.filter(l=>l.kind==='deduction'&&['勞保','就保','健保'].includes(l.label)).reduce((n,l)=>n+l.amount,0)-exemptOvertime-Math.floor(calendar.exemptCompensation+1e-8));
 const taxRule=need('tax',input.payDate);
 const payment=paymentTaxes(input.payDate,taxable,bonus,profile,taxRule?.data as TaxTable|undefined,{...context,paymentMinimum:[...minimumWages].filter(w=>w.effective_date<=input.payDate).at(-1)?.monthly_amount},s=>issues.push(s));
 if(taxRule){add('deduction','所得稅扣繳',payment.taxRegular,'依給付月累計薪資、本人方式／本職或兼職身分，扣除同月已扣額');if(payment.taxBonus)add('deduction','非每月獎金扣繳',payment.taxBonus,'獎金依當次給付額及官方起扣點判定');}
 if(payment.nhiPremium)add('deduction','健保補充保費',payment.nhiPremium,'依給付時身分、獎金年累計／兼職單次門檻及官方生效費率');
 for(const c of context.corrections??[])if(c.kind!=='salary_topup'){const refund=c.kind==='tax_refund'||c.kind==='insurance_refund';const label:Record<string,string>={salary_recovery:'經同意追回前期溢領',insurance_charge:'前期保費補扣',insurance_refund:'前期保費退還',tax_charge:'前期扣繳稅補扣',tax_refund:'前期扣繳稅退還'};add(refund?'earning':'deduction',label[c.kind]??'前期更正',c.amount,`原已發薪#${c.sourceRunId}；${c.reason}；${c.reference}`);}
 const gross=earned(),deductions=deducted(),net=gross-deductions;
 if(net<0)issues.push('扣項超過應發工資，須先核對，不自動產生負實領');
 return {employeeId:input.employeeId,month:input.month,payDate:input.payDate,gross,deductions,net,employer:lines.filter(l=>l.kind==='employer').reduce((n,l)=>n+l.amount,0),nhiPolicyVersion:context.policy?{id:context.policy.id,effectiveDate:context.policy.effectiveDate,source:context.policy.source}:undefined,corrections:(context.corrections??[]).map(c=>c.id),nhiPremium:payment.nhiPremium,regularTaxable:payment.regularTaxable,bonusGross:payment.bonusGross,taxRegular:payment.taxRegular,taxBonus:payment.taxBonus,nhiIncome:payment.nhiIncome,nhiUnitKey:(context.paymentProfile??profile).nhiUnitKey,attendanceAmount:up(attendance),lines,issues:[...new Set(issues)],ruleVersions:[...refs.values()].map(r=>({id:r.id,kind:r.kind,source:r.source_url})),wageRates:paidDays.map(d=>({date:d.date,hourly:rateAt(d.date)})),cashouts:cashouts.map(c=>({key:c.key,minutes:c.minutes,amount:up(c.amount)})),overtimeTaxBands};
}
