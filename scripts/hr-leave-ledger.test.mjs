import test from "node:test";
import assert from "node:assert/strict";
import {annualLeaveLedger,annualLeaveSchedule,partTimeBase,partTimeEntitlementMinutes} from "../shared/hr-annual-leave.ts";
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
test("expiry is the end of the next month and extends by one month",()=>{
 assert.equal(nextMonthEnd("2026-10-20"),"2026-11-30");
 assert.equal(extendMonth("2026-11-30"),"2026-12-31");
});
test("an advance is owed to its holiday and is not absorbed by the balance (BD-060 #29)",()=>{
 // Three days of comp time already earned; 8 hours advanced against 10/10 國慶日.
 const credits=[{id:1,kind:"overtime",minutes:1440,issuedOn:"2026-09-20",expiresOn:"2026-10-31"}];
 const uses=[{minutes:480,workDate:"2026-10-02",advanceHolidayDate:"2026-10-10",advanceHolidayName:"國慶日"}];
 const owed=compBalances(credits,uses,[],"2026-10-03");
 assert.equal(owed.balanceMinutes,1440);assert.equal(owed.advanceMinutes,480);
 // Using a day of the balance leaves the advance untouched: 3−1=2 days, still −8 hours for 國慶日.
 const spent=compBalances(credits,[...uses,{minutes:480,workDate:"2026-10-05"}],[],"2026-10-06");
 assert.equal(spent.balanceMinutes,960);assert.equal(spent.advances[0].outstandingMinutes,480);
 // Only 國慶日's own comp time clears it; any rest of that grant joins the balance.
 const holiday={id:100000001,kind:"holiday",minutes:600,issuedOn:"2026-10-10",expiresOn:"2026-11-30",holidayDate:"2026-10-10",holidayName:"國慶日"};
 const repaid=compBalances([...credits,holiday],[...uses,{minutes:480,workDate:"2026-10-05"}],[],"2026-10-11");
 assert.equal(repaid.advanceMinutes,0);assert.equal(repaid.balanceMinutes,960+120);
 // Another holiday's comp time does not clear it.
 const other={...holiday,id:100000002,holidayDate:"2026-10-25",holidayName:"光復節",issuedOn:"2026-10-25"};
 assert.equal(compBalances([...credits,other],uses,[],"2026-10-26").advanceMinutes,480);
});
test("earliest expiry is spent first; settlement pays what is left after uses",()=>{
 const credits=[{id:1,kind:"overtime",minutes:480,issuedOn:"2026-10-01",expiresOn:"2026-11-30"},
 {id:2,kind:"overtime",minutes:480,issuedOn:"2026-10-01",expiresOn:"2026-12-31"}];
 const rows=compBalances(credits,[{workDate:"2026-10-05",minutes:600}],[{creditId:2,minutes:60}],"2026-10-20");
 assert.equal(rows.credits.find(x=>x.id===1)?.remainingMinutes,0);
 assert.equal(rows.credits.find(x=>x.id===2)?.remainingMinutes,300);
});
test("a credit only covers leave inside its validity; booked future leave counts at once",()=>{
 const credits=[{id:10,kind:"overtime",minutes:480,issuedOn:"2026-10-06",expiresOn:"2026-11-30"}];
 assert.equal(compBalances(credits,[{minutes:240,workDate:"2026-10-05"}],[],"2026-10-05").deficitMinutes,240);
 const booked=compBalances(credits,[{minutes:240,workDate:"2026-10-20"}],[],"2026-10-08");
 assert.equal(booked.balanceMinutes,240);assert.equal(booked.deficitMinutes,0);
 assert.equal(compBalances(credits,[{minutes:240,workDate:"2026-12-05"}],[],"2026-10-08").deficitMinutes,240);
});
test("part-time annual leave is prorated by hours worked in the base period",()=>{
 const base=partTimeBase("2026-07-01","2026-01-01");
 assert.deepEqual(base,{from:"2026-01-01",to:"2026-06-30"});
 assert.deepEqual(partTimeBase("2027-01-01","2026-01-01"),{from:"2026-01-01",to:"2026-12-31"});
 // Half of a 40-hour week over the six months gives half of 3 days × 8 hours = 12 hours.
 const full=Math.round(181*2400/7);
 assert.equal(partTimeEntitlementMinutes(3,full/2,base.from,base.to).minutes,720);
 assert.equal(partTimeEntitlementMinutes(3,full*2,base.from,base.to).minutes,1440);
 const rows=annualLeaveLedger([{periodStart:"2026-07-01",periodEnd:"2026-12-31",days:3,serviceYearsLabel:"",entitledMinutes:720}],[{workDate:"2026-08-01",minutes:240}],"2026-09-01");
 assert.equal(rows[0].remainingMinutes,480);
});
