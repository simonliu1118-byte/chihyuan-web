import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
const root=new URL("../",import.meta.url);
const source=readFileSync(new URL("../src/runtime/modules/change-log-labels.ts",import.meta.url),"utf8");
// Several labels share a line in the map, so match every quoted key, not only the first per line.
const vocabulary=new Set([...source.matchAll(/"([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)+)"\s*:/g)].map(m=>m[1]));
const actions=new Set();
function walk(relative){
 for(const item of readdirSync(new URL(relative,root),{withFileTypes:true})){
  const path=join(relative,item.name);
  if(item.isDirectory()){if(!path.includes("acceptance"))walk(path);continue;}
  if(!item.name.endsWith(".ts"))continue;
  const text=readFileSync(new URL(path.replaceAll("\\","/"),root),"utf8");
  for(const m of text.matchAll(/\baction\s*:\s*["']([a-z][a-z0-9_]+(?:\.[a-z0-9_]+)+)["']/g))actions.add(m[1]);
 }
}
walk("worker");
const variableActions=[
 "sales_work_order.erp.filled","sales_work_order.erp.corrected",
 "sales_work_order.waiting_stock","sales_work_order.picked","sales_work_order.shipped",
 "sales_work_order.voided","work_log.review.submitted","work_log.review.withdrawn",
 "defect.reopened","defect.resolved",
];
test("all worker audit action literals and dynamic action choices have Chinese labels",()=>{
 const missing=[...new Set([...actions,...variableActions])].filter(code=>!vocabulary.has(code));
 assert.deepEqual(missing,[], "未翻譯 Audit 動作："+missing.join(", "));
});
test("admin/customer shared list is human readable, not raw audit columns",()=>{
 const text=readFileSync(new URL("../src/runtime/modules/AuditOperationalPage.tsx",import.meta.url),"utf8");
 assert.match(text,/auditSentence\(item,\s*lookups\)/);
 assert.match(text,/role==="SUPER_ADMIN"/);
 assert.match(text,/<ChangeLogList role=\{role\}/);
});

test("ERP query display is server-gated and every Audit row is a single-line sentence",()=>{
 const query=readFileSync(new URL("../worker/audit/audit-service.ts",import.meta.url),"utf8");
 const route=readFileSync(new URL("../worker/http/settings-audit-routes.ts",import.meta.url),"utf8");
 const page=readFileSync(new URL("../src/runtime/modules/AuditOperationalPage.tsx",import.meta.url),"utf8");
 const styles=readFileSync(new URL("../src/app.css",import.meta.url),"utf8");
 assert.match(query,/ae\.entity_type <> 'erp_item_query'/);
 assert.match(query,/ae\.action <> 'erp_item_query\.created'/);
 assert.match(route,/role === "SUPER_ADMIN" && query\.includeErpQueries/);
 // V0.10.10: ERP rows are a module choice only Super Admin gets; one table line per change, oldest first.
 assert.match(page,/role==="SUPER_ADMIN"\?moduleOptions:moduleOptions\.filter/);
 assert.match(page,/includeErpQueries:value===ERP_MODULES/);
 assert.match(page,/formatDateTime\(item\.occurredAt\)/);
 assert.match(page,/\[\.\.\.events\]\.reverse\(\)/);
 assert.match(page,/<ExpandToggle /);
 assert.match(styles,/\.cy-change-log-sub \.cy-sheet-value\{padding:1px 8px;font-size:var\(--cy-fs-xs\)/);
 assert.doesNotMatch(source,/entityLabel\(event\.entityType\) \+ " #"/);
});
