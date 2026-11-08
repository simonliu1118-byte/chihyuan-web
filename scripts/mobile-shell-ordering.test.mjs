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
test("phone ordering has actual saved draft listing with clear entry points",()=>{
 assert.match(ordering,/mobileListMode/);
 assert.match(ordering,/\/orders\?status=DRAFT/);
 assert.match(ordering,/pane.pane!=="list"\|\|mobileListMode!=="drafts"/);
 assert.match(ordering,/aria-label="手機叫貨功能"/);
 assert.match(ordering,/>草稿<\/button>/);
 assert.match(ordering,/>叫貨紀錄<\/button>/);
 assert.match(ordering,/搜尋叫貨草稿/);
 assert.match(ordering,/void reloadOrder\(d.id\)/);
 assert.match(ordering,/void chooseNewSource\(\)/);
});
test("draft navigation and back use the existing unsaved guard",()=>{
 assert.match(ordering,/async function showMobileList\(mode:"drafts"\|"history"\)\{\s*if\(!await prepareSwitch\(\)\)return/);
 assert.match(ordering,/async function backToMobileList\(\)\{\s*if\(!await prepareSwitch\(\)\)return/);
 assert.match(ordering,/async function chooseNewSource\(\)\{\s*if\(!await prepareSwitch\(\)\)return/);
 assert.match(ordering,/async function openDraft\(sourceId:number\)/);
 assert.match(ordering,/useUnsavedChangesGuard/);
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
