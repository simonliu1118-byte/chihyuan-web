import test from "node:test";
import assert from "node:assert/strict";
import {leaveMinutes,leaveDates,checkLeaveQuota} from "../shared/hr-leave.ts";
const type=(id,code,quotaDays,quotaPeriod,mergeIntoTypeId,mergeAfterDays=0)=>({id,code,quotaDays,quotaPeriod,mergeIntoTypeId,mergeAfterDays});
const personal=type(1,"事",14,"calendar_year");
const family=type(2,"家",7,"calendar_year",1);
const ordinary=type(3,"病",30,"calendar_year",4);
const hospital=type(4,"院",365,"two_years");
const period=type(5,"生",1,"month",3,3);
const types=[personal,family,ordinary,hospital,period];
const entry=(leaveTypeId,date,minutes=480)=>({leaveTypeId,workDate:date,minutes});
test("full-day 480, half/casual cannot whole-day, shift break overlap",()=>{
 const shift={startTime:"09:00",endTime:"17:30",breakStart:"13:00",breakEnd:"13:30"};
 assert.equal(leaveMinutes("full",null,shift,{wholeDay:true}),480);
 assert.equal(leaveMinutes("full",null,shift,{startTime:"12:00",endTime:"15:00"}),150);
 assert.equal(leaveMinutes("casual",null,shift,{startTime:"09:00",endTime:"11:00"}),120);
 assert.throws(()=>leaveMinutes("half",null,shift,{wholeDay:true}),/WHOLE_DAY/);
 assert.throws(()=>leaveMinutes("full",null,shift,{startTime:"08:00",endTime:"10:00"}),/OUTSIDE_SHIFT/);
 assert.equal(leaveMinutes("casual",null,null,{minutes:120}),120);
});
test("date range skips off days and 國, but maternity counts calendar days",()=>{
 const cells=[{date:"2026-10-06",kind:"off",offMark:"slash"},{date:"2026-10-09",kind:"leave",leaveCode:"國"}];
 assert.equal(leaveDates({from:"2026-10-05",to:"2026-10-11"},cells,{countsCalendarDays:false}).length,5);
 assert.equal(leaveDates({from:"2026-10-05",to:"2026-10-11"},cells,{countsCalendarDays:true}).length,7);
});
test("personal leave 14 then 15 days rejected",()=>{
 const prior=Array.from({length:14},(_,i)=>entry(1,"2026-02-"+String(i+1).padStart(2,"0")));
 assert.equal(checkLeaveQuota(personal,types,prior,[entry(1,"2026-10-01")])[0]?.code,"事");
 assert.equal(checkLeaveQuota(personal,types,prior,[]).length,0);
});
test("family leave merges into personal quota",()=>{
 const prior=Array.from({length:10},(_,i)=>entry(1,"2026-02-"+String(i+1).padStart(2,"0")));
 assert.ok(checkLeaveQuota(family,types,prior,Array.from({length:5},(_,i)=>entry(2,"2026-10-"+String(i+1).padStart(2,"0")))).some(x=>x.code==="事"));
});
test("menstrual leave limits one per month and 4th joins ordinary sick",()=>{
 assert.ok(checkLeaveQuota(period,types,[entry(5,"2026-10-01")],[entry(5,"2026-10-02")]).some(x=>x.code==="生"));
 const first=Array.from({length:3},(_,i)=>entry(5,"2026-0"+(i+1)+"-01"));
 const ordinaryPrior=Array.from({length:29},(_,i)=>entry(3,"2026-07-"+String(i+1).padStart(2,"0")));
 assert.ok(checkLeaveQuota(period,types,[...first,...ordinaryPrior],[entry(5,"2026-10-02")]).some(x=>x.code==="病"));
});
test("ordinary leave 30 and hospital rolling two years",()=>{
 const prior=Array.from({length:30},(_,i)=>entry(3,"2026-09-"+String(i+1).padStart(2,"0")));
 assert.ok(checkLeaveQuota(ordinary,types,prior,[entry(3,"2026-10-01")]).some(x=>x.code==="病"));
 const hospitalPrior=Array.from({length:365},(_,i)=>entry(4,"2026-01-01"));
 assert.ok(checkLeaveQuota(hospital,types,hospitalPrior,[entry(4,"2026-10-01")]).some(x=>x.code==="院"));
});
test("bereavement quotas separate by event date",()=>{
 const funeral=type(8,"喪",8,"event");funeral.eventQuotaOptions="3,6,8";
 const prior=Array.from({length:8},(_,i)=>({...entry(8,"2026-10-"+String(i+1).padStart(2,"0")),eventDate:"2026-10-01",eventQuotaDays:8}));
 assert.ok(checkLeaveQuota(funeral,[funeral],prior,[{...entry(8,"2026-10-12"),eventDate:"2026-10-01",eventQuotaDays:8}]).length>0);
 assert.equal(checkLeaveQuota(funeral,[funeral],prior,[{...entry(8,"2026-10-12"),eventDate:"2026-09-10",eventQuotaDays:8}]).length,0);
});
