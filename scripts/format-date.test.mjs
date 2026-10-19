import assert from "node:assert/strict";
import { test } from "node:test";
import { formatDate, formatDateTime, formatItem } from "../src/ui/foundation/format.ts";

test("date-only strings do not shift across time zones", () => {
  assert.equal(formatDate("2026-01-05"), "2026/01/05");
  assert.equal(formatDate("2026-10-17T16:30:00Z"), "2026/10/18");
  assert.equal(formatDate(null), "—");
});
test("timestamps use yyyy/mm/dd hh:mm in Taipei and preserve leading zeroes", () => {
  assert.equal(formatDateTime("2026-10-17T16:30:00Z"), "2026/10/18 00:30");
  assert.equal(formatDateTime("2026-01-04T16:05:00Z"), "2026/01/05 00:05");
  assert.equal(formatDateTime(undefined), "—");
});

test("item numbers and names use exactly one ordinary space", () => {
  assert.equal(formatItem("A00001", "志遠拔罐杯#1"), "A00001 志遠拔罐杯#1");
  assert.equal(formatItem("", "單獨品名"), "單獨品名");
  assert.equal(formatItem("A00001", ""), "A00001");
  assert.equal(formatItem(null, null), "");
});
