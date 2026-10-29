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

test("stocktake detail uses shared ordering record header and toolbar",()=>{
 assert.match(stocktake,/<header className="cy-record-header">/);
 assert.match(stocktake,/<div className="cy-ordering-title">[\s\S]*?<StatusChip[\s\S]*?formatDate\(currentSheet\.sheetDate\)\+"盤點"/);
 assert.match(stocktake,/商品 \{filledCount\}\/\{totalCount\} 已填/);
 assert.match(stocktake,/<div className="cy-record-actions">/);
 assert.match(stocktake,/>初盤確認<\/button>/);
 assert.match(stocktake,/>複盤確認<\/button>/);
 assert.match(stocktake,/<DataViewToolbar searchValue=\{search\} onSearchChange=\{setSearch\}/);
 assert.match(stocktake,/filters=\{<select className="cy-op-input"/);
 assert.doesNotMatch(stocktake,/盲盤中：帳面數量在第一次主管確認前/);
});

test("stocktake inventory is an ordering-style editable grid without per-product cards",()=>{
 assert.match(stocktake,/<h3>盤點品號庫存明細<\/h3>/);
 assert.match(stocktake,/className="cy-ordering-grid-scroll cy-stocktake-lines"/);
 assert.match(stocktake,/<table className="cy-ordering-grid cy-stocktake-grid"/);
 assert.match(stocktake,/className="cy-ordering-cell"[\s\S]*?onBlur=\{\(\)=>void saveLine\(l\)\}/);
 assert.match(stocktake,/onKeyDown=\{e=>nextOnEnter\(e,l\)\}/);
 assert.match(stocktake,/void showHistory\(l\)/);
 assert.match(stocktake,/void deleteBatch\(l\)/);
 assert.match(stocktake,/colSpan=\{currentSheet.status==="COUNTING"\?11:14\}/);
 assert.doesNotMatch(stocktake,/<article className="cy-stocktake-line"/);
 assert.match(css,/cy-stocktake-grid\[data-phase="recount"\]/);
});

test("mobile stocktake rows expose each field without requiring a 1290px horizontal table",()=>{
 assert.match(stocktake,/<td data-label="品號">/);
 assert.match(stocktake,/<td data-label="品名">/);
 assert.match(stocktake,/<td data-label="庫別">/);
 assert.match(stocktake,/<td data-label="儲位">/);
 assert.match(stocktake,/<td data-label="批號">/);
 assert.match(stocktake,/className="cy-stocktake-qty-cell" data-label=\{currentSheet\.status==="COUNTING"\?"初盤數量":"複盤數量"\}/);
 assert.match(stocktake,/data-stocktake-qty type="text"/);
 assert.match(stocktake,/onBlur=\{\(\)=>void saveLine\(l\)\}/);
 assert.match(stocktake,/onKeyDown=\{e=>nextOnEnter\(e,l\)\}/);
 assert.match(css,/\.cy-ordering-grid\.cy-stocktake-grid\{display:block;box-sizing:border-box;width:100%;min-width:0/);
 assert.match(css,/\.cy-stocktake-grid tbody\{display:grid;gap:10px;width:100%;min-width:0\}/);
 assert.match(css,/\.cy-ordering-grid\.cy-stocktake-grid tr\.cy-stocktake-row-group>td::before\{content:attr\(data-label\)/);
 assert.match(css,/\.cy-ordering-grid\.cy-stocktake-grid \.cy-stocktake-qty-cell\{grid-column:1\/-1/);
 assert.match(css,/\.cy-stocktake-grid \.cy-stocktake-qty-cell \.cy-ordering-cell\{display:block;width:100%;height:46px/);
});

test("stocktake search and ALL dropdown share one compact row on phones",()=>{
 assert.match(css,/\.cy-stocktake-main \.cy-data-toolbar-primary\{display:flex;flex-direction:row;align-items:center/);
 assert.match(css,/\.cy-stocktake-main \.cy-data-search\{display:block;flex:1 1 0/);
 assert.match(css,/\.cy-stocktake-main \.cy-data-filters\{display:flex;flex:0 0 106px;flex-direction:row/);
 assert.match(css,/\.cy-stocktake-main \.cy-data-filters>\.cy-op-input\{box-sizing:border-box;width:100%;min-width:0/);
});
