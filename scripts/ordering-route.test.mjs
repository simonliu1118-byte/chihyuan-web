import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {build} from "esbuild";
const compiled=await build({entryPoints:["worker/http/ordering-routes.ts"],bundle:true,write:false,platform:"node",format:"esm"});
const {handleOrderingRoute}=await import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));
function fixture(role="SUPER_ADMIN"){
 const sql=new DatabaseSync(":memory:");
 const queries=[];
 sql.exec("PRAGMA foreign_keys=ON");
 for(const file of readdirSync(new URL("../migrations/",import.meta.url)).filter(f=>f.endsWith(".sql")).sort())sql.exec(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
 const t="2026-10-21T00:00:00Z";
 sql.prepare("INSERT INTO app_members(identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?)").run("test-ordering","9999","測試員工甲",1,t,t);
 const db={
  prepare(query){queries.push(query);let bind=[];const s=sql.prepare(query);const exec=()=>({results:s.all(...bind),meta:{changes:sql.prepare("SELECT changes() n").get().n,last_row_id:sql.prepare("SELECT last_insert_rowid() n").get().n}});
   return {bind(...params){bind=params;return this},async first(){return exec().results[0]??null},async all(){return exec()},async run(){return exec()},execute:exec}
  },
  async batch(stmts){sql.exec("BEGIN");try{const out=stmts.map(s=>s.execute());sql.exec("COMMIT");return out}catch(e){sql.exec("ROLLBACK");throw e}}
 };
 const principal={workspaceId:"workspace-test",employeeId:"test-ordering",employeeNo:"9999",displayName:"測試員工甲",workspaceRole:role,
 isIdentityAdmin:false,emailVerified:true,isWorkspaceSuperAdmin:role==="SUPER_ADMIN",credentialVersion:1,employeeRevision:1};
 const env={DB:db,IDENTITY_APPLICATION_ID:"APP_TEST",IDENTITY_WORKSPACE_ID:"workspace-test",IDENTITY:{async fetch(){return Response.json({principal,session:{expiresAt:"2999-01-01T00:00:00Z"}})}}};
 const call=async(path,method="GET",json)=>{const req=new Request("https://acceptance.test/api/business/ordering"+path,{method,headers:{cookie:"cyweb_identity_session=cyid_"+"a".repeat(64),"content-type":"application/json"},body:json===undefined?undefined:JSON.stringify(json)});const res=await handleOrderingRoute(req,env,"ordering-test");return {status:res.status,body:await res.json()}};
 return {sql,call,queries,db};
}
test("permission gate and idempotent source seed",async()=>{
 const denied=fixture("USER");try{assert.equal((await denied.call("/sources")).status,403)}finally{denied.sql.close()}
 const {sql,call}=fixture();try{
  const first=await call("/sources");assert.equal(first.status,200,JSON.stringify(first.body));assert.equal(first.body.data.length,22);
  assert.equal((await call("/sources")).body.data.length,22);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM ordering_sources").get().n,22);
  assert.equal(first.body.data.find(x=>x.name==="東昇").conditions,"滿$5000免運費");
 }finally{sql.close()}
});
test("draft saves one row, conflicts on stale version, and send locks header and all line mutations",async()=>{
 const {sql,call}=fixture();try{
  const sources=(await call("/sources")).body.data;
  const source=sources.find(x=>x.name==="台中");
  let o=(await call("/orders","POST",{sourceId:source.id,plannedSendDate:"2026-10-22"})).body.data;
  assert.equal(o.status,"DRAFT");assert.equal(o.version,1);
  let save=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:1,operation:"save",line:{itemCode:"T001",itemName:"測試品名甲",quantityText:"2箱",vendorItemCode:"A1"}});
  assert.equal(save.status,200,JSON.stringify(save.body));o=save.body.data;assert.equal(o.lines[0].quantity,2);assert.equal(o.lines[0].unit,"箱");
  assert.equal(o.lines[0].vendorItemName,"測試品名甲");
  const stale=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:1,operation:"save",lineId:o.lines[0].id,line:{quantityText:"3"}});
  assert.equal(stale.status,409);assert.equal(stale.body.error.code,"ORDERING_VERSION_CONFLICT");
  let sent=await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version});assert.equal(sent.status,200,JSON.stringify(sent.body));
  assert.equal(sent.body.data.revision,1);o=sent.body.data;
  const auditBefore=sql.prepare("SELECT COUNT(*) n FROM audit_events").get().n;
  for(const input of [
   {operation:"save",lineId:o.lines[0].id,line:{quantityText:"3"}},
   {operation:"save",line:{itemName:"不應新增",quantityText:"1"}},
   {operation:"delete",lineId:o.lines[0].id},
   {operation:"save",lineId:o.lines[0].id,line:{sortOrder:999}},
  ]){
   const blocked=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,...input});
   assert.equal(blocked.status,409);assert.match(blocked.body.error.message,/唯讀/);
  }
  const blockedHeader=await call("/orders/"+o.id,"PATCH",{expectedVersion:o.version,note:"不應變更",plannedSendDate:"2026-10-23"});
  assert.equal(blockedHeader.status,409);
  const persisted=(await call("/orders/"+o.id)).body.data;
  assert.equal(persisted.lines.length,1);assert.equal(persisted.lines[0].quantity,2);
  assert.equal(persisted.version,o.version);assert.equal(persisted.revision,1);assert.equal(persisted.note,"");
  assert.equal(persisted.plannedSendDate,"2026-10-22");
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM audit_events").get().n,auditBefore);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM ordering_revisions").get().n,0);
  const unchanged=await call("/orders/"+o.id,"PATCH",{expectedVersion:o.version,note:o.note,plannedSendDate:o.plannedSendDate});
  assert.equal(unchanged.status,409,"sent orders reject even a stale editor's no-op PATCH");
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM ordering_revisions").get().n,0);
 }finally{sql.close()}
});
test("manual vendor memory is reused, ERP sales item fills blanks and source disable preserves history",async()=>{
 const {sql,call}=fixture();try{
  const sources=(await call("/sources")).body.data;
  const vendor=sources.find(x=>x.name==="永全"),sourceId=vendor.id;
  sql.prepare("INSERT INTO erp_sales_items(item_code,item_name,unit,updated_at) VALUES(?,?,?,?)").run("CODE01","測試品名甲","箱","2026-10-21T00:00:00Z");
  let o=(await call("/orders","POST",{sourceId})).body.data;
  const first=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{itemCode:"CODE01",itemName:"測試品名甲",quantityText:"1",vendorItemCode:"V01",vendorItemName:"測試廠商品名甲"},final:true});
  assert.equal(first.status,200,JSON.stringify(first.body));
  o=first.body.data;assert.equal(o.lines[0].vendorItemName,"測試廠商品名甲");
  assert.equal((await call("/vendor-memory?sourceId="+sourceId+"&itemCode=CODE01")).body.data.vendor_item_name,"測試廠商品名甲");
  let other=(await call("/orders","POST",{sourceId})).body.data;
  other=(await call("/orders/"+other.id+"/lines","POST",{expectedVersion:other.version,line:{itemCode:"CODE01",itemName:"",vendorItemCode:"",vendorItemName:"",quantityText:"2"},final:true})).body.data;
  assert.equal(other.lines[0].itemName,"測試品名甲");assert.equal(other.lines[0].unit,"箱");
  assert.equal(other.lines[0].vendorItemCode,"V01");assert.equal(other.lines[0].vendorItemName,"測試廠商品名甲");
  assert.equal((await call("/sources/"+sourceId,"PATCH",{isActive:false})).status,422,"populated drafts cannot be stranded by hiding");
  const sentFirst=await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version});
  const sentSecond=await call("/orders/"+other.id+"/send","POST",{expectedVersion:other.version});
  assert.equal(sentFirst.status,200,JSON.stringify(sentFirst.body));
  assert.equal(sentSecond.status,200,JSON.stringify(sentSecond.body));
  assert.equal((await call("/sources/"+sourceId,"PATCH",{isActive:false})).status,200);
  assert.equal((await call("/orders/"+o.id)).status,200,"inactive source must retain history");
 }finally{sql.close()}
});
test("autosave while typing neither fills nor remembers; a changed key drops the values it brought",async()=>{
 const {sql,call}=fixture();try{
  const vendor=(await call("/sources")).body.data.find(x=>x.name==="永全");
  sql.prepare("INSERT INTO erp_sales_items(item_code,item_name,unit,updated_at) VALUES(?,?,?,?)").run("CODE01","測試品名甲","箱","2026-10-21T00:00:00Z");
  sql.prepare("INSERT INTO ordering_vendor_items(source_id,key_type,item_key,vendor_item_code,vendor_item_name,updated_at) VALUES(?,?,?,?,?,?)").run(vendor.id,"CODE","CODE01","V01","測試廠商品名甲","2026-10-21T00:00:00Z");
  let o=(await call("/orders","POST",{sourceId:vendor.id})).body.data;
  // Half-typed code: nothing is pulled in.
  let r=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{itemCode:"CODE0",quantityText:"1"}});
  assert.equal(r.status,200,JSON.stringify(r.body));o=r.body.data;const id=r.body.data.savedLineId;
  assert.equal(o.lines[0].vendorItemCode,"");assert.equal(o.lines[0].itemName,"");
  // Committed: ERP and vendor memory fill the blanks.
  r=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,lineId:id,line:{itemCode:"CODE01"},final:true});o=r.body.data;
  assert.equal(o.lines[0].itemName,"測試品名甲");assert.equal(o.lines[0].unit,"箱");
  assert.equal(o.lines[0].vendorItemCode,"V01");assert.equal(o.lines[0].vendorItemName,"測試廠商品名甲");
  // The code is changed again: what CODE01 brought goes with it.
  r=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,lineId:id,line:{itemCode:"CODE02"}});o=r.body.data;
  assert.equal(o.lines[0].itemName,"");assert.equal(o.lines[0].vendorItemCode,"");assert.equal(o.lines[0].vendorItemName,"");assert.equal(o.lines[0].vendorNameFollows,true);
  // Typing a vendor code without committing is not remembered; committing it is.
  r=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,lineId:id,line:{itemName:"測試品名乙",vendorItemCode:"V0"}});o=r.body.data;
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM ordering_vendor_items WHERE item_key='CODE02'").get().n,0);
  r=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,lineId:id,line:{vendorItemCode:"V02"},final:true});o=r.body.data;
  assert.equal(sql.prepare("SELECT vendor_item_code c FROM ordering_vendor_items WHERE item_key='CODE02'").get().c,"V02");
  // Clearing a vendor code on a saved line clears it rather than restoring it.
  r=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,lineId:id,line:{vendorItemCode:""},final:true});o=r.body.data;
  assert.equal(o.lines[0].vendorItemCode,"");
  // A cleared 單位 stays cleared: later saves of other fields never pull the ERP unit back.
  r=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{itemCode:"CODE01",quantityText:"100"},final:true});o=r.body.data;
  const filled=o.lines.find(l=>l.id===r.body.data.savedLineId);assert.equal(filled.unit,"箱");
  r=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,lineId:filled.id,line:{unit:""},final:true});o=r.body.data;
  assert.equal(o.lines.find(l=>l.id===filled.id).unit,"");
  r=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,lineId:filled.id,line:{note:"測試"},final:true});o=r.body.data;
  assert.equal(o.lines.find(l=>l.id===filled.id).unit,"");
 }finally{sql.close()}
});
test("send drops emptied rows, names incomplete rows, and hiding needs a boolean",async()=>{
 const {sql,call}=fixture();try{
  const sources=(await call("/sources")).body.data;
  const regular=sources.find(x=>x.kind==="CN_REGULAR"),taichung=sources.find(x=>x.name==="台中");
  let o=(await call("/orders","POST",{sourceId:regular.id})).body.data;
  assert.equal((await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{section:"",itemName:"測試品名甲",quantityText:"1"}})).status,422,"定期中國貨 needs a block");
  for(const line of [{section:"SINGLE",itemName:"測試品名甲",quantityText:"1"},{section:"SINGLE",itemName:"測試品名乙"},{section:"BAG",itemName:"測試品名丙",quantityText:"2"}]){
   const r=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line});assert.equal(r.status,200,JSON.stringify(r.body));o=r.body.data;
  }
  const bad=await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version});
  assert.equal(bad.status,422);assert.match(bad.body.error.message,/針灸針－單支 第 2 列/);
  const second=o.lines.find(l=>l.itemName==="測試品名乙");
  o=(await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,lineId:second.id,line:{itemName:""}})).body.data;
  const sent=await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version});
  assert.equal(sent.status,200,JSON.stringify(sent.body));assert.equal(sent.body.data.lines.length,2);
  assert.equal((await call("/sources/"+taichung.id,"PATCH",{isActive:"false"})).status,422);
  assert.equal(sql.prepare("SELECT is_active FROM ordering_sources WHERE id=?").get(taichung.id).is_active,1);
 }finally{sql.close()}
});
test("combined vendor overview groups draft lines without sending vendors",async()=>{
 const {sql,call}=fixture();try{
  const sources=(await call("/sources")).body.data;
  const a=sources.find(x=>x.name==="永全"),b=sources.find(x=>x.name==="東昇");
  for(const source of [a,b]){
   let draft=(await call("/orders","POST",{sourceId:source.id})).body.data;
   const added=await call("/orders/"+draft.id+"/lines","POST",{expectedVersion:draft.version,line:{itemCode:"SKU"+source.id,itemName:"測試品名甲",quantityText:"1箱"}});
   assert.equal(added.status,200,JSON.stringify(added.body));
  }
  const overview=await call("/vendors/overview");assert.equal(overview.status,200,JSON.stringify(overview.body));
  const first=overview.body.data.find(x=>x.sourceId===a.id);
  const second=overview.body.data.find(x=>x.sourceId===b.id);
  assert.equal(first.lines.length,1);assert.equal(first.lines[0].itemName,"測試品名甲");
  assert.equal(second.lines.length,1);
  assert.ok(first.orderId>0&&first.orderVersion>1);assert.equal(second.conditions,"滿$5000免運費");
  const changed=await call("/orders/"+first.orderId+"/lines","POST",{expectedVersion:first.orderVersion,operation:"save",lineId:first.lines[0].id,line:{quantityText:"2箱"}});
  assert.equal(changed.status,200,JSON.stringify(changed.body));
  const updated=(await call("/vendors/overview")).body.data.find(x=>x.sourceId===a.id);
  assert.equal(updated.lines[0].quantity,2);
  assert.equal((await call("/orders/"+first.orderId)).body.data.status,"DRAFT");
 }finally{sql.close()}
});
test("multiple receipts per order, repeated ERP number allowed, pending search and final status",async()=>{
 const {sql,call}=fixture();try{
  const sourceId=(await call("/sources")).body.data.find(s=>s.name==="台中").id;
  let order=(await call("/orders","POST",{sourceId})).body.data;
  order=(await call("/orders/"+order.id+"/lines","POST",{expectedVersion:order.version,line:{itemCode:"SKU001",itemName:"測試品名甲",quantityText:"3箱"}})).body.data;
  order=(await call("/orders/"+order.id+"/send","POST",{expectedVersion:order.version})).body.data;
  assert.equal((await call("/pending")).body.data.find(l=>l.orderId===order.id).remaining,3);
  for(const amount of [1,2]){
   const reply=await call("/orders/"+order.id+"/receipts","POST",{expectedVersion:order.version,erpPurchaseNo:"20261021001",receivedDate:"2026-10-21",lines:[{lineId:order.lines[0].id,quantity:amount}]});
   assert.equal(reply.status,200,JSON.stringify(reply.body));order=reply.body.data;
  }
  assert.equal(order.status,"CLOSED");assert.equal(order.lines[0].received,3);
  assert.equal(order.receipts.length,2);
  assert.ok(order.receipts.every(r=>r.erpPurchaseNo==="341A-20261021001"));
  assert.equal(order.receipts.reduce((n,r)=>n+r.lines[0].quantity,0),3);
  assert.equal((await call("/pending")).body.data.some(l=>l.orderId===order.id),false);
  const filtered=await call("/orders?q=20261021001&status=CLOSED&sourceId="+sourceId);
  assert.equal(filtered.status,200,JSON.stringify(filtered.body));assert.equal(filtered.body.data[0].id,order.id);
 }finally{sql.close()}
});
test("receipt performs multi-line update and settles shortages with correct status",async()=>{
 const {sql,call}=fixture();try{
  const id=(await call("/sources")).body.data.find(x=>x.name==="台北").id;
  let o=(await call("/orders","POST",{sourceId:id})).body.data;
  for(const itemName of ["測試品名甲","測試品名乙"]){
   o=(await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{itemName,quantityText:"3",itemCode:itemName}})).body.data;
  }
  o=(await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version})).body.data;
  const r=await call("/orders/"+o.id+"/receipts","POST",{expectedVersion:o.version,erpPurchaseNo:"20261021001",receivedDate:"2026-10-21",lines:[{lineId:o.lines[0].id,quantity:2},{lineId:o.lines[1].id,quantity:3}]});
  assert.equal(r.status,200,JSON.stringify(r.body));o=r.body.data;assert.equal(o.status,"PARTIAL");
  assert.equal(o.lines[0].received,2);assert.equal(o.lines[1].received,3);
  o=(await call("/orders/"+o.id+"/close","POST",{expectedVersion:o.version,lineId:o.lines[0].id,closedAs:"SHORTAGE",reason:"測試缺貨"})).body.data;
  assert.equal(o.status,"CLOSED");
  assert.equal((await call("/pending")).body.data.length,0);
  assert.equal((await call("/orders/"+o.id+"/receipts","POST",{expectedVersion:o.version,erpPurchaseNo:"20260229001",receivedDate:"2026-10-21",lines:[{lineId:o.lines[0].id,quantity:1}]})).status,422);
 }finally{sql.close()}
});

for(const kind of ["GENERAL","VENDOR"])test(`${kind}: vendor-only draft persists on reopen and can send without copying our item fields`,async()=>{
 const {sql,call,queries}=fixture();try{
  const source=(await call("/sources")).body.data.find(x=>x.kind===kind);
  let o=(await call("/orders","POST",{sourceId:source.id})).body.data;
  const saved=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{vendorItemCode:"TEST-V01",vendorItemName:"測試廠商品名",quantityText:"7",unit:"箱",note:"測試備註"}});
  assert.equal(saved.status,200,JSON.stringify(saved.body));o=saved.body.data;
  const id=o.savedLineId;assert.ok(Number.isSafeInteger(id)&&id>0);assert.equal(o.lines[0].id,id);
  assert.equal((await call("/orders?status=DRAFT&sourceId="+source.id)).body.data[0].id,o.id);
  queries.length=0;
  const reopened=(await call("/orders/"+o.id)).body.data;
  assert.equal(queries.filter(q=>q==="SELECT * FROM ordering_orders WHERE id=?").length,1);
  assert.equal(queries.some(q=>/ordering_receipt|ordering_revisions/.test(q)),false,"draft detail skips receipt/revision reads");
  assert.equal(reopened.lines.length,1);const line=reopened.lines[0];
  assert.equal(line.itemCode,"");assert.equal(line.itemName,"");assert.equal(line.vendorItemCode,"TEST-V01");
  assert.equal(line.vendorItemName,"測試廠商品名");assert.equal(line.quantity,7);assert.equal(line.unit,"箱");assert.equal(line.note,"測試備註");
  const updated=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,lineId:id,line:{note:"後續補的備註"}});
  assert.equal(updated.status,200);o=updated.body.data;assert.equal(o.savedLineId,id);assert.equal(o.lines.length,1);
  const sent=await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version});
  assert.equal(sent.status,200,JSON.stringify(sent.body));assert.equal(sent.body.data.status,"SENT");
  assert.equal(sent.body.data.lines[0].itemName,"");
  const pending=(await call("/pending")).body.data.find(l=>l.lineId===id);
  assert.equal(pending.vendorItemName,"測試廠商品名");assert.equal(pending.itemName,"");
  assert.equal((await call("/orders?history=1&q="+encodeURIComponent("測試廠商品名"))).body.data[0].id,o.id);
  assert.equal((await call("/orders?history=1&q=TEST-V01")).body.data[0].id,o.id);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM ordering_vendor_items").get().n,0,"no vendor memory is keyed by a fabricated own-item identity");
 }finally{sql.close()}
});

test("incomplete draft rows persist across reopen but incomplete orders cannot be sent",async()=>{
 const {sql,call}=fixture();try{
  const sources=(await call("/sources")).body.data;
  for(const kind of ["GENERAL","VENDOR","CN_REGULAR","CN_CUSTOM"]){
   const source=sources.find(s=>s.kind===kind);
   let o=(await call("/orders","POST",{sourceId:source.id})).body.data;
   const partial=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{itemCode:"A00302",quantityText:""}});
   assert.equal(partial.status,200,JSON.stringify(partial.body));o=partial.body.data;
   assert.equal(o.lines[0].itemCode,"A00302");
   assert.equal(o.lines[0].quantityText,"");
   assert.equal((await call("/orders/"+o.id)).body.data.lines[0].itemCode,"A00302");
   const noSend=await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version});
   assert.equal(noSend.status,422,"incomplete draft must not be sent");
   const blank=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{}});
   assert.equal(blank.status,422,"wholly empty rows are not stored");
   const changed=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,lineId:o.lines[0].id,line:{itemName:"測試品名",quantityText:"2"}});
   assert.equal(changed.status,200,JSON.stringify(changed.body));o=changed.body.data;
   assert.equal((await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version})).status,200);
  }
  const source=sources.find(s=>s.kind==="GENERAL");let o=(await call("/orders","POST",{sourceId:source.id})).body.data;
  o=(await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{itemName:"測試品名",quantityText:"2"}})).body.data;
  const blank=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,lineId:o.lines[0].id,line:{itemName:""}});
  assert.equal(blank.status,200,"clearing a name is allowed while drafting");
  o=blank.body.data;
  assert.equal((await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version})).status,422,"cannot send without name");
 }finally{sql.close()}
});

test("receipt readback failure preserves committed data and returns reconciliation code",async()=>{
 const {sql,call,db}=fixture();
 const originalPrepare=db.prepare;
 const originalError=console.error;
 const logs=[];
 try{
  const source=(await call("/sources")).body.data.find(x=>x.name==="台中");
  let o=(await call("/orders","POST",{sourceId:source.id})).body.data;
  o=(await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{itemName:"測試品名甲",quantityText:"5"}})).body.data;
  o=(await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version})).body.data;
  let receiptLineReads=0;
  db.prepare=function(query){
   if(query.startsWith("SELECT l.*,") && query.includes("ordering_receipt_lines") && ++receiptLineReads===2){
    throw new Error("synthetic readback failure");
   }
   return originalPrepare.call(this,query);
  };
  console.error=(...args)=>logs.push(args);
  const reply=await call("/orders/"+o.id+"/receipts","POST",{
   expectedVersion:o.version,erpPurchaseNo:"20261022003",receivedDate:"2026-10-22",
   lines:[{lineId:o.lines[0].id,quantity:4}],
  });
  assert.equal(reply.status,503);
  assert.equal(reply.body.error.code,"ORDERING_RECEIPT_CONFIRMATION_REQUIRED");
  assert.match(reply.body.error.message,/請重新載入/);
  assert.equal(reply.body.requestId,"ordering-test");
  assert.equal(logs[0][0],"[ordering_receipt_failure]");
  assert.equal(logs[0][1].phase,"readback");
  assert.equal(logs[0][1].requestId,"ordering-test");
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM ordering_receipts").get().n,1);
  assert.equal(sql.prepare("SELECT quantity FROM ordering_receipt_lines").get().quantity,4);
  const reloaded=await call("/orders/"+o.id);
  assert.equal(reloaded.status,200);
  assert.equal(reloaded.body.data.lines[0].received,4);
 }finally{db.prepare=originalPrepare;console.error=originalError;sql.close()}
});

test("receipt preflight rejection is preserved and does not create a receipt",async()=>{
 const {sql,call}=fixture();
 try{
  const source=(await call("/sources")).body.data.find(x=>x.name==="台中");
  let o=(await call("/orders","POST",{sourceId:source.id})).body.data;
  o=(await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{itemName:"測試品名甲",quantityText:"5"}})).body.data;
  o=(await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version})).body.data;
  const response=await call("/orders/"+o.id+"/receipts","POST",{expectedVersion:o.version,
   erpPurchaseNo:"20260229001",receivedDate:"2026-10-22",lines:[{lineId:o.lines[0].id,quantity:4}]});
  assert.equal(response.status,422);
  assert.equal(response.body.error.code,"ORDERING_INVALID");
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM ordering_receipts").get().n,0);
 }finally{sql.close()}
});


test("source payment terms, soft-hide, atomic shared sort and personal vendor order survive reloads",async()=>{
 const {sql,call}=fixture();try{
  const sources=(await call("/sources")).body.data;
  const vendor=sources.find(x=>x.name==="永全"),internal=sources.find(x=>x.name==="台北");
  assert.equal(vendor.paymentTerms,"");
  const paid=await call("/sources/"+vendor.id,"PATCH",{paymentTerms:"月結30天"});
  assert.equal(paid.status,200,JSON.stringify(paid.body));
  assert.equal((await call("/sources")).body.data.find(x=>x.id===vendor.id).paymentTerms,"月結30天");
  const invalid=await call("/sources/"+vendor.id,"PATCH",{paymentTerms:"X".repeat(201)});
  assert.equal(invalid.status,422);
  const orderIds=sources.filter(x=>x.kind==="VENDOR"&&x.name!=="其他").slice(0,3).map(x=>x.id).reverse();
  const saved=await call("/preferences/vendors","PUT",{sourceIds:orderIds});
  assert.equal(saved.status,200,JSON.stringify(saved.body));
  assert.deepEqual((await call("/preferences/vendors")).body.data,orderIds);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM ordering_user_preferences").get().n,1);
  assert.equal((await call("/preferences/vendors","PUT",{sourceIds:[vendor.id,vendor.id]})).status,422);
  assert.equal((await call("/preferences/vendors","PUT",{sourceIds:[internal.id]})).status,422);
  const all=sources.map(x=>x.id).reverse();
  const sorted=await call("/sources/reorder","POST",{sourceIds:all});
  assert.equal(sorted.status,200,JSON.stringify(sorted.body));
  assert.deepEqual((await call("/sources")).body.data.map(x=>x.id),all);
  assert.deepEqual((await call("/preferences/vendors")).body.data,orderIds,"shared sort does not overwrite personal preferences");
  let existing=(await call("/orders","POST",{sourceId:vendor.id})).body.data;
  existing=(await call("/orders/"+existing.id+"/lines","POST",{expectedVersion:existing.version,line:{vendorItemName:"測試廠商品名",quantityText:"1"}})).body.data;
  const blocked=await call("/sources/"+vendor.id,"PATCH",{isActive:false});
  assert.equal(blocked.status,422,"a hidden tab must not strand meaningful unsent drafts");
  assert.match(blocked.body.error.message,/草稿/);
  existing=(await call("/orders/"+existing.id+"/send","POST",{expectedVersion:existing.version})).body.data;
  assert.equal((await call("/sources/"+vendor.id,"PATCH",{isActive:false})).status,200);
  assert.equal((await call("/orders/"+existing.id)).status,200,"hiding source retains historical orders");
  assert.equal((await call("/orders","POST",{sourceId:vendor.id})).status,422,"hidden source cannot create fresh drafts");
  assert.equal((await call("/sources/"+vendor.id,"PATCH",{isActive:true})).status,200);
  assert.equal((await call("/orders","POST",{sourceId:vendor.id})).status,200,"restored source can create drafts again");
 }finally{sql.close()}
});
test("an unsent draft can be deleted; a sent order cannot and is voided instead",async()=>{
 const {sql,call}=fixture();try{
  const source=(await call("/sources")).body.data.find(x=>x.name==="台中");
  let o=(await call("/orders","POST",{sourceId:source.id})).body.data;
  o=(await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{itemName:"測試品名甲",quantityText:"2"}})).body.data;
  assert.equal((await call("/orders/"+o.id,"DELETE",{expectedVersion:o.version-1})).status,409,"stale version is refused");
  const removed=await call("/orders/"+o.id,"DELETE",{expectedVersion:o.version});assert.equal(removed.status,200,JSON.stringify(removed.body));
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM ordering_orders WHERE id=?").get(o.id).n,0);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM ordering_lines WHERE order_id=?").get(o.id).n,0);
  let s=(await call("/orders","POST",{sourceId:source.id})).body.data;
  s=(await call("/orders/"+s.id+"/lines","POST",{expectedVersion:s.version,line:{itemName:"測試品名乙",quantityText:"1"}})).body.data;
  s=(await call("/orders/"+s.id+"/send","POST",{expectedVersion:s.version})).body.data;
  assert.equal((await call("/orders/"+s.id,"DELETE",{expectedVersion:s.version})).status,409);
 }finally{sql.close()}
});
test("a sent order is revised in one explicit save that becomes one new version",async()=>{
 const {sql,call}=fixture();try{
  const source=(await call("/sources")).body.data.find(x=>x.name==="台中");
  let o=(await call("/orders","POST",{sourceId:source.id})).body.data;
  for(const [name,q] of [["測試品名甲","10"],["測試品名乙","5"]])o=(await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{itemName:name,quantityText:q}})).body.data;
  o=(await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version})).body.data;
  const [a,b]=o.lines;
  o=(await call("/orders/"+o.id+"/receipts","POST",{expectedVersion:o.version,erpPurchaseNo:"20261021001",receivedDate:"2026-10-21",lines:[{lineId:a.id,quantity:4}]})).body.data;
  // Rules: received lines cannot drop below what came or be deleted; names and quantities stay required.
  assert.equal((await call("/orders/"+o.id+"/revise","POST",{expectedVersion:o.version,lines:[{lineId:a.id,quantityText:"3"}]})).status,422);
  assert.equal((await call("/orders/"+o.id+"/revise","POST",{expectedVersion:o.version,deleted:[a.id]})).status,422);
  assert.equal((await call("/orders/"+o.id+"/revise","POST",{expectedVersion:o.version,lines:[{itemName:"測試品名丙"}]})).status,422);
  const r=await call("/orders/"+o.id+"/revise","POST",{expectedVersion:o.version,note:"測試備註",deleted:[b.id],
   lines:[{lineId:a.id,quantityText:"12"},{itemName:"測試品名丙",quantityText:"3箱"}]});
  assert.equal(r.status,200,JSON.stringify(r.body));const after=r.body.data;
  assert.equal(after.revision,o.revision+1);assert.equal(after.note,"測試備註");
  assert.deepEqual(after.lines.map(l=>[l.itemName,l.quantity,l.unit]),[["測試品名甲",12,""],["測試品名丙",3,"箱"]]);
  assert.equal(after.revisions.length,o.revisions.length+1,"one save is one version");
  assert.match(after.revisions[0].summary,/數量 10 → 12/);assert.match(after.revisions[0].summary,/刪除 測試品名乙/);assert.match(after.revisions[0].summary,/新增 測試品名丙/);
  // An unchanged resend changes nothing.
  const same=await call("/orders/"+o.id+"/revise","POST",{expectedVersion:after.version,lines:[{lineId:a.id,quantityText:"12"}]});
  assert.equal(same.body.data.revision,after.revision);
  // Drafts keep their autosave path.
  let d=(await call("/orders","POST",{sourceId:source.id})).body.data;
  assert.equal((await call("/orders/"+d.id+"/revise","POST",{expectedVersion:d.version,lines:[]})).status,409);
 }finally{sql.close()}
});
test("dragging rows renumbers one block in one write; revise can move sent rows too",async()=>{
 const {sql,call}=fixture();try{
  const source=(await call("/sources")).body.data.find(x=>x.name==="台中");
  let o=(await call("/orders","POST",{sourceId:source.id})).body.data;
  for(const name of ["測試甲","測試乙","測試丙"])o=(await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{itemName:name,quantityText:"1"}})).body.data;
  const [a,b,c]=o.lines.map(l=>l.id);
  assert.equal((await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,operation:"reorder",lineIds:[c,c]})).status,422);
  o=(await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,operation:"reorder",lineIds:[c,a,b]})).body.data;
  assert.deepEqual(o.lines.map(l=>l.itemName),["測試丙","測試甲","測試乙"]);
  o=(await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version})).body.data;
  const r=await call("/orders/"+o.id+"/revise","POST",{expectedVersion:o.version,lines:[{lineId:b,sortOrder:5}]});
  assert.equal(r.status,200,JSON.stringify(r.body));
  assert.deepEqual(r.body.data.lines.map(l=>l.itemName),["測試乙","測試丙","測試甲"]);
  assert.match(r.body.data.revisions[0].summary,/調整明細順序/);
 }finally{sql.close()}
});
test("vendor status marks drafts with content, waiting and partly received orders, and nothing once all arrived",async()=>{
 const {sql,call}=fixture();try{
  const vendor=(await call("/sources")).body.data.find(x=>x.name==="永全");
  const status=async()=>(await call("/vendors/status")).body.data.find(x=>x.sourceId===vendor.id)??null;
  let o=(await call("/orders","POST",{sourceId:vendor.id})).body.data;
  assert.equal(await status(),null,"an empty draft is not marked");
  o=(await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,line:{itemName:"測試品名甲",quantityText:"4"}})).body.data;
  assert.deepEqual(await status(),{sourceId:vendor.id,draft:true,sent:false,partial:false});
  o=(await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version})).body.data;
  assert.deepEqual(await status(),{sourceId:vendor.id,draft:false,sent:true,partial:false});
  const line=o.lines[0].id;
  o=(await call("/orders/"+o.id+"/receipts","POST",{expectedVersion:o.version,erpPurchaseNo:"20261021001",receivedDate:"2026-10-21",lines:[{lineId:line,quantity:1}]})).body.data;
  assert.deepEqual(await status(),{sourceId:vendor.id,draft:false,sent:false,partial:true});
  o=(await call("/orders/"+o.id+"/receipts","POST",{expectedVersion:o.version,erpPurchaseNo:"20261021002",receivedDate:"2026-10-21",lines:[{lineId:line,quantity:3}]})).body.data;
  assert.equal(await status(),null,"fully received: no mark");
 }finally{sql.close()}
});
