import test from "node:test";
import assert from "node:assert/strict";
import { parseErpNameKeyword, erpNameContains, parseErpCode } from "../shared/erp-name-search.ts";

test("name search keyword limits and trimming",()=>{
  assert.equal(parseErpNameKeyword("  穴位貼  "),"穴位貼");
  assert.equal(parseErpNameKeyword("護 腕"),"護 腕");
  assert.equal(parseErpNameKeyword("a".repeat(40)),"a".repeat(40));
  for (const keyword of [""," ","a".repeat(41),"a'b","a%b","a_b","a[b","a]b","a\n","a\u0000"]) {
    assert.equal(parseErpNameKeyword(keyword),null,JSON.stringify(keyword));
  }
  assert.equal(parseErpNameKeyword(10),null);
});
test("case and width insensitive matching, without interpreting wildcard",()=>{
  assert.equal(erpNameContains("假穴位貼A","穴位貼"),true);
  assert.equal(erpNameContains("ABC健康","ａｂｃ"),true);
  assert.equal(erpNameContains("測試商品","其他"),false);
});
test("order numbers: 23x 銷貨 and 24x 銷退 only", async () => {
  const { parseErpOrderNo } = await import("../shared/erp-name-search.ts");
  assert.equal(parseErpOrderNo(" 232a-20260804003 "), "232A-20260804003");
  assert.equal(parseErpOrderNo("241A-20260910001"), "241A-20260910001");
  for (const no of ["631A-20260422002", "232A20260804003", "232A-2026080400X", ""]) assert.equal(parseErpOrderNo(no), null, no);
});

test("ERP codes may hold a dash after the first letter or digit", () => {
  assert.equal(parseErpCode(" K1807003-1 "), "K1807003-1");
  assert.equal(parseErpCode("A00001"), "A00001");
  for (const bad of ["-A1", "A 1", "A_1", "A'1", "穴位貼", "A".repeat(41), ""]) assert.equal(parseErpCode(bad), null, bad);
});
