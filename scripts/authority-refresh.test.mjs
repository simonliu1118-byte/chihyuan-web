import assert from "node:assert/strict";
import test from "node:test";
import { build } from "esbuild";
async function compile(path) {
  const result = await build({ entryPoints: [path], bundle: true, write: false, platform: "node", format: "esm", target: "node24" });
  return import("data:text/javascript;base64," + Buffer.from(result.outputFiles[0].text).toString("base64"));
}
const { createAuthorityMonitor } = await compile("src/auth/authority-monitor.ts");
const { loadCurrentSession } = await compile("src/auth/auth-client.ts");
const { handleAuthRoute } = await compile("worker/http/auth-routes.ts");
const { CYWEB_MODULES } = await compile("shared/modules.ts");
function fixture(load = async () => "snapshot") {
  let now = 0, id = 0, visible = true;
  const timers = new Map(), values = [], errors = [], calls = [];
  const monitor = createAuthorityMonitor({
    load: signal => { calls.push(signal); return load(signal); },
    onValue: value => values.push(value), onError: error => { errors.push(error); return error === "invalid"; },
    visible: () => visible, now: () => now,
    schedule: (callback, delay) => { timers.set(++id, { callback, at: now + delay }); return id; },
    cancel: timer => timers.delete(timer),
  });
  async function tick(milliseconds = 0) {
    for (let i=0;i<8;i++) await Promise.resolve();
    const until = now + milliseconds;
    for (;;) {
      const next = [...timers].sort((a,b) => a[1].at - b[1].at)[0];
      if (!next || next[1].at > until) break;
      now = next[1].at; timers.delete(next[0]); next[1].callback();
      for (let i=0;i<8;i++) await Promise.resolve();
    }
    now = until;
    for (let i=0;i<8;i++) await Promise.resolve();
  }
  return { monitor, calls, values, errors, tick, timers, visibility: value => { visible = value; monitor.refresh(); } };
}
test("foreground cadence, focus coalescing and hidden suspension use one bounded read", async () => {
  const f = fixture(); f.monitor.start(); await f.tick(29999); assert.equal(f.calls.length,0);
  await f.tick(1); assert.equal(f.calls.length,1); assert.deepEqual(f.values,["snapshot"]);
  f.monitor.refresh(); f.monitor.refresh(); await f.tick(1000); assert.equal(f.calls.length,2);
  f.visibility(false); await f.tick(90000); assert.equal(f.calls.length,2);
  f.visibility(true); await f.tick(); assert.equal(f.calls.length,3);
  f.monitor.stop(); await f.tick(60000); assert.equal(f.calls.length,3); assert.equal(f.timers.size,0);
});
test("denial during an in-flight read fences its stale result and coalesces one fresh read", async () => {
  const pending=[]; const f=fixture(() => new Promise(resolve => pending.push(resolve)));
  f.monitor.start(true); await f.tick(); assert.equal(f.calls.length,1);
  f.monitor.refresh(true); f.monitor.refresh(true); pending.shift()("stale"); await f.tick(1000);
  assert.deepEqual(f.values,[]); assert.equal(f.calls.length,2);
  pending.shift()("revoked"); await f.tick(); assert.deepEqual(f.values,["revoked"]);
  f.monitor.stop();
});
test("deadline and outage retry never report an authority denial; confirmed invalid stops", async () => {
  let mode="timeout";
  const f=fixture(signal => mode === "timeout" ? new Promise((_, reject) => signal.addEventListener("abort", () => reject("timeout"))) : Promise.reject("invalid"));
  f.monitor.start(true); await f.tick(10000); assert.equal(f.calls[0].aborted,true);
  assert.deepEqual(f.errors,["timeout"]); assert.equal(f.values.length,0);
  mode="invalid"; await f.tick(30000); assert.deepEqual(f.errors,["timeout","invalid"]);
  await f.tick(90000); assert.equal(f.calls.length,2); assert.equal(f.timers.size,0);
});
test("logout/unmount aborts and ignores even a transport that later returns stale success", async () => {
  let resolve; const f=fixture(() => new Promise(done => { resolve=done; }));
  f.monitor.start(true); await f.tick(); f.monitor.stop(); assert.equal(f.calls[0].aborted,true);
  resolve("late"); await f.tick(); assert.deepEqual(f.values,[]); assert.equal(f.timers.size,0);
});
test("missing/malformed permission snapshots are unavailable, never interpreted as revoke", async () => {
  const original=globalThis.fetch;
  try {
    for(const moduleAccess of [undefined, {}, {modules:[],allowedModules:["UNKNOWN"],implicitAll:false}]) {
      globalThis.fetch=async input => { assert.equal(input,"/api/auth/me?include=module-access"); return Response.json({ok:true,requestId:"synthetic",data:{user:{employeeId:"fixture",workspaceId:"synthetic",workspaceRole:"USER"},moduleAccess}}); };
      await assert.rejects(loadCurrentSession(), error => error.code === "INVALID_API_RESPONSE");
    }
  } finally { globalThis.fetch=original; }
});
const principal={workspaceId:"synthetic-workspace",employeeId:"fixture-user",employeeNo:"4712",displayName:"Synthetic",workspaceRole:"USER",isIdentityAdmin:false,emailVerified:true,isWorkspaceSuperAdmin:false,credentialVersion:1,employeeRevision:1};
function serverFixture() {
  const f={grants:["CUSTOMERS"],active:1,role:"USER",status:200,reads:0,writes:0,resolutions:0};
  f.env={IDENTITY_APPLICATION_ID:"CYWEB",IDENTITY_WORKSPACE_ID:principal.workspaceId,
    IDENTITY:{async fetch(request){ f.resolutions++; assert.equal(new URL(request.url).pathname,"/v1/identity/session/resolve"); return Response.json({principal:{...principal,workspaceRole:f.role,isWorkspaceSuperAdmin:f.role==="SUPER_ADMIN"},session:{expiresAt:"2999-01-01T00:00:00Z"}},{status:f.status}); }},
    DB:{prepare(sql){ assert.match(sql,/^SELECT/); f.reads++; return {bind(){return this;},async first(){return {id:1,identity_employee_id:principal.employeeId,employee_no:"4712",is_active:f.active};},async all(){return {results:f.grants.map(module_code => ({module_code}))};},async run(){f.writes++;throw Error("unexpected mutation");}};}}};
  f.read=include => handleAuthRoute(new Request("https://web.example.test/api/auth/me"+(include?"?include=module-access":""),{headers:{cookie:"cyweb_identity_session=cyid_"+"c".repeat(64)}}),f.env,"synthetic");
  return f;
}
test("combined snapshot resolves CYID once, reads current app-local grants, preserves shell and legacy shape", async () => {
  const f=serverFixture();
  const baseline=await (await f.read(false)).json(); assert.equal("moduleAccess" in baseline.data,false);
  let response=await (await f.read(true)).json(); assert.deepEqual(response.data.moduleAccess.allowedModules,["CUSTOMERS"]);
  f.grants=[]; response=await (await f.read(true)).json(); assert.deepEqual(response.data.moduleAccess.allowedModules,[]); assert.equal(response.data.user.employeeId,principal.employeeId);
  f.grants=["ITEMS"]; f.active=0; assert.deepEqual((await (await f.read(true)).json()).data.moduleAccess.allowedModules,[]);
  f.role="SUPER_ADMIN"; response=await (await f.read(true)).json(); assert.equal(response.data.moduleAccess.allowedModules.length,CYWEB_MODULES.length); assert.equal(response.data.moduleAccess.implicitAll,true);
  assert.equal(f.resolutions,5); assert.equal(f.writes,0);
});
test("invalid Session clears cookie; provider outage preserves cookie and never reads grants", async () => {
  for(const [status,expected,clears] of [[401,401,true],[503,503,false]]) {
    const f=serverFixture(); f.status=status; const response=await f.read(true);
    assert.equal(response.status,expected); assert.equal(f.reads,0); assert.equal(f.resolutions,1);
    assert.equal((response.headers.get("set-cookie")??"").includes("Max-Age=0"),clears);
  }
});
