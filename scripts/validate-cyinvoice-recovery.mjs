import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { build } from "esbuild";

const built = await build({
  entryPoints: ["worker/http/cyinvoice-recovery-routes.ts"],
  bundle: true,
  write: false,
  platform: "node",
  format: "esm",
  target: "node24",
});
const moduleUrl = "data:text/javascript;base64," + Buffer.from(built.outputFiles[0].text).toString("base64");
const { handleCyInvoiceRecoveryRoute } = await import(moduleUrl);

const url = "https://cyweb.example.test/api/identity/admin/cyinvoice/device-recovery/invitations";
const operationId = "11111111-1111-4111-8111-111111111111";
const sessionToken = "cyid_" + "a".repeat(64);
const now = new Date(Date.now() + 300000).toISOString();
const principal = {
  workspaceId: "identity_workspace",
  employeeId: "employee_synthetic",
  employeeNo: "0001",
  displayName: "Synthetic Administrator",
  workspaceRole: "SUPER_ADMIN",
  isIdentityAdmin: false,
  isWorkspaceSuperAdmin: true,
  emailVerified: true,
  credentialVersion: 3,
  employeeRevision: 7,
};

let providerCalls = 0;
let issuerCalls = 0;
let statusCalls = 0;
let revokeCalls = 0;
let issuerInput;
let issuerResult = {status:"sent", invitationId:"inv_22222222-2222-4222-8222-222222222222", expiresAt:now};
let issuerThrows = false;
let resolved = principal;
const env = {
  IDENTITY_APPLICATION_ID: "CYWEB",
  IDENTITY_WORKSPACE_ID: "identity_workspace",
  IDENTITY: {
    async fetch(request) {
      providerCalls++;
      assert.equal(new URL(request.url).pathname, "/v1/identity/session/resolve");
      assert.equal(request.headers.get("authorization"), "Bearer " + sessionToken);
      assert.equal(request.headers.get("x-identity-application"), "CYWEB");
      return Response.json({ok:true, principal:resolved, session:{expiresAt:now}});
    },
  },
  CYINVOICE_RECOVERY: {
    async issueRecoveryInvitation(input) {
      issuerCalls++;
      issuerInput = input;
      if (issuerThrows) throw new Error("RPC_RESULT_LOST");
      return issuerResult;
    },
    async getRecoveryInvitationStatus(input) {
      statusCalls++;
      issuerInput = input;
      return issuerResult;
    },
    async revokeRecoveryInvitation(input) {
      revokeCalls++;
      issuerInput = input;
      return {status:"failed"};
    },
  },
};

function post(body = {password:"syntheticpass", operationId}, overrides = {}) {
  return new Request(overrides.url ?? url, {
    method:"POST",
    headers:{
      origin:"https://cyweb.example.test",
      "sec-fetch-site":"same-origin",
      "content-type":"application/json",
      cookie:`cyweb_identity_session=${sessionToken}`,
      ...(overrides.headers ?? {}),
    },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}
async function run(request, runtime = env) {
  const response = await handleCyInvoiceRecoveryRoute(request, runtime, "request_synthetic");
  return {status:response.status, payload:await response.json()};
}
async function denied(request, status, code, runtime = env) {
  const prior = issuerCalls + statusCalls + revokeCalls;
  const result = await run(request, runtime);
  assert.equal(result.status, status);
  assert.equal(result.payload.error.code, code);
  assert.equal(issuerCalls + statusCalls + revokeCalls, prior,
    "Denied request must never invoke private recovery capability");
}

await denied(post(undefined, {headers:{origin:"https://evil.example.test"}}),403,"ORIGIN_NOT_ALLOWED");
await denied(post(undefined, {headers:{origin:""}}),403,"ORIGIN_NOT_ALLOWED");
await denied(post(undefined, {headers:{"sec-fetch-site":"cross-site"}}),403,"ORIGIN_NOT_ALLOWED");
await denied(post(undefined, {headers:{cookie:`cyweb_first_login=cyif_${"b".repeat(64)}`}}),401,"AUTH_REQUIRED");
await denied(post(undefined, {headers:{cookie:""}}),401,"AUTH_REQUIRED");
resolved={...principal,workspaceRole:"USER",isWorkspaceSuperAdmin:false};
await denied(post(),403,"SUPER_ADMIN_REQUIRED");
resolved={...principal,workspaceRole:"ADMIN",isIdentityAdmin:true,isWorkspaceSuperAdmin:false};
await denied(post(),403,"SUPER_ADMIN_REQUIRED");
resolved={...principal,emailVerified:false};
await denied(post(),403,"SUPER_ADMIN_REQUIRED");
resolved=principal;
await denied(post({password:"short",operationId}),400,"INVALID_REQUEST");
await denied(post({password:"syntheticpass",operationId,workspaceRole:"SUPER_ADMIN"}),400,"INVALID_REQUEST");
await denied(post({password:"syntheticpass",operationId:"invalid"}),400,"INVALID_REQUEST");
await denied(post({password:"syntheticpass",operationId}, {headers:{"content-type":"text/plain"}}),400,"UNSUPPORTED_CONTENT_TYPE");
await denied(post(),503,"RECOVERY_NOT_CONFIGURED",{...env,CYINVOICE_RECOVERY:undefined});
const ok=await run(post());
assert.equal(ok.status,200);
assert.equal(ok.payload.data.status,"sent");
assert.equal(issuerCalls,1);
assert.deepEqual(issuerInput,{
  operationId,employeeNo:principal.employeeNo,password:"syntheticpass",
  expectedEmployeeId:principal.employeeId,
  expectedIdentityWorkspaceId:principal.workspaceId,
  expectedCredentialVersion:principal.credentialVersion,
  expectedEmployeeRevision:principal.employeeRevision,
});
assert.equal(JSON.stringify(ok).includes("syntheticpass"),false);
assert.equal(JSON.stringify(ok).includes(sessionToken),false);

issuerResult={status:"pending"};
const pending=await run(post());
assert.equal(pending.status,202);
assert.equal(pending.payload.data.status,"pending");
issuerThrows=true;
const lost=await run(post());
assert.equal(lost.status,503);
assert.equal(lost.payload.error.code,"RECOVERY_RESULT_UNKNOWN");
assert.equal(issuerCalls,3, "Never automatically replay a lost RPC result");
issuerThrows=false;
issuerResult={status:"pending"};
const statusUrl=url+"/status";
const revokeUrl=url+"/revoke";
const status=await run(post(undefined,{url:statusUrl}));
assert.equal(status.status,200);
assert.equal(status.payload.data.status,"pending");
assert.equal(statusCalls,1);
const revoked=await run(post(undefined,{url:revokeUrl}));
assert.equal(revoked.status,200);
assert.equal(revoked.payload.data.status,"revoked");
assert.equal(revokeCalls,1);
issuerResult={status:"failed"};
const unavailable=await run(post(undefined,{url:statusUrl}));
assert.equal(unavailable.status,200);
assert.equal(unavailable.payload.data.status,"unavailable");
await denied(post(undefined,{url:revokeUrl,headers:{origin:"https://evil.example.test"}}),403,"ORIGIN_NOT_ALLOWED");
resolved={...principal,workspaceRole:"USER",isWorkspaceSuperAdmin:false};
await denied(post(undefined,{url:statusUrl}),403,"SUPER_ADMIN_REQUIRED");
await denied(post(undefined,{url:revokeUrl}),403,"SUPER_ADMIN_REQUIRED");
resolved=principal;
await denied(post(undefined,{url:statusUrl}),503,"RECOVERY_NOT_CONFIGURED",{
  ...env,CYINVOICE_RECOVERY:{issueRecoveryInvitation:env.CYINVOICE_RECOVERY.issueRecoveryInvitation},
});
assert.deepEqual(issuerInput,{
  operationId,employeeNo:principal.employeeNo,password:"syntheticpass",
  expectedEmployeeId:principal.employeeId,
  expectedIdentityWorkspaceId:principal.workspaceId,
  expectedCredentialVersion:principal.credentialVersion,
  expectedEmployeeRevision:principal.employeeRevision,
});

assert.ok(providerCalls>0);
const get=await handleCyInvoiceRecoveryRoute(new Request(url),env,"request_synthetic");
assert.equal(get.status,405);
assert.equal(await handleCyInvoiceRecoveryRoute(new Request("https://cyweb.example.test/api/unrelated"),env,"request_synthetic"),null);
console.log("CYWEB CYInvoice recovery boundary: auth, origin, payload, RPC scope and lost-result guards passed");
