import test from 'node:test';import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {compiled,plugin} from './test-support/hr-ui-fixture.mjs';
const read=p=>readFileSync(p,'utf8');
const {shiftMonthValue}=await compiled('src/ui/forms/MonthPicker.tsx',[plugin]);
test('month stepping crosses year ends and ignores malformed values',()=>{
 assert.equal(shiftMonthValue('2026-11',1),'2026-12');assert.equal(shiftMonthValue('2026-12',1),'2027-01');
 assert.equal(shiftMonthValue('2026-01',-1),'2025-12');assert.equal(shiftMonthValue('2026-03',-14),'2025-01');
 assert.equal(shiftMonthValue('bad',1),'bad');
});
test('month picker is mouse and touch only: no typing, no shortcut keys, bounded and disabled months',()=>{
 const source=read('src/ui/forms/MonthPicker.tsx');
 assert.doesNotMatch(source,/<input|ArrowUp|ArrowDown|ctrlKey|type="month"/);
 assert.match(source,/event\.key !== "Escape"/);assert.match(source,/pointerdown/);
 assert.match(source,/disabled=\{blocked\(target\)\}/);assert.match(source,/aria-pressed=\{target === value\}/);
});
test('the month pages share the picker and keep their own guards',()=>{
 for(const [file,guard] of [['HrRosterPanel','discard()'],['HrAttendancePanel','discard()'],['HrPayrollMonthly','navigation.canLeave()'],['HrEmployerSupplement','']]){
  const source=read(`src/runtime/modules/${file}.tsx`);
  assert.match(source,/<MonthPicker /,file);assert.ok(source.includes(guard),file+' keeps its unsaved-change guard');assert.doesNotMatch(source,/上個月|下個月/,file);
 }
 const profile=read('src/runtime/modules/MyProfilePage.tsx');
 assert.match(profile,/<MonthPicker value=\{month\} min=\{since\.slice\(0,7\)\} max=\{today\.slice\(0,7\)\}/);
});
test('every module settings entry is the shared icon-only gear named 「<模組>設定」',()=>{
 const gear=read('src/ui/shell/ModuleSettingsGear.tsx');
 assert.match(gear,/`\$\{moduleLabel\}設定`/);assert.match(gear,/aria-label=\{label\} title=\{label\}/);assert.match(gear,/cy-shell-gear/);
 assert.match(read('src/runtime/modules/HrSettingsButton.tsx'),/<ModuleSettingsGear moduleLabel="人事"/);
 assert.match(read('src/runtime/modules/ModuleSettingsPanel.tsx'),/<ModuleSettingsGear moduleLabel=\{label\}/);
 const css=read('src/app.css');
 assert.match(css,/\.cy-shell-gear \{[^}]*border: 0;[^}]*background: transparent/);
});
test('shell: desktop puts tools after the title, phone puts them in the right cluster before the bell; no drawer or swipe',()=>{
 const shell=read('src/ui/shell/AppShell.tsx');
 assert.match(shell,/!compact && pageTools \? <div className="cy-shell-page-tools">/);
 assert.match(shell,/<div className="cy-shell-topbar-end">\{compact \? pageTools : null\}\{notifications\}\{appearance\}\{account\}<\/div>/);
 assert.doesNotMatch(shell,/Drawer|touchstart|cy-shell-menu-toggle/);
 const app=read('src/App.tsx');
 assert.match(app,/appearance=\{compact \? undefined : <ThemeSwitch \/>\}/);
 assert.match(app,/appearance=\{compact \? <ThemeToggle iconOnly direct \/> : undefined\}/);
 const account=read('src/ui/shell/AccountMenu.tsx');assert.match(account,/cy-account-appearance/);
 const css=read('src/app.css');
 assert.match(css,/\.cy-account-popover \{ width: max-content; min-width: 200px; max-width: 220px; \}/);
 assert.match(css,/\.cy-account-popover > button \{ min-height: 44px;/);
 assert.match(css,/\.cy-account-appearance \.cy-theme-toggle \{ width: 44px; height: 44px;/);
});
test('dialog widths follow the V0.27.0 rule: small 400, medium 560 (default), large 860',()=>{
 const css=read('src/ui/overlays/overlay.css');
 assert.match(css,/\.cy-dialog-surface \{[^}]*width: min\(560px/);
 assert.match(css,/\.cy-dialog-small > \.cy-dialog-surface \{\s*width: min\(400px/);
 assert.match(css,/\.cy-dialog-large > \.cy-dialog-surface \{\s*width: min\(860px/);
});
test('人事設定 has the category list, single-table panes and editor dialogs, no inline editable rows',()=>{
 const button=read('src/runtime/modules/HrSettingsButton.tsx');
 for(const label of ['門市','職稱','班別','國定假日','假別','津貼項目','最低工資','法定級距','出勤更正授權'])assert.ok(button.includes(`label:"${label}"`),label);
 for(const group of ['組織','排班','請假','薪資','權限'])assert.ok(button.includes(`label:"${group}"`),group);
 assert.match(button,/data-pane=/);assert.match(button,/設定分類/);
 const pane=read('src/runtime/modules/HrSettingsPane.tsx');assert.match(pane,/<Dialog open title=\{title\} size=\{size\}/);
 for(const file of ['HrPhase2aSettings','HrLeaveTypeSettings','HrPayrollSettings'])assert.doesNotMatch(read(`src/runtime/modules/${file}.tsx`),/cy-sheet-input|EntryTable/,file);
 // The 修改／儲存 swap that submitted on click (#548) must not return: each button has its own key and type.
 const lookups=read('src/runtime/modules/HrPhase2aSettings.tsx');
 assert.match(lookups,/<button key="edit" type="button"/);assert.match(read('src/runtime/modules/HrSettingsPane.tsx'),/<button key="save" type="submit"/);
});
test('HR list rows are one line in both lists and the store shows as an outlined tag',()=>{
 const hr=read('src/runtime/modules/HrOperationalPage.tsx'),customer=read('src/runtime/modules/CustomerOperationalPage.tsx');
 assert.match(hr,/<ResultRow key=\{row\.id\} no=\{row\.employee_no\} name=\{row\.name\} tag=/);
 assert.match(customer,/<ResultRow key=\{customer\.id\} no=/);
 assert.doesNotMatch(read('src/runtime/modules/customer-operational.css'),/cy-customer-result-row/);
 const css=read('src/ui/data/result-row.css');assert.match(css,/\.cy-outline-tag \{[^}]*border-radius: 4px;[^}]*background: transparent/);
 assert.match(css,/text-overflow: ellipsis/);
 // The filled rounded pill stays the status; sort order is unchanged (ORDER BY e.id).
 assert.match(read('worker/hr/hr-service.ts'),/ORDER BY e\.id LIMIT \?/);
});
