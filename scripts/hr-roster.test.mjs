import test from "node:test";
import assert from "node:assert/strict";
import {cyclesFor,classifyRoster} from "../shared/hr-roster.ts";
const day=(start,n)=>new Date(Date.parse(start+"T00:00:00Z")+n*86400000).toISOString().slice(0,10);
const make=(start,count,fn)=>Array.from({length:count},(_,i)=>({date:day(start,i),...fn(i)}));
const shift={kind:"shift",minutes:480,shiftCode:"早"},off={kind:"off",offMark:"slash"};
const opts={anchorMonday:"2026-09-28",employmentType:"full"};
test("fortnight anchored Monday crosses Sep/Oct and both months",()=>{
 const cycles=cyclesFor(opts.anchorMonday,"2026-10-01","2026-11-08");
 assert.deepEqual(cycles.map(c=>c.start),["2026-09-28","2026-10-12","2026-10-26"]);
 assert.equal(cycles[0].end,"2026-10-11");assert.equal(cycles.at(-1).end,"2026-11-08");
});
test("all slash, statutory and typhoon leave count as work, incomplete periods skip quota",()=>{
 const input=make("2026-10-05",14,i=>[0,3,7,10].includes(i)?off:{kind:"leave",leaveCode:["國","補","換","颱","特"][i%5]});
 const result=classifyRoster(input,null,opts);
 assert.ok(["regular_off","rest_day"].includes(result.labels[day("2026-10-05",3)]));
 assert.equal(result.labels[day("2026-10-05",1)],"work");
 const incomplete=make("2026-10-05",14,i=>i<7?(i===0?off:shift):{kind:"unscheduled"});
 assert.ok(!classifyRoster(incomplete,null,opts).violations.some(x=>x.code==="CYCLE_OFF"));
});
test("weekly regular day prioritizes the latest within 7 days, then relaxes",()=>{
 // Tue and Fri off for three weeks: the latest within 7 days of the previous 例假 is each Friday.
 const input=make("2026-10-05",21,i=>i%7===1||i%7===4?off:shift);
 const result=classifyRoster(input,"2026-10-04",opts);
 assert.equal(result.labels["2026-10-09"],"regular_off");
 assert.equal(result.labels["2026-10-16"],"regular_off");
 assert.equal(result.labels["2026-10-23"],"regular_off");
 assert.equal(result.labels["2026-10-06"],"rest_day");
 // Previous 例假 on Mon 9/28 and only Sat/Sun off in the week of 10/5: nothing within 7 days, so it relaxes to Sunday.
 const relaxed=classifyRoster(make("2026-10-05",7,i=>i>=5?off:shift),"2026-09-28",opts);
 assert.equal(relaxed.labels["2026-10-11"],"regular_off");
 assert.equal(relaxed.violations.length,0);
});
test("past weeks keep their saved 例假",()=>{
 const input=make("2026-10-05",7,i=>i===1||i===6?off:shift);
 const result=classifyRoster(input,null,{...opts,fixedRegularOff:new Set(["2026-10-06"])});
 assert.equal(result.labels["2026-10-06"],"regular_off");
 assert.equal(result.labels["2026-10-11"],"rest_day");
});
test("regular holidays may be separated by 13 days if weekly holidays exist",()=>{
 const input=make("2026-10-05",14,i=>[0,4,9,13].includes(i)?off:shift);
 const result=classifyRoster(input,null,opts);
 assert.ok(!result.violations.some(x=>x.code==="CONSECUTIVE_7"||x.code==="WEEK_NO_REGULAR"||x.code==="CYCLE_OFF"));
});
test("six consecutive is approval candidate, seven is blocked and suggested, never mutated",()=>{
 const six=make("2026-10-05",7,i=>i===6?off:shift);
 const a=classifyRoster(six,null,opts);assert.deepEqual(a.consecutive.map(x=>x.days),[6]);assert.equal(a.violations.filter(x=>x.code==="CONSECUTIVE_7").length,0);
 const seven=make("2026-10-05",7,i=>i===4?{kind:"leave",leaveCode:"特"}:shift),before=JSON.stringify(seven);
 const b=classifyRoster(seven,null,opts);
 assert.ok(b.violations.some(x=>x.code==="CONSECUTIVE_7"));
 assert.ok(b.consecutive[0].suggestion.includes("不會自動"));
 assert.equal(JSON.stringify(seven),before);
});
test("five days never trigger six-day warning",()=>{
 const input=make("2026-10-05",7,i=>i===0||i===6?off:shift);
 assert.equal(classifyRoster(input,null,opts).consecutive.length,0);
});
test("one week without off and three off days per fortnight are violations",()=>{
 // The fortnight starting 10/12 (aligned to the 9/28 anchor): no / in its first week, three / in total.
 const input=make("2026-10-12",14,i=>[8,10,12].includes(i)?off:shift);
 const v=classifyRoster(input,null,opts).violations.map(x=>x.code);
 assert.ok(v.includes("WEEK_NO_REGULAR"));assert.ok(v.includes("CYCLE_OFF"));
});
test("daily, weekly and fortnight hours limits apply to full and half",()=>{
 const input=make("2026-10-12",14,i=>[0,6,7,13].includes(i)?off:{kind:"shift",minutes:660});
 for(const employmentType of ["full","half"]){
  const v=classifyRoster(input,null,{...opts,employmentType}).violations.map(x=>x.code);
  assert.ok(v.includes("DAY_HOURS"));assert.ok(v.includes("WEEK_HOURS"));assert.ok(v.includes("CYCLE_HOURS"));
 }
});
test("casual ignores off quota, X and blanks break run, over 8 hours requires approval",()=>{
 const casual={...opts,employmentType:"casual"};
 const days=make("2026-10-05",14,i=>i%7===0?{kind:"off",offMark:"x"}:i===3?{kind:"unscheduled"}:{kind:"hours",minutes:540});
 const r=classifyRoster(days,null,casual);
 assert.equal(r.labels[day("2026-10-05",0)],"off");
 assert.equal(r.labels[day("2026-10-05",3)],"off");
 assert.ok(r.overEight.length>0);
 assert.ok(!r.violations.some(x=>x.code==="CYCLE_OFF"||x.code==="DAY_HOURS"));
});
test("skip checks and no-roster casual bypass all constraints",()=>{
 const input=make("2026-10-05",14,()=>({kind:"shift",minutes:720}));
 assert.deepEqual(classifyRoster(input,null,{...opts,skipChecks:true}).violations,[]);
 assert.deepEqual(classifyRoster(input,null,{...opts,employmentType:"casual",scheduleMode:"none"}).violations,[]);
});
