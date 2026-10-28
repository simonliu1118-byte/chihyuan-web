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
function fixture({ role = "SUPER_ADMIN", active = true, authenticated = true, bound = true, failure, auditRows = [], auditUnavailable = false, latestVerifiedAt = null } = {}) {
  const calls = [], queries = [], target = {};
  const env = { RECOVERY_DB: bound ? target : undefined, IDENTITY_APPLICATION_ID: "APP_TEST", IDENTITY_WORKSPACE_ID: "workspace-test",
    DB: {
      prepare(sql) { return {
        bind(...args) { queries.push({ sql, args }); return this; },
        async first() {
          if (sql.includes("ae.occurred_at")) return latestVerifiedAt ? { occurred_at: latestVerifiedAt } : null;
          return { id: 7, identity_employee_id: "synthetic", employee_no: "0098", display_name: "Synthetic", is_active: active ? 1 : 0 };
        },
        async all() { if (auditUnavailable) throw Error("sensitive audit provider outage"); return { results: auditRows }; },
      }; },
      async batch() { return [{ results: [] }, { results: [] }]; },
    },
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
  const history = () => handleBackupRoute(new Request("https://synthetic.test/api/admin/backups", {
    method: "GET", headers: { cookie: "cyweb_identity_session=cyid_" + "a".repeat(64) },
  }), env, "synthetic-history");
  const reminder = () => handleBackupRoute(new Request("https://synthetic.test/api/admin/backups/quarterly-reminder", {
    method: "GET", headers: { cookie: "cyweb_identity_session=cyid_" + "a".repeat(64) },
  }), env, "synthetic-reminder");
  return { run, history, reminder, calls, queries, target };
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
  for (const failure of ["BACKUP_TARGET_NOT_EMPTY", "BACKUP_TABLE_COVERAGE_MISMATCH", "BACKUP_COLUMNS_MISMATCH", "BACKUP_ISOLATED_RECOVERY_FAILED", "sensitive-provider-details"]) {
    const f = fixture({ failure }), response = await f.run(); assert.equal(response.status, 409);
    const body = await response.json(); assert.equal(body.error.code, failure.startsWith("BACKUP_") ? failure : "BACKUP_RECOVERY_UNAVAILABLE");
    assert.ok(!JSON.stringify(body).includes("sensitive-provider-details")); assert.equal(f.calls.length, 1);
  }
});

test("incompatible old recovery target explains schema mismatch without leaking resource IDs", async () => {
  const f = fixture({ failure: "BACKUP_TABLE_COVERAGE_MISMATCH" });
  const response = await f.run(), body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error.code, "BACKUP_TABLE_COVERAGE_MISMATCH");
  assert.match(body.error.message, /結構.*不一致/);
  assert.match(body.error.message, /不可|保留|新版/);
});

test("backup refresh includes bounded, workspace-scoped rehearsal status without exposing raw Audit metadata", async () => {
  const f = fixture({ auditRows: [
    { id: 3, entity_key: id, action: "backup.rehearsal.failed", occurred_at: "2026-10-28T07:46:34.000Z",
      request_id: "request-a", metadata_json: JSON.stringify({ provider: "gcs", phase: "target_validation",
        errorCode: "BACKUP_TABLE_COVERAGE_MISMATCH", customerSecret: "hidden" }) },
    { id: 2, entity_key: id, action: "backup.rehearsal.started", occurred_at: "2026-10-28T07:46:34.000Z",
      request_id: "request-a", metadata_json: "{}" },
    { id: 1, entity_key: id, action: "backup.rehearsal.verified", occurred_at: "2026-10-18T02:39:55.000Z",
      request_id: "request-old", metadata_json: JSON.stringify({ provider: "r2" }) },
  ] });
  const response = await f.history(), body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.rehearsals.length, 2);
  assert.equal(body.data.rehearsals[0].status, "failed");
  assert.equal(body.data.rehearsals[0].errorCode, "BACKUP_TABLE_COVERAGE_MISMATCH");
  assert.equal(body.data.rehearsals[1].status, "verified");
  assert.doesNotMatch(JSON.stringify(body), /customerSecret|hidden/);
  assert.ok(f.queries.some(q => q.sql.includes("JOIN backup_sets") && q.args[0] === "workspace-test"));
});

test("optional Audit lookup failure does not conceal healthy backup catalog or report false success", async () => {
  const f = fixture({ auditUnavailable: true }), response = await f.history(), body = await response.json();
  assert.equal(response.status, 200);
  assert.equal(body.data.rehearsalHistoryAvailable, false);
  assert.deepEqual(body.data.rehearsals, []);
  assert.deepEqual(body.data.sets, []);
  assert.doesNotMatch(JSON.stringify(body), /sensitive audit provider outage/);
});

test("quarterly reminder is Super Admin only, workspace scoped, and read-only", async () => {
  const current = new Date().toISOString();
  const f = fixture({ latestVerifiedAt: current });
  const response = await f.reminder(), data = (await response.json()).data;
  assert.equal(response.status, 200);
  assert.equal(data.due, false);
  assert.match(data.quarter, /^\d{4}-Q[1-4]$/);
  assert.ok(f.queries.some(q => q.sql.includes("backup.rehearsal.verified") && q.args[0] === "workspace-test"));
  assert.equal((await fixture({ role: "ADMIN" }).reminder()).status, 403);
  assert.equal((await fixture({ role: "USER" }).reminder()).status, 403);
});
test("rehearsal lock error is safe and distinct from transient provider failure", async () => {
  const f = fixture({ failure: "BACKUP_TARGET_ALREADY_REHEARSED" });
  const response = await f.run(), body = await response.json();
  assert.equal(response.status, 409);
  assert.equal(body.error.code, "BACKUP_TARGET_ALREADY_REHEARSED");
  assert.match(body.error.message, /鎖定/);
});
