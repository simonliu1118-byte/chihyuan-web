import type {PayrollProfile,PayrollRule,PayrollLine,LaborTable,PensionTable,HealthTable,RuleKind} from './hr-payroll';
export interface EffectivePayrollProfile {effectiveDate:string;settings:PayrollProfile}
/** One monthly premium statement, split at actual effective dates; round only each final charge. */
export function payrollInsurance(month:string,history:readonly EffectivePayrollProfile[],rules:readonly PayrollRule[],
 add:(kind:PayrollLine['kind'],label:string,amount:number,detail:string)=>void,issue:(s:string)=>void,
 need:(kind:RuleKind,at:string)=>PayrollRule|null,daysBetween:(a:string,b:string|null,m:string)=>number){
 const start=month+'-01',last=new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).toISOString().slice(0,10);
 const ordered=[...history].sort((a,b)=>a.effectiveDate.localeCompare(b.effectiveDate));
 const at=(d:string)=>ordered.filter(p=>p.effectiveDate<=d).at(-1)?.settings;
 const cuts=[...new Set([start,...ordered.map(p=>p.effectiveDate),...rules.filter(r=>r.kind!=='tax').map(r=>r.effective_date)])].filter(d=>d>=start&&d<=last).sort();
 const totals=new Map<string,{kind:PayrollLine['kind'];amount:number;detail:string[]}>();
 const push=(kind:PayrollLine['kind'],label:string,value:number,detail:string)=>{const row=totals.get(label)??{kind,amount:0,detail:[]};row.amount+=value;row.detail.push(detail);totals.set(label,row);};
 let laborUsed=0,pensionUsed=0,occupationalUsed=0;
 // The final civil day of a 31-day month shares the 30-day insurance billing boundary.
 for(let i=cuts.length-1;i>=0;i--){const from=cuts[i],to=cuts[i+1]?new Date(Date.parse(cuts[i+1]+'T00:00:00Z')-86400000).toISOString().slice(0,10):last,p=at(from);if(!p)continue;
  const days=(a:string|null|undefined,b:string|null|undefined,used:number)=>a?Math.min(Math.max(0,30-used),daysBetween(a>from?a:from,b&&b<to?b:to,month)):0;
  const laborDays=days(p.insuredFrom,p.insuredTo,laborUsed),pensionDays=days(p.pensionFrom??p.insuredFrom,p.pensionTo??p.insuredTo,pensionUsed),occupationalDays=days(p.insuredFrom,p.insuredTo,occupationalUsed);
  if(p.laborEnabled&&laborDays){laborUsed+=laborDays;const rule=need('labor',from),table=rule?.data as LaborTable|undefined,row=table?.rows.find(r=>r.basis===p.laborBasis);
   if(!row)issue(from+' 勞保投保金額不在適用官方表內');else{
    // Fixed-point rates avoid binary floating-point dropping the fourth decimal of a daily premium.
    const premium=(rate:number,share:number)=>laborDays===30?Math.round(p.laborBasis*rate*share/10000):Math.trunc(p.laborBasis*Math.round(rate*10000)*share/300000+1e-7)/10000*laborDays;
    const ei=p.employmentInsurance?row.employmentRate:0,detail=`${from}～${to}；${laborDays}天，投保${p.laborBasis}`;
    if(p.employmentInsurance&&laborDays===30&&(premium(row.laborRate,20)+premium(ei,20)!==row.worker||premium(row.laborRate,70)+premium(ei,70)!==row.employer))issue(from+' 勞保／就保分項金額與官方表不一致');
    push('deduction','勞保',premium(row.laborRate,20),detail);push('deduction','就保',premium(ei,20),detail);push('employer','雇主勞保',premium(row.laborRate,70),detail);push('employer','雇主就保',premium(ei,70),detail);
   }
  }
  if(p.pensionEnabled&&pensionDays){pensionUsed+=pensionDays;const rule=need('pension',from);if(rule&&!(rule.data as PensionTable).amounts.includes(p.pensionBasis))issue(from+' 勞退提繳金額不在適用官方表內');
   const detail=`${from}～${to}；${pensionDays}天，提繳${p.pensionBasis}`;
   push('deduction','勞退個人自提',p.pensionBasis*p.pensionSelfRate/100*pensionDays/30,detail);push('employer','雇主勞退',p.pensionBasis*p.pensionEmployerRate/100*pensionDays/30,detail);
  }
  if(p.occupationalRate&&occupationalDays){occupationalUsed+=occupationalDays;push('employer','職災保險',p.occupationalBasis*p.occupationalRate/100*occupationalDays/30,`${from}～${to}；${occupationalDays}天，單位費率${p.occupationalRate}%`);}
 }
 const p=at(last),healthFrom=p?.healthFrom??p?.insuredFrom,healthTo=p?.healthTo??p?.insuredTo;
 if(p?.healthEnabled&&p.healthAtMonthEnd&&healthFrom&&healthFrom<=last&&(!healthTo||healthTo>=last)){
  const rule=need('health',last),row=(rule?.data as HealthTable|undefined)?.rows.find(r=>r.basis===p.healthBasis);
  if(!row)issue('健保投保金額不在月底適用官方表內');else{push('deduction','健保',row.worker[Math.min(p.dependents,3)],'按月底投保事實／官方全月金額；眷口最多3口');push('employer','雇主健保',row.employer,'官方全月公司負擔，不扣員工');}
 }
 // Company rule (user 2026-11-16): an employee's deductions are truncated to whole 元, never rounded up; the employer share keeps the official rounding.
 for(const [label,row]of totals)add(row.kind,label,row.kind==='deduction'?Math.floor(row.amount+1e-8):Math.floor(row.amount+0.5+1e-8),row.detail.reverse().join('；'));
 return Math.floor((totals.get('勞退個人自提')?.amount??0)+1e-8);
}
