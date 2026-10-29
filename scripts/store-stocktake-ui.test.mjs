import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const stocktake=readFileSync(new URL("../src/runtime/modules/StoreStocktake.tsx",import.meta.url),"utf8");
const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
const erp=readFileSync(new URL("../src/runtime/modules/useErpJob.ts",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/runtime/modules/store.css",import.meta.url),"utf8");

test("stocktake sync uses the existing global ERP toast only after an observed job completes",()=>{
 assert.match(erp,/if \(!sawRunning\.current\) return;/);
 assert.match(erp,/queryType: job\.queryType/);
 assert.match(app,/const isStocktakeSync = detail\.queryType === "STOCKTAKE_SYNC"/);
 assert.match(app,/if \(detail\.visible && !isStocktakeSync\) return;/);
 assert.match(app,/ERP盤點單同步/);
 assert.match(app,/<ToastRegion toasts=\{toasts\}/);
 assert.doesNotMatch(stocktake,/if\(job\.result\.queryType==="STOCKTAKE_SYNC"\)notify/);
 assert.doesNotMatch(stocktake,/盤點單更新已排入 ERP 佇列/);
});

test("stocktake picker follows ordering list with date between sheet number and status Pill",()=>{
 assert.match(stocktake,/cy-op-list-row cy-status-row cy-stocktake-list-row/);
 assert.match(stocktake,/<strong>\{s\.sheetNo\}<\/strong>[\s\S]*?<span className="cy-stocktake-list-date">[\s\S]*?<StatusChip/);
 assert.match(stocktake,/formatDate\(s\.sheetDate\)\+"盤點"/);
 assert.doesNotMatch(stocktake,/cy-stocktake-sheet"/);
 assert.doesNotMatch(stocktake,/列已填寫<\/small>/);
 assert.match(css,/\.cy-status-row\.cy-stocktake-list-row\{grid-template-columns:auto minmax\(0,1fr\) auto/);
});

test("ignore setup dialog is compact, has inline add and uses ordering table styles",()=>{
 assert.match(stocktake,/>設定忽略底稿<\/button>/);
 assert.match(stocktake,/className="cy-stocktake-ignore-dialog"/);
 assert.match(stocktake,/className="cy-stocktake-ignore-input"/);
 assert.match(stocktake,/>新增<\/button>/);
 assert.match(stocktake,/cy-op-table cy-stocktake-ignored-table/);
 assert.match(stocktake,/setIgnoreForm\(""\);await loadSheets\(\)/);
 assert.doesNotMatch(stocktake,/新增忽略<\/button>/);
 assert.match(css,/width:min\(496px,calc\(100vw - 32px\)\)/);
});
