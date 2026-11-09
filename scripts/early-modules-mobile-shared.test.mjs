import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync as read} from "node:fs";
const modules=[
 ["DefectOperationalPage.tsx","瑕疵"],
 ["SalesOrderOperationalPage.tsx","工單"],
 ["OutsourcingOperationalPage.tsx","代工單"],
 ["WorkLogOperationalPage.tsx","工作日誌"],
].map(([name,label])=>({code:read("src/runtime/modules/"+name,"utf8"),label}));
test("early modules share phone list, filter, actions and retain desktop list",()=>{
 for(const {code,label} of modules){
  assert.match(code,/const compact = useCompactLayout\(\)/,label);
  assert.match(code,/<DataViewToolbar searchValue=\{/,label);
  assert.match(code,/<ListRow key=\{row\.id\}/,label);
  assert.match(code,/<ActionBar/,label);
  assert.match(code,/<OverflowMenu items=/,label);
  assert.match(code,/cy-md-toolbar/,label);
  assert.match(code,/cy-op-list-row cy-status-row/,label);
 }
});
test("Outsourcing ModuleSections uses the same guarded tab switch as desktop",()=>{
 const code=modules[2].code;
 assert.match(code,/<ModuleSections label="委外代工功能"/);
 assert.match(code,/async function switchTab\(value:Tab\)/);
 assert.match(code,/editing&&\!\(await discardEditing\(\)\)/);
 assert.match(code,/masterEditing&&\!\(await confirm\(/);
 assert.match(code,/onChange=\{value=>void switchTab\(value\)\}/);
 assert.match(code,/onClick=\{\(\)=>void switchTab\(value\)\}/);
});
test("responsive data tables and shared narrow-row styles do not replace original handlers",()=>{
 assert.match(modules[1].code,/cy-op-table cy-rt/);
 assert.match(modules[2].code,/cy-op-table cy-rt/);
 assert.match(modules[3].code,/track\("submit",submit\(\)\)/);
 const shared=read("src/ui/mobile/mobile.css","utf8");
 assert.match(shared,/\.cy-mobile-form-two-col\{/);
 assert.match(shared,/\.cy-mobile-form-stack\{/);
 for(const file of ["sales-order-operational.css","outsourcing-operational.css","worklog-operational.css"]){
  const code=read("src/runtime/modules/"+file,"utf8");
  assert.doesNotMatch(code,/@media \(max-width: (560|720)px\)/);
 }
});
