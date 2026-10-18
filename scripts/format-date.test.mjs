import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import ts from "typescript";

const source = readFileSync(new URL("../src/ui/foundation/format.ts", import.meta.url), "utf8");
const transpiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { formatDate, formatDateTime } = await import("data:text/javascript;base64," + Buffer.from(transpiled).toString("base64"));

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
