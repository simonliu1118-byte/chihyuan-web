import assert from "node:assert/strict";
import test from "node:test";
import { DatabaseSync } from "node:sqlite";
import { readFileSync,readdirSync } from "node:fs";
import { build } from "esbuild";
import { taipeiToday,resolveHistoryRange } from "../shared/erp-query-history.ts";
const compiled=await build({entryPoints:["worker/http/erp-item-query-routes.ts"],bundle:true,write:false,platform:"node",format:"esm"});
const {handleErpItemQueryRoute}=await import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));
function fixture() {
  const sql=new DatabaseSync(":memory:");
  for(const file of readdirSync(new URL("../migrations/",import.meta.url)).filter(f=>f.endsWith(".sql")).sort())sql.exec(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
  const db={prepare(query){let values=[];const statement=sql.prepare(query);const execute=()=>({results:statement.all(...values),meta:{changes:sql.prepare("SELECT changes() AS n").get().n,last_row_id:sql.prepare("SELECT last_insert_rowid() AS n").get().n}});return {
    bind(...params){values=params;return this;},async first(){return execute().results[0]??null;},async all(){return execute();},async run(){return execute();},execute,
  };},async batch(statements){sql.exec("BEGIN");try{const results=statements.map(s=>s.execute());sql.exec("COMMIT");return results;}catch(error){sql.exec("ROLLBACK");throw error;}}};
  const env={DB:db,IDENTITY_APPLICATION_ID:"APP_TEST",IDENTITY_WORKSPACE_ID:"workspace-test",IDENTITY:{async fetch(){return Response.json({principal:{workspaceId:"workspace-test",employeeId:"history-api-synthetic",employeeNo:"0098",displayName:"Synthetic",workspaceRole:"SUPER_ADMIN",isIdentityAdmin:false,emailVerified:true,isWorkspaceSuperAdmin:true,credentialVersion:1,employeeRevision:1},session:{expiresAt:"2999-01-01T00:00:00Z"}});}}};
  const create=(input)=>handleErpItemQueryRoute(new Request("https://acceptance.test/api/erp/item-queries",{method:"POST",headers:{"content-type":"application/json",cookie:"cyweb_identity_session=cyid_"+"a".repeat(64)},body:JSON.stringify({itemNo:"T0001",includeHistory:true,...input})}),env,"history-api-synthetic");
  return {sql,create};
}
test("actual Worker rejects more than three calendar years without creating a job",async()=>{
  const {sql,create}=fixture();try{
    for(const range of [{historyFrom:"2023-01-01",historyTo:"2026-01-02"},{historyFrom:"2021-02-28",historyTo:"2024-02-29"}]){
      const response=await create(range);assert.equal(response.status,400);assert.equal((await response.json()).error.code,"INVALID_HISTORY_RANGE");
    }
    assert.equal(sql.prepare("SELECT count(*) AS n FROM erp_item_queries").get().n,0);
  }finally{sql.close();}
});
test("actual Worker accepts the three-year anniversary and persists shared date defaults",async()=>{
  for(const range of [{historyFrom:"2023-01-01",historyTo:"2026-01-01"},{historyFrom:null,historyTo:null}]){
    const {sql,create}=fixture();try{
      const response=await create(range);assert.equal(response.status,202,JSON.stringify(await response.clone().json()));
      const row=sql.prepare("SELECT history_from,history_to FROM erp_item_queries").get();
      const expected=resolveHistoryRange({includeHistory:true,...range},taipeiToday());
      assert.equal(row.history_from,expected.historyFrom);assert.equal(row.history_to,expected.historyTo);
    }finally{sql.close();}
  }
});
