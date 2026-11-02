import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { build } from "esbuild";
import { erpHousekeepingPhases } from "../shared/erp-housekeeping.ts";
import { CYWEB_CRON, cywebCronTasks } from "../shared/cyweb-cron.ts";

async function compile(path){
  const output=await build({entryPoints:[path],bundle:true,write:false,platform:"node",format:"esm"});
  return import("data:text/javascript;base64,"+Buffer.from(output.outputFiles[0].text).toString("base64"));
}
const {runErpHousekeeping,expireStaleErpQueries}=await compile("worker/http/erp-housekeeping.ts");
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

test("the single CY Web cron runs ERP checks every tick and each daily job at its Taiwan time",()=>{
  assert.equal(CYWEB_CRON,"*/5 * * * *");
  assert.deepEqual(erpHousekeepingPhases(Date.parse("2026-10-29T14:05:00Z")),{expire:true,purge:true,retention:false});
  assert.deepEqual(erpHousekeepingPhases(at),{expire:true,purge:true,retention:true});
  const tasks=t=>{const x=cywebCronTasks(Date.parse("2026-10-29T"+t+":00Z"));return Object.keys(x).filter(k=>x[k]===true&&k!=="erp").join()};
  assert.equal(tasks("16:00"),"storeMonthly");assert.equal(tasks("19:00"),"programCatalog");assert.equal(tasks("19:15"),"erpRetention");
  assert.equal(tasks("19:30"),"backup");assert.equal(tasks("19:45"),"backup");
  for(const t of ["16:05","19:05","19:20","19:35","19:50","03:30","11:30"])assert.equal(tasks(t),"",t);
});
test("idle cron probes queue but never attempts an UPDATE or DELETE",async()=>{
  const f=fixture();
  try{
    await worker.scheduled({cron:CYWEB_CRON,scheduledTime:at+5*60000},{DB:f.db});
    // Only the bounded result purge (a no-op here) writes; nothing touches the queue while it is idle.
    assert.deepEqual(f.statements.filter(s=>/^\s*(UPDATE|DELETE|INSERT)\b/i.test(s)).map(s=>s.trim().slice(0,32)),["UPDATE erp_item_queries SET fiel"]);
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
test("results clear 5 minutes after completion; daily 7-day retention runs only at its tick",async()=>{
  const f=fixture();
  try{
    f.add("finished","DONE",-20,null,-10,'[{"name":"品號","value":"X0001"}]');
    f.add("older","DONE",-45000,null,-45000);
    f.add("week-old","DONE",-8*1440,null,-8*1440);
    f.add("six-days","DONE",-6*1440,null,-6*1440);
    await runErpHousekeeping(f.db,at-5*60000);
    assert.ok(f.sql.prepare("SELECT fields_json FROM erp_item_queries WHERE id='finished'").get().fields_json);
    assert.ok(f.sql.prepare("SELECT id FROM erp_item_queries WHERE id='older'").get());
    await runErpHousekeeping(f.db,at);
    assert.equal(f.sql.prepare("SELECT fields_json FROM erp_item_queries WHERE id='finished'").get().fields_json,null);
    assert.equal(f.sql.prepare("SELECT id FROM erp_item_queries WHERE id='older'").get(),undefined);
    // Finished queries are kept 7 days.
    assert.equal(f.sql.prepare("SELECT id FROM erp_item_queries WHERE id='week-old'").get(),undefined);
    assert.ok(f.sql.prepare("SELECT id FROM erp_item_queries WHERE id='six-days'").get());
  }finally{f.sql.close()}
});
test("5-minute purge reads only the last hour; the daily pass clears older leftovers",async()=>{
  const f=fixture();
  try{
    f.add("missed","DONE",-130,null,-120,"[]");
    await runErpHousekeeping(f.db,at-5*60000);
    assert.equal(f.sql.prepare("SELECT fields_json FROM erp_item_queries WHERE id='missed'").get().fields_json,"[]");
    await runErpHousekeeping(f.db,at);
    assert.equal(f.sql.prepare("SELECT fields_json FROM erp_item_queries WHERE id='missed'").get().fields_json,null);
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

test("reading one's own query times out only that query, once, with the same rules as the cron",async()=>{
  const f=fixture();
  try{
    f.add("mine","RUNNING",-30,-6);
    f.add("other","RUNNING",-30,-6);
    f.add("fresh","RUNNING",-2,-1);
    await expireStaleErpQueries(f.db,at,"mine");
    await expireStaleErpQueries(f.db,at,"mine");
    await expireStaleErpQueries(f.db,at,"fresh");
    const status=id=>f.sql.prepare("SELECT status FROM erp_item_queries WHERE id=?").get(id).status;
    assert.equal(status("mine"),"FAILED");assert.equal(status("other"),"RUNNING","left to the cron");assert.equal(status("fresh"),"RUNNING");
    assert.equal(f.sql.prepare("SELECT count(*) n FROM audit_events WHERE entity_type='erp_item_query'").get().n,1,"recorded once");
  }finally{f.sql.close()}
});
