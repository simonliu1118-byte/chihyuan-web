import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync as read} from "node:fs";
const app=read("src/App.tsx","utf8"),theme=read("src/ui/foundation/ThemeToggle.tsx","utf8"),
 status=read("src/runtime/modules/ErpAgentCredentialControl.tsx","utf8"),
 erp=read("src/runtime/modules/ErpItemQueryPage.tsx","utf8"),
 ordering=read("src/runtime/modules/OrderingPage.tsx","utf8"),
 grid=read("src/ui/OrderingGrid.tsx","utf8"),
 css=read("src/runtime/modules/erp-item-query.css","utf8"),
 overlay=read("src/ui/overlays/overlay.css","utf8"),shellCss=read("src/app.css","utf8");

test("mobile sun/moon theme uses effective mode; desktop still three choices",()=>{
 assert.match(app,/ThemeToggle iconOnly direct/);
 assert.match(theme,/effectiveDark \? "light" : "dark"/);
 assert.match(theme,/current === "system" && prefersDark/);
 assert.match(theme,/function ThemeSwitch\(/);
 assert.match(shellCss,/\.cy-shell-topbar-end \.cy-theme-toggle \{[^}]*border: 0;/);
});
test("navigation Drawer only narrows its own surface",()=>{
 assert.match(overlay,/cy-shell-navigation-drawer \.cy-dialog-surface \{ width: min\(264px,calc\(100vw - 72px\)\)/);
 assert.match(overlay,/\.cy-dialog-drawer \.cy-dialog-surface \{\s*width: min\(560px, 92vw\)/);
});
test("ERP phone state is a pill and its existing control Dialog remains",()=>{
 assert.match(status,/compact \? compactLabel : connected/);
 assert.match(status,/cy-erp-agent-trigger/);
 assert.match(status,/onClick=\{\(\) => setOpen\(true\)\}/);
 assert.match(css,/\.cy-erp-agent-trigger\.cy-op-button\.compact\{/);
});
test("ERP category tabs are shared with desktop and preserve mounted panels",()=>{
 assert.equal((erp.match(/role="tablist"/g)||[]).length,1);
 assert.match(erp,/role="tabpanel"/);
 assert.match(erp,/hidden=\{category !== key\}/);
 assert.match(erp,/ERP_OPEN_CATEGORY_EVENT/);
 assert.doesNotMatch(erp,/<select className="cy-op-input cy-erp-category"/);
 assert.match(css,/overflow-x:auto;overscroll-behavior-x:contain;touch-action:pan-x/);
});
test("phone ordering uses shared bottom sections, pending first, and the original source owners",()=>{
 assert.match(ordering,/useEffect\(\(\)=>\{if\(compact\)void showPending\(\)\}/);
 assert.match(ordering,/listQuery=useRef\("history=1"\)/);
 assert.match(ordering,/<ModuleSections label="手機叫貨功能"/);
 assert.match(ordering,/\{key:"pending",label:"未到貨"/);
 assert.match(ordering,/\{key:"drafts",label:"草稿"/);
 assert.match(ordering,/\{key:"history",label:"叫貨單"/);
 assert.match(ordering,/mobileGeneralSources=active\.filter/);
 assert.match(ordering,/mobileVendors=orderedVendors\.filter/);
 assert.match(ordering,/onClick=\{\(\)=>void selectSource\(item\)\}/);
 assert.match(ordering,/onClick=\{\(\)=>void chooseVendor\(item\.id\)\}/);
 assert.doesNotMatch(ordering,/\/orders\?status=DRAFT/);
 assert.match(ordering,/!compact\?<div className="cy-ordering-tabbar">/);
});

test("phone filters are shared DataViewToolbar controls, desktop remains unchanged",()=>{
 assert.match(ordering,/<DataViewToolbar searchValue=\{search\}/);
 assert.match(ordering,/filters=\{historyFilterControls\}/);
 assert.match(ordering,/activeFilterCount=\{\[openOnly,status,sourceFilter,from,to\]/);
 assert.match(ordering,/<StatusFilter label="叫貨狀態"/);
 assert.match(ordering,/<OrderingSourcePicker sources=\{sources\}/);
 assert.match(ordering,/aria-label="起日"/);
 assert.match(ordering,/aria-label="迄日"/);
 assert.match(ordering,/className="cy-ordering-history-advanced"\>\{historyFilterControls\}/);
});

test("all mobile destinations retain original page authority and unsaved guard",()=>{
 assert.match(ordering,/async function showMobileList\(mode:"drafts"\|"history"\)\{\s*if\(!await prepareSwitch\(\)\)return/);
 assert.match(ordering,/async function backToMobileList\(\)\{\s*if\(!await prepareSwitch\(\)\)return/);
 assert.match(ordering,/async function openDraft\(sourceId:number\)\{\s*if\(!await prepareSwitch\(\)\)return/);
 assert.match(ordering,/async function showPending\(\)\{if\(!await prepareSwitch\(\)\)return/);
 assert.match(ordering,/pendingOrders\(pending\)\.map/);
 assert.match(ordering,/useUnsavedChangesGuard/);
 assert.match(ordering,/<OrderingGrid kind=\{current.sourceKind\}/);
});
test("one OrderingGrid owner renders phone ListRow editor sheet and desktop table",()=>{
 assert.match(grid,/const compact=useCompactLayout\(\)/);
 assert.match(grid,/editor\.current\.openNew=/);
 assert.match(grid,/<ListRow key=\{mobileKey\(row\)\}/);
 assert.match(grid,/<BottomSheet open title=/);
 assert.match(grid,/void editor\.current\.flush\(\)/);
 assert.match(grid,/data-label=\{title\} data-col=\{field\}/);
 assert.match(grid,/data-label="項次" data-col="index"/);
 assert.match(ordering,/<table className="cy-op-table cy-rt cy-ordering-pending-table"/);
 assert.match(ordering,/<table className="cy-op-table cy-rt cy-ordering-receipts"/);
});

test("mobile drawer brand replaces redundant title and BOT has a dedicated icon",()=>{
 const shell=read("src/ui/shell/AppShell.tsx","utf8");
 assert.match(shell,/cy-shell-nav-close" aria-label="關閉模組選單"/);
 assert.match(shell,/className="cy-shell-navigation-drawer" hideHeader showCloseButton=\{false\}/);
 assert.match(shell,/"bot-center": \[/);
 assert.match(shellCss,/\.cy-shell-navigation-drawer\.cy-dialog-plain \.cy-dialog-body/);
});
test("ordering toolbar routes history filtering through DataViewToolbar and keeps the same filter state",()=>{
 assert.match(ordering,/searchValue=\{search\} onSearchChange=\{setSearch\}/);
 assert.match(ordering,/beforeSearch=\{<OpenOnlyToggle value=\{openOnly\}/);
 assert.match(ordering,/activeFilterCount=\{\[openOnly,status,sourceFilter,from,to\]/);
 assert.match(ordering,/\{compact\?<DataViewToolbar/);
 assert.match(ordering,/<div className="cy-md-toolbar-lead">/);
});

test("pending rows reuse responsive-table presentation with original receipt and closing mutations",()=>{
 assert.match(ordering,/cy-rt cy-ordering-pending-table/);
 assert.match(ordering,/data-label="品名" data-priority="title"/);
 assert.match(ordering,/setReceipt\(\{id:l\.orderId/);
 assert.match(ordering,/setClosing\(\{id:l\.lineId/);
 assert.doesNotMatch(css,/cy-ordering-pending-table tr\{display:grid/);
});

test("phone drafts use shared ListRow, retaining the ordered source and vendor lists",()=>{
 assert.match(ordering,/mobileGeneralSources=active\.filter/);
 assert.match(ordering,/mobileVendors=orderedVendors\.filter/);
 assert.match(ordering,/mobileGeneralSources\.map\(item=><ListRow/);
 assert.match(ordering,/mobileVendors\.map\(item=><ListRow/);
 assert.match(ordering,/VendorDots status=\{vendorStatus\.get\(item\.id\)\}/);
 assert.doesNotMatch(css,/cy-ordering-mobile-draft-row\{/);
});
