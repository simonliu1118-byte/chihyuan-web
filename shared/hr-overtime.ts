/** HR 2b overtime suggestions and expiry-ordered compensatory leave ledger. */
export interface OvertimeDay {date:string;workedMinutes:number;overtimeMinutes:number;normalMinutes:number}
export interface OvertimeShift {endTime:string;normalMinutes:number}
export interface SuggestionDay {workDate:string;out1?:string|null;out2?:string|null;workedMinutes:number;employmentType:"full"|"half"|"casual";marker?:string|null;hasPunch?:boolean}
export interface CompCredit {id:number;kind:"overtime"|"holiday"|"grant";minutes:number;expiresOn:string;issuedOn:string}
export interface CompUse {kind:"overtime"|"holiday";minutes:number;workDate:string}
export interface CompSettlement {creditId:number;minutes:number}
export interface CompBalanceRow extends CompCredit {remainingMinutes:number;expired:boolean;expiringSoon:boolean}
export interface CompBalances {overtimeMinutes:number;holidayMinutes:number;grantMinutes:number;holidayAdvanceMinutes:number;credits:CompBalanceRow[]}
function time(x:string){if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(x))throw Error("INVALID_TIME");return Number(x.slice(0,2))*60+Number(x.slice(3))}
function day(x:string){if(!/^\d{4}-\d{2}-\d{2}$/.test(x))throw Error("INVALID_DATE");const t=Date.parse(x+"T00:00:00Z");if(!Number.isFinite(t))throw Error("INVALID_DATE");return t}
export function nextMonthEnd(value:string):string{
 const y=Number(value.slice(0,4)),m=Number(value.slice(5,7));
 return new Date(Date.UTC(y,m+1,0)).toISOString().slice(0,10);
}
export function extendMonth(value:string):string{
 const y=Number(value.slice(0,4)),m=Number(value.slice(5,7));
 return new Date(Date.UTC(y,m+1,0)).toISOString().slice(0,10);
}
export function overtimeSuggestion(
 d:SuggestionDay,shift:OvertimeShift|null,holidays:readonly string[],rosterLabel:string|null,
):{minutes:number;reason:string} {
 if(d.marker==="home"||d.marker==="booth"||d.hasPunch===false)return {minutes:0,reason:"特殊工作日不自動建議"};
 if(rosterLabel==="regular_off"||rosterLabel==="rest_day"||rosterLabel==="off"||holidays.includes(d.workDate))
  return {minutes:Math.floor(d.workedMinutes/30)*30,reason:"例休日／國定假日出勤"};
 if(d.employmentType!=="full")return {minutes:Math.max(0,Math.floor((d.workedMinutes-480)/30)*30),reason:"實際超過八小時"};
 if(!shift)return {minutes:0,reason:"未設定班別"};
 const last=d.out2||d.out1;
 return {minutes:last?Math.max(0,Math.floor((time(last)-time(shift.endTime))/30)*30):0,reason:"超過預定下班時間"};
}
export function overtimeWarnings(days:readonly OvertimeDay[]):string[]{
 const result:string[]=[];
 const month=new Map<string,number>();
 for(const d of days){
  const key=d.date.slice(0,7);month.set(key,(month.get(key)??0)+d.overtimeMinutes);
  if(d.normalMinutes+d.overtimeMinutes>720)result.push(d.date+" 正常加延長工時超過 12 小時");
 }
 for(const [key,minutes] of month)if(minutes>46*60)result.push(key+" 延長工時超過 46 小時");
 return result;
}
export function compBalances(credits:readonly CompCredit[],uses:readonly CompUse[],settlements:readonly CompSettlement[],asOf:string):CompBalances{
 let holidayAdvance=0,overtimeDeficit=0;
 const rows=credits.map(c=>({...c,remainingMinutes:c.minutes,expired:c.expiresOn<asOf,expiringSoon:c.expiresOn>=asOf&&c.expiresOn<=new Date(day(asOf)+7*86400000).toISOString().slice(0,10)}));
 const settled=new Map<number,number>();for(const s of settlements)settled.set(s.creditId,(settled.get(s.creditId)??0)+s.minutes);
 for(const row of rows)row.remainingMinutes=Math.max(0,row.remainingMinutes-(settled.get(row.id)??0));
 for(const u of [...uses].sort((a,b)=>a.workDate.localeCompare(b.workDate))){
  let need=u.minutes;
  const group=rows.filter(x=>u.kind==="holiday"?x.kind==="holiday":x.kind==="overtime"||x.kind==="grant")
   .filter(x=>x.issuedOn<=u.workDate && x.expiresOn>=u.workDate)
   .sort((a,b)=>a.expiresOn.localeCompare(b.expiresOn)||a.id-b.id);
  for(const c of group){const taken=Math.min(need,c.remainingMinutes);c.remainingMinutes-=taken;need-=taken;if(!need)break}
  if(need) {
   if(u.kind==="holiday")holidayAdvance+=need;
   else overtimeDeficit+=need;
  }
 }
 // Newly granted holiday credit repays any previously advanced swap leave before it creates a positive balance.
 for(const row of rows.filter(x=>x.kind==="holiday"&&x.remainingMinutes>0).sort((a,b)=>a.expiresOn.localeCompare(b.expiresOn))){
   const settled=Math.min(holidayAdvance,row.remainingMinutes);row.remainingMinutes-=settled;holidayAdvance-=settled;
 }
 const totals={overtimeMinutes:0,holidayMinutes:0,grantMinutes:0};
 for(const x of rows)if(!x.expired)totals[x.kind==="overtime"?"overtimeMinutes":x.kind==="holiday"?"holidayMinutes":"grantMinutes"]+=x.remainingMinutes;
 return {...totals,overtimeMinutes:totals.overtimeMinutes+totals.grantMinutes-overtimeDeficit,
  holidayMinutes:totals.holidayMinutes-holidayAdvance,holidayAdvanceMinutes:holidayAdvance,credits:rows};
}
