import type {PayrollProfile,TaxTable} from './hr-payroll';
export interface NhiSupplementPolicy {id:number;effectiveDate:string;rate:number;cap:number;multiple:number;source:string}
export interface PayrollPaidIncome {date:string;regular:number;bonus:number;taxRegular:number;taxBonus:number;nhiIncome:number;nhiPremium?:number}
export interface PaymentTaxContext {policy?:NhiSupplementPolicy|null;paymentProfile?:PayrollProfile;paidIncome?:readonly PayrollPaidIncome[];requirePaymentFacts?:boolean;paymentMinimum?:number}
export function paymentTaxes(at:string,regular:number,bonus:number,baseProfile:PayrollProfile,table:TaxTable|undefined,ctx:PaymentTaxContext,issue:(s:string)=>void){
 const p=ctx.paymentProfile??baseProfile,paid=ctx.paidIncome??[],prior=paid.filter(r=>r.date.slice(0,7)===at.slice(0,7)),sameDay=prior.filter(r=>r.date===at),category=p.nhiSupplementCategory??(p.healthEnabled?'own':null),salaryKind=p.taxSalaryKind??'primary';
 if(ctx.requirePaymentFacts&&!p.nhiUnitKey?.trim())issue('請先核對本公司投保單位代碼，以便公司補充保費彙總');
 if(ctx.requirePaymentFacts&&!p.taxSalaryKind)issue('請先核對給付日的本職／兼職所得性質');
 if(ctx.requirePaymentFacts&&!category)issue('請先核對給付日的補充保費身分及免扣證明');
 if(category==='exempt'&&!p.nhiExemptionReference?.trim())issue('補充保費免扣須有可追溯的身分／證明資料');
 let taxRegular=0,taxBonus=0,nhiPremium=0;
 const threshold=table?.nonMonthlyThreshold??table?.rows.find(r=>r.amounts[0]>0)?.from??Infinity;
 if(table){
  if(p.taxResidence==='nonresident'){
   const priorTotal=prior.reduce((n,r)=>n+r.regular+r.bonus,0),total=priorTotal+regular+bonus,totalTax=Math.floor(total*(total<=table.nonresidentThreshold?0.06:0.18)+1e-8);
   taxRegular=Math.max(0,totalTax-prior.reduce((n,r)=>n+r.taxRegular+r.taxBonus,0));
  }else if(salaryKind==='secondary'){
   const total=regular+bonus+sameDay.reduce((n,r)=>n+r.regular+r.bonus,0);taxRegular=Math.max(0,(total>=threshold?Math.floor(total*0.05+1e-8):0)-sameDay.reduce((n,r)=>n+r.taxRegular+r.taxBonus,0));
  }else{
   const total=regular+prior.reduce((n,r)=>n+r.regular,0);let due=0;
   // 員工本人選扣繳稅額表或全月5%（扣繳率標準§2Ⅰ①）；兩者每月應扣不超過2,000元皆免扣（薪資所得扣繳辦法§7Ⅰ）。
   if(p.taxMethod==='percent')due=Math.floor(total*0.05+1e-8);
   else{const row=table.rows.find(r=>total>=r.from&&total<=r.to);if(row&&p.taxDependents<row.amounts.length)due=row.amounts[p.taxDependents];else if(total>=table.rows[0].from)issue('薪資／扶養人數超過官方扣繳表，請核對法定公式');}
   if(due<=2000)due=0;
   taxRegular=Math.max(0,due-prior.reduce((n,r)=>n+r.taxRegular,0));const sameBonus=bonus+sameDay.reduce((n,r)=>n+r.bonus,0);taxBonus=Math.max(0,(sameBonus>=threshold?Math.floor(sameBonus*0.05+1e-8):0)-sameDay.reduce((n,r)=>n+r.taxBonus,0));
  }
 }
 const income=regular+bonus;
 if((category==='own'&&bonus>0||category==='other'&&income>0)&&!ctx.policy)issue('缺少給付日有效的官方補充保費規則');
 if(category==='own'&&bonus>0){
  const year=+at.slice(0,4),through=p.bonusOpeningThrough;
  if(p.bonusOpeningYear!==year||!through||(through.slice(0,4)!==String(year)&&through!==String(year-1)+'-12-31')||through>=at||p.bonusOpeningAmount==null||!p.bonusOpeningReference?.trim())issue('本年獎金需先核對系統外期初累計／截止日及來源，不預設過去獎金為0');
  else{
   const earlier=(p.bonusOpeningAmount??0)+paid.filter(r=>r.date<at&&r.date.slice(0,4)===String(year)).reduce((n,r)=>n+r.bonus,0);
   if(bonus>0&&!p.healthBasis)issue('獎金補充保費缺少給付時（離職者為離職月）投保金額');
   const todayBonus=bonus+sameDay.reduce((n,r)=>n+r.bonus,0);
   const basis=Math.min(todayBonus,Math.max(0,earlier+todayBonus-p.healthBasis*(ctx.policy?.multiple??4)),ctx.policy?.cap??10000000);
   if(basis>0){if(!ctx.policy||ctx.policy.effectiveDate>at)issue('缺少給付日有效的官方補充保費規則');else nhiPremium=Math.max(0,Math.floor(basis*ctx.policy.rate/100+0.5+1e-8)-sameDay.reduce((n,r)=>n+(r.nhiPremium??0),0));}
  }
 }else if(category==='other'&&income>0){
  if(!ctx.paymentMinimum)issue('缺少給付日有效的最低工資，不能判定兼職補充保費門檻');
  else if(income+sameDay.reduce((n,r)=>n+r.regular+r.bonus,0)>=ctx.paymentMinimum){if(!ctx.policy||ctx.policy.effectiveDate>at)issue('缺少給付日有效的官方補充保費規則');else nhiPremium=Math.max(0,Math.floor(Math.min(income+sameDay.reduce((n,r)=>n+r.regular+r.bonus,0),ctx.policy.cap)*ctx.policy.rate/100+0.5+1e-8)-sameDay.reduce((n,r)=>n+(r.nhiPremium??0),0));}
 }
 return {taxRegular,taxBonus,nhiPremium,nhiIncome:income,bonusGross:bonus,regularTaxable:regular};
}
