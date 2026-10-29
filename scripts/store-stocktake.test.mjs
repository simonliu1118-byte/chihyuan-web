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
  sql.prepare("INSERT INTO stocktake_sheets(sheet_no,sheet_date,status,detail_read_at,total_lines,recount_needed,created_at,updated_at) VALUES(?,?,'COUNTING',?,?,?, ?,?)")
   .run(number,"2026-10-28",now,data.length,data.length,now,now);
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


async function prepareWrite(f, counts=["4","1"], recount=["5","1"]) {
 f.insert();
 for(const line of (await f.sheet()).data.lines){
   const n=Number(line.seq)-1;
   const result=await f.user("/990001/line","PATCH",{lineKey:line.lineKey,expectedVersion:line.version,quantity:counts[n]});
   assert.equal(result.status,200,JSON.stringify(result));
 }
 let d=(await f.sheet()).data;
 assert.equal((await f.user("/990001/first-confirm","POST",{expectedVersion:d.sheet.version})).status,200);
 d=(await f.sheet()).data;
 for(const line of d.lines){
   if(line.locked)continue;
   const n=Number(line.seq)-1;
   const result=await f.user("/990001/line","PATCH",{lineKey:line.lineKey,expectedVersion:line.version,quantity:recount[n]});
   assert.equal(result.status,200,JSON.stringify(result));
 }
 d=(await f.sheet()).data;
 const created=await f.user("/990001/second-confirm","POST",{expectedVersion:d.sheet.version});
 assert.equal(created.status,200,JSON.stringify(created));
 const claimed=await f.agent("/item-queries/claim",{
   agentVersion:"synthetic",erpState:"BROWSE",queryTypes:["STOCKTAKE_WRITE"]});
 assert.equal(claimed.status,200,JSON.stringify(claimed));
 assert.equal(claimed.data.job.id,created.data.id);
 assert.equal(claimed.data.job.sheetNo,"990001");
 return {id:created.data.id,rows:claimed.data.job.rows};
}
function writeComplete(id,rows,overrides={}) {
 return {outcome:"FOUND",sheetNo:"990001",
  results:rows.map(l=>({key:l.key,ok:true,erpSeq:l.seq,message:"已核對"})),
  confirmed:true,mismatches:[],elapsedMs:15,agentVersion:"synthetic",...overrides};
}
test("WRITE complete is atomic, ERP_CONFIRMED, never writes quantities to shared Audit",async()=>{
 const f=fixture();try{
   const {id,rows}=await prepareWrite(f);
   assert.equal(rows.length,1);
   assert.equal(rows[0].key,"00001");
   const response=await f.agent("/item-queries/"+id+"/complete",writeComplete(id,rows));
   assert.equal(response.status,200,JSON.stringify(response));
   assert.equal((await f.sheet()).data.sheet.status,"ERP_CONFIRMED");
   assert.ok((await f.sheet()).data.sheet.erpConfirmedAt);
   const job=f.sql.prepare("SELECT status,result_json FROM erp_item_queries WHERE id=?").get(id);
   assert.equal(job.status,"DONE");
   assert.equal(job.result_json,null);
   const audit=f.sql.prepare("SELECT metadata_json FROM audit_events WHERE entity_type='erp_item_query' AND action='erp_item_query.completed' AND entity_key=?").get(id);
   assert.ok(audit);
   assert.doesNotMatch(audit.metadata_json,/"quantity"/);
   assert.doesNotMatch(audit.metadata_json,/"rows"/);
   assert.equal((await f.user("/990001/retry-write","POST",{expectedVersion:(await f.sheet()).data.sheet.version})).status,409);
 }finally{f.sql.close()}
});
test("WRITE mismatch on a never-written original line is accepted, blocks confirmation and permits explicit retry",async()=>{
 const f=fixture();try{
   const {id,rows}=await prepareWrite(f);
   const mismatch={key:"00002",seq:"00002",itemCode:"X0001",batch:"B2",expected:"1",actual:"0"};
   let response=await f.agent("/item-queries/"+id+"/complete",
     writeComplete(id,rows,{confirmed:false,mismatches:[mismatch]}));
   assert.equal(response.status,200,JSON.stringify(response));
   let sheet=(await f.sheet()).data.sheet;
   assert.equal(sheet.status,"WRITE_FAILED");
   assert.deepEqual(sheet.writeResult.mismatches,[mismatch]);
   assert.equal(f.sql.prepare("SELECT status FROM erp_item_queries WHERE id=?").get(id).status,"FAILED");
   const retry=await f.user("/990001/retry-write","POST",{expectedVersion:sheet.version});
   assert.equal(retry.status,200,JSON.stringify(retry));
   assert.notEqual(retry.data.id,id);
   const claim=await f.agent("/item-queries/claim",{
      agentVersion:"synthetic",erpState:"BROWSE",queryTypes:["STOCKTAKE_WRITE"]});
   assert.equal(claim.status,200,JSON.stringify(claim));
   assert.deepEqual(claim.data.job.rows,rows);
   response=await f.agent("/item-queries/"+retry.data.id+"/complete",writeComplete(retry.data.id,rows));
   assert.equal(response.status,200,JSON.stringify(response));
   sheet=(await f.sheet()).data.sheet;
   assert.equal(sheet.status,"ERP_CONFIRMED");
   assert.equal(sheet.secondConfirmedAt!==null,true);
 }finally{f.sql.close()}
});
test("WRITE rejects unrelated INVR11 mismatch keys and inconsistent confirmation without finishing job",async()=>{
 const f=fixture();try{
   const {id,rows}=await prepareWrite(f);
   for(const extra of [
     {confirmed:false,mismatches:[{key:"FAKE",seq:"00002",itemCode:"X0001",batch:"B2",expected:"1",actual:"0"}]},
     {confirmed:true,mismatches:[{key:"00002",seq:"00002",itemCode:"X0001",batch:"B2",expected:"1",actual:"0"}]},
     {results:[{key:"WRONG",ok:true,erpSeq:"00001",message:"ok"}]},
   ]){
     const response=await f.agent("/item-queries/"+id+"/complete",writeComplete(id,rows,extra));
     assert.equal(response.status,400,JSON.stringify(response));
     assert.equal(f.sql.prepare("SELECT status FROM erp_item_queries WHERE id=?").get(id).status,"RUNNING");
     assert.equal((await f.sheet()).data.sheet.status,"WRITING");
   }
 }finally{f.sql.close()}
});
test("WRITE empty rows still requires INVR11/INVI06 confirmation",async()=>{
 const f=fixture();try{
   const {id,rows}=await prepareWrite(f,["2","1"],["2","1"]);
   assert.deepEqual(rows,[]);
   const completed=await f.agent("/item-queries/"+id+"/complete",writeComplete(id,rows));
   assert.equal(completed.status,200,JSON.stringify(completed));
   assert.equal((await f.sheet()).data.sheet.status,"ERP_CONFIRMED");
 }finally{f.sql.close()}
});


test("running WRITE 3600-second timeout releases WRITING and requires an explicit supervisor retry",async()=>{
 const f=fixture();try{
   const {id}=await prepareWrite(f);
   f.sql.prepare("UPDATE erp_item_queries SET started_at='2020-01-01T00:00:00.000Z' WHERE id=?").run(id);
   const poll=await f.agent("/item-queries/claim",{agentVersion:"synthetic",erpState:"BROWSE",
      queryTypes:["STOCKTAKE_WRITE"]});
   assert.equal(poll.status,200,JSON.stringify(poll));
   assert.equal(f.sql.prepare("SELECT status,error_code FROM erp_item_queries WHERE id=?").get(id).status,"FAILED");
   const sheet=(await f.sheet()).data.sheet;
   assert.equal(sheet.status,"WRITE_FAILED");
   assert.match(JSON.stringify(sheet.writeResult),/逾時/);
   const retry=await f.user("/990001/retry-write","POST",{expectedVersion:sheet.version});
   assert.equal(retry.status,200,JSON.stringify(retry));
   assert.equal((await f.sheet()).data.sheet.status,"WRITING");
 }finally{f.sql.close()}
});
test("pre-existing untouched COUNTING sheet may refresh only before any counts are entered",async()=>{
 const f=fixture();try{
   f.insert();
   let refreshed=await f.user("/990001/refresh","POST");
   assert.equal(refreshed.status,200,JSON.stringify(refreshed));
   let claimed=await f.agent("/item-queries/claim",{agentVersion:"synthetic",erpState:"BROWSE",
      queryTypes:["STOCKTAKE_SYNC"]});
   assert.equal(claimed.status,200,JSON.stringify(claimed));
   assert.equal(claimed.data.job.onlySheet,"990001");
   const complete=await f.agent("/item-queries/"+refreshed.data.id+"/complete",{
     outcome:"FOUND",sheets:[{sheetNo:"990001",date:"2026-10-28"}],
     details:[{sheetNo:"990001",rows:[f.row("00001","B1","5")]}],
     elapsedMs:35,agentVersion:"synthetic"
   });
   assert.equal(complete.status,200,JSON.stringify(complete));
   let d=(await f.sheet()).data;
   assert.equal(d.lines.length,1,"missing original line must disappear on an approved unfilled refresh");
   assert.equal(JSON.stringify(d).includes("bookQty"),false);
   assert.equal((await f.user("/990001/line","PATCH",{
     lineKey:d.lines[0].lineKey,expectedVersion:d.lines[0].version,quantity:"5"
   })).status,200);
   refreshed=await f.user("/990001/refresh","POST");
   assert.equal(refreshed.status,409,"filled count cannot be overwritten by ERP reimport");
 }finally{f.sql.close()}
});


test("STOCKTAKE_WRITE progress accepts only STOCK and preserves monotonic completion",async()=>{
 const f=fixture();try{
  const {id,rows}=await prepareWrite(f);
  const wrong=await f.agent("/item-queries/"+id+"/progress",{stage:"REPORT",done:1,total:1});
  assert.equal(wrong.status,400,JSON.stringify(wrong));
  const valid=await f.agent("/item-queries/"+id+"/progress",{stage:"STOCK",done:1,total:rows.length});
  assert.equal(valid.status,200,JSON.stringify(valid));
  const older=await f.agent("/item-queries/"+id+"/progress",{stage:"STOCK",done:0,total:rows.length});
  assert.equal(older.status,200,JSON.stringify(older));
  const row=f.sql.prepare("SELECT progress_stage,progress_done,progress_total FROM erp_item_queries WHERE id=?").get(id);
  assert.deepEqual({...row},{progress_stage:"STOCK",progress_done:1,progress_total:rows.length});
 }finally{f.sql.close()}
});
test("blind current-count rows include the actual actor name but no book quantity",async()=>{
 const f=fixture();try{
  f.insert();
  const d=(await f.sheet()).data;
  const row=d.lines[0];
  const save=await f.user("/990001/line","PATCH",{
     lineKey:row.lineKey,quantity:"2",expectedVersion:row.version});
  assert.equal(save.status,200,JSON.stringify(save));
  const fresh=(await f.sheet()).data.lines.find(l=>l.lineKey===row.lineKey);
  assert.equal(fresh.firstByName,"合成盤點員甲");
  assert.equal(fresh.firstBy,1);
  assert.equal(fresh.bookQty,undefined);
 }finally{f.sql.close()}
});


test("unignored pre-created stub is not skipped and receives its first ERP details",async()=>{
 const f=fixture();try{
  const ignored=await f.user("/ignore","POST",{sheetNo:"990001"});
  assert.equal(ignored.status,200,JSON.stringify(ignored));
  assert.deepEqual((await f.user("")).data,[]);
  const shown=(await f.user("?ignored=true")).data;
  assert.equal(shown.length,1);
  const unignored=await f.user("/990001/unignore","POST",{expectedVersion:1});
  assert.equal(unignored.status,200,JSON.stringify(unignored));
  const sync=await f.user("/sync","POST");
  assert.equal(sync.status,200,JSON.stringify(sync));
  const claimed=await f.agent("/item-queries/claim",{agentVersion:"synthetic",erpState:"BROWSE",
   queryTypes:["STOCKTAKE_SYNC"]});
  assert.equal(claimed.status,200,JSON.stringify(claimed));
  assert.deepEqual(claimed.data.job.skipSheets,[]);
  const completed=await f.agent("/item-queries/"+sync.data.id+"/complete",{
    outcome:"FOUND",sheets:[{sheetNo:"990001",date:"2026-10-28"}],
    details:[{sheetNo:"990001",rows:[f.row("00001","B1","2")]}],
    elapsedMs:15,agentVersion:"synthetic"
  });
  assert.equal(completed.status,200,JSON.stringify(completed));
  const d=(await f.sheet()).data;
  assert.equal(d.lines.length,1);
  assert.equal(d.sheet.status,"COUNTING");
  assert.equal(d.lines[0].bookQty,undefined);
 }finally{f.sql.close()}
});


test("STOCKTAKE_SYNC imports 3000 rows with bulk JSON1 in one atomic completion; 3001 is rejected",async()=>{
 const f=fixture();try{
  const created=await f.user("/sync","POST");
  assert.equal(created.status,200,JSON.stringify(created));
  const claim=await f.agent("/item-queries/claim",{agentVersion:"synthetic",erpState:"BROWSE",
    queryTypes:["STOCKTAKE_SYNC"]});
  assert.equal(claim.status,200,JSON.stringify(claim));
  const rows=Array.from({length:3000},(_,i)=>f.row(String(i+1).padStart(5,"0"),"LOT"+i,"1"));
  const body={outcome:"FOUND",sheets:[{sheetNo:"990001",date:"2026-10-28"}],
    details:[{sheetNo:"990001",rows}],elapsedMs:1500,agentVersion:"synthetic"};
  const tooMany=await f.agent("/item-queries/"+created.data.id+"/complete",
    {...body,details:[{sheetNo:"990001",rows:[...rows, f.row("03001","LOT3001","1")]}]});
  assert.equal(tooMany.status,400,JSON.stringify(tooMany).slice(0,1000));
  assert.equal(f.sql.prepare("SELECT count(*) n FROM stocktake_lines").get().n,0);
  const saved=await f.agent("/item-queries/"+created.data.id+"/complete",body);
  assert.equal(saved.status,200,JSON.stringify(saved).slice(0,1000));
  assert.equal(f.sql.prepare("SELECT count(*) n FROM stocktake_lines").get().n,3000);
  assert.equal(f.sql.prepare("SELECT result_json FROM erp_item_queries WHERE id=?")
    .get(created.data.id).result_json,null);
  const detail=await f.sheet();
  assert.equal(detail.status,200);
  assert.equal(detail.data.lines.length,3000);
  assert.equal(JSON.stringify(detail.data).includes("bookQty"),false);
 }finally{f.sql.close()}
});


test("new batch must receive ERP sequence and existing batch must keep its sequence before CONFIRMED",async()=>{
 const validate=await compile("worker/http/stocktake-erp.ts","validateWriteResult");
 const base={outcome:"FOUND",sheetNo:"990001",confirmed:true,mismatches:[]};
 const added=[{key:"N0001",seq:null,itemCode:"X0001",batch:"NEW",quantity:"3"}];
 assert.throws(()=>validate({...base,results:[{key:"N0001",ok:true,erpSeq:null,message:"ok"}]},
   "990001",added),/ERP/);
 assert.deepEqual(validate({...base,results:[{key:"N0001",ok:true,erpSeq:"00003",message:"ok"}]},
   "990001",added).results.map(x=>x.erpSeq),["00003"]);
 const existing=[{key:"00001",seq:"00001",itemCode:"X0001",batch:"B1",quantity:"1"}];
 assert.throws(()=>validate({...base,results:[{key:"00001",ok:true,erpSeq:"00002",message:"ok"}]},
   "990001",existing),/ERP/);
});


test("each member has at most 3 active stocktake ERP jobs and fourth receives actionable 409",async()=>{
 const f=fixture();try{
  for(let i=0;i<3;i++){
   const created=await f.user("/sync","POST");
   assert.equal(created.status,200,JSON.stringify(created));
  }
  const fourth=await f.user("/sync","POST");
  assert.equal(fourth.status,409,JSON.stringify(fourth));
  assert.equal(fourth.error.code,"ERP_QUEUE_LIMIT");
  assert.equal(f.sql.prepare("SELECT count(*) n FROM erp_item_queries WHERE status='QUEUED'").get().n,3);
 }finally{f.sql.close()}
});

// Claude review (2026-10-29): robustness fixes.
test("a failed WRITE may carry no rows and leaves the sheet WRITE_FAILED for retry",async()=>{
 const f=fixture();try{
  const {id}=await prepareWrite(f);
  const failed=await f.agent("/item-queries/"+id+"/complete",{outcome:"FAILED",sheetNo:"990001",results:[],confirmed:false,mismatches:[],
   errorCode:"ERP_SEATS_FULL",errorMessage:null,elapsedMs:5,agentVersion:"synthetic"});
  assert.equal(failed.status,200,JSON.stringify(failed));
  assert.equal((await f.sheet()).data.sheet.status,"WRITE_FAILED");
 }finally{f.sql.close()}
});
test("a failed SYNC may omit the lists; a refresh may list every sheet; a sheet ignored meanwhile is skipped",async()=>{
 const f=fixture();try{
  const first=await f.user("/sync","POST");
  await f.agent("/item-queries/claim",{agentVersion:"synthetic",erpState:"BROWSE",queryTypes:["STOCKTAKE_SYNC"]});
  const failed=await f.agent("/item-queries/"+first.data.id+"/complete",{outcome:"FAILED",errorCode:"ERP_NOT_OPEN",errorMessage:null,elapsedMs:5,agentVersion:"synthetic"});
  assert.equal(failed.status,200,JSON.stringify(failed));
  // Ignored after the claim: its details are skipped, the other sheet is kept.
  const second=await f.user("/sync","POST");
  await f.agent("/item-queries/claim",{agentVersion:"synthetic",erpState:"BROWSE",queryTypes:["STOCKTAKE_SYNC"]});
  assert.equal((await f.user("/ignore","POST",{sheetNo:"990002"})).status,200);
  const done=await f.agent("/item-queries/"+second.data.id+"/complete",{outcome:"FOUND",
   sheets:[{sheetNo:"990001",date:"2026-10-28"},{sheetNo:"990002",date:"2026-10-28"}],
   details:[{sheetNo:"990001",rows:[f.row("00001","B1","2"),f.row("00002","B1","3")]},{sheetNo:"990002",rows:[f.row("00001","B1","2")]}],
   elapsedMs:5,agentVersion:"synthetic"});
  assert.equal(done.status,200,JSON.stringify(done));
  assert.equal((await f.sheet("990001")).data.lines.length,2,"the same 品號＋批號 twice on an ERP sheet is kept");
  assert.equal(f.sql.prepare("SELECT status FROM stocktake_sheets WHERE sheet_no='990002'").get().status,"IGNORED");
  assert.equal(f.sql.prepare("SELECT COUNT(*) n FROM stocktake_lines WHERE sheet_no='990002'").get().n,0);
  // Refresh: the agent may return the whole list with only this sheet's details.
  const refresh=await f.user("/990001/refresh","POST");
  assert.equal(refresh.status,200,JSON.stringify(refresh));
  await f.agent("/item-queries/claim",{agentVersion:"synthetic",erpState:"BROWSE",queryTypes:["STOCKTAKE_SYNC"]});
  const refreshed=await f.agent("/item-queries/"+refresh.data.id+"/complete",{outcome:"FOUND",
   sheets:[{sheetNo:"990001",date:"2026-10-28"},{sheetNo:"990002",date:"2026-10-28"}],
   details:[{sheetNo:"990001",rows:[f.row("00001","B1","5")]}],elapsedMs:5,agentVersion:"synthetic"});
  assert.equal(refreshed.status,200,JSON.stringify(refreshed));
  assert.equal((await f.sheet("990001")).data.lines.length,1);
 }finally{f.sql.close()}
});
test("a counted quantity cannot be negative",async()=>{
 const f=fixture();try{
  f.insert();const line=(await f.sheet()).data.lines[0];
  assert.equal((await f.user("/990001/line","PATCH",{lineKey:line.lineKey,expectedVersion:line.version,quantity:"-1"})).status,422);
  assert.equal((await f.user("/990001/line","PATCH",{lineKey:line.lineKey,expectedVersion:line.version,quantity:"0"})).status,200);
 }finally{f.sql.close()}
});

test("incremental GET returns only changed lines and deletion tombstones",async()=>{
 const f=fixture();try{
   f.insert();
   const before=(await f.sheet()).data;
   assert.equal(before.sheet.total,2);
   assert.equal(before.sheet.counted,0);
   const idle=(await f.user("/990001?since="+before.sheet.version)).data;
   assert.deepEqual(idle.lines,[]);
   const first=before.lines[0];
   const patched=await f.user("/990001/line","PATCH",{lineKey:first.lineKey,quantity:"2",expectedVersion:first.version});
   assert.equal(patched.status,200,JSON.stringify(patched));
   assert.equal(patched.data.sheet.counted,1);
   assert.equal(patched.data.line.lineKey,first.lineKey);
   assert.equal(patched.data.lines,undefined);
   const delta=(await f.user("/990001?since="+before.sheet.version)).data;
   assert.equal(delta.lines.length,1);
   assert.equal(delta.lines[0].lineKey,first.lineKey);
   assert.equal(delta.sheet.counted,1);
   const added=await f.user("/990001/batches","POST",{itemCode:"X0001",batch:"NEW",quantity:"1"});
   assert.equal(added.status,200,JSON.stringify(added));
   assert.equal(added.data.sheet.total,3);
   assert.equal(added.data.sheet.counted,2);
   const revision=added.data.sheet.version;
   const removed=await f.user("/990001/batches","DELETE",{lineKey:added.data.line.lineKey,expectedVersion:added.data.line.version,confirmNonEmpty:true});
   assert.equal(removed.status,200,JSON.stringify(removed));
   assert.equal(removed.data.sheet.total,2);
   assert.equal(removed.data.sheet.counted,1);
   const changes=(await f.user("/990001?since="+revision)).data;
   assert.deepEqual(changes.removedKeys,[added.data.line.lineKey]);
   assert.deepEqual(changes.lines,[]);
 }finally{f.sql.close()}
});
