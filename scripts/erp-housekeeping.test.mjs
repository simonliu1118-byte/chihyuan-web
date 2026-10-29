import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { build } from "esbuild";
import { erpHousekeepingPhases, ERP_HOUSEKEEPING_CRON } from "../shared/erp-housekeeping.ts";

async function compile(path){
  const output=await build({entryPoints:[path],bundle:true,write:false,platform:"node",format:"esm"});
  return import("data:text/javascript;base64,"+Buffer.from(output.outputFiles[0].text).toString("base64"));
}
const {runErpHousekeeping}=await compile("worker/http/erp-housekeeping.ts");
const {default:worker}=await compile("worker/index.ts");
const at=Date.parse("2026-10-29T19:15:00Z");
const stamp=(offset)=>new Date(at+offset*60000).toISOString();

function fixture(){
  const sql=new DatabaseSync(":memory:");
  sql.exec("PRAGMA foreign_keys=ON");
  for(const file of readdirSync(new URL("../migrations/",import.meta.url)).filter(n=>n.endsWith(".sql")).sort())
    sql.exec(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
  sql.prepare("INSERT INTO app_members(identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES(?,?,?,?,?,?)")
    .run("erp-synthetic","9100","合成測試人員",1,stamp(-60),stamp(-60));
  const statements=[];
  const db={prepare(query){
    statements.push(query);
    let params=[];
    const stmt=sql.prepare(query);
    return {
      bind(...values){params=values;return this;},
      async first(){return stmt.get(...params)??null;},
      async all(){return {results:stmt.all(...params)};},
      async run(){const result=stmt.run(...params);
        return {meta:{changes:result.changes,last_row_id:sql.prepare("SELECT last_insert_rowid() AS n").get().n}};}
    };
  }};
  const add=(id,status,createdMinutes,startedMinutes=null,completedMinutes=null,fields=null,kind="ITEM_NO")=>
    sql.prepare("INSERT INTO erp_item_queries(id,owner_member_id,item_no,status,query_type,created_at,expires_at,started_at,completed_at,fields_json) VALUES(?,1,?,?,?,?,?,?,?,?)")
      .run(id,"X0001",status,kind,stamp(createdMinutes),stamp(createdMinutes+60),startedMinutes===null?null:stamp(startedMinutes),completedMinutes===null?null:stamp(completedMinutes),fields);
  return {sql,db,statements,add};
}

test("one Cron partitions 1-minute timeout, 5-minute purge and daily retention by scheduledTime",()=>{
  assert.equal(ERP_HOUSEKEEPING_CRON,"* * * * *");
  assert.deepEqual(erpHousekeepingPhases(Date.parse("2026-10-29T14:01:00Z")),{expire:true,purge:false,retention:false});
  assert.deepEqual(erpHousekeepingPhases(Date.parse("2026-10-29T14:05:00Z")),{expire:true,purge:true,retention:false});
  assert.deepEqual(erpHousekeepingPhases(at),{expire:true,purge:true,retention:true});
  assert.deepEqual(erpHousekeepingPhases(at+60000),{expire:true,purge:false,retention:false});
});
test("idle cron probes queue but never attempts an UPDATE or DELETE",async()=>{
  const f=fixture();
  try{
    await worker.scheduled({cron:ERP_HOUSEKEEPING_CRON,scheduledTime:at+60000},{DB:f.db});
    assert.equal(f.statements.filter(s=>/^\s*(UPDATE|DELETE|INSERT)\b/i.test(s)).length,0);
    assert.equal(f.statements.filter(s=>s.includes("EXISTS(SELECT 1 FROM erp_item_queries WHERE status=")).length,1);
  }finally{f.sql.close()}
});
test("expired QUEUED and timed-out RUNNING fail or expire once and retain audit; healthy queue remains",async()=>{
  const f=fixture();
  try{
    f.add("expired","QUEUED",-100);
    f.sql.prepare("UPDATE erp_item_queries SET expires_at=? WHERE id='expired'").run(stamp(-1));
    f.add("running","RUNNING",-30,-6);
    f.add("healthy","QUEUED",-1);
    await runErpHousekeeping(f.db,at+60000);
    assert.equal(f.sql.prepare("SELECT status FROM erp_item_queries WHERE id='expired'").get().status,"EXPIRED");
    assert.equal(f.sql.prepare("SELECT status,error_code FROM erp_item_queries WHERE id='running'").get().status,"FAILED");
    assert.equal(f.sql.prepare("SELECT error_code FROM erp_item_queries WHERE id='running'").get().error_code,"AGENT_TIMEOUT");
    assert.equal(f.sql.prepare("SELECT status FROM erp_item_queries WHERE id='healthy'").get().status,"QUEUED");
    const events=f.sql.prepare("SELECT action FROM audit_events WHERE entity_type='erp_item_query' ORDER BY action").all().map(row=>row.action);
    assert.deepEqual(events,["erp_item_query.expired","erp_item_query.failed"]);
  }finally{f.sql.close()}
});
test("results clear only after 5 minutes; daily 30-day retention is a separate phase",async()=>{
  const f=fixture();
  try{
    f.add("finished","DONE",-20,null,-10,'[{"name":"品號","value":"X0001"}]');
    f.add("older","DONE",-45000,null,-45000);
    await runErpHousekeeping(f.db,at-60000);
    assert.ok(f.sql.prepare("SELECT fields_json FROM erp_item_queries WHERE id='finished'").get().fields_json);
    assert.ok(f.sql.prepare("SELECT id FROM erp_item_queries WHERE id='older'").get());
    await runErpHousekeeping(f.db,at);
    assert.equal(f.sql.prepare("SELECT fields_json FROM erp_item_queries WHERE id='finished'").get().fields_json,null);
    assert.equal(f.sql.prepare("SELECT id FROM erp_item_queries WHERE id='older'").get(),undefined);
  }finally{f.sql.close()}
});
test("young results are preserved and cleanup uses the existing completion index",async()=>{
  const f=fixture();
  try{
    f.add("newer","DONE",-10,null,-4,"[]");
    await runErpHousekeeping(f.db,at);
    assert.equal(f.sql.prepare("SELECT fields_json FROM erp_item_queries WHERE id='newer'").get().fields_json,"[]");
    const indexes=f.sql.prepare("PRAGMA index_list(erp_item_queries)").all().map(row=>row.name);
    assert.ok(indexes.includes("idx_erp_query_retention"));
  }finally{f.sql.close()}
});

test("stocktake WRITE retains 3600-second timeout and transitions WRITING to WRITE_FAILED",async()=>{
  const f=fixture();
  try{
    f.add("stock-write","RUNNING",-80,-61,null,null,"STOCKTAKE_WRITE");
    f.sql.prepare("UPDATE erp_item_queries SET target_code=? WHERE id='stock-write'").run("990001");
    f.sql.prepare("INSERT INTO stocktake_sheets(sheet_no,sheet_date,status,write_query_id,created_at,updated_at) VALUES(?,?,'WRITING',?,?,?)")
      .run("990001","2026-10-28","stock-write",stamp(-90),stamp(-90));
    await runErpHousekeeping(f.db,at+60000);
    assert.equal(f.sql.prepare("SELECT status FROM erp_item_queries WHERE id='stock-write'").get().status,"FAILED");
    const sheet=f.sql.prepare("SELECT status,write_result_json FROM stocktake_sheets WHERE sheet_no='990001'").get();
    assert.equal(sheet.status,"WRITE_FAILED");
    assert.match(sheet.write_result_json,/逾時/);
    assert.equal(f.sql.prepare("SELECT COUNT(*) AS n FROM audit_events WHERE action='stocktake.write_failed'").get().n,1);
  }finally{f.sql.close()}
});
test("stocktake SYNC keeps its 1800-second limit rather than an ordinary 180-second limit",async()=>{
  const f=fixture();
  try{
    f.add("stock-sync","RUNNING",-10,-10,null,null,"STOCKTAKE_SYNC");
    await runErpHousekeeping(f.db,at+60000);
    assert.equal(f.sql.prepare("SELECT status FROM erp_item_queries WHERE id='stock-sync'").get().status,"RUNNING");
    f.sql.prepare("UPDATE erp_item_queries SET started_at=? WHERE id='stock-sync'").run(stamp(-31));
    await runErpHousekeeping(f.db,at+60000);
    assert.equal(f.sql.prepare("SELECT status FROM erp_item_queries WHERE id='stock-sync'").get().status,"FAILED");
  }finally{f.sql.close()}
});
