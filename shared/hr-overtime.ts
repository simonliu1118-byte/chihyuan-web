/** HR 2b overtime suggestions and expiry-ordered compensatory leave ledger. */
export interface OvertimeDay {date:string;workedMinutes:number;overtimeMinutes:number;normalMinutes:number}
export interface OvertimeShift {endTime:string;normalMinutes:number}
export interface SuggestionDay {workDate:string;out1?:string|null;out2?:string|null;workedMinutes:number;employmentType:"full"|"half"|"casual";marker?:string|null;hasPunch?:boolean}
export interface CompCredit {id:number;kind:"overtime"|"holiday"|"grant";minutes:number;expiresOn:string;issuedOn:string;holidayDate?:string|null;holidayName?:string|null}
/** A 補 leave. With advanceHolidayDate it is an advance on that holiday's comp time (BD-060 #29), kept apart from the balance. */
export interface CompUse {minutes:number;workDate:string;advanceHolidayDate?:string|null;advanceHolidayName?:string|null}
export interface CompSettlement {creditId:number;minutes:number}
export interface CompBalanceRow extends CompCredit {remainingMinutes:number;expired:boolean;expiringSoon:boolean}
export interface CompAdvance {holidayDate:string;holidayName:string;advancedMinutes:number;repaidMinutes:number;outstandingMinutes:number}
export interface CompBalances {balanceMinutes:number;deficitMinutes:number;advanceMinutes:number;advances:CompAdvance[];credits:CompBalanceRow[]}
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
/**
 * One kind of comp time (BD-060 #27). Ordinary 補 uses take the earliest-expiring credit valid on the leave date.
 * An advance is owed to one named holiday: only that holiday's comp credit repays it, never the ordinary balance (#29).
 * Every use counts whatever its date, so booking future leave cannot spend the same credit twice; asOf only sets expiry flags.
 */
export function compBalances(credits:readonly CompCredit[],uses:readonly CompUse[],settlements:readonly CompSettlement[],asOf:string):CompBalances{
 const soon=new Date(day(asOf)+7*86400000).toISOString().slice(0,10);
 const rows:CompBalanceRow[]=credits.map(c=>({...c,remainingMinutes:c.minutes,expired:c.expiresOn<asOf,expiringSoon:c.expiresOn>=asOf&&c.expiresOn<=soon}));
 const advances=new Map<string,CompAdvance>();
 for(const u of uses)if(u.advanceHolidayDate){
  const a=advances.get(u.advanceHolidayDate)??{holidayDate:u.advanceHolidayDate,holidayName:u.advanceHolidayName??"",advancedMinutes:0,repaidMinutes:0,outstandingMinutes:0};
  a.advancedMinutes+=u.minutes;advances.set(u.advanceHolidayDate,a);
 }
 for(const row of rows.filter(x=>x.kind==="holiday"&&x.holidayDate&&advances.has(x.holidayDate)).sort((a,b)=>a.id-b.id)){
  const a=advances.get(row.holidayDate!)!,repay=Math.min(row.remainingMinutes,a.advancedMinutes-a.repaidMinutes);
  row.remainingMinutes-=repay;a.repaidMinutes+=repay;
 }
 let deficit=0;
 for(const u of uses.filter(x=>!x.advanceHolidayDate).sort((a,b)=>a.workDate.localeCompare(b.workDate))){
  let need=u.minutes;
  for(const c of rows.filter(x=>x.remainingMinutes>0&&x.issuedOn<=u.workDate&&x.expiresOn>=u.workDate).sort((a,b)=>a.expiresOn.localeCompare(b.expiresOn)||a.id-b.id)){
   const taken=Math.min(need,c.remainingMinutes);c.remainingMinutes-=taken;need-=taken;if(!need)break;
  }
  deficit+=need;
 }
 // Settlement pays out what was left after expiry, so it comes after every use the credit could have covered.
 const settled=new Map<number,number>();for(const x of settlements)settled.set(x.creditId,(settled.get(x.creditId)??0)+x.minutes);
 for(const row of rows)if(row.kind==="overtime")row.remainingMinutes=Math.max(0,row.remainingMinutes-(settled.get(row.id)??0));
 const list=[...advances.values()].map(a=>({...a,outstandingMinutes:a.advancedMinutes-a.repaidMinutes})).sort((a,b)=>a.holidayDate.localeCompare(b.holidayDate));
 const balance=rows.filter(x=>!x.expired&&x.issuedOn<=asOf).reduce((n,x)=>n+x.remainingMinutes,0)-deficit;
 return {balanceMinutes:balance,deficitMinutes:deficit,advanceMinutes:list.reduce((n,a)=>n+a.outstandingMinutes,0),advances:list,credits:rows};
}
