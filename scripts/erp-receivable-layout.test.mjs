import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const r=readFileSync("src/runtime/modules/ErpReceivableQuery.tsx","utf8");
const q=readFileSync("src/runtime/modules/ErpQueryRows.tsx","utf8");
const c=readFileSync("src/runtime/modules/erp-item-query.css","utf8");
test("receivable uses shared table and chevron with expandable detail row",()=>{
 assert.match(r,/cy-op-table cy-rt cy-erp-receivable-table/);
 assert.match(r,/<ExpandToggle expanded=\{opened\}/);
 assert.match(r,/data-label="結帳單明細" data-priority="wide" colSpan=\{5\}/);
 assert.match(r,/tableMode="shared"/);
 assert.doesNotMatch(r,/<details key=\{group\.customerCode\}/);
});
test("shared ERP rows retain pagination, vouchers and original adaptive default",()=>{
 assert.match(q,/tableMode="adaptive"/);
 assert.match(q,/compact&&!shared/);
 assert.match(q,/const size=25/);
 assert.match(r,/parseErpOrderNo\(v\.voucherNo\)/);
 assert.match(r,/setOpenOrder\(orderNo\)/);
});
test("receivable widths and amount columns are no-wrap",()=>{
 assert.match(r,/width:160/);
 assert.match(c,/cy-erp-receivable-name\{white-space:nowrap/);
 assert.match(c,/cy-erp-receivable-money\{white-space:nowrap/);
 assert.match(c,/\.cy-op-table \.num\{white-space:nowrap/);
 assert.match(c,/cy-erp-receivable-detail \.cy-erp-table-scroller\{max-width:100%;overflow-x:auto/);
});
