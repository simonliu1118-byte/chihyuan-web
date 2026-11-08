import test from "node:test";
import assert from "node:assert/strict";
import {DatabaseSync} from "node:sqlite";
import {readFileSync,readdirSync} from "node:fs";
import {build} from "esbuild";
const compiled=await build({entryPoints:["worker/http/home-hub-routes.ts"],bundle:true,write:false,platform:"node",format:"esm"});
const {handleHomeHubRoute}=await import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));
function fixture(){
 const sql=new DatabaseSync(":memory:");
 sql.exec("PRAGMA foreign_keys=ON");
 for(const file of readdirSync(new URL("../migrations/",import.meta.url)).filter(f=>f.endsWith(".sql")).sort())sql.exec(readFileSync(new URL("../migrations/"+file,import.meta.url),"utf8"));
 const now="2026-11-08T00:00:00.000Z";
 for(let i=1;i<=3;i++)sql.prepare("INSERT INTO app_members(id,identity_employee_id,employee_no,display_name,is_active,created_at,updated_at) VALUES(?,?,?,?,1,?,?)").run(i,"synthetic-"+i,String(i).padStart(4,"0"),"測試使用者"+i,now,now);
 let actor=1,grantCodes=[];
 const db={
  prepare(query){const statement=sql.prepare(query);let args=[];
   const execute=()=>({results:statement.all(...args),meta:{changes:sql.prepare("SELECT changes() n").get().n,last_row_id:sql.prepare("SELECT last_insert_rowid() n").get().n}});
   return {bind(...params){args=params;return this},async first(){return execute().results[0]??null},async all(){return execute()},async run(){return execute()},execute};
  },
  async batch(stmts){sql.exec("BEGIN");try{const results=stmts.map(s=>s.execute());sql.exec("COMMIT");return results}catch(e){sql.exec("ROLLBACK");throw e}},
 };
 const env={DB:db,IDENTITY_APPLICATION_ID:"APP_TEST",IDENTITY_WORKSPACE_ID:"workspace-test",
  IDENTITY:{async fetch(){return Response.json({principal:{workspaceId:"workspace-test",employeeId:"synthetic-"+actor,employeeNo:String(actor).padStart(4,"0"),displayName:"測試使用者"+actor,workspaceRole:actor===1?"SUPER_ADMIN":"USER",isIdentityAdmin:false,emailVerified:true,isWorkspaceSuperAdmin:actor===1,credentialVersion:1,employeeRevision:1},session:{expiresAt:"2999-01-01T00:00:00Z"}})}}
 };
 const cookie="cyweb_identity_session=cyid_"+"a".repeat(64);
 async function call(user,path,method="GET",data,authenticated=true){
  actor=user;
  const request=new Request("https://acceptance.test"+path,{method,headers:{"content-type":"application/json",...(authenticated?{cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)});
  const response=await handleHomeHubRoute(request,env,"home-hub-synthetic");
  return {status:response.status,body:await response.json()};
 }
 return {sql,call,close(){sql.close()}};
}
const ok=result=>{assert.equal(result.status,200,JSON.stringify(result.body));return result.body.data};
const created=result=>{assert.equal(result.status,201,JSON.stringify(result.body));return result.body.data};
test("unauthenticated requests fail; all logged-in users can create only their own todos",async()=>{
 const f=fixture();try{
  assert.equal((await f.call(1,"/api/hub/summary","GET",undefined,false)).status,401);
  const t=created(await f.call(2,"/api/hub/todos","POST",{title:"私人工作",detail:"準備資料",dueDate:null,dueTime:null,priority:"important"}));
  assert.equal(t.title,"私人工作");
  assert.equal(ok(await f.call(2,"/api/hub/todos?status=open")).items[0].id,t.id);
  assert.equal((await f.call(3,"/api/hub/todos/"+t.id)).status,404);
  assert.equal((await f.call(3,"/api/hub/todos/"+t.id,"PATCH",{completed:true})).status,404);
  assert.equal((await f.call(3,"/api/hub/todos/"+t.id,"DELETE")).status,404);
  assert.equal(ok(await f.call(2,"/api/hub/todos/"+t.id,"PATCH",{completed:true})).completedAt!==null,true);
  assert.equal(ok(await f.call(2,"/api/hub/todos?status=done")).items[0].id,t.id);
  assert.equal(ok(await f.call(3,"/api/hub/summary")).todos.length,0);
  assert.equal(ok(await f.call(2,"/api/hub/reminders")).counts.total,0);
 }finally{f.close()}
});
test("personal notice sender grant is separate; recipient identity and receipts are isolated",async()=>{
 const f=fixture();try{
  assert.equal((await f.call(2,"/api/hub/recipients")).status,403);
  assert.equal((await f.call(2,"/api/hub/notices","POST",{kind:"personal",title:"越權",body:"不得發",recipients:[3]})).status,403);
  assert.equal((await f.call(2,"/api/hub/notices","POST",{kind:"company",title:"越權",body:"不得發"})).status,403);
  const posted=created(await f.call(1,"/api/hub/notices","POST",{kind:"personal",title:"請查閱",body:"指定使用者",recipients:[2]}));
  assert.equal(posted.kind,"personal");
  assert.equal(ok(await f.call(2,"/api/hub/notices?kind=personal&mode=inbox")).items[0].id,posted.id);
  assert.equal(ok(await f.call(3,"/api/hub/notices?kind=personal&mode=inbox")).items.length,0);
  assert.equal((await f.call(3,"/api/hub/notices/"+posted.id)).status,404);
  assert.equal((await f.call(3,"/api/hub/notices/"+posted.id+"/read","POST",{})).status,404);
  assert.equal(ok(await f.call(2,"/api/hub/reminders")).counts.personal,1);
  assert.equal(ok(await f.call(2,"/api/hub/notices/"+posted.id+"/read","POST",{})).read,true);
  assert.equal(ok(await f.call(2,"/api/hub/reminders")).counts.personal,0);
  assert.equal((await f.call(2,"/api/hub/notices/"+posted.id+"/receipts")).status,403);
  const receipts=ok(await f.call(1,"/api/hub/notices/"+posted.id+"/receipts"));
  assert.equal(receipts.length,1);assert.ok(receipts[0].readAt);
  assert.equal((await f.call(2,"/api/hub/notices?kind=personal&mode=sent")).status,403);
  const sent=ok(await f.call(1,"/api/hub/notices?kind=personal&mode=sent"));
  assert.equal(sent.items[0].id,posted.id);
  assert.equal(ok(await f.call(1,"/api/hub/notices/"+posted.id+"/revoke","POST",{})).revoked,true);
  assert.equal((await f.call(2,"/api/hub/notices/"+posted.id)).status,404);
 }finally{f.close()}
});
test("company announcements are available to all readers, distinct from recipient-specific notices",async()=>{
 const f=fixture();try{
  const posted=created(await f.call(1,"/api/hub/notices","POST",{kind:"company",title:"公司公告",body:"所有人可讀"}));
  assert.equal(ok(await f.call(2,"/api/hub/summary")).counts.company,1);
  assert.equal(ok(await f.call(3,"/api/hub/notices?kind=company&mode=inbox")).items[0].id,posted.id);
  assert.equal(ok(await f.call(3,"/api/hub/notices/"+posted.id)).kind,"company");
  assert.equal(ok(await f.call(2,"/api/hub/notices/"+posted.id+"/read","POST",{})).read,true);
  assert.equal(ok(await f.call(2,"/api/hub/summary")).counts.company,0);
  assert.equal(ok(await f.call(3,"/api/hub/summary")).counts.company,1);
 }finally{f.close()}
});
test("bell count includes all reminders and keyset cursor can page past first five without duplicates",async()=>{
 const f=fixture();try{
  const posted=[];
  for(let i=0;i<13;i++)posted.push(created(await f.call(1,"/api/hub/notices","POST",{kind:"company",title:"公告 "+i,body:"合成公告內容 "+i})).id);
  const first=ok(await f.call(2,"/api/hub/reminders?limit=5"));
  assert.equal(first.counts.total,13);
  assert.equal(first.items.length,5);
  assert.equal(first.more,true);
  assert.ok(first.nextCursor);
  const second=ok(await f.call(2,"/api/hub/reminders?limit=10&before="+encodeURIComponent(first.nextCursor)));
  assert.equal(second.items.length,8);
  assert.equal(second.more,false);
  assert.equal(new Set([...first.items,...second.items].map(x=>x.id)).size,13);
  assert.equal(second.counts.total,13);
 }finally{f.close()}
});
