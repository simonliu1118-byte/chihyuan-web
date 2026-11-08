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
test("phone ordering opens sent list first and routes pending directly, while drafts select sources",()=>{
 assert.match(ordering,/useState<"drafts"\|"history">\("history"\)/);
 assert.match(ordering,/listQuery=useRef\("history=1"\)/);
 assert.match(ordering,/aria-label="手機叫貨功能"/);
 assert.ok(ordering.indexOf('>叫貨清單</button>')<ordering.indexOf('>未到貨 {pending.length}</button>'));
 assert.ok(ordering.indexOf('>未到貨 {pending.length}</button>')<ordering.indexOf('>草稿</button>'));
 assert.match(ordering,/mobileGeneralSources=active\.filter/);
 assert.match(ordering,/mobileVendors=orderedVendors\.filter/);
 assert.match(ordering,/onClick=\{\(\)=>void selectSource\(item\)\}/);
 assert.match(ordering,/onClick=\{\(\)=>void chooseVendor\(item\.id\)\}/);
 assert.match(ordering,/搜尋叫貨來源或廠商/);
 assert.doesNotMatch(ordering,/\/orders\?status=DRAFT/);
 assert.match(ordering,/!compact\?<div className="cy-ordering-tabbar">/);
 assert.match(css,/\.cy-ordering-page \.cy-ordering-vendor-picker\{display:none\}/);
});
test("phone history filters collapse without changing desktop filter owners",()=>{
 assert.match(ordering,/cy-ordering-history-advanced" hidden=\{compact&&!mobileHistoryFiltersOpen\}/);
 assert.match(ordering,/aria-expanded=\{mobileHistoryFiltersOpen\}/);
 assert.match(ordering,/<OpenOnlyToggle value=\{openOnly\}/);
 assert.match(ordering,/<StatusFilter label="叫貨狀態"/);
 assert.match(ordering,/<OrderingSourcePicker sources=\{sources\}/);
 assert.match(ordering,/aria-label="起日"/);
 assert.match(ordering,/aria-label="迄日"/);
 assert.match(css,/\.cy-ordering-page \.cy-ordering-history-advanced\{display:contents\}/);
 assert.match(css,/\.cy-ordering-page \.cy-ordering-history-advanced\[hidden\]\{display:none\}/);
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
test("ordering keeps one grid renderer; phone labels allow readable cards",()=>{
 assert.match(grid,/data-label=\{title\} data-col=\{field\}/);
 assert.match(grid,/data-label="項次" data-col="index"/);
 assert.match(ordering,/data-label="品號"/);
 assert.match(ordering,/data-label="剩餘"/);
 assert.match(css,/\.cy-ordering-page \.cy-ordering-grid tbody tr\{display:grid/);
 assert.match(css,/\.cy-ordering-page \.cy-ordering-pending-table tr\{display:grid/);
 assert.match(css,/\.cy-ordering-page \.cy-ordering-grid \.cy-ordering-cell\{height:44px/);
});

test("mobile drawer brand replaces redundant title and BOT has a dedicated icon",()=>{
 const shell=read("src/ui/shell/AppShell.tsx","utf8");
 assert.match(shell,/cy-shell-nav-close" aria-label="關閉模組選單"/);
 assert.match(shell,/className="cy-shell-navigation-drawer" hideHeader showCloseButton=\{false\}/);
 assert.match(shell,/"bot-center": \[/);
 assert.match(shellCss,/\.cy-shell-navigation-drawer\.cy-dialog-plain \.cy-dialog-body/);
});
test("phone history tools occupy a single row without changing their owners",()=>{
 assert.match(css,/\.cy-ordering-page \.cy-md-toolbar-lead\{display:grid;grid-template-columns:minmax\(0,1fr\) auto auto;/);
 assert.match(css,/\.cy-ordering-page \.cy-md-toolbar-lead>:first-child\{grid-column:3;grid-row:1;/);
 assert.match(css,/\.cy-ordering-page \.cy-md-toolbar-lead>\.cy-op-input\{grid-column:1;grid-row:1;/);
 assert.match(css,/\.cy-ordering-page \.cy-ordering-filter-toggle\{grid-column:2;grid-row:1;/);
 assert.match(ordering,/<OpenOnlyToggle value=\{openOnly\}/);
});
test("phone pending item is two lines with all original actions",()=>{
 assert.match(css,/cy-ordering-pending-table tr\{display:grid;grid-template-columns:minmax\(0,1fr\) auto;grid-template-rows:auto auto;/);
 assert.match(css,/cy-ordering-pending-table td:nth-child\(1\)\{grid-column:1\/-1;grid-row:1;/);
 assert.match(css,/cy-ordering-pending-table td:nth-child\(3\)\{grid-column:1;grid-row:2;/);
 assert.match(css,/cy-ordering-pending-table td:last-child\{grid-column:2;grid-row:2;/);
 assert.match(ordering,/cy-ordering-pending-mobile-name/);
 assert.match(ordering,/cy-ordering-pending-mobile-summary/);
 assert.match(ordering,/setReceipt\(\{id:l\.orderId/);
 assert.match(ordering,/setClosing\(\{id:l\.lineId/);
});
test("phone draft rows are dense while keeping the previous source and vendor order",()=>{
 assert.match(ordering,/mobileGeneralSources=active\.filter/);
 assert.match(ordering,/mobileVendors=orderedVendors\.filter/);
 assert.match(css,/\.cy-ordering-mobile-draft-list\{display:grid;gap:0\}/);
 assert.match(css,/\.cy-ordering-mobile-draft-row\+\.cy-ordering-mobile-draft-row\{border-top:1px solid var\(--cy-border\)\}/);
 assert.match(css,/\.cy-ordering-mobile-draft-row\{display:grid;grid-template-columns:minmax\(0,1fr\) auto;/);
 assert.match(ordering,/VendorDots status=\{vendorStatus\.get\(item\.id\)\}/);
});
