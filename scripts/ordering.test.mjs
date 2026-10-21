import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {build} from "esbuild";
import "./ordering-grid.test.mjs";
const compiled=await build({entryPoints:["shared/ordering.ts","shared/ordering-export.ts","shared/xlsx-writer.ts"],bundle:true,format:"esm",platform:"node",outdir:"out",write:false});
const modules=await Promise.all(compiled.outputFiles.map(async f=>import("data:text/javascript;base64,"+Buffer.from(f.text).toString("base64"))));
const logic=modules.find(m=>m.parseQuantity),excel=modules.find(m=>m.orderSheet),zip=modules.find(m=>m.buildXlsx);
const {parseQuantity,parseErpPurchaseNo,pickDraft,lineState,orderStatus,vendorItemKey,exportFileName}=logic;
test("quantity splitting and uncounted warning",{concurrency:false},()=>{
 assert.deepEqual(parseQuantity("1箱"),{text:"1",quantity:1,unit:"箱"});
 assert.deepEqual(parseQuantity("2.5 包"),{text:"2.5",quantity:2.5,unit:"包"});
 assert.equal(parseQuantity("各1").quantity,null);
 assert.equal(parseQuantity("1,000").quantity,1000);
});
test("Taipei display converts UTC timestamps and midnight boundary",()=>{
 assert.deepEqual(logic.orderingTaipeiDateTime("2026-10-21T08:28:00Z"),{date:"2026/10/21",time:"16:28"});
 assert.deepEqual(logic.orderingTaipeiDateTime("2026-10-20T16:30:00Z"),{date:"2026/10/21",time:"00:30"});
 assert.deepEqual(logic.orderingTaipeiDateTime("2026-10-22"),{date:"2026/10/22",time:""});
});
test("serial queue preserves three 300ms edits and resumes after a rejected write",async()=>{
 const queue=logic.createOrderingWriteQueue(),events=[];
 let version=1,active=0,maxActive=0;
 const jobs=[1,2,3].map(number=>queue.enqueue("order:1",async()=>{
   active++;maxActive=Math.max(maxActive,active);
   const expected=version;
   await new Promise(resolve=>setTimeout(resolve,300));
   assert.equal(version,expected,"a queued request must use the latest serial version");
   events.push(number);version++;active--;
 }));
 await Promise.all(jobs);
 assert.deepEqual(events,[1,2,3]);assert.equal(version,4);assert.equal(maxActive,1);
 await assert.rejects(queue.enqueue("order:1",async()=>{throw Error("simulated 409")}),/409/);
 await queue.enqueue("order:1",async()=>{events.push(4);version++});
 assert.deepEqual(events,[1,2,3,4]);assert.equal(version,5);
});
test("purchase number validates full date",()=>{
 assert.equal(parseErpPurchaseNo("20261019001"),"341A-20261019001");
 assert.equal(parseErpPurchaseNo("341A-20260229001"),null);
 assert.equal(parseErpPurchaseNo("20261231002"),"341A-20261231002");
 assert.equal(parseErpPurchaseNo("2026101"),null);
});
test("nearest draft, tie prefers earlier, no-date latest",()=>{
 const drafts=[{id:1,plannedSendDate:"2026-10-22",createdAt:"2026-10-01"},{id:2,plannedSendDate:"2026-10-29",createdAt:"2026-10-02"}];
 assert.equal(pickDraft(drafts,"2026-10-21").id,1);
 assert.equal(pickDraft([{...drafts[0],plannedSendDate:"2026-10-19"},drafts[1]],"2026-10-21").id,1);
 assert.equal(pickDraft([{...drafts[0],plannedSendDate:"2026-10-20"},{...drafts[1],plannedSendDate:"2026-10-22"}],"2026-10-21").id,1);
 assert.equal(pickDraft([{...drafts[0],plannedSendDate:null},{...drafts[1],plannedSendDate:null}],"2026-10-21").id,2);
 assert.equal(pickDraft([{...drafts[0],plannedSendDate:null},drafts[1]],"2026-10-21").id,2);
});
test("line and order states",()=>{
 const open={quantity:5,received:0,closedAs:null},partial={...open,received:3};
 assert.equal(lineState(open),"OPEN");assert.equal(lineState(partial),"PARTIAL");
 assert.equal(lineState({...open,received:5}),"RECEIVED");
 assert.equal(lineState({...open,closedAs:"SHORTAGE"}),"CLOSED");
 assert.equal(lineState({...open,quantity:null}),"UNCOUNTED");
 assert.equal(orderStatus("DRAFT",[partial]),"DRAFT");
 assert.equal(orderStatus("SENT",[open]),"SENT");
 assert.equal(orderStatus("SENT",[partial]),"PARTIAL");
 assert.equal(orderStatus("SENT",[partial,{...open,closedAs:"SHORTAGE"}]),"PARTIAL");
 assert.equal(orderStatus("SENT",[{...open,received:5},{...open,closedAs:"CANCELLED"}]),"CLOSED");
});
test("vendor memory keyed by code else name",()=>{
 assert.deepEqual(vendorItemKey("P-01","測試品名甲"),{type:"CODE",key:"P-01"});
 assert.deepEqual(vendorItemKey("","測試品名甲"),{type:"NAME",key:"測試品名甲"});
 assert.equal(exportFileName("台中","2026-10-21"),"台中20261021.xlsx");
});
const line={section:"",itemCode:"M1",itemName:"測試品名甲",vendorItemCode:"V1",vendorItemName:"廠商品名甲",spec:"規格一",quantityText:"2",quantity:2,unit:"箱",note:"測試備註"};
test("Excel columns match each source and zip contains valid worksheet XML",()=>{
 const general=excel.orderSheet({sourceName:"台中",sourceKind:"GENERAL",date:"2026-10-21",note:"",lines:[line]});
 assert.deepEqual(general.rows[1],["項次","廠商品號","廠商品名","數量","單位","備註"]);
 assert.deepEqual(general.rows[2],[1,"V1","廠商品名甲",2,"箱","測試備註"]);
 const regular=excel.orderSheet({sourceName:"定期中國貨",sourceKind:"CN_REGULAR",date:"2026-10-21",note:"",lines:[{...line,section:"SINGLE"},{...line,section:"BAG"}]});
 assert.equal(regular.rows[2][1],"單支");assert.equal(regular.rows[3][1],"氣包袋");
 const custom=excel.orderSheet({sourceName:"自訂中國貨",sourceKind:"CN_CUSTOM",date:"2026-10-21",note:"",lines:[{...line,itemCode:""}]});
 assert.deepEqual(custom.rows[1],["項次","品號","品名","規格","數量","單位","備註"]);
 assert.equal(custom.rows[2][1],"");
 const bytes=zip.buildXlsx([general,regular,custom]);
 const buf=Buffer.from(bytes);
 assert.equal(buf.readUInt32LE(0),0x04034b50);assert.ok(buf.includes(Buffer.from("xl/worksheets/sheet1.xml")));
 assert.ok(buf.includes(Buffer.from("廠商品名甲")));assert.ok(buf.includes(Buffer.from("叫貨單")));
 assert.equal(buf.readUInt32LE(buf.length-22),0x06054b50);
});
test("ordering migration recreates module CHECK and all tables",()=>{
 const sql=new DatabaseSync(":memory:");
 for(const file of readdirSync(new URL("../migrations/",import.meta.url)).filter(x=>x.endsWith(".sql")).sort())
  sql.exec(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
 for(const table of ["ordering_sources","ordering_orders","ordering_lines","ordering_receipts","ordering_receipt_lines","ordering_vendor_items","ordering_item_last_source","ordering_revisions"])
  assert.equal(sql.prepare("SELECT name FROM sqlite_master WHERE name=?").get(table)?.name,table);
 assert.match(sql.prepare("SELECT sql FROM sqlite_master WHERE name='app_member_module_access'").get().sql,/ORDERING/);
});
