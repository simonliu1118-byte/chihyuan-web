import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";

const stocktake=readFileSync(new URL("../src/runtime/modules/StoreStocktake.tsx",import.meta.url),"utf8");
const app=readFileSync(new URL("../src/App.tsx",import.meta.url),"utf8");
const erp=readFileSync(new URL("../src/runtime/modules/useErpJob.ts",import.meta.url),"utf8");
const css=readFileSync(new URL("../src/runtime/modules/store.css",import.meta.url),"utf8");
const grouped=readFileSync(new URL("../src/runtime/modules/StocktakeGroupedDetail.tsx",import.meta.url),"utf8");

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

test("stocktake grouped inventory uses location cells for save, history and desktop ordering styles",()=>{
 assert.match(stocktake,/<StocktakeGroupedDetail detail=\{detail!\}/);
 assert.match(stocktake,/locationCountId:cell\.id/);
 assert.match(stocktake,/expectedVersion:cell\.version/);
 assert.match(stocktake,/const resolved=stocktakeAggregateLines\(lines,cells\)/);
 assert.match(grouped,/className="cy-ordering-grid cy-stocktake-grouped-table"/);
 assert.match(grouped,/onBlur=\{\(\)=>onSave\(r\.cell\)\}/);
 assert.match(grouped,/data-stocktake-qty type="text"/);
});

test("one item mobile card contains a location selector and batch count rows without redundant headers",()=>{
 assert.match(grouped,/className="cy-stocktake-item-card"/);
 assert.match(grouped,/data-progress=\{locked\?"done":state\}/);
 assert.match(grouped,/className="cy-stocktake-location-heading"/);
 assert.match(grouped,/>選擇儲位<\/strong>/);
 assert.match(grouped,/onRename\(group\.code,selected\.warehouse,selected\.location\)/);
 assert.match(grouped,/className="cy-stocktake-location-switch"/);
 assert.match(grouped,/className="cy-stocktake-batch-rows"/);
 assert.match(grouped,/批號 \{r\.line\.batch\|\|"無"\}/);
 assert.match(grouped,/onAddBatch\(group\.code,selected\.warehouse,selected\.location\)/);
 assert.doesNotMatch(grouped,/批號\s*\/\s*初盤數量/);
 assert.doesNotMatch(grouped,/儲位 1324\/修改儲位/);
 assert.match(css,/\.cy-stocktake-item-card\[data-progress="partial"\]\{border-color:var\(--cy-warning\)\}/);
 assert.match(css,/\.cy-stocktake-item-card\[data-progress="done"\]\{border-color:var\(--cy-success\)\}/);
 assert.match(css,/height:48px;min-height:48px;font-size:16px/);
});

test("stocktake adds and edits selected WEB locations while preserving ERP manual follow-up",()=>{
 assert.match(stocktake,/setRenameForm\(\{itemCode,warehouseName,fromLocation,toLocation:""\}\)/);
 assert.match(stocktake,/\/manual-locations/);
 assert.match(stocktake,/ERP 儲位待手動修改/);
 assert.match(stocktake,/只修改 WEB|僅修改 WEB/);
 assert.match(grouped,/className="cy-stocktake-cell-editor"/);
 assert.match(grouped,/r\.cell\[phase\]/);
 assert.match(grouped,/qtySum\(selected\.rows,locked\?"firstQty":phase\)/);
 assert.match(grouped,/progress\.done===progress\.total\?"done":"partial"/);
});

test("old global location dropdown remains absent; search and ALL filter stay inline",()=>{
 assert.doesNotMatch(stocktake,/cy-stocktake-location-filter|setLocation\(/);
 assert.doesNotMatch(css,/cy-stocktake-location-filter/);
 assert.match(stocktake,/searchLabel="搜尋儲位、品號、品名、批號"/);
 assert.match(css,/\.cy-stocktake-main \.cy-data-toolbar-primary\{display:flex;flex-direction:row;align-items:center/);
 assert.match(css,/\.cy-stocktake-main \.cy-data-filters\{display:flex;flex:0 0 106px;flex-direction:row/);
});
