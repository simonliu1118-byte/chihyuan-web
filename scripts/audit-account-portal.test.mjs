import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { auditAccountPortal } from "./audit-account-portal.mjs";
const root = path.resolve(process.env.CYAPPS_SOURCE_ROOT ?? ".tmp/canonical-cyapps");
const canonical = await import(pathToFileURL(path.join(root,
  "apps/CYAccountingWeb/scripts/resolve-cyid-production-runtime.mjs")));
const id = n => `${n}1111111-1111-4111-8111-111111111111`;
const plain = (name,text) => ({type:"plain_text",name,text});
function fixture(overrides = {}) {
  const dev="synthetic-identity-development", prod="synthetic-identity-production", web="synthetic-web";
  const portal="https://portal.example.test/", workspace="synthetic-workspace";
  const devSettings = {success:true,result:{bindings:[plain("APP_ENV","development"),{type:"d1",name:"DB",id:id(1)}]}};
  const provider={success:true,result:{bindings:[plain("APP_ENV","production"),plain("CYACC_SERVICE_BINDING_TARGET",prod),
    plain("CYACC_APPLICATION_ID","CYACC"),plain("CYACC_WORKSPACE_ID",workspace),plain("ACCOUNT_PORTAL_URL",portal),
    plain("CORE_ACCOUNT_APPLICATION_ID","CYWEB"),{type:"d1",name:"DB",id:id(2)}]}};
  const settings={success:true,result:{bindings:[{type:"service",name:"IDENTITY",service:prod},
    plain("IDENTITY_WORKSPACE_ID",workspace),plain("IDENTITY_APPLICATION_ID","CYWEB"),
    plain("IDENTITY_CONSUMER_VERSION","1.0.4"),{type:"d1",name:"DB",id:id(3)}]}};
  const health={ok:true,data:{service:"cyweb",database:"ok",identityConsumerVersion:"1.0.4"}};
  const domains={success:true,result:[{hostname:"portal.example.test",service:web}]};
  const state={dev,prod,web,devSettings,provider,settings,health,domains};
  overrides.change?.(state);
  const calls=[];
  async function fetchImpl(url, init) {
    calls.push({url,init});
    assert.equal(init.method,"GET"); assert.equal(init.redirect,"error"); assert.equal(init.body,undefined);
    const u=new URL(url);
    if(u.hostname==="portal.example.test") {
      assert.equal(new Headers(init.headers).has("authorization"),false);
      assert.equal(u.pathname,"/api/health");
      return Response.json(health);
    }
    assert.equal(u.hostname,"api.cloudflare.com");
    assert.equal(new Headers(init.headers).get("authorization"),"Bearer synthetic-token");
    if(u.pathname.endsWith(`/scripts/${dev}/settings`)) return Response.json(devSettings);
    if(u.pathname.endsWith(`/scripts/${prod}/settings`)) return Response.json(provider);
    if(u.pathname.endsWith(`/scripts/${web}/settings`)) {
      if(overrides.drift && calls.filter(x=>new URL(x.url).pathname.endsWith(`/scripts/${web}/settings`)).length>1)
        return Response.json({...settings, changed:true});
      return Response.json(settings);
    }
    if(u.pathname.endsWith("/workers/domains")) return Response.json(domains);
    if(u.pathname.includes("/d1/database/")) return Response.json({success:true,result:{uuid:decodeURIComponent(u.pathname.split("/").at(-1))}});
    throw Error("unexpected route");
  }
  return {calls,state,options:{accountId:"synthetic-account",apiToken:"synthetic-token",configuredIdentityService:dev,
    configuredWorker:web,configuredDatabaseId:id(3),resolveProductionRuntime:canonical.resolveCyidProductionRuntime,
    verifyProductionPortal:canonical.verifyCyWebProductionPortal,fetchImpl}};
}
test("actual canonical resolver/guard validates production topology using only GET without credential forwarding",async()=>{
  const f=fixture(); const r=await auditAccountPortal(f.options);
  assert.equal(r.productionPortalReady,true); assert.equal(r.failureCode,null);
  assert.equal(r.portalUsesCanonicalProductionIdentity,true);assert.equal(r.healthMatchesRuntime,true);
  assert.equal(r.portalIsConfiguredDevelopmentWorker,true);assert.equal(r.portalUsesConfiguredDevelopmentBusinessDatabase,true);
  assert.equal(r.mutationPerformed,false);
  const text=JSON.stringify(r);
  for(const sensitive of [f.state.dev,f.state.prod,f.state.web,"synthetic-token","synthetic-account","synthetic-workspace",id(2),id(3),"portal.example.test"])
    assert.equal(text.includes(sensitive),false, "public report excludes private metadata");
});
test("development-bound portal reports the exact canonical authority mismatch, without remapping resources",async()=>{
  const f=fixture({change:s=>{s.settings.result.bindings[0].service=s.dev;}});
  const r=await auditAccountPortal(f.options);
  assert.equal(r.productionPortalReady,false);assert.equal(r.failureCode,"CYWEB_PRODUCTION_AUTHORITY_MISMATCH");
  assert.equal(r.portalUsesConfiguredDevelopmentIdentity,true);assert.equal(r.portalIdentityProviderEnvironment,"development");
  assert.equal(r.workspaceMatchesProductionConsumer,true);
});
test("workspace and health failures stay blocked even with matching provider name",async()=>{
  const f=fixture({change:s=>{s.settings.result.bindings.find(b=>b.name==="IDENTITY_WORKSPACE_ID").text="other-workspace";}});
  assert.equal((await auditAccountPortal(f.options)).failureCode,"CYWEB_PRODUCTION_WORKSPACE_MISMATCH");
  const g=fixture({change:s=>{s.health.data.database="unavailable";}});
  const r=await auditAccountPortal(g.options);
  assert.equal(r.healthMatchesRuntime,false);assert.equal(r.productionPortalReady,false);
});
test("same D1 for dev/prod authority and identity/business DB collision fail closed",async()=>{
  const f=fixture({change:s=>{s.provider.result.bindings.find(b=>b.name==="DB").id=id(1);}});
  await assert.rejects(auditAccountPortal(f.options),/CYWEB_AUDIT_PROVIDER_DB_ISOLATION_UNVERIFIED/);
  const g=fixture({change:s=>{s.settings.result.bindings.find(b=>b.name==="DB").id=id(2);}});
  await assert.rejects(auditAccountPortal(g.options),/CYWEB_AUDIT_IDENTITY_BUSINESS_DB_COLLISION/);
});
test("unsafe portal and multiple managed-domain targets do not pass readiness",async()=>{
  const f=fixture({change:s=>{s.provider.result.bindings.find(b=>b.name==="ACCOUNT_PORTAL_URL").text="https://portal.example.test/?password=secret";}});
  await assert.rejects(auditAccountPortal(f.options),/CYWEB_PRODUCTION_PORTAL_INVALID/);
  const g=fixture({change:s=>{s.domains.result.push({...s.domains.result[0]});}});
  await assert.rejects(auditAccountPortal(g.options),/CYWEB_PRODUCTION_DOMAIN_UNVERIFIED/);
});
test("resource drift during canonical strict recheck does not report a mixed snapshot as ready",async()=>{
  const f=fixture({drift:true});await assert.rejects(auditAccountPortal(f.options),/CYWEB_AUDIT_SNAPSHOT_CHANGED/);
});
test("read adapter rejects canonical mutations and credential forwarding to non-Cloudflare hosts",async()=>{
  const f=fixture();
  f.options.resolveProductionRuntime=async({fetchImpl})=>fetchImpl("https://evil.example.test/",{headers:{authorization:"Bearer synthetic-token"}});
  await assert.rejects(auditAccountPortal(f.options),/CYWEB_AUDIT_CREDENTIAL_TARGET_INVALID/);
  const g=fixture();
  g.options.resolveProductionRuntime=async({fetchImpl})=>fetchImpl("https://api.cloudflare.com/client/v4/accounts/synthetic-account/d1/database/id",{method:"POST"});
  await assert.rejects(auditAccountPortal(g.options),/CYWEB_AUDIT_NON_READ_REQUEST/);
});
test("audit workflow has no PR credentials or deployment path for audit operation",()=>{
  const raw=fs.readFileSync(".github/workflows/development-deploy.yml","utf8");
  assert.match(raw,/inputs\.operation == 'deploy-development'/);
  const audit=raw.slice(raw.indexOf("\n  audit-identity:"));
  assert.match(audit,/inputs\.operation == 'audit-identity'/);
  assert.match(audit,/refs\/heads\/audit\/cyweb-identity/);
  assert.doesNotMatch(audit,/wrangler|migrations apply|secrets put|deploy --|pull_request/);
});
