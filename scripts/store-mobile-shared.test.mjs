import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const order=readFileSync("src/runtime/modules/StoreCustomerOrders.tsx","utf8");
const repairs=readFileSync("src/runtime/modules/StoreRepairs.tsx","utf8");
const equipment=readFileSync("src/runtime/modules/StoreEquipment.tsx","utf8");
const inventory=readFileSync("src/runtime/modules/StoreStocktake.tsx","utf8");
const css=readFileSync("src/runtime/modules/store.css","utf8");

test("store workflow and repair tables use the existing responsive-table owner",()=>{
 assert.match(order,/cy-rt cy-store-workflow-table/);
 assert.match(order,/cy-rt cy-store-blacklist-table/);
 assert.match(repairs,/cy-rt cy-store-workflow-table cy-repair-list/);
 assert.match(equipment,/cy-rt cy-store-workflow-table cy-equipment-list/);
 assert.match(order,/data-label="客戶姓名" data-priority="title"/);
 assert.match(repairs,/data-label="客戶編號\/姓名" data-priority="title"/);
 assert.match(order,/data-label="處理狀態" data-priority="title"/);
 assert.match(repairs,/data-label="處理狀態" data-priority="title"/);
});
test("stocktake administrative tables use cy-rt without changing count mutations",()=>{
 assert.match(inventory,/cy-rt cy-stocktake-ignored-table/);
 assert.match(inventory,/cy-rt cy-stocktake-manual-table/);
 assert.match(inventory,/data-label="狀態與操作" data-priority="wide"/);
 assert.match(inventory,/verifyManual\(row,!row.verifiedAt\)/);
});
test("only replaced mobile card styles are gone, desktop table budget remains",()=>{
 assert.doesNotMatch(css,/\.cy-store-cards tbody/);
 assert.doesNotMatch(css,/\.cy-store-workflow-table tbody>tr\{display:grid/);
 assert.match(css,/\.cy-ordering-grid\.cy-store-workflow-table\{min-width:1340px/);
 assert.match(css,/\.cy-store-date-popover\{position:relative/);
});
