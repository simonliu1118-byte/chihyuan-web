/** BD-060: UTC civil-day arithmetic, independent of month display and worker state. */
export type RosterKind="shift"|"hours"|"off"|"leave"|"unscheduled";
export type RosterLabel="regular_off"|"rest_day"|"off"|"work"|"unscheduled";
export type EmploymentType="full"|"half"|"casual";
export interface RosterDay { date:string;kind:RosterKind;offMark?:"slash"|"x"|null;minutes?:number;leaveCode?:string|null;shiftCode?:string|null }
export interface RosterOptions {anchorMonday:string;employmentType?:EmploymentType;partTime?:boolean;skipChecks?:boolean;scheduleMode?:"shift"|"hours"|"none"}
export interface RosterViolation {code:string;from:string;to:string;dates:string[];message:string}
export interface ConsecutiveSegment {startDate:string;endDate:string;days:number;suggestion:string}
export interface RosterResult {labels:Record<string,RosterLabel>;violations:RosterViolation[];consecutive:ConsecutiveSegment[];sixthDays:string[];overEight:string[]}
const DAY=86400000;
function time(s:string):number {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(s))throw Error("INVALID_DATE");
 const v=Date.parse(s+"T00:00:00Z");
 if(!Number.isFinite(v)||new Date(v).toISOString().slice(0,10)!==s)throw Error("INVALID_DATE");
 return v;
}
function iso(t:number):string{return new Date(t).toISOString().slice(0,10)}
function weekStart(t:number){return t-((new Date(t).getUTCDay()+6)%7)*DAY}
export function cyclesFor(anchorMonday:string,from:string,to:string) {
 const anchor=time(anchorMonday),start=time(from),end=time(to);
 if(new Date(anchor).getUTCDay()!==1||end<start)throw Error("INVALID_CYCLE");
 const offset=Math.floor((start-anchor)/(14*DAY)),out:{start:string;end:string;weeks:[string[],string[]]}[]=[];
 for(let t=anchor+offset*14*DAY;t<=end;t+=14*DAY){
  const week=(n:number)=>Array.from({length:7},(_,i)=>iso(t+(n+i)*DAY));
  out.push({start:iso(t),end:iso(t+13*DAY),weeks:[week(0),week(7)]});
 } return out;
}
const suggestion="可將附近例休日「/」與上班或整天假別對調；系統不會自動修改排班。";
export function classifyRoster(days:readonly RosterDay[],previousRegularOff:string|null,options:RosterOptions):RosterResult {
 const labels:Record<string,RosterLabel>={},violations:RosterViolation[]=[],consecutive:ConsecutiveSegment[]=[],sixthDays:string[]=[],overEight:string[]=[];
 const answer=()=>({labels,violations,consecutive,sixthDays,overEight});
 if(!days.length)return answer();
 const sorted=[...days].sort((a,b)=>a.date.localeCompare(b.date)),byDate=new Map(sorted.map(d=>[d.date,d]));
 if(byDate.size!==sorted.length)throw Error("DUPLICATE_ROSTER_DAY");
 const first=time(sorted[0].date),last=time(sorted[sorted.length-1].date),anchor=time(options.anchorMonday);
 if(new Date(anchor).getUTCDay()!==1)throw Error("ANCHOR_NOT_MONDAY");
 const casual=options.employmentType==="casual"||options.partTime===true;
 for(let t=first;t<=last;t+=DAY){const d=byDate.get(iso(t));
  labels[iso(t)]=!d||d.kind==="unscheduled"?(casual?"off":"unscheduled"):
   d.kind==="off"?(casual?"off":"rest_day"):"work";
 }
 if(options.skipChecks||options.scheduleMode==="none")return answer();
 let previous=previousRegularOff?time(previousRegularOff):null;
 for(let w=weekStart(first);w<=last;w+=7*DAY){
  const dates=Array.from({length:7},(_,i)=>iso(w+i*DAY));
  const complete=dates.every(d=>labels[d]&&labels[d]!=="unscheduled");
  if(!complete)continue;
  if(!casual){
   const offs=dates.filter(d=>labels[d]==="rest_day");
   if(!offs.length)violations.push({code:"WEEK_NO_REGULAR",from:dates[0],to:dates[6],dates,message:"每週至少要有一天例假"});
   else {
    const preceding=previous;
    const suitable=preceding===null?[]:offs.filter(d=>time(d)>preceding&&time(d)-preceding<=7*DAY);
    const chosen=(suitable.length?suitable:offs).at(-1)!;
    labels[chosen]="regular_off";previous=time(chosen);
   }
  }
  if(!casual){
   const total=dates.reduce((n,d)=>n+(labels[d]==="work"?(byDate.get(d)?.kind==="leave"?480:byDate.get(d)?.minutes??0):0),0);
   for(const d of dates){const cell=byDate.get(d),mins=labels[d]==="work"?(cell?.kind==="leave"?480:cell?.minutes??0):0;
    if(mins>600)violations.push({code:"DAY_HOURS",from:d,to:d,dates:[d],message:d+" 正常工時超過 10 小時"});
   }
   if(total>2880)violations.push({code:"WEEK_HOURS",from:dates[0],to:dates[6],dates,message:"一週正常工時超過 48 小時"});
  }
 }
 if(!casual)for(const cycle of cyclesFor(options.anchorMonday,iso(first),iso(last))){
  const dates=cycle.weeks.flat();
  if(!dates.every(d=>labels[d]&&labels[d]!=="unscheduled"))continue;
  const rests=dates.filter(d=>labels[d]==="rest_day"||labels[d]==="regular_off").length;
  if(rests<4)violations.push({code:"CYCLE_OFF",from:cycle.start,to:cycle.end,dates,message:"雙週只有 "+rests+" 天例休日（應至少 4 天）"});
  const mins=dates.reduce((n,d)=>n+(labels[d]==="work"?(byDate.get(d)?.kind==="leave"?480:byDate.get(d)?.minutes??0):0),0);
  if(mins>4800)violations.push({code:"CYCLE_HOURS",from:cycle.start,to:cycle.end,dates,message:"雙週正常工時超過 80 小時"});
 }
 if(casual)for(const cell of sorted)if(labels[cell.date]==="work"&&(cell.minutes??0)>480)overEight.push(cell.date);
 let sequence:string[]=[];
 function endSequence(){
  if(sequence.length>=6){
   const d=[...sequence],from=d[0],to=d[d.length-1];
   consecutive.push({startDate:from,endDate:to,days:d.length,suggestion});
   sixthDays.push(...d.slice(5));
   if(d.length>=7)violations.push({code:"CONSECUTIVE_7",from,to,dates:d,message:"連續工作 "+d.length+" 天，不得核准。"+suggestion});
  }
  sequence=[];
 }
 for(let t=first;t<=last;t+=DAY){const d=iso(t);if(labels[d]==="work")sequence.push(d);else endSequence()}endSequence();
 return answer();
}
export function rosterViolations(days:readonly RosterDay[],previousRegularOff:string|null,options:RosterOptions){return classifyRoster(days,previousRegularOff,options).violations}
