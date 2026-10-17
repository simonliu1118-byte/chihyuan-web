import test from "node:test";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
const directory = mkdtempSync(join(tmpdir(), "cyweb-rehearsal-http-"));
let handleBackupRoute;
try {
  const outfile = join(directory, "route.mjs");
  await build({ entryPoints: [fileURLToPath(new URL("../worker/http/backup-routes.ts", import.meta.url))], outfile,
    bundle: true, platform: "node", format: "esm", plugins: [{ name: "inject-storage-service-only", setup(builder) {
      builder.onLoad({ filter: /worker\/backup\/runtime\.ts$/ }, () => ({ contents: "export const backupService = env => env.testService;", loader: "js" }));
    } }] });
  ({ handleBackupRoute } = await import(pathToFileURL(outfile)));
} finally { rmSync(directory, { recursive: true, force: true }); }
const id = "00000000-0000-4000-8000-000000000001";
const valid = { selectionConfirmation: id, reviewed: true, confirmation: "驗證隔離還原", provider: "gcs" };
function fixture({ role = "SUPER_ADMIN", active = true, authenticated = true, bound = true, failure } = {}) {
  const calls = [], target = {};
  const env = { RECOVERY_DB: bound ? target : undefined, IDENTITY_APPLICATION_ID: "APP_TEST", IDENTITY_WORKSPACE_ID: "workspace-test",
    DB: { prepare() { return { bind() { return this; }, async first() { return { id: 7, identity_employee_id: "synthetic", employee_no: "0098", is_active: active ? 1 : 0 }; } }; } },
    IDENTITY: { async fetch() {
      if (!authenticated) return Response.json({ error: { code: "SESSION_INVALID" } }, { status: 401 });
      return Response.json({ ok: true, principal: { workspaceId: "workspace-test", employeeId: "synthetic", employeeNo: "0098", displayName: "Synthetic",
        workspaceRole: role, isIdentityAdmin: false, emailVerified: true, isWorkspaceSuperAdmin: role === "SUPER_ADMIN", credentialVersion: 1, employeeRevision: 1 },
        session: { expiresAt: "2999-01-01T00:00:00.000Z" } });
    } },
    testService: { async isolatedRecovery(...args) { calls.push(args); if (failure) throw Error(failure);
      return { safetyBackupId: "00000000-0000-4000-8000-000000000002", provider: "gcs" }; } },
  };
  const run = (body = valid, origin = "https://synthetic.test", headers = {}) => handleBackupRoute(new Request(`https://synthetic.test/api/admin/backups/${id}/rehearse`, {
    method: "POST", headers: { cookie: "cyweb_identity_session=cyid_" + "a".repeat(64), "content-type": "application/json", ...(origin ? { origin } : {}), ...headers },
    body: body instanceof ReadableStream ? body : typeof body === "string" ? body : JSON.stringify(body),
    ...(body instanceof ReadableStream ? { duplex: "half" } : {}),
  }), env, "synthetic-request");
  return { run, calls, target };
}
test("rehearsal uses CYID authority, active app member, exact server binding and forced GCS", async () => {
  const f = fixture(), response = await f.run(); assert.equal(response.status, 200);
  const body = await response.json(); assert.equal(body.data.verified, true); assert.equal(body.data.provider, "gcs");
  assert.equal(f.calls.length, 1); assert.equal(f.calls[0][0], f.target);
  assert.equal(f.calls[0][1].role, "SUPER_ADMIN"); assert.equal(f.calls[0][1].provider, "gcs");
  assert.equal(f.calls[0][2].actorMemberId, 7); assert.equal(f.calls[0][2].requestId, "synthetic-request");
});
test("chunked requests without Content-Length stop reading at the actual byte limit", async () => {
  let pulls = 0, cancelled = false;
  const body = new ReadableStream({ pull(controller) { pulls++; controller.enqueue(new Uint8Array(1024).fill(120)); },
    cancel() { cancelled = true; } });
  const f = fixture(), response = await f.run(body);
  assert.equal(response.status, 400); assert.equal((await response.json()).error.code, "REQUEST_TOO_LARGE");
  assert.equal(cancelled, true); assert.ok(pulls <= 6); assert.equal(f.calls.length, 0);
});
test("invalid sessions, other roles, inactive app members and unbound targets never call recovery", async () => {
  for (const [options, status] of [[{ authenticated: false }, 401], [{ role: "ADMIN" }, 403], [{ role: "USER" }, 403], [{ active: false }, 403], [{ bound: false }, 503]]) {
    const f = fixture(options); assert.equal((await f.run()).status, status); assert.equal(f.calls.length, 0);
  }
});
test("missing or foreign Origin, malformed JSON, oversized and incomplete/spoofed confirmation cannot restore", async () => {
  for (const origin of [null, "https://foreign.test", "null"]) {
    const f = fixture(); assert.equal((await f.run(valid, origin)).status, 403); assert.equal(f.calls.length, 0);
  }
  for (const body of ["{", "[]", "x".repeat(4097), { ...valid, selectionConfirmation: "other" }, { ...valid, reviewed: false },
    { ...valid, confirmation: "yes" }, { ...valid, provider: ["gcs"] }, { ...valid, targetDatabaseId: "arbitrary" }, { ...valid, role: "SUPER_ADMIN" }]) {
    const f = fixture(); assert.equal((await f.run(body)).status, 400); assert.equal(f.calls.length, 0);
  }
});
test("used targets and provider failures return stable safe errors without automatic retry", async () => {
  for (const failure of ["BACKUP_TARGET_NOT_EMPTY", "sensitive-provider-details"]) {
    const f = fixture({ failure }), response = await f.run(); assert.equal(response.status, 409);
    const body = await response.json(); assert.equal(body.error.code, failure === "BACKUP_TARGET_NOT_EMPTY" ? failure : "BACKUP_RECOVERY_UNAVAILABLE");
    assert.ok(!JSON.stringify(body).includes("sensitive-provider-details")); assert.equal(f.calls.length, 1);
  }
});
