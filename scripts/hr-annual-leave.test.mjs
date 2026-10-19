import test from "node:test";
import assert from "node:assert/strict";
import { annualLeaveSchedule } from "../shared/hr-annual-leave.ts";
const years = (n, asOf = "2058-10-01") => annualLeaveSchedule("2026-01-01", [], asOf).find(row=>row.serviceYearsLabel===`滿 ${n} 年`);
test("under six months has no entitlement",()=>assert.deepEqual(annualLeaveSchedule("2026-01-01",[],"2026-06-30"),[]));
test("exactly six months gives three days",()=>assert.equal(annualLeaveSchedule("2026-01-01",[],"2026-07-01")[0].days,3));
test("one, two, three, four, five, ten, twenty-four and thirty years",()=>{
 for(const [n,days] of [[1,7],[2,10],[3,14],[4,14],[5,15],[10,16],[24,30],[30,30]])assert.equal(years(n).days,days);
});
test("end dates precede next entitlement",()=>{
 const rows=annualLeaveSchedule("2026-01-01",[],"2027-01-01");
 assert.deepEqual(rows.slice(0,2).map(x=>[x.periodStart,x.periodEnd]),[["2026-07-01","2026-12-31"],["2027-01-01","2027-12-31"]]);
});
test("Feb 29 anniversary starts on Mar 1 in a non-leap year (Civil Code 121)",()=>{
 const rows=annualLeaveSchedule("2024-02-29",[],"2025-03-01");
 assert.equal(rows.at(-1).periodStart,"2025-03-01");
});
test("Aug 31 reaches six months on March 1",()=>{
 const rows=annualLeaveSchedule("2025-08-31",[],"2026-03-01");
 assert.equal(rows[0]?.periodStart,"2026-03-01");
});
test("excluded seniority days push anniversary forward",()=>{
 const rows=annualLeaveSchedule("2026-01-01",[{startDate:"2026-03-01",endDate:"2026-03-10"}],"2027-01-11");
 assert.equal(rows[0].periodStart,"2026-07-11");
 assert.equal(rows[1].periodStart,"2027-01-11");
});
