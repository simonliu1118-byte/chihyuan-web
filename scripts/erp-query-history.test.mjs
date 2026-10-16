import test from "node:test";
import assert from "node:assert/strict";
import { resolveHistoryRange, HistoryRangeError, taipeiToday } from "../shared/erp-query-history.ts";
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
  assert.deepEqual(ok({includeHistory:true}),{includeHistory:true,historyFrom:"2025-10-17",historyTo:day});
  assert.deepEqual(ok({includeHistory:true,historyFrom:"2026-01-01"}),{includeHistory:true,historyFrom:"2026-01-01",historyTo:day});
  assert.deepEqual(ok({includeHistory:true,historyTo:"2026-09-30"}),{includeHistory:true,historyFrom:"2025-10-01",historyTo:"2026-09-30"});
  assert.deepEqual(ok({includeHistory:true,historyFrom:"2023-10-16",historyTo:day}).historyFrom,"2023-10-16");
});
test("future, reversed, >3yr and invalid calendar are rejected",()=>{
  invalid({includeHistory:true,historyFrom:"2023-10-15"});
  invalid({includeHistory:true,historyTo:"2026-10-17"});
  invalid({includeHistory:true,historyFrom:"2026-10-17"});
  invalid({includeHistory:true,historyFrom:"2026-01-01",historyTo:"2025-12-31"});
  invalid({includeHistory:true,historyFrom:"2026-02-30"});
  invalid({includeHistory:true,historyFrom:"26-01-01"});
});
