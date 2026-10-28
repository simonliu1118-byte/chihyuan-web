import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {createHash} from "node:crypto";
import {build} from "esbuild";

async function compile(entry,name){
 const output=await build({entryPoints:[entry],bundle:true,write:false,platform:"node",format:"esm"});
 return (await import("data:text/javascript;base64,"+Buffer.from(output.outputFiles[0].text).toString("base64")))[name];
}
const [handleStocktake,handleErp]=await Promise.all([
 compile("worker/http/store-stocktake-routes.ts","handleStoreStocktakeRoute"),
 compile("worker/http/erp-item-query-routes.ts","handleErpItemQueryRoute")
]);
const TOKEN="a".repeat(64);
function fixture(role="SUPER_ADMIN",grant=true){
 const sql=new DatabaseSync(":memory:");
 sql.exec("PRAGMA foreign_keys=ON");
 for(const file of readdirSync(new URL("../migrations/",import.meta.url)).filter(f=>f.endsWith(".sql")).sort())
   sql.exec(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
 const now="2026-10-29T01:00:00Z";
 sql.prepare("INSERT INTO app_members(identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?)")
   .run("stocktake-worker","9000","合成盤點員甲",1,now,now);
 if(grant)sql.prepare("INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at) VALUES(1,'STORE_STOCKTAKE',1,?)").run(now);
 sql.prepare("INSERT INTO erp_item_agent_credentials(id,token_hash,created_at) VALUES(1,?,?)")
   .run(createHash("sha256").update(TOKEN).digest("hex"),now);
 const db={
  prepare(query){let bindings=[];const stmt=sql.prepare(query);const execute=()=>{
    const results=stmt.all(...bindings);
    return {results,meta:{changes:sql.prepare("SELECT changes() n").get().n,last_row_id:sql.prepare("SELECT last_insert_rowid() n").get().n}};
   };
   return {bind(...params){bindings=params;return this},async first(){return execute().results[0]??null},
    async all(){return execute()},async run(){return execute()},execute}
  },
  async batch(stmts){
   sql.exec("BEGIN");
   try{const results=stmts.map(s=>s.execute());sql.exec("COMMIT");return results}
   catch(e){sql.exec("ROLLBACK");throw e}
  }
 };
 const principal={workspaceId:"test-workspace",employeeId:"stocktake-worker",employeeNo:"9000",displayName:"合成盤點員甲",
  workspaceRole:role,isIdentityAdmin:false,emailVerified:true,isWorkspaceSuperAdmin:role==="SUPER_ADMIN",
  credentialVersion:1,employeeRevision:1};
 const env={DB:db,IDENTITY_APPLICATION_ID:"APP_TEST",IDENTITY_WORKSPACE_ID:"test-workspace",
  IDENTITY:{async fetch(){return Response.json({principal,session:{expiresAt:"2999-01-01T00:00:00Z"}})}}};
 const api=async(path,method="GET",body,agent=false)=>{
  const req=new Request("https://acceptance.test"+path,{method,headers:{
   "content-type":"application/json",...(agent?{authorization:"Bearer "+TOKEN}:{cookie:"cyweb_identity_session=cyid_"+"a".repeat(64)})},
   body:body===undefined?undefined:JSON.stringify(body)});
  const fn=path.startsWith("/api/erp")?handleErp:handleStocktake;
  const res=await fn(req,env,"synthetic-stocktake-request");
  return {status:res.status,...await res.json()};
 };
 const user=(path,method="GET",body)=>api("/api/business/store/stocktake"+path,method,body);
 const agent=(path,body)=>api("/api/erp-agent"+path,"POST",body,true);
 const sheet=(number="990001")=>user("/"+number);
 const row=(seq,batch,bookQty,code="X0001")=>({
  seq,itemCode:code,itemName:"合成品名",spec:"測試規格",warehouseName:"倉甲",location:"A-01",unit:"個",batch,bookQty
 });
 const insert=(number="990001",data=[row("00001","B1","2"),row("00002","B2","1")])=>{
  sql.prepare("INSERT INTO stocktake_sheets(sheet_no,sheet_date,status,detail_read_at,created_at,updated_at) VALUES(?,?,'COUNTING',?,?,?)")
   .run(number,"2026-10-28",now,now,now);
  for(const line of data)sql.prepare("INSERT INTO stocktake_lines(sheet_no,line_key,seq,item_code,item_name,spec,warehouse_name,location,unit,batch,book_qty) VALUES(?,?,?,?,?,?,?,?,?,?,?)")
   .run(number,line.seq,line.seq,line.itemCode,line.itemName,line.spec,line.warehouseName,line.location,line.unit,line.batch,line.bookQty);
 };
 return {sql,db,api,user,agent,sheet,row,insert};
}

test("access denied without STOCKTAKE grant; normal user cannot confirm",async()=>{
 const f=fixture("USER",false);try{assert.equal((await f.user("")).status,403)}finally{f.sql.close()}
 const g=fixture("USER");try{
  g.insert();assert.equal((await g.user("/990001")).status,200);
  assert.equal((await g.user("/990001/first-confirm","POST",{expectedVersion:1})).status,403);
  assert.equal((await g.user("/ignore","POST",{sheetNo:"999888"})).status,403);
 }finally{g.sql.close()}
});
test("blind COUNTING API has no bookQty, audit does not include per-line changes, conflict is per row",async()=>{
 const f=fixture();try{
  f.insert();
  let d=(await f.sheet()).data;
  assert.equal(d.sheet.status,"COUNTING");
  assert.ok(d.lines.every(l=>!("bookQty" in l)),JSON.stringify(d.lines));
  assert.equal(JSON.stringify(d).includes("bookQty"),false);
  const first=d.lines[0],second=d.lines[1];
  const one=await f.user("/990001/line","PATCH",{lineKey:first.lineKey,quantity:"1",expectedVersion:first.version});
  assert.equal(one.status,200,JSON.stringify(one));
  assert.equal((await f.user("/990001/line","PATCH",{lineKey:first.lineKey,quantity:"3",expectedVersion:1})).status,409);
  assert.equal((await f.user("/990001/line","PATCH",{lineKey:second.lineKey,quantity:"2",expectedVersion:second.version})).status,200);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM stocktake_line_history").get().n,2);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM audit_events WHERE entity_type='stocktake'").get().n,0);
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM stocktake_participants").get().n,1);
  d=(await f.sheet()).data;
  const c=await f.user("/990001/first-confirm","POST",{expectedVersion:d.sheet.version});
  assert.equal(c.status,200,JSON.stringify(c));
  assert.equal(c.data.sheet.status,"RECOUNTING");
  assert.ok(c.data.lines.every(l=>"bookQty" in l));
  assert.ok(c.data.lines.every(l=>l.locked),"1+2 vs 2+1 must lock at item total, not batch");
 }finally{f.sql.close()}
});
test("adding a batch requires an existing batch-managed item and rejects duplicates",async()=>{
 const f=fixture();try{
  f.insert();
  assert.equal((await f.user("/990001/batches","POST",{itemCode:"X9999",batch:"B9",quantity:"1"})).status,422);
  assert.equal((await f.user("/990001/batches","POST",{itemCode:"X0001",batch:"B1",quantity:"1"})).status,409);
  const added=await f.user("/990001/batches","POST",{itemCode:"X0001",batch:"B9",quantity:"1"});
  assert.equal(added.status,200,JSON.stringify(added));assert.equal(added.data.lines.length,3);
  const newLine=added.data.lines.find(x=>x.isAdded);
  assert.equal(newLine.bookQty,undefined,"blind even for added batch");
  assert.equal((await f.user("/990001/batches","DELETE",{lineKey:newLine.lineKey,expectedVersion:newLine.version})).status,409);
  assert.equal((await f.user("/990001/batches","DELETE",{lineKey:newLine.lineKey,expectedVersion:newLine.version,confirmNonEmpty:true})).status,200);
 }finally{f.sql.close()}
});
test("difference triggers recount; write sends only changed existing batches plus new",async()=>{
 const f=fixture();try{
  f.insert();
  let d=(await f.sheet()).data;
  for(const l of d.lines) {
   const save=await f.user("/990001/line","PATCH",{lineKey:l.lineKey,expectedVersion:l.version,quantity:l.seq==="00001"?"4":"1"});
   assert.equal(save.status,200,JSON.stringify(save));
  }
  d=(await f.sheet()).data;
  assert.equal((await f.user("/990001/first-confirm","POST",{expectedVersion:d.sheet.version})).status,200);
  d=(await f.sheet()).data;
  assert.equal(d.sheet.recountNeeded,2);
  for(const l of d.lines){
   const saved=await f.user("/990001/line","PATCH",{lineKey:l.lineKey,quantity:l.seq==="00001"?"5":"1",expectedVersion:l.version});
   assert.equal(saved.status,200,JSON.stringify(saved));
  }
  d=(await f.sheet()).data;
  const confirm=await f.user("/990001/second-confirm","POST",{expectedVersion:d.sheet.version});
  assert.equal(confirm.status,200,JSON.stringify(confirm));
  const stored=f.sql.prepare("SELECT keyword FROM erp_item_queries WHERE id=?").get(confirm.data.id);
  const sent=JSON.parse(stored.keyword);
  assert.equal(sent.rows.length,1);
  assert.deepEqual(sent.rows[0],{key:"00001",seq:"00001",itemCode:"X0001",batch:"B1",quantity:"5"});
  assert.equal((await f.sheet()).data.sheet.status,"WRITING");
 }finally{f.sql.close()}
});
test("SYNC validates exact job payload and never reveals book quantities in user read",async()=>{
 const f=fixture();try{
  const created=await f.user("/sync","POST");
  assert.equal(created.status,200,JSON.stringify(created));
  const claimed=await f.agent("/item-queries/claim",{agentVersion:"synthetic",erpState:"BROWSE",queryTypes:["STOCKTAKE_SYNC"]});
  assert.equal(claimed.status,200,JSON.stringify(claimed));
  assert.deepEqual(claimed.data.job.skipSheets,[]);
  assert.equal(claimed.data.job.onlySheet,null);
  const invalid=await f.agent("/item-queries/"+created.data.id+"/complete",{outcome:"FOUND",sheets:[{sheetNo:"990001",date:"2026-10-28"}],
   details:[{sheetNo:"990001",rows:[f.row("001","B1","2")]}],elapsedMs:25,agentVersion:"synthetic"});
  assert.equal(invalid.status,400,"seq must have 5 digits");
  const ok=await f.agent("/item-queries/"+created.data.id+"/complete",{outcome:"FOUND",sheets:[{sheetNo:"990001",date:"2026-10-28"}],
   details:[{sheetNo:"990001",rows:[f.row("00001","B1","2")]}],elapsedMs:25,agentVersion:"synthetic"});
  assert.equal(ok.status,200,JSON.stringify(ok));
  const d=(await f.sheet()).data;
  assert.equal(d.lines.length,1);
  assert.equal(JSON.stringify(d).includes("bookQty"),false);
  assert.equal(f.sql.prepare("SELECT result_json FROM erp_item_queries WHERE id=?").get(created.data.id).result_json,null);
  const repeat=await f.user("/sync","POST");
  assert.equal(repeat.status,200);
  const second=await f.agent("/item-queries/claim",{agentVersion:"synthetic",erpState:"BROWSE",queryTypes:["STOCKTAKE_SYNC"]});
  assert.deepEqual(second.data.job.skipSheets,["990001"]);
 }finally{f.sql.close()}
});
