export interface SeniorityExclusion { startDate: string; endDate: string }
export interface AnnualLeavePeriod { periodStart: string; periodEnd: string; days: number; serviceYearsLabel: string }
function parse(s: string): Date { const d = new Date(s + "T00:00:00Z"); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw Error("INVALID_DATE"); return d }
function iso(d: Date): string { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }
function anniversary(start: Date, months: number): Date {
  const year = start.getUTCFullYear() + Math.floor((start.getUTCMonth() + months) / 12);
  const month = (start.getUTCMonth() + months) % 12;
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  // Civil Code Article 121: a missing anniversary date ends at month-end;
  // entitlement starts on the following day, not the truncated date.
  return start.getUTCDate() > lastDay
    ? new Date(Date.UTC(year, month + 1, 1))
    : new Date(Date.UTC(year, month, start.getUTCDate()));
}
function excludedDays(start: Date, end: Date, exclusions: readonly SeniorityExclusion[]): number {
  const intervals = exclusions.map(x => [Math.max(start.getTime(), parse(x.startDate).getTime()), Math.min(end.getTime(), parse(x.endDate).getTime())] as const).filter(([a,b]) => a <= b).sort((a,b)=>a[0]-b[0]);
  let total=0, lastEnd=Number.NEGATIVE_INFINITY;
  for (const [a,b] of intervals) { const first=Math.max(a,lastEnd+86400000); if (first<=b) total += Math.round((b-first)/86400000)+1; lastEnd=Math.max(lastEnd,b) }
  return total;
}
function adjusted(start: Date, nominal: Date, exclusions: readonly SeniorityExclusion[]): Date {
  let target=nominal;
  for (let i=0;i<100;i++) {
    const next=addDays(nominal, excludedDays(start, addDays(target,-1), exclusions));
    if (next.getTime()===target.getTime()) return target;
    target=next;
  }
  throw Error("INVALID_EXCLUSION_RANGE");
}
function entitlement(years: number): number { if(years===1)return 7; if(years===2)return 10; if(years===3||years===4)return 14; if(years>=5&&years<=9)return 15; return Math.min(30,years+6) }
export function annualLeaveSchedule(seniorityStart: string, exclusions: readonly SeniorityExclusion[], asOf: string): AnnualLeavePeriod[] {
  const start=parse(seniorityStart), until=parse(asOf);
  for(const x of exclusions) if(parse(x.startDate)>parse(x.endDate))throw Error("INVALID_EXCLUSION_RANGE");
  if(until<start)return [];
  const result:AnnualLeavePeriod[]=[];
  for(let years=0;years<=60;years++){
    const months=years===0?6:years*12;
    const current=adjusted(start,anniversary(start,months),exclusions);
    if(current>until)break;
    const next=adjusted(start,anniversary(start,years===0?12:(years+1)*12),exclusions);
    result.push({periodStart:iso(current),periodEnd:iso(addDays(next,-1)),days:years===0?3:entitlement(years),serviceYearsLabel:years===0?"滿 6 個月":`滿 ${years} 年`});
  }
  return result;
}

export interface AnnualLeaveUse {workDate:string;minutes:number;cancelledAt?:string|null}
export interface AnnualLeaveLedgerRow {
 periodStart:string;periodEnd:string;entitledDays:number;carriedInDays:number;
 usedCarriedDays:number;usedCurrentDays:number;remainingDays:number;carriedOutDays:number;expiredUnpaidDays:number;
 entitledMinutes:number;remainingMinutes:number;expiredUnpaidMinutes:number;
}
/** A period may carry its own entitlement in minutes (part-time proration); otherwise days × 480. */
export type LedgerPeriod=AnnualLeavePeriod&{entitledMinutes?:number|null};
export function annualLeaveLedger(periods:readonly LedgerPeriod[],records:readonly AnnualLeaveUse[],asOf:string):AnnualLeaveLedgerRow[] {
 const ordered=[...periods].sort((a,b)=>a.periodStart.localeCompare(b.periodStart));
 const paid=records.filter(x=>!x.cancelledAt);
 const result:AnnualLeaveLedgerRow[]=[];let carry=0;
 for(const p of ordered){
  const closed=p.periodEnd<asOf,entitled=p.entitledMinutes??p.days*480;
  const used=paid.filter(x=>x.workDate>=p.periodStart&&x.workDate<=p.periodEnd&&x.workDate<=asOf).reduce((n,x)=>n+x.minutes,0);
  const usedCarried=Math.min(carry,used),usedCurrent=used-usedCarried;
  const currentRemaining=Math.max(0,entitled-usedCurrent),remaining=Math.max(0,carry+entitled-used);
  const expired=closed?carry-usedCarried:0,carryNext=closed?currentRemaining:0;
  result.push({periodStart:p.periodStart,periodEnd:p.periodEnd,entitledDays:entitled/480,carriedInDays:carry/480,
   usedCarriedDays:usedCarried/480,usedCurrentDays:usedCurrent/480,remainingDays:remaining/480,
   carriedOutDays:carryNext/480,expiredUnpaidDays:expired/480,
   entitledMinutes:entitled,remainingMinutes:remaining,expiredUnpaidMinutes:expired});
  carry=carryNext;
 }
 return result;
}

/**
 * Part-time annual leave (勞動部「僱用部分時間工作勞工應行注意事項」): the full-time days × 8 hours,
 * scaled by hours worked in the base period over a full-time 40-hour week for the same span; rounded up to 30 minutes.
 * The base period is the year before the period starts (the first six months for the first period).
 */
export function partTimeBase(periodStart:string,seniorityStart:string):{from:string;to:string}{
 const start=new Date(periodStart+"T00:00:00Z");start.setUTCFullYear(start.getUTCFullYear()-1);
 const from=start.toISOString().slice(0,10)<seniorityStart?seniorityStart:start.toISOString().slice(0,10);
 return {from,to:new Date(Date.parse(periodStart+"T00:00:00Z")-86400000).toISOString().slice(0,10)};
}
export function partTimeEntitlementMinutes(days:number,workedMinutes:number,from:string,to:string):{minutes:number;fullMinutes:number;ratio:number}{
 const span=Math.round((Date.parse(to+"T00:00:00Z")-Date.parse(from+"T00:00:00Z"))/86400000)+1;
 const fullMinutes=Math.round(span*2400/7),ratio=fullMinutes>0?Math.min(1,workedMinutes/fullMinutes):0;
 return {minutes:Math.ceil(days*480*ratio/30)*30,fullMinutes,ratio};
}
