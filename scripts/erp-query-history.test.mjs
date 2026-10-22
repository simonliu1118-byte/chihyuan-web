import test from "node:test";
import assert from "node:assert/strict";
import { resolveHistoryRange, resolveRestockRange, HistoryRangeError, taipeiToday } from "../shared/erp-query-history.ts";
const day="2026-10-16";
const ok=(input)=>resolveHistoryRange(input,day);
const invalid=(input)=>assert.throws(()=>ok(input),error=>error instanceof HistoryRangeError);
test("Taipei date boundary rather than UTC",()=>{
  assert.equal(taipeiToday(new Date("2026-10-15T16:30:00Z")),day);
});
test("optional history off cannot carry dates",()=>{
  assert.deepEqual(ok({}),{includeHistory:false,historyFrom:null,historyTo:null});
  invalid({includeHistory:false,historyFrom:"2026-10-01"});
  invalid({includeHistory:0});
});
test("recent year and explicitly chosen ends",()=>{
  assert.deepEqual(ok({includeHistory:true}),{includeHistory:true,historyFrom:"2025-10-16",historyTo:day});
  assert.deepEqual(ok({includeHistory:true,historyFrom:"2026-01-01"}),{includeHistory:true,historyFrom:"2026-01-01",historyTo:day});
  assert.deepEqual(ok({includeHistory:true,historyTo:"2026-09-30"}),{includeHistory:true,historyFrom:"2025-09-30",historyTo:"2026-09-30"});
  assert.deepEqual(ok({includeHistory:true,historyFrom:"2023-10-16",historyTo:day}).historyFrom,"2023-10-16");
});

test("three calendar years includes the anniversary and rejects the next day on every client/server",()=>{
  assert.equal(ok({includeHistory:true,historyFrom:"2023-01-01",historyTo:"2026-01-01"}).historyTo,"2026-01-01");
  invalid({includeHistory:true,historyFrom:"2023-01-01",historyTo:"2026-01-02"});
  invalid({includeHistory:true,historyFrom:"2021-02-28",historyTo:"2024-02-29"});
  assert.equal(ok({includeHistory:true,historyFrom:"2020-02-29",historyTo:"2023-02-28"}).historyTo,"2023-02-28");
  invalid({includeHistory:true,historyFrom:"2020-02-29",historyTo:"2023-03-01"});
  assert.deepEqual(ok({includeHistory:true,historyFrom:"",historyTo:""}),ok({includeHistory:true}));
  assert.equal(resolveHistoryRange({includeHistory:true},"2024-02-29").historyFrom,"2023-02-28");
});
test("future, reversed, >3yr and invalid calendar are rejected",()=>{
  invalid({includeHistory:true,historyFrom:"2023-10-15"});
  invalid({includeHistory:true,historyTo:"2026-10-17"});
  invalid({includeHistory:true,historyFrom:"2026-10-17"});
  invalid({includeHistory:true,historyFrom:"2026-01-01",historyTo:"2025-12-31"});
  invalid({includeHistory:true,historyFrom:"2026-02-30"});
  invalid({includeHistory:true,historyFrom:"26-01-01"});
});

test("進貨輔助 needs both dates, at most the given days, not after today", () => {
  const today = "2026-10-20";
  assert.deepEqual(resolveRestockRange("2026-10-12", "2026-10-20", 31, today), { from: "2026-10-12", to: "2026-10-20" });
  assert.deepEqual(resolveRestockRange("2026-09-20", "2026-10-20", 31, today), { from: "2026-09-20", to: "2026-10-20" });
  for (const [from, to] of [[null, "2026-10-20"], ["2026-10-12", ""], ["2026-09-19", "2026-10-20"], ["2026-10-20", "2026-10-19"], ["2026-10-20", "2026-10-21"], ["2026-02-30", "2026-03-01"]])
    assert.throws(() => resolveRestockRange(from, to, 31, today), HistoryRangeError, `${from}～${to}`);
});
