import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
const compiled = await build({entryPoints:["worker/http/auth-routes.ts"], bundle:true,
  write:false,platform:"node",format:"esm",target:"node24"});
const {handleAuthRoute} = await import("data:text/javascript;base64,"+Buffer.from(compiled.outputFiles[0].text).toString("base64"));
const ticket="cyif_"+"b".repeat(64);
function fixture(payload, status=200) {
  const calls=[];
  return {calls,env:{DB:{prepare(){throw Error("First-login must not write business projection");}},
    IDENTITY_APPLICATION_ID:"CYWEB",IDENTITY_WORKSPACE_ID:"synthetic-workspace",
    IDENTITY:{async fetch(request){calls.push({url:request.url,body:await request.json()});return Response.json(payload,{status});}}}};
}
const request=(path,body,cookie="")=>new Request("https://portal.example.test/api/auth/"+path,
  {method:"POST",headers:{"content-type":"application/json",cookie},body:JSON.stringify(body)});
const completion=(f,password="syntheticpass",cookie=`cyweb_first_login=${ticket}`)=>handleAuthRoute(
  request("first-login/complete",{password},cookie),f.env,"synthetic-request");
test("first password creates only short-lived first-login cookie, not a normal Session or member",async()=>{
  const f=fixture({passwordChangeRequired:true,firstLogin:{token:ticket,employeeNo:"0001",displayName:"Synthetic",expiresAt:new Date(Date.now()+300000).toISOString()}});
  const r=await handleAuthRoute(request("login",{employeeNo:"0001",password:"initialpass"}),f.env,"synthetic");
  const body=await r.json();assert.equal(body.data.passwordChangeRequired,true);
  assert.equal(JSON.stringify(body).includes(ticket),false);
  const cookies=r.headers.get("set-cookie");assert.match(cookies,/cyweb_first_login=cyif_/);
  assert.doesNotMatch(cookies,/cyweb_identity_session=cyid_/);
  assert.deepEqual(f.calls[0].body,{employeeNo:"0001",password:"initialpass",workspaceId:"synthetic-workspace",applicationId:"CYWEB"});
});
test("only a verified/password-changed/relogin-required response returns completion, no normal Session",async()=>{
  const f=fixture({emailVerified:true,passwordChanged:true,reloginRequired:true});
  const r=await completion(f);assert.equal(r.status,200);
  assert.deepEqual((await r.json()).data,{emailVerified:true,passwordChanged:true,reloginRequired:true});
  assert.match(r.headers.get("set-cookie"),/cyweb_first_login=;.*Max-Age=0/);
  assert.doesNotMatch(r.headers.get("set-cookie"),/cyweb_identity_session=cyid_/);
  assert.deepEqual(f.calls[0].body,{workspaceId:"synthetic-workspace",applicationId:"CYWEB",token:ticket,password:"syntheticpass"});
});
test("partial/false completion or unexpected provider Session cannot show a successful verification",async()=>{
  for(const patch of [{emailVerified:false},{passwordChanged:false},{reloginRequired:false},{session:{}},{principal:{}}]) {
    const f=fixture({emailVerified:true,passwordChanged:true,reloginRequired:true,...patch});
    const r=await completion(f);assert.equal(r.status,503);assert.equal((await r.json()).ok,false);
  }
});
test("expired ticket and provider outage remain failure; neither becomes a completion",async()=>{
  for(const [status,code,expected] of [[400,"FIRST_LOGIN_EXPIRED",400],[503,"UNAVAILABLE",503]]) {
    const f=fixture({error:{code}},status);const r=await completion(f);
    assert.equal(r.status,expected);assert.equal((await r.json()).ok,false);
  }
  const missing=fixture({});assert.equal((await completion(missing,"syntheticpass","")).status,400);
  assert.equal(missing.calls.length,0);
  const invalid=fixture({});assert.equal((await completion(invalid,"short")).status,400);
  assert.equal(invalid.calls.length,0);
});
