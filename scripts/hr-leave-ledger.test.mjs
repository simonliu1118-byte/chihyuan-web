import test from "node:test";
import assert from "node:assert/strict";
import {annualLeaveLedger,annualLeaveSchedule} from "../shared/hr-annual-leave.ts";
import {overtimeSuggestion,overtimeWarnings,compBalances,nextMonthEnd,extendMonth} from "../shared/hr-overtime.ts";
test("seven annual leave days, three used, four carried next year",()=>{
 const periods=[{periodStart:"2026-01-01",periodEnd:"2026-12-31",days:7,serviceYearsLabel:"滿一年"},{periodStart:"2027-01-01",periodEnd:"2027-12-31",days:10,serviceYearsLabel:"滿兩年"}];
 const rows=annualLeaveLedger(periods,[{workDate:"2026-06-01",minutes:1440},{workDate:"2026-07-01",minutes:480,cancelledAt:"2026-07-02"}],"2027-03-01");
 assert.equal(rows[0].carriedOutDays,4);assert.equal(rows[1].carriedInDays,4);
 const used=annualLeaveLedger(periods,[{workDate:"2026-06-01",minutes:1440},{workDate:"2027-02-01",minutes:960}],"2028-01-01");
 assert.equal(used[1].usedCarriedDays,2);assert.equal(used[1].expiredUnpaidDays,2);
});
test("seniority exclusion shifts annual period date",()=>{
 const adjusted=annualLeaveSchedule("2025-01-01",[{startDate:"2025-04-01",endDate:"2025-04-10"}],"2026-01-20");
 assert.equal(adjusted[0].periodStart,"2025-07-11");
});
test("overtime suggestions by shift, part-time, off-day, holiday and special marker",()=>{
 const base={workDate:"2026-10-05",out1:"18:16",workedMinutes:540,employmentType:"full"};
 assert.equal(overtimeSuggestion(base,{endTime:"17:30",normalMinutes:480},[],null).minutes,30);
 assert.equal(overtimeSuggestion({...base,employmentType:"casual",workedMinutes:560},null,[],null).minutes,60);
 assert.equal(overtimeSuggestion({...base,workedMinutes:420},null,[], "rest_day").minutes,420);
 assert.equal(overtimeSuggestion(base,null,["2026-10-05"],null).minutes,540);
 assert.equal(overtimeSuggestion({...base,marker:"booth"},null,[],null).minutes,0);
});
test("Article 32 46h/month and 12h/day warnings are nonblocking",()=>{
 const days=[{date:"2026-10-01",workedMinutes:800,normalMinutes:480,overtimeMinutes:360},
  {date:"2026-10-02",workedMinutes:600,normalMinutes:480,overtimeMinutes:2500}];
 const warnings=overtimeWarnings(days);
 assert.ok(warnings.some(x=>x.includes("12 小時")));assert.ok(warnings.some(x=>x.includes("46 小時")));
});
test("expiry next-month end, extend, borrow holiday and offset by grant",()=>{
 assert.equal(nextMonthEnd("2026-10-20"),"2026-11-30");
 assert.equal(extendMonth("2026-11-30"),"2026-12-31");
 const loan=[{kind:"holiday",minutes:480,workDate:"2026-10-02"}];
 const before=compBalances([],loan,[],"2026-10-10");
 assert.equal(before.holidayMinutes,-480);
 const after=compBalances([{id:20,kind:"holiday",minutes:600,issuedOn:"2026-10-15",expiresOn:"2026-11-30"}],loan,[],"2026-10-20");
 assert.equal(after.holidayMinutes,120);
});
test("earliest expiry spent first, settlements subtract credits",()=>{
 const credits=[{id:1,kind:"overtime",minutes:480,issuedOn:"2026-10-01",expiresOn:"2026-11-30"},
 {id:2,kind:"overtime",minutes:480,issuedOn:"2026-10-01",expiresOn:"2026-12-31"}];
 const rows=compBalances(credits,[{kind:"overtime",workDate:"2026-10-05",minutes:600}],[{creditId:2,minutes:60}],"2026-10-20");
 assert.equal(rows.credits.find(x=>x.id===1)?.remainingMinutes,0);
 assert.equal(rows.credits.find(x=>x.id===2)?.remainingMinutes,300);
});

test("future credits and future leave do not affect a current balance",()=>{
 const credits=[{id:10,kind:"overtime",minutes:480,issuedOn:"2026-10-06",expiresOn:"2026-11-30"}];
 const uses=[{kind:"overtime",minutes:240,workDate:"2026-10-07"}];
 assert.equal(compBalances(credits,uses,[],"2026-10-05").overtimeMinutes,0);
 assert.equal(compBalances(credits,uses,[],"2026-10-06").overtimeMinutes,480);
 assert.equal(compBalances(credits,uses,[],"2026-10-08").overtimeMinutes,240);
 assert.equal(compBalances(credits,uses,[],"2026-12-01").overtimeMinutes,0);
});
