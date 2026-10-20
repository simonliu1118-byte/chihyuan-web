import test from "node:test";
import assert from "node:assert/strict";
import { D1_DAILY_LIMITS, usageLevel, usageRatio, aggregateD1Usage } from "../shared/cloudflare-usage.ts";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
async function importWorkerBundle(relativePath){
  const entry=fileURLToPath(new URL(relativePath,import.meta.url));
  const result=await build({entryPoints:[entry],bundle:true,format:"esm",platform:"node",write:false,logLevel:"silent"});
  const url="data:text/javascript;base64,"+Buffer.from(result.outputFiles[0].contents).toString("base64");
  return import(url);
}
const {fetchD1Usage,CloudflareUsageError}=await importWorkerBundle("../worker/usage/cloudflare-usage.ts");

test("thresholds are inclusive and the worse quota wins",()=>{
  assert.equal(usageLevel(3_495_000,0),"ok");
  assert.equal(usageLevel(3_500_000,0),"warning");
  assert.equal(usageLevel(4_500_000,0),"danger");
  assert.equal(usageLevel(0,70_000),"warning");
  assert.equal(usageLevel(0,90_000),"danger");
  assert.equal(usageLevel(1_000_000,90_000),"danger");
  assert.equal(usageLevel(null,undefined),"ok");
  assert.equal(usageLevel(10,0,{rowsReadPerDay:0,rowsWrittenPerDay:0}),"ok");
  assert.equal(usageRatio(NaN,0),0);
  assert.equal(D1_DAILY_LIMITS.rowsReadPerDay,5_000_000);
  assert.equal(D1_DAILY_LIMITS.rowsWrittenPerDay,100_000);
});
const now = new Date("2026-10-20T00:01:00Z");
const groups=[
 {dimensions:{date:"2026-10-20",databaseId:"db1"},sum:{rowsRead:100,rowsWritten:10}},
 {dimensions:{date:"2026-10-20",databaseId:"db2"},sum:{rowsRead:250,rowsWritten:5}},
 {dimensions:{date:"2026-10-20",databaseId:"db1"},sum:{rowsRead:50,rowsWritten:2}},
 {dimensions:{date:"2026-10-18",databaseId:"db2"},sum:{rowsRead:90,rowsWritten:3}},
 {dimensions:{date:"2026-10-17",databaseId:"db1"},sum:{rowsRead:99,rowsWritten:99}},
];
test("UTC days, missing days, all databases and descending read sorting",()=>{
 const result=aggregateD1Usage(groups,{db1:"web-db",db2:"cyacc-db",db3:"idle-db"},3,now);
 assert.deepEqual(result.days.map(x=>x.date),["2026-10-18","2026-10-19","2026-10-20"]);
 assert.deepEqual(result.days.map(x=>x.rowsRead),[90,0,400]);
 assert.deepEqual(result.days.map(x=>x.rowsWritten),[3,0,17]);
 assert.deepEqual(result.today.databases.map(x=>[x.name,x.rowsRead,x.rowsWritten]),
   [["cyacc-db",250,5],["web-db",150,12],["idle-db",0,0]]);
 assert.equal(result.today.level,"ok");
 assert.equal(result.fetchedAt,now.toISOString());
});
test("unmapped database falls back to first 8 UUID characters",()=>{
 const result=aggregateD1Usage([{dimensions:{date:"2026-10-20",databaseId:"abcdef987654"},sum:{rowsRead:12}}],{},1,now);
 assert.equal(result.today.databases[0].name,"abcdef98");
});
test("validated limits reject invalid day count",()=>{
 for(const days of [0,32,1.5,NaN])assert.throws(()=>aggregateD1Usage([],{},days,now));
});
function fixtures(){
 const counts={graph:0,listing:0};
 const cacheRows=new Map();
 const cache={match:async key=>cacheRows.get(key.url)?.clone(),put:async(key,value)=>{cacheRows.set(key.url,value.clone());}};
 const fetchImpl=async(input,init)=>{
   const url=String(input);
   assert.equal(init.headers.authorization,"Bearer synthetic-private-token");
   if(url.includes("/graphql")){counts.graph++;assert.equal(init.method,"POST");
     assert.ok(JSON.parse(init.body).query.includes("d1AnalyticsAdaptiveGroups"));
     return Response.json({data:{viewer:{accounts:[{d1AnalyticsAdaptiveGroups:groups}]}}});
   }
   counts.listing++;
   assert.ok(url.includes("page=1"));
   return Response.json({success:true,result:[{uuid:"db1",name:"web-db"},{uuid:"db2",name:"cyacc-db"}]});
 };
 return {counts,cache,fetchImpl};
}
const env={CF_ACCOUNT_ID:"synthetic-account",CF_USAGE_API_TOKEN:"synthetic-private-token"};
test("10 minute cache keyed by days prevents repeat Cloudflare API calls",async()=>{
 const f=fixtures();
 const options={fetchImpl:f.fetchImpl,cache:f.cache,now};
 const a=await fetchD1Usage(env,7,options);
 const b=await fetchD1Usage(env,7,options);
 assert.deepEqual(a,b);
 assert.deepEqual(f.counts,{graph:1,listing:1});
 await fetchD1Usage(env,1,options);
 assert.deepEqual(f.counts,{graph:2,listing:2});
});
test("missing configuration and upstream failures never expose token",async()=>{
 await assert.rejects(()=>fetchD1Usage({CF_ACCOUNT_ID:"x"},7,{cache:null}),
   error=>error instanceof CloudflareUsageError && error.code==="USAGE_NOT_CONFIGURED");
 for(const response of [Response.json({errors:[{message:"sensitive upstream"}]}),
   new Response("sensitive upstream",{status:403})]){
   await assert.rejects(()=>fetchD1Usage(env,7,{cache:null,now,
     fetchImpl:async()=>response.clone()}),
     error=>error instanceof CloudflareUsageError && error.code==="USAGE_UNAVAILABLE"
       && !String(error).includes("synthetic-private-token"));
 }
});
test("upstream abort is mapped to unavailable without retry",async()=>{
 let calls=0;
 await assert.rejects(()=>fetchD1Usage(env,7,{cache:null,now,fetchImpl:async()=>{calls++;throw new Error("abort");}}),
   error=>error instanceof CloudflareUsageError && error.code==="USAGE_UNAVAILABLE");
 assert.equal(calls,1);
});

test("deployment renderer forwards optional account ID but never a token",async()=>{
 const fs=await import("node:fs");const os=await import("node:os");const path=await import("node:path");
 const {renderDeployConfig}=await import("./render-deploy-config.mjs");
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"usage-deploy-"));
 try{
   const outputPath=path.join(dir,"config.json");
   const env={
     CF_WORKER_NAME:"synthetic-worker",CF_PUBLIC_HOSTNAME:"test.example.com",
     CF_D1_DATABASE_NAME:"synthetic-db",CF_D1_DATABASE_ID:"11111111-1111-4111-8111-111111111111",
     CF_IDENTITY_SERVICE:"synthetic-identity",CF_IDENTITY_APPLICATION_ID:"APP_TEST",
     CF_IDENTITY_WORKSPACE_ID:"testworkspace",CF_SOURCE_COMMIT:"a".repeat(40),
     CLOUDFLARE_ACCOUNT_ID:"synthetic-account",CF_USAGE_API_TOKEN:"synthetic-secret",
     CF_BACKUP_ENABLED:"false"
   };
   renderDeployConfig({env,outputPath});
   const config=JSON.parse(fs.readFileSync(outputPath,"utf8"));
   assert.equal(config.vars.CF_ACCOUNT_ID,"synthetic-account");
   assert.equal(fs.readFileSync(outputPath,"utf8").includes("synthetic-secret"),false);
   renderDeployConfig({env:{...env,CLOUDFLARE_ACCOUNT_ID:""},outputPath:path.join(dir,"unset.json")});
   assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(path.join(dir,"unset.json"),"utf8")).vars,"CF_ACCOUNT_ID"),false);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test("optional usage secret is written to protected output even without backup",async()=>{
 const fs=await import("node:fs");const os=await import("node:os");const path=await import("node:path");
 const {renderBackupSecrets}=await import("./render-backup-secrets.mjs");
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),"usage-secrets-"));
 try{
   const omitted=path.join(dir,"omitted.json");
   assert.equal(renderBackupSecrets({env:{CF_BACKUP_ENABLED:"false"},outputPath:omitted}),false);
   assert.equal(fs.existsSync(omitted),false);
   const target=path.join(dir,"protected.json");
   assert.equal(renderBackupSecrets({env:{CF_BACKUP_ENABLED:"false",CF_USAGE_API_TOKEN:"synthetic-secret"},outputPath:target}),true);
   assert.deepEqual(JSON.parse(fs.readFileSync(target,"utf8")),{CF_USAGE_API_TOKEN:"synthetic-secret"});
   if(process.platform!=="win32")assert.equal(fs.statSync(target).mode&0o777,0o600);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});

test("read-only HR-independent usage route enforces CYID SUPER_ADMIN before Cloudflare or D1",async()=>{
 const {handleUsageRoute}=await importWorkerBundle("../worker/http/usage-routes.ts");
 let role="USER",remoteCalls=0;
 const runtime={IDENTITY_APPLICATION_ID:"APP_TEST",IDENTITY_WORKSPACE_ID:"workspace-test",
   CF_ACCOUNT_ID:"synthetic-account",CF_USAGE_API_TOKEN:"synthetic-private-token",
   get DB(){throw Error("usage endpoint must not access D1");},
   IDENTITY:{fetch:async()=>Response.json({ok:true,principal:{
     workspaceId:"workspace-test",employeeId:"usage-synthetic",employeeNo:"9999",displayName:"測試管理員",
     workspaceRole:role,isIdentityAdmin:false,emailVerified:true,isWorkspaceSuperAdmin:role==="SUPER_ADMIN",
     credentialVersion:1,employeeRevision:1,
   },session:{expiresAt:"2999-01-01T00:00:00.000Z"}})}
 };
 const call=async (days="7",authenticated=true,override=runtime)=>{
   const cookie=authenticated?{"cookie":"cyweb_identity_session=cyid_"+"a".repeat(64)}:{};
   return handleUsageRoute(new Request("https://unit.test/api/business/usage/d1?days="+days,{headers:cookie}),override,"test-usage",{
     now,cache:null,fetchImpl:async(...args)=>{remoteCalls++;return fixtures().fetchImpl(...args);}
   });
 };
 for(const denied of ["USER","ADMIN"]){
   role=denied;assert.equal((await call()).status,403);
 }
 assert.equal(remoteCalls,0);
 role="SUPER_ADMIN";
 assert.equal((await call("7",false)).status,401);
 assert.equal((await call("0")).status,422);
 assert.equal((await call("32")).status,422);
 assert.equal((await call("1.5")).status,422);
 assert.equal(remoteCalls,0);
 const missingToken={
   IDENTITY_APPLICATION_ID:runtime.IDENTITY_APPLICATION_ID,
   IDENTITY_WORKSPACE_ID:runtime.IDENTITY_WORKSPACE_ID,
   IDENTITY:runtime.IDENTITY,CF_ACCOUNT_ID:runtime.CF_ACCOUNT_ID,
 };
 const notConfigured=await call("7",true,missingToken);
 assert.equal(notConfigured.status,503);
 assert.equal((await notConfigured.json()).error.code,"USAGE_NOT_CONFIGURED");
 assert.equal(remoteCalls,0);
});
