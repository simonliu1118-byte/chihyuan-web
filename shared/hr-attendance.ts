export interface AttendanceShift {startTime:string;endTime:string;breakStart?:string|null;breakEnd?:string|null;normalMinutes:number}
export interface AttendanceSchedule {kind:"shift"|"hours"|"off"|"leave"|"unscheduled";offMark?:"slash"|"x"|null;restLabel?:"regular"|"rest"|null;marker?:"home"|"booth"|null;leaveCode?:string|null}
export interface AttendancePunches {in1?:string|null;out1?:string|null;in2?:string|null;out2?:string|null}
export interface AttendanceResult {workedMinutes:number;lateMinutes:number;earlyMinutes:number;anomalies:string[]}
export function clockMinutes(s:string):number {
 if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(s))throw Error("INVALID_TIME");
 return Number(s.slice(0,2))*60+Number(s.slice(3));
}
export function normalizePunchTime(v:string):string {
 const text=v.trim(),match=/^(\d{1,2}):?(\d{2})$/.exec(text);
 if(!match)throw Error("INVALID_TIME");
 const output=match[1].padStart(2,"0")+":"+match[2];clockMinutes(output);return output;
}
export function evaluateAttendance(schedule:AttendanceSchedule|null,shift:AttendanceShift|null,punches:AttendancePunches,options:{noRosterPartTime?:boolean}={}):AttendanceResult{
 const values=[punches.in1,punches.out1,punches.in2,punches.out2];
 const present=values.some(Boolean),anomalies:string[]=[];
 const pairs:[number,number][]=[];
 if((!!values[0])!== (!!values[1]) || (!!values[2])!== (!!values[3]))anomalies.push("缺卡");
 for(let i=0;i<4;i+=2){if(!values[i]||!values[i+1])continue;
  const a=clockMinutes(values[i]!),b=clockMinutes(values[i+1]!);
  if(b<=a)throw Error("CLOCK_ORDER");
  if(pairs.length&&a<pairs[pairs.length-1][1])throw Error("OVERLAPPING_PUNCHES");
  pairs.push([a,b]);
 }
 if(schedule?.marker==="home"&&!present&&shift)
   return {workedMinutes:shift.normalMinutes,lateMinutes:0,earlyMinutes:0,anomalies};
 let workedMinutes=pairs.reduce((n,[a,b])=>n+b-a,0);
 if(shift?.breakStart&&shift.breakEnd){
  const a=clockMinutes(shift.breakStart),b=clockMinutes(shift.breakEnd);
  workedMinutes-=pairs.reduce((n,[s,e])=>n+Math.max(0,Math.min(e,b)-Math.max(s,a)),0);
 }
 let lateMinutes=0,earlyMinutes=0;
 if(shift&&pairs.length&&schedule?.marker!=="booth"&&!options.noRosterPartTime){
  lateMinutes=Math.max(0,pairs[0][0]-clockMinutes(shift.startTime));
  earlyMinutes=Math.max(0,clockMinutes(shift.endTime)-pairs.at(-1)![1]);
  if(lateMinutes>0)anomalies.push("遲到");if(earlyMinutes>0)anomalies.push("早退");
 }
 if(present&&schedule?.kind==="off")anomalies.push(schedule.restLabel==="regular"?"例假出勤":schedule.offMark==="x"?"X 日出勤":"例休日出勤");
 if(!present&&(schedule?.kind==="shift"||schedule?.kind==="hours")&&schedule.marker!=="home")anomalies.push("曠職");
 return {workedMinutes,lateMinutes,earlyMinutes,anomalies};
}
