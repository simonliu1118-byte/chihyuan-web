import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {build} from "esbuild";
const compiled=await build({entryPoints:["worker/http/store-routes.ts"],bundle:true,write:false,platform:"node",format:"esm"});
const {handleStoreRoute}=await import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));
function fixture(role="SUPER_ADMIN"){
 const sql=new DatabaseSync(":memory:");
 const queries=[];
 sql.exec("PRAGMA foreign_keys=ON");
 for(const file of readdirSync(new URL("../migrations/",import.meta.url)).filter(f=>f.endsWith(".sql")).sort())sql.exec(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
 const t="2026-10-21T00:00:00Z";
 sql.prepare("INSERT INTO app_members(identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?)").run("test-store","9999","測試員工甲",1,t,t);
 const db={
  prepare(query){queries.push(query);let bind=[];const s=sql.prepare(query);const exec=()=>({results:s.all(...bind),meta:{changes:sql.prepare("SELECT changes() n").get().n,last_row_id:sql.prepare("SELECT last_insert_rowid() n").get().n}});
   return {bind(...params){bind=params;return this},async first(){return exec().results[0]??null},async all(){return exec()},async run(){return exec()},execute:exec}
  },
  async batch(stmts){sql.exec("BEGIN");try{const out=stmts.map(s=>s.execute());sql.exec("COMMIT");return out}catch(e){sql.exec("ROLLBACK");throw e}}
 };
 const principal={workspaceId:"workspace-test",employeeId:"test-store",employeeNo:"9999",displayName:"測試員工甲",workspaceRole:role,
 isIdentityAdmin:false,emailVerified:true,isWorkspaceSuperAdmin:role==="SUPER_ADMIN",credentialVersion:1,employeeRevision:1};
 const env={DB:db,IDENTITY_APPLICATION_ID:"APP_TEST",IDENTITY_WORKSPACE_ID:"workspace-test",IDENTITY:{async fetch(){return Response.json({principal,session:{expiresAt:"2999-01-01T00:00:00Z"}})}}};
 const call=async(path,method="GET",json)=>{const req=new Request("https://acceptance.test/api/business/store"+path,{method,headers:{cookie:"cyweb_identity_session=cyid_"+"a".repeat(64),"content-type":"application/json"},body:json===undefined?undefined:JSON.stringify(json)});const res=await handleStoreRoute(req,env,"store-test");return {status:res.status,body:await res.json()}};
 return {sql,call,queries,db};
}
const order=(over={})=>({orderDate:"2026-10-28",customerName:"測試顧客甲",phone:"0912-345-678",lineName:"測試LINE",deposit:100,note:"",
 lines:[{itemCode:"T001",itemName:"測試品名甲",quantity:2,unitPrice:150},{itemCode:"",itemName:"測試品名乙",quantity:1,unitPrice:99}],...over});

test("permission gate: a member without 門市顧客訂購 is refused",async()=>{
 const denied=fixture("USER");try{assert.equal((await denied.call("/orders")).status,403)}finally{denied.sql.close()}
});

test("an order with several items is saved in one go, totals are computed and search matches phone digits",async()=>{
 const {sql,call}=fixture();try{
  const r=await call("/orders","POST",order());assert.equal(r.status,200,JSON.stringify(r.body));
  const o=r.body.data;
  assert.equal(o.phone,"0912345678");assert.equal(o.total,399);assert.equal(o.status,"ORDERED");
  assert.deepEqual(o.lines.map(l=>l.itemName),["測試品名甲","測試品名乙"]);
  assert.equal((await call("/orders","POST",order({lines:[]}))).status,422,"at least one item");
  assert.equal((await call("/orders","POST",order({customerName:" "}))).status,422,"name required");
  assert.equal((await call("/orders?q=345678")).body.data.length,1);
  assert.equal((await call("/orders?q="+encodeURIComponent("測試品名乙"))).body.data.length,1);
  assert.equal((await call("/orders?q=nomatch")).body.data.length,0);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM store_customer_order_lines").get().n,2);
  // Editing replaces the items; a stale version is refused.
  const e=await call("/orders/"+o.id,"PATCH",{...order({lines:[{itemName:"測試品名丙",quantity:3,unitPrice:10}]}),expectedVersion:o.version});
  assert.equal(e.status,200,JSON.stringify(e.body));assert.equal(e.body.data.total,30);assert.equal(e.body.data.lines.length,1);
  assert.equal((await call("/orders/"+o.id,"PATCH",{...order(),expectedVersion:o.version})).status,409);
 }finally{sql.close()}
});

test("blacklist by phone: 拒絕訂購 refuses, 收全款 needs the deposit to equal the amount",async()=>{
 const {sql,call}=fixture();try{
  assert.equal((await call("/blacklist","POST",{name:"測試黑名單甲",phone:"0911 111 111",reason:"多次未取",action:"REFUSE"})).status,200);
  assert.equal((await call("/blacklist","POST",{name:"重複",phone:"0911111111",reason:"測試",action:"REFUSE"})).status,409,"one row per phone");
  const hit=await call("/blacklist/check?phone=0911-111-111");assert.equal(hit.body.data.action,"REFUSE");
  assert.equal((await call("/blacklist/check?phone=0922222222")).body.data,null);
  const refused=await call("/orders","POST",order({phone:"0911111111"}));assert.equal(refused.status,409);assert.match(refused.body.error.message,/拒絕訂購/);
  await call("/blacklist","POST",{name:"測試黑名單乙",phone:"0933333333",reason:"曾棄單",action:"FULL_PAYMENT"});
  assert.equal((await call("/orders","POST",order({phone:"0933333333",deposit:100}))).status,422);
  assert.equal((await call("/orders","POST",order({phone:"0933333333",deposit:399}))).status,200);
  const list=(await call("/blacklist")).body.data;assert.equal(list.length,2);
  assert.equal((await call("/blacklist/"+list[0].id,"DELETE")).status,200);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM store_blacklist").get().n,1);
 }finally{sql.close()}
});

test("status: 通知 starts the pickup clock, 取消 needs a reason and can add the customer to the blacklist",async()=>{
 const {sql,call}=fixture();try{
  let o=(await call("/orders","POST",order())).body.data;
  o=(await call("/orders/"+o.id+"/status","POST",{expectedVersion:o.version,status:"NOTIFIED"})).body.data;
  assert.equal(o.status,"NOTIFIED");assert.ok(o.notifiedAt);
  const firstNotice=o.notifiedAt;
  o=(await call("/orders/"+o.id+"/status","POST",{expectedVersion:o.version,status:"NOTIFIED"})).body.data;
  assert.equal(o.notifiedAt,firstNotice,"re-saving 通知 keeps the original date");
  o=(await call("/orders/"+o.id+"/status","POST",{expectedVersion:o.version,status:"ARRIVED"})).body.data;
  assert.equal(o.notifiedAt,null,"stepping back clears it");
  assert.equal((await call("/orders/"+o.id+"/status","POST",{expectedVersion:o.version,status:"CANCELLED"})).status,422,"reason required");
  const c=await call("/orders/"+o.id+"/status","POST",{expectedVersion:o.version,status:"CANCELLED",reason:"逾期未取",blacklistAction:"FULL_PAYMENT"});
  assert.equal(c.status,200,JSON.stringify(c.body));assert.equal(c.body.data.cancelReason,"逾期未取");
  const b=sql.prepare("SELECT name,phone,reason,action FROM store_blacklist").get();
  assert.deepEqual({...b},{name:"測試顧客甲",phone:"0912345678",reason:"逾期未取",action:"FULL_PAYMENT"});
  assert.equal((await call("/orders/"+o.id,"PATCH",{...order({deposit:399}),expectedVersion:c.body.data.version})).status,409,"a cancelled order is not edited");
  assert.equal((await call("/orders/"+o.id+"/status","POST",{expectedVersion:1,status:"ORDERED"})).status,409,"stale version");
 }finally{sql.close()}
});
