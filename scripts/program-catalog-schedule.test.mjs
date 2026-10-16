import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import { build } from "esbuild";
import { verifiedProgramCatalog, PROGRAM_CATALOG_CRON, programCatalogDay, nextProgramCatalogUpdate } from "../shared/program-catalog.ts";
async function compile(entry) {
  const result=await build({entryPoints:[entry],bundle:true,write:false,platform:"node",format:"esm"});
  return import("data:text/javascript;base64,"+Buffer.from(result.outputFiles[0].text).toString("base64"));
}
const {loadProgramCatalog,updateProgramCatalog}=await compile("worker/programs/release-catalog.ts");
const {default:worker}=await compile("worker/index.ts");
const {exportPortableBackup}=await compile("worker/backup/portable-backup.ts");
const {acceptProgramCatalog}=await compile("worker/acceptance/program-catalog-acceptance.ts");
function database() {
  const sqlite=new DatabaseSync(":memory:");
  for(const name of readdirSync(new URL("../migrations/",import.meta.url)).filter(n=>n.endsWith(".sql")).sort()) sqlite.exec(readFileSync(new URL("../migrations/"+name,import.meta.url),"utf8"));
  const db={prepare(sql){let params=[];const stmt=sqlite.prepare(sql);return {
    bind(...values){params=values;return this;},
    async first(){return stmt.get(...params)??null;},
    async run(){return {meta:stmt.run(...params)};},
    async all(){return {results:stmt.all(...params)};},
  };},async batch(statements){return Promise.all(statements.map(stmt=>stmt.all()));}};
  return {db,sqlite};
}
const releases=verifiedProgramCatalog.programs.filter(p=>p.releaseUrl).map(p=>({tag_name:p.releaseUrl.split("/").at(-1),draft:false,prerelease:false,published_at:p.publishedAt,assets:p.downloadUrl?[{name:p.downloadUrl.split("/").at(-1),browser_download_url:p.downloadUrl,state:"uploaded",size:100}]:[]}));
const day="2026-10-16T19:00:00.000Z";
test("03:00 Taiwan boundary and next daily run are stable across UTC dates",()=>{
  const before=Date.parse("2026-10-16T18:59:59Z"),at=before+1000;
  assert.equal(programCatalogDay(before),"2026-10-16"); assert.equal(programCatalogDay(at),"2026-10-17");
  assert.equal(nextProgramCatalogUpdate(before),"2026-10-16T19:00:00.000Z");
  assert.equal(nextProgramCatalogUpdate(at),"2026-10-17T19:00:00.000Z");
});
test("durable SQL claim coalesces instances; GET and same-day reloads never fetch GitHub",async()=>{
  const {db,sqlite}=database();let calls=0;
  const fetcher=async()=>{calls++;return Response.json(releases);};
  const initial=await loadProgramCatalog(db,Date.parse(day)); assert.equal(initial.automaticUpdate.status,"pending");
  assert.equal(sqlite.prepare("SELECT count(*) AS n FROM program_catalog_state").get().n,0);
  const results=await Promise.all([updateProgramCatalog(db,day,fetcher),updateProgramCatalog(db,day,fetcher)]);
  assert.equal(results.filter(Boolean).length,1);assert.equal(calls,1);
  for(let i=0;i<3;i++){assert.equal((await loadProgramCatalog(db,Date.parse(day))).current,true);assert.equal(await updateProgramCatalog(db,day,fetcher),false);}
  assert.equal(calls,1);sqlite.close();
});
test("failed day retains last success, never retries that day, and recovers on next daily run",async()=>{
  const {db,sqlite}=database();await acceptProgramCatalog(db);sqlite.close();
});
test("late prior-day success cannot overwrite a newer claimed day",async()=>{
  const {db,sqlite}=database();let release;
  const old=updateProgramCatalog(db,day,()=>new Promise(resolve=>{release=resolve;}));
  while(!release)await Promise.resolve();
  const newer="2026-10-17T19:00:00.000Z";
  await updateProgramCatalog(db,newer,async()=>Response.json(releases));
  release(Response.json([]));await old;
  const value=await loadProgramCatalog(db,Date.parse(newer)); assert.equal(value.current,true);assert.equal(value.checkedAt,newer);assert.equal(value.refreshFailure,undefined);
  sqlite.close();
});
test("saved release fields cannot override current names or inject an untrusted download",async()=>{
  const {db,sqlite}=database();await updateProgramCatalog(db,day,async()=>Response.json(releases));
  const value=JSON.parse(sqlite.prepare("SELECT catalog_json FROM program_catalog_state").get().catalog_json);
  value.programs[2].name="Old name";sqlite.prepare("UPDATE program_catalog_state SET catalog_json=?").run(JSON.stringify(value));
  assert.equal((await loadProgramCatalog(db,Date.parse(day))).programs[2].name,"電子發票工具");
  value.programs[2].downloadUrl="https://untrusted.test/file.zip";sqlite.prepare("UPDATE program_catalog_state SET catalog_json=?").run(JSON.stringify(value));
  const invalid=await loadProgramCatalog(db,Date.parse(day));assert.equal(invalid.current,false);assert.equal(invalid.refreshFailure.code,"INVALID");assert(!JSON.stringify(invalid).includes("untrusted.test"));
  sqlite.close();
});
test("catalog cron runs with backup disabled; other schedules cannot trigger catalog fetching",async()=>{
  const {db,sqlite}=database();const original=globalThis.fetch;let calls=0;
  try{
    globalThis.fetch=async()=>{calls++;return Response.json(releases);};
    await worker.scheduled({cron:PROGRAM_CATALOG_CRON,scheduledTime:Date.parse(day)},{DB:db,BACKUP_SCHEDULE_ENABLED:"false"});
    await worker.scheduled({cron:PROGRAM_CATALOG_CRON,scheduledTime:Date.parse(day)},{DB:db,BACKUP_SCHEDULE_ENABLED:"false"});
    const disabled={BACKUP_SCHEDULE_ENABLED:"false",get DB(){throw Error("unexpected DB");}};
    await worker.scheduled({cron:"30 19 * * *",scheduledTime:Date.parse(day)},disabled);
    await worker.scheduled({cron:"unexpected",scheduledTime:Date.parse(day)},disabled);
    assert.equal(calls,1);
  }finally{globalThis.fetch=original;sqlite.close();}
});
test("derived catalog cache leaves portable business schema and data compatible",async()=>{
  const {db,sqlite}=database(),scope={workspaceScope:"synthetic-workspace",appVersion:"0.7.31"};
  sqlite.exec("DROP TABLE program_catalog_state");
  const before=await exportPortableBackup(db,scope);
  sqlite.exec(readFileSync(new URL("../migrations/0008_program_catalog_state.sql",import.meta.url),"utf8"));
  await updateProgramCatalog(db,day,async()=>Response.json(releases));
  const after=await exportPortableBackup(db,scope);
  assert.equal(JSON.parse(new TextDecoder().decode(before.manifestBytes)).schemaSha256,JSON.parse(new TextDecoder().decode(after.manifestBytes)).schemaSha256);
  assert.deepEqual(before.dataBytes,after.dataBytes);assert(!new TextDecoder().decode(after.dataBytes).includes("program_catalog_state"));
  sqlite.close();
});
