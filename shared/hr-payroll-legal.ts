import type {PayrollLeave,PayrollSalary,PayrollProfile,PayrollDay} from './hr-payroll';
export interface PayrollLegalCase {id:number;kind:'maternity'|'occupational';eventDate:string;from:string;to:string;monthlyBasis:number;averageDaily:number;offsets:Record<string,number>;reference:string;active:boolean}
export interface LegalAdjustment {kind:'earning'|'deduction';label:string;amount:number;detail:string;exempt:number}
const next=(d:string,n=1)=>new Date(Date.parse(d+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function legalCalendarPay(month:string,hireDate:string,profile:PayrollProfile,salaries:readonly PayrollSalary[],
 leaves:readonly PayrollLeave[],cases:readonly PayrollLegalCase[],baseByDate:ReadonlyMap<string,number>,attendanceByDate:number,
 issue:(s:string)=>void,days:readonly PayrollDay[]=[]){
 const adjustments:LegalAdjustment[]=[],active=leaves.filter(l=>!l.cancelled_at),latest=new Map<string,PayrollLegalCase>();
 for(const c of cases)latest.set(c.kind+'|'+c.eventDate,c);
 const groups=new Map<string,PayrollLeave[]>();
 for(const l of active.filter(l=>l.code==='產'||l.code==='傷')){
  const c=l.code==='產'?latest.get('maternity|'+l.event_date):[...latest.values()].find(c=>c.kind==='occupational'&&c.active&&l.work_date>=c.from&&l.work_date<=c.to);
  const key=c?'case:'+c.id:l.code+'|'+(l.event_date??l.work_date);const group=groups.get(key)??[];group.push(l);groups.set(key,group);
 }
 let permittedLoss=0,exemptCompensation=0;
 for(const records of groups.values()){
  let current=records.filter(l=>l.work_date.startsWith(month));if(!current.length)continue;
  const first=records[0],kind=first.code==='產'?'maternity':'occupational';
  const matches=[...latest.values()].filter(c=>c.kind===kind&&c.active&&(kind==='maternity'?c.eventDate===first.event_date:current.some(l=>l.work_date>=c.from&&l.work_date<=c.to)));
  if(matches.length!==1){issue(current[0].work_date+' '+(kind==='maternity'?'產假':'公傷病')+'請先核對法定計薪基準與證明（不得重疊案件）');continue;}
  const c=matches[0],quota=first.event_quota_days;
  if(records.some(l=>l.work_date<c.from||l.work_date>c.to||kind==='maternity'&&l.whole_day!==1)||kind==='maternity'&&new Set(records.map(l=>l.work_date)).size!==records.length){issue('法定連續假期間須與整日正式假單一致：'+c.from);continue;}
  if(kind==='maternity'){
   if(![56,28,7,5].includes(quota??0)||Math.round((Date.parse(c.to)-Date.parse(c.from))/86400000)+1!==quota||records.some(l=>l.event_quota_days!==quota)){
    issue('產假期間必須為連續56／28／7／5個曆日，與假單類型一致');continue;}
   const dates=new Set(records.map(l=>l.work_date));let complete=true;
   for(let d=c.from;d<=c.to;d=next(d))if(!dates.has(d))complete=false;
   if(!complete){issue('產假須包含例休與假日的完整連續曆日，請先補齊正式假單');continue;}
  }
  if(current.some(l=>[...latest.values()].some(other=>other.id!==c.id&&other.active&&other.kind===kind&&l.work_date>=other.from&&l.work_date<=other.to))){issue('法定案件期間重疊，請先更正');continue;}
  if(kind==='occupational'){
   const byDate=new Map<string,PayrollLeave>();for(const l of records){const existing=byDate.get(l.work_date);byDate.set(l.work_date,existing?{...l,minutes:existing.minutes+l.minutes,whole_day:Math.max(existing.whole_day,l.whole_day)}:l);}const last=new Date(Date.UTC(+month.slice(0,4),+month.slice(5),0)).toISOString().slice(0,10);current=[];
   for(let d=c.from>month+'-01'?c.from:month+'-01';d<=c.to&&d<=last;d=next(d))current.push(byDate.get(d)??{...first,work_date:d,whole_day:1,minutes:480});
   if(!(month in c.offsets)){issue(month+' 公傷病須核對本月同事故給付抵充，尚未給付請明確記0');continue;}
  }
  const six=new Date(hireDate+'T00:00:00Z');const day=six.getUTCDate();six.setUTCDate(1);six.setUTCMonth(six.getUTCMonth()+6);const monthLast=new Date(Date.UTC(six.getUTCFullYear(),six.getUTCMonth()+1,0)).getUTCDate();if(day>monthLast){six.setUTCMonth(six.getUTCMonth()+1);six.setUTCDate(1);}else six.setUTCDate(day);
  const ratio=kind==='occupational'?1:(quota===5||quota===7?0:c.from>=six.toISOString().slice(0,10)?1:0.5);
  const daily=kind==='occupational'?c.monthlyBasis/30:Math.max(c.monthlyBasis/30,c.averageDaily);
  if(ratio&&daily<=0){issue('法定給薪基準未完整核對：'+c.eventDate);continue;}
  let target=0,baseline=0,protectedAttendance=0;
  for(const l of current){
   const salary=[...salaries].filter(s=>s.effective_date<=l.work_date).at(-1);
   if(salary?.payment_type!=='monthly'&&kind==='occupational'){
    const schedule=days.find(d=>d.date===l.work_date)?.schedule;if(!schedule){issue(l.work_date+' 時薪公傷病須補齊實際例假排班，不能猜測星期日');continue;}if(schedule.rest_label==='regular')continue;
   }
   const fraction=kind==='maternity'||l.whole_day===1?1:l.minutes/480;
   const normal=(baseByDate.get(l.work_date)??0)*fraction,protectedPart=attendanceByDate*fraction;
   baseline+=normal;protectedAttendance+=protectedPart;
   // Keep the statutory attendance protection separately from a half-paid/unpaid maternity period.
   target+=Math.max(daily*ratio*fraction,normal*ratio+protectedPart);
  }
  const offset=c.offsets[month]??0;if(offset>target||kind==='maternity'&&offset){issue('抵充不得超過同事故當月補償，產假不得任意抵充：'+c.eventDate);continue;}
  const ordinary=baseline+protectedAttendance,desired=target-offset,delta=desired-ordinary;
  if(delta>=0)adjustments.push({kind:'earning',label:kind==='maternity'?'產假法定工資補足':'公傷病原領工資補償補足',amount:delta,detail:`${c.from}～${c.to}；本月${current.length}曆日；日基準${daily.toFixed(4)}×${ratio}，同事故抵充${offset}；${c.reference}`,exempt:0});
  else{permittedLoss-=delta;adjustments.push({kind:'deduction',label:kind==='maternity'?'產假法定給薪調整':'同事故公傷病給付抵充',amount:-delta,detail:`本月${current.length}曆日，原列本薪／津貼${ordinary.toFixed(4)}，應付${target.toFixed(4)}，已核對抵充${offset}；${c.reference}`,exempt:0});}
  if(kind==='occupational'){exemptCompensation+=desired;adjustments.push({kind:'earning',label:'公傷病補償明細（已含本薪列）',amount:0,detail:`同事故本月補償${desired.toFixed(4)}，原領工資${c.monthlyBasis}／30，並非另加一筆；${c.reference}`,exempt:desired});}
 }
 return {adjustments,permittedLoss,exemptCompensation};
}
