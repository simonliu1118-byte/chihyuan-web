export interface SeniorityExclusion { startDate: string; endDate: string }
export interface AnnualLeavePeriod { periodStart: string; periodEnd: string; days: number; serviceYearsLabel: string }
function parse(s: string): Date { const d = new Date(s + "T00:00:00Z"); if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) throw Error("INVALID_DATE"); return d }
function iso(d: Date): string { return d.toISOString().slice(0, 10) }
function addDays(d: Date, n: number): Date { const x = new Date(d); x.setUTCDate(x.getUTCDate() + n); return x }
function anniversary(start: Date, months: number): Date {
  const year = start.getUTCFullYear() + Math.floor((start.getUTCMonth() + months) / 12);
  const month = (start.getUTCMonth() + months) % 12;
  const day = Math.min(start.getUTCDate(), new Date(Date.UTC(year, month + 1, 0)).getUTCDate());
  return new Date(Date.UTC(year, month, day));
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
