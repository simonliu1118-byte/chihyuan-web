/** HR leave is recorded in half-hour units; one statutory day is 480 minutes. */
export interface LeaveCell {date:string;kind?:string|null;offMark?:string|null;leaveCode?:string|null}
export interface LeaveTypeRule {
  id:number;code:string;name?:string;quotaDays?:number|null;quotaPeriod?:string|null;
  mergeIntoTypeId?:number|null;mergeAfterDays?:number|null;countsCalendarDays?:boolean;
  eventQuotaOptions?:string|null;
}
export interface LeaveEntry {
  leaveTypeId:number;workDate:string;minutes:number;eventDate?:string|null;
  eventQuotaDays?:number|null;cancelledAt?:string|null;
}
export interface LeaveRequest {
  wholeDay?:boolean;startTime?:string;endTime?:string;minutes?:number;
}
export interface LeaveShift {
  startTime:string;endTime:string;breakStart?:string|null;breakEnd?:string|null;
}
export interface QuotaFailure {leaveTypeId:number;code:string;period:string;usedMinutes:number;limitMinutes:number;message:string}
const DAY=86400000;
function epoch(date:string):number {
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error("INVALID_DATE");
 const value=Date.parse(date+"T00:00:00Z");
 if(!Number.isFinite(value)||new Date(value).toISOString().slice(0,10)!==date)throw Error("INVALID_DATE");
 return value;
}
function clock(value:string):number {
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(value))throw Error("INVALID_CLOCK");
 return Number(value.slice(0,2))*60+Number(value.slice(3));
}
export function leaveMinutes(employmentType:"full"|"half"|"casual",cell:LeaveCell|null,shift:LeaveShift|null,request:LeaveRequest):number {
 if(request.wholeDay){
  if(employmentType!=="full")throw Error("WHOLE_DAY_FULL_ONLY");
  return 480;
 }
 if(request.startTime&&request.endTime){
  const start=clock(request.startTime),end=clock(request.endTime);
  if(end<=start)throw Error("INVALID_LEAVE_INTERVAL");
  if(shift){
   const shiftStart=clock(shift.startTime),shiftEnd=clock(shift.endTime);
   if(start<shiftStart||end>shiftEnd)throw Error("OUTSIDE_SHIFT");
   let worked=end-start;
   if(shift.breakStart&&shift.breakEnd){
    const pauseStart=clock(shift.breakStart),pauseEnd=clock(shift.breakEnd);
    worked-=Math.max(0,Math.min(end,pauseEnd)-Math.max(start,pauseStart));
   }
   if(worked<=0||worked%30!==0)throw Error("LEAVE_HALF_HOUR");
   return worked;
  }
  if((end-start)%30!==0)throw Error("LEAVE_HALF_HOUR");
  return end-start;
 }
 if(!shift&&employmentType!=="full"&&Number.isInteger(request.minutes)&&request.minutes!>0&&request.minutes!%30===0)return request.minutes!;
 throw Error("LEAVE_TIME_REQUIRED");
}
export function leaveDates(range:{from:string;to:string},cells:readonly LeaveCell[],type:Pick<LeaveTypeRule,"countsCalendarDays">):string[]{
 const first=epoch(range.from),last=epoch(range.to);
 if(last<first||last-first>365*DAY)throw Error("INVALID_LEAVE_RANGE");
 const map=new Map(cells.map(x=>[x.date,x]));
 const out:string[]=[];
 for(let t=first;t<=last;t+=DAY){
  const date=new Date(t).toISOString().slice(0,10),cell=map.get(date);
  if(!type.countsCalendarDays&&(cell?.kind==="off"&&cell.offMark==="slash"||cell?.kind==="leave"&&cell.leaveCode==="國"))continue;
  out.push(date);
 }
 return out;
}
function samePeriod(entry:LeaveEntry,date:string,period:string|null|undefined):boolean {
 if(period==="calendar_year")return entry.workDate.slice(0,4)===date.slice(0,4);
 if(period==="month")return entry.workDate.slice(0,7)===date.slice(0,7);
 if(period==="two_years"){
  const d=new Date(epoch(date));d.setUTCFullYear(d.getUTCFullYear()-2);
  return entry.workDate>=d.toISOString().slice(0,10)&&entry.workDate<=date;
 }
 if(period==="event")return false;
 return true;
}
export function checkLeaveQuota(type:LeaveTypeRule,types:readonly LeaveTypeRule[],records:readonly LeaveEntry[],candidate:readonly LeaveEntry[]):QuotaFailure[]{
 const byId=new Map(types.map(x=>[x.id,x]));
 const active=[...records,...candidate].filter(x=>!x.cancelledAt).sort((a,b)=>a.workDate.localeCompare(b.workDate));
 const failures:QuotaFailure[]=[],checkTypes=types.filter(x=>x.quotaDays!=null&&x.quotaDays>=0);
 for(const rule of checkTypes){
  const relevant=active.filter(x=>x.leaveTypeId===rule.id || byId.get(x.leaveTypeId)?.mergeIntoTypeId===rule.id);
  for(const c of candidate.filter(x=>!x.cancelledAt)){
   if(c.leaveTypeId!==rule.id && byId.get(c.leaveTypeId)?.mergeIntoTypeId!==rule.id)continue;
   let used=0;
   const eventDate=c.eventDate??c.workDate;
   for(const entry of relevant) {
    if(rule.quotaPeriod==="event"){
      if((entry.eventDate??entry.workDate)!==eventDate)continue;
    }else if(!samePeriod(entry,c.workDate,rule.quotaPeriod))continue;
    if(entry.leaveTypeId===rule.id)used+=entry.minutes;
    else {
      const source=byId.get(entry.leaveTypeId);
      if(!source)continue;
      const threshold=(source.mergeAfterDays??0)*480;
      if(threshold>0){
        const earlier=active.filter(x=>x.leaveTypeId===source.id&&!x.cancelledAt&&x.workDate<=entry.workDate&&x.workDate.slice(0,4)===entry.workDate.slice(0,4))
            .reduce((n,x)=>n+x.minutes,0);
        const before=earlier-entry.minutes;
        used+=Math.min(entry.minutes,Math.max(0,earlier-threshold))-Math.max(0,before-threshold);
      }else used+=entry.minutes;
    }
   }
   const limit=(rule.quotaPeriod==="event"&&rule.eventQuotaOptions&&c.eventQuotaDays?c.eventQuotaDays:rule.quotaDays!)*480;
   if(used>limit){
     const id=rule.id+"|"+(rule.quotaPeriod==="event"?eventDate:rule.quotaPeriod==="month"?c.workDate.slice(0,7):rule.quotaPeriod==="calendar_year"?c.workDate.slice(0,4):c.workDate);
     if(!failures.some(x=>x.message.startsWith(id+" ")))failures.push({leaveTypeId:rule.id,code:rule.code,period:id,
       usedMinutes:used,limitMinutes:limit,message:id+" "+rule.code+" 假額度超過上限（已用 "+(used/480)+" 天／上限 "+(limit/480)+" 天）"});
   }
  }
 }
 return failures;
}
