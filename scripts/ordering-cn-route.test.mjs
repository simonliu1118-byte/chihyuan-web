import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {build} from "esbuild";
const compiled=await build({entryPoints:["worker/http/ordering-routes.ts"],bundle:true,write:false,platform:"node",format:"esm"});
const {handleOrderingRoute}=await import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));
function fixture(role="SUPER_ADMIN",files=undefined){
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
 const env={HR_FILES:files,DB:db,IDENTITY_APPLICATION_ID:"APP_TEST",IDENTITY_WORKSPACE_ID:"workspace-test",IDENTITY:{async fetch(){return Response.json({principal,session:{expiresAt:"2999-01-01T00:00:00Z"}})}}};
 const call=async(path,method="GET",json)=>{const req=new Request("https://acceptance.test/api/business/ordering"+path,{method,headers:{cookie:"cyweb_identity_session=cyid_"+"a".repeat(64),"content-type":"application/json"},body:json===undefined?undefined:JSON.stringify(json)});const res=await handleOrderingRoute(req,env,"ordering-test");return {status:res.status,body:await res.json()}};
 const raw=async(path,init)=>handleOrderingRoute(new Request("https://acceptance.test/api/business/ordering"+path,{...init,headers:{cookie:"cyweb_identity_session=cyid_"+"a".repeat(64),...(init?.headers??{})}}),env,"ordering-test");
 return {sql,call,queries,db,raw};
}

async function sentCnOrder(call){
 const sources=(await call("/sources")).body.data,source=sources.find(x=>x.kind==="CN_CUSTOM");
 let o=(await call("/orders","POST",{sourceId:source.id})).body.data;
 // Explicit sortOrder: lines saved in the same millisecond would otherwise tie and come back in id (random) order.
 for(const [i,[name,qty]] of [["無煙自黏艾粒","10"],["檀木魚形按摩梳","5"],["牛角刮痧匙(大)","20"]].entries())
  o=(await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,operation:"save",line:{itemName:name,quantityText:qty,sortOrder:(i+1)*10}})).body.data;
 return (await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version})).body.data;
}
test("CN purchase: grant, split over cards, 原定 kept, logged, conflicts",async()=>{
 const denied=fixture("USER");try{
  const t="2026-11-10T00:00:00Z";
  denied.sql.prepare("INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at) VALUES(1,'ORDERING',1,?)").run(t);
  const o=await sentCnOrder(denied.call);
  assert.equal((await denied.call("/orders/"+o.id+"/cn-purchase")).status,403);
  denied.sql.prepare("INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at) VALUES(1,'ORDERING_CN_PURCHASE',1,?)").run(t);
  assert.equal((await denied.call("/orders/"+o.id+"/cn-purchase")).status,200);
 }finally{denied.sql.close()}
 const {sql,call}=fixture();try{
  let o=await sentCnOrder(call);const [a,b,c]=o.lines;
  let r=await call("/orders/"+o.id+"/cn-purchase");assert.equal(r.status,200,JSON.stringify(r.body));
  assert.deepEqual(r.body.data.purchase.pieces,[]);
  const save={expectedVersion:o.version,
   cards:[{key:"n1",chargedOn:"2026-11-11",amount:1400,fee:null,shipping:60},{key:"n2",chargedOn:"2026-11-12",amount:480,fee:5}],
   pieces:[{lineKey:"L"+a.id,quantity:5,rmbPrice:3500,cardKey:"n1",sortOrder:1},{lineKey:"L"+b.id,quantity:5,rmbPrice:680,cardKey:"n1",sortOrder:2},
    {lineKey:"L"+c.id,quantity:24,rmbPrice:520,cardKey:"n1",sortOrder:3,note:"多買給門市"},{lineKey:"L"+a.id,quantity:3,rmbPrice:3500,cardKey:"n2",sortOrder:1},
    {lineKey:"L"+a.id,quantity:2,rmbPrice:3500,cardKey:null,sortOrder:9},{lineKey:"N1",quantity:3,rmbPrice:23900,cardKey:null,sortOrder:10}],
   lines:[{key:"N1",itemName:"倪海廈一套8本",unit:"套"}]};
  r=await call("/orders/"+o.id+"/cn-purchase/order","PUT",save);assert.equal(r.status,200,JSON.stringify(r.body));
  o=r.body.data.order;const p=r.body.data.purchase;
  assert.equal(p.pieces.length,6);assert.equal(p.charges.filter(x=>x.kind==="CARD").length,2);
  const cl=o.lines.find(x=>x.id===c.id);assert.equal(cl.quantity,24);assert.equal(cl.originalQuantity,20);
  const added=o.lines.find(x=>x.purchaseAdded);assert.equal(added.itemName,"倪海廈一套8本");assert.equal(added.quantity,3);assert.equal(added.originalQuantity,null);
  assert.match(o.revisions[0].summary,/牛角刮痧匙\(大\) 採購數量 20 → 24/);
  assert.equal(p.pieces.find(x=>x.lineId===c.id).note,"多買給門市");
  assert.equal(p.charges.find(x=>x.kind==="CARD"&&x.amount===1400).shipping,60);assert.match(o.revisions[0].summary,/運費 60/);assert.match(o.revisions[0].summary,/備註 空白 → 多買給門市/);assert.match(o.revisions[0].summary,/採購新增 倪海廈一套8本/);
  // stale version
  assert.equal((await call("/orders/"+o.id+"/cn-purchase/order","PUT",save)).status,409);
  // 修改叫貨單 may not change a purchased quantity
  const rev=await call("/orders/"+o.id+"/revise","POST",{expectedVersion:o.version,lines:[{lineId:c.id,quantityText:"30"}]});
  assert.equal(rev.status,422);assert.match(rev.body.error.message,/採購/);
  // 對帳: fee only
  const card1=p.charges.find(x=>x.kind==="CARD"&&x.amount===1400);
  r=await call("/orders/"+o.id+"/cn-purchase/reconcile","PUT",{expectedVersion:o.version,cards:[{id:card1.id,amount:1400,fee:14}]});
  assert.equal(r.status,200,JSON.stringify(r.body));o=r.body.data.order;assert.match(o.revisions[0].summary,/對帳：刷卡 #\d 手續費 待補 → 14/);
  // shipping before 完成訂購 refused; tax before shipping refused
  assert.equal((await call("/orders/"+o.id+"/cn-purchase/shipping","PUT",{expectedVersion:o.version,items:[{chargedOn:"2026-11-20",amount:1758,fee:18}]})).status,422);
  r=await call("/orders/"+o.id+"/cn-purchase/complete","POST",{expectedVersion:o.version});assert.equal(r.status,200,JSON.stringify(r.body));o=r.body.data.order;
  assert.ok(r.body.data.purchase.orderedAt);
  assert.equal((await call("/orders/"+o.id+"/cn-purchase/tax","PUT",{expectedVersion:o.version,tax:{chargedOn:"2026-12-18",amount:276}})).status,422);
  r=await call("/orders/"+o.id+"/cn-purchase/shipping","PUT",{expectedVersion:o.version,items:[{chargedOn:"2026-11-20",amount:1758,fee:18},{chargedOn:"2026-11-22",amount:1033,fee:10}]});
  assert.equal(r.status,200,JSON.stringify(r.body));o=r.body.data.order;
  r=await call("/orders/"+o.id+"/cn-purchase/tax","PUT",{expectedVersion:o.version,tax:{chargedOn:"2026-12-18",amount:276}});
  assert.equal(r.status,200,JSON.stringify(r.body));o=r.body.data.order;
  // returns need goods received first
  assert.equal((await call("/orders/"+o.id+"/cn-purchase/returns","PUT",{expectedVersion:o.version,items:[{lineId:c.id,quantity:2,rmbAmount:1040,ntdAmount:65,fee:null,reason:"瑕疵"}]})).status,422);
  r=await call("/orders/"+o.id+"/receipts","POST",{expectedVersion:o.version,erpPurchaseNo:"20261125001",receivedDate:"2026-11-25",lines:[{lineId:c.id,quantity:24}]});
  assert.equal(r.status,200,JSON.stringify(r.body));o=r.body.data;
  r=await call("/orders/"+o.id+"/cn-purchase/returns","PUT",{expectedVersion:o.version,items:[{lineId:c.id,quantity:2,rmbAmount:1040,ntdAmount:65,fee:null,reason:"瑕疵"}]});
  assert.equal(r.status,200,JSON.stringify(r.body));o=r.body.data.order;assert.match(o.revisions[0].summary,/新增退貨 牛角刮痧匙\(大\) 2/);
  // a purchased quantity cannot drop below what came
  const shrink=structuredClone(save);shrink.expectedVersion=o.version;
  const cur=(await call("/orders/"+o.id+"/cn-purchase")).body.data.purchase;
  shrink.cards=cur.charges.filter(x=>x.kind==="CARD").map(x=>({id:x.id,chargedOn:x.chargedOn,amount:x.amount,fee:x.fee}));
  shrink.lines=[{lineId:added.id,itemName:added.itemName,unit:"套"}];
  shrink.pieces=cur.pieces.map(x=>({lineKey:"L"+x.lineId,quantity:x.lineId===c.id?10:x.quantity,rmbPrice:x.rmbPrice,cardKey:x.chargeId?"C"+x.chargeId:null,sortOrder:x.sortOrder}));
  const bad=await call("/orders/"+o.id+"/cn-purchase/order","PUT",shrink);assert.equal(bad.status,422);assert.match(bad.body.error.message,/已到貨/);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM ordering_cn_pieces").get().n,6);
 }finally{sql.close()}
});
test("CN purchase: 絕版／停產 closes the line and can be restored",async()=>{
 const {sql,call}=fixture();try{
  let o=await sentCnOrder(call);const [a,b,c]=o.lines;
  let r=await call("/orders/"+o.id+"/cn-purchase/discontinue","POST",{expectedVersion:o.version,lineId:b.id,reason:"絕版"});
  assert.equal(r.status,200,JSON.stringify(r.body));o=r.body.data.order;
  const bl=o.lines.find(x=>x.id===b.id);assert.equal(bl.closedAs,"OTHER");assert.equal(bl.cnDiscontinued,true);assert.equal(bl.closedNote,"絕版");
  // saving 訂購 skips the discontinued line and refuses pieces on it
  const base={cards:[{key:"k",chargedOn:"2026-11-11",amount:null,fee:null}],pieces:[{lineKey:"L"+a.id,quantity:10,rmbPrice:3500,cardKey:"k"},{lineKey:"L"+c.id,quantity:20,rmbPrice:520,cardKey:"k"}]};
  r=await call("/orders/"+o.id+"/cn-purchase/order","PUT",{expectedVersion:o.version,...base,pieces:[...base.pieces,{lineKey:"L"+b.id,quantity:5,rmbPrice:680}]});
  assert.equal(r.status,422);
  r=await call("/orders/"+o.id+"/cn-purchase/order","PUT",{expectedVersion:o.version,...base});assert.equal(r.status,200,JSON.stringify(r.body));o=r.body.data.order;
  // a line with a card cannot be marked discontinued
  assert.equal((await call("/orders/"+o.id+"/cn-purchase/discontinue","POST",{expectedVersion:o.version,lineId:a.id})).status,422);
  r=await call("/orders/"+o.id+"/cn-purchase/restore","POST",{expectedVersion:o.version,lineId:b.id});
  assert.equal(r.status,200,JSON.stringify(r.body));o=r.body.data.order;
  const back=o.lines.find(x=>x.id===b.id);assert.equal(back.closedAs,null);assert.equal(back.cnDiscontinued,false);
  assert.match(o.revisions[0].summary,/恢復採購/);
  // 完成訂購 needs every active line purchased
  r=await call("/orders/"+o.id+"/cn-purchase/complete","POST",{expectedVersion:o.version});assert.equal(r.status,422);assert.match(r.body.error.message,/檀木魚形按摩梳/);
 }finally{sql.close()}
});

function fakeBucket(){
 const store=new Map();
 return {store,async put(k,v){store.set(k,new Uint8Array(v))},async get(k){const v=store.get(k);return v?{body:new Blob([v]).stream()}:null},
  async delete(k){for(const key of [k].flat())store.delete(key)}};
}
// A minimal valid baseline JPEG header (SOI, SOF0 4x3, EOI) is enough for the size check.
const jpeg=new Uint8Array([0xff,0xd8,0xff,0xc0,0x00,0x11,0x08,0x00,0x03,0x00,0x04,0x03,0x01,0x22,0x00,0x02,0x11,0x01,0x03,0x11,0x01,0xff,0xd9]);
test("CN line photo: one per line, replaced, removed with its line, and gone at 結案",async()=>{
 const bucket=fakeBucket();
 const {sql,call,raw}=fixture("SUPER_ADMIN",bucket);try{
  const sources=(await call("/sources")).body.data,source=sources.find(x=>x.kind==="CN_CUSTOM");
  let o=(await call("/orders","POST",{sourceId:source.id})).body.data;
  for(const [name,qty] of [["甲品","2"],["乙品","1"]])o=(await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,operation:"save",line:{itemName:name,quantityText:qty}})).body.data;
  const [a,b]=o.lines,put=lineId=>raw("/orders/"+o.id+"/lines/"+lineId+"/photo",{method:"PUT",headers:{"content-type":"image/jpeg"},body:jpeg});
  assert.equal((await put(a.id)).status,200);assert.equal((await put(b.id)).status,200);
  assert.equal(bucket.store.size,2);
  assert.equal((await put(a.id)).status,200,"replacing keeps one file per line");assert.equal(bucket.store.size,2);
  const got=await raw("/orders/"+o.id+"/lines/"+a.id+"/photo");assert.equal(got.headers.get("content-type"),"image/jpeg");
  assert.equal((await raw("/orders/"+o.id+"/lines/"+a.id+"/photo",{method:"PUT",headers:{"content-type":"image/png"},body:jpeg})).status,422);
  o=(await call("/orders/"+o.id)).body.data;assert.deepEqual(o.lines.map(l=>l.photo),[true,true]);
  // deleting a draft line removes its photo file
  o=(await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,operation:"delete",lineId:b.id})).body.data;
  assert.equal(bucket.store.size,1);assert.equal(sql.prepare("SELECT COUNT(*) n FROM ordering_line_photos").get().n,1);
  o=(await call("/orders/"+o.id+"/send","POST",{expectedVersion:o.version})).body.data;
  assert.equal(o.lines[0].photo,true);
  // full receipt → 結案 → photo deleted
  o=(await call("/orders/"+o.id+"/receipts","POST",{expectedVersion:o.version,erpPurchaseNo:"20261111001",receivedDate:"2026-11-11",lines:[{lineId:a.id,quantity:2}]})).body.data;
  assert.equal(o.status,"CLOSED");assert.equal(o.lines[0].photo,false);
  assert.equal(bucket.store.size,0);assert.equal(sql.prepare("SELECT COUNT(*) n FROM ordering_line_photos").get().n,0);
  assert.equal((await put(a.id)).status,409,"no new photo after 結案");
 }finally{sql.close()}
});
test("CN line photo is only for 自訂中國貨",async()=>{
 const {sql,call,raw}=fixture("SUPER_ADMIN",fakeBucket());try{
  const source=(await call("/sources")).body.data.find(x=>x.name==="台中");
  let o=(await call("/orders","POST",{sourceId:source.id})).body.data;
  o=(await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,operation:"save",line:{itemName:"甲品",quantityText:"1"}})).body.data;
  assert.equal((await raw("/orders/"+o.id+"/lines/"+o.lines[0].id+"/photo",{method:"PUT",headers:{"content-type":"image/jpeg"},body:jpeg})).status,422);
 }finally{sql.close()}
});
test("自訂中國貨 has 商品 ('') and 書籍 ('OTHER') blocks",async()=>{
 const {sql,call}=fixture();try{
  const source=(await call("/sources")).body.data.find(x=>x.kind==="CN_CUSTOM");
  let o=(await call("/orders","POST",{sourceId:source.id})).body.data;
  let r=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,operation:"save",line:{itemName:"艾粒",quantityText:"1"}});
  assert.equal(r.status,200);o=r.body.data;assert.equal(o.lines[0].section,"");
  r=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,operation:"save",line:{section:"OTHER",itemName:"傷寒論",publisher:"人民衛生出版社",author:"劉渡舟",quantityText:"1"}});
  assert.equal(r.status,200,JSON.stringify(r.body));o=r.body.data;assert.deepEqual(o.lines.map(l=>l.section),["","OTHER"]);
  assert.deepEqual([o.lines[1].publisher,o.lines[1].author],["人民衛生出版社","劉渡舟"]);
  r=await call("/orders/"+o.id+"/lines","POST",{expectedVersion:o.version,operation:"save",line:{section:"BAG",itemName:"錯",quantityText:"1"}});
  assert.equal(r.status,422);
 }finally{sql.close()}
});
test("migration 0066 moves 自訂中國貨 lines with a 規格 to 書籍 and splits 出版社/作者",()=>{
 const sql=new DatabaseSync(":memory:");
 const files=readdirSync(new URL("../migrations/",import.meta.url)).filter(f=>f.endsWith(".sql")).sort();
 for(const f of files.filter(f=>f<"0066"))sql.exec(readFileSync(new URL("../migrations/"+f,import.meta.url),"utf8"));
 const t="2026-11-11T00:00:00Z";
 sql.exec(`INSERT INTO ordering_sources(id,name,kind,sort_order,created_at,updated_at) VALUES(1,'自訂中國貨','CN_CUSTOM',0,'${t}','${t}'),(2,'台中','GENERAL',1,'${t}','${t}')`);
 sql.exec(`INSERT INTO ordering_orders(id,source_id,status,note,version,revision,created_at,updated_at) VALUES(1,1,'DRAFT','',1,0,'${t}','${t}'),(2,2,'DRAFT','',1,0,'${t}','${t}')`);
 sql.exec(`INSERT INTO ordering_lines(id,order_id,sort_order,item_name,spec,quantity_text) VALUES(1,1,1,'艾粒','','1'),(2,1,2,'傷寒論','人衛/劉渡舟、蘇寶剛','1'),(3,2,1,'台中品','某規格','1'),(4,1,3,'某書','只有出版社','1')`);
 sql.exec(readFileSync(new URL("../migrations/"+files.find(f=>f.startsWith("0066")),import.meta.url),"utf8"));
 assert.deepEqual(sql.prepare("SELECT id,section,spec,publisher,author FROM ordering_lines ORDER BY id").all().map(r=>[r.id,r.section,r.spec,r.publisher,r.author]),
  [[1,"","","",""],[2,"OTHER","","人衛","劉渡舟、蘇寶剛"],[3,"","某規格","",""],[4,"OTHER","","只有出版社",""]]);
});
