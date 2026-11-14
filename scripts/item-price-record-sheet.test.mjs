import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync as read} from "node:fs";
const sheet=read("src/runtime/modules/item/ItemSheet.tsx","utf8");
const main=read("src/runtime/modules/ItemOperationalPage.tsx","utf8");
const worker=read("worker/item/item-persistence.ts","utf8");
const route=read("src/App.tsx","utf8");
const backup=read("worker/backup/portable-backup.ts","utf8");
test("item create, edit and detail share one RecordSheet owner",()=>{
 assert.match(sheet,/<RecordSheet label="商品資料" editing=\{editing\} rows=\{fields\}/);
 assert.match(main,/<ItemSheet editing creating=/);
 assert.match(main,/<ItemSheet editing=\{false\}/);
 assert.match(sheet,/minmax\(0,1\.35fr\) minmax\(0,1\.35fr\)/);
 assert.match(sheet, /label:"批發價"/);
 assert.match(sheet, /label:"網路價"/);
 assert.match(sheet, /<InlineGridField label="網路價"/);
});
test("item price writes stay in revision guarded mutation batches and audit each field",()=>{
 assert.match(worker,/updatePriceStatements\(this.db,itemId,input\)/);
 assert.match(worker,/action:"item.price.changed"/);
 assert.match(worker,/revision = \?/);
 assert.match(worker,/wholesalePrices/);
 assert.match(worker,/onlinePrices/);
});
test("defect grants and old deep links survive item sidebar consolidation",()=>{
 assert.doesNotMatch(route, /key: "defects", label: "瑕疵", href: "#defects"/);
 assert.match(route,/route === "items" \|\| route === "defects"/);
 assert.match(backup,/CURRENT_MIGRATION = "0069_item_cost_tax_modes"/);
});
