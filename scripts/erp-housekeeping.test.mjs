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
