import assert from "node:assert/strict";
import test from "node:test";
import fs from "node:fs";
import { resolveDeployRuntime, identitySeedFor } from "./resolve-deploy-runtime.mjs";

const dbId = "31111111-1111-4111-8111-111111111111";
const plain = (name, text) => ({ type: "plain_text", name, text });
function fixture(change) {
  const state = {
    domains: [{ hostname: "admin.example.test", service: "synthetic-web", environment: "production", enabled: true }],
    bindings: [plain("IDENTITY_CONSUMER_VERSION", "1.0.5"), plain("SOURCE_VERSION", "0.21.3"),
      plain("IDENTITY_APPLICATION_ID", "CYWEB"), plain("IDENTITY_WORKSPACE_ID", "synthetic-workspace"),
      { type: "d1", name: "DB", id: dbId }, { type: "service", name: "IDENTITY", service: "synthetic-identity-prod" },
      { type: "r2_bucket", name: "HR_FILES", bucket_name: "synthetic-hr" }],
    database: { uuid: dbId, name: "synthetic-db" },
    subdomain: "synthetic-sub",
  };
  change?.(state);
  const calls = [];
  async function fetchImpl(url, init) {
    calls.push(url);
    assert.equal(init.method, "GET"); assert.equal(init.redirect, "error");
    assert.equal(new Headers(init.headers).get("authorization"), "Bearer synthetic-token");
    const u = new URL(url);
    assert.equal(u.origin, "https://api.cloudflare.com");
    const ok = result => Response.json({ success: true, result });
    if (u.pathname.endsWith("/workers/domains")) return ok(state.domains);
    if (u.pathname.endsWith("/workers/scripts/synthetic-web/settings")) return ok({ bindings: state.bindings });
    if (u.pathname.endsWith(`/d1/database/${dbId}`)) return ok(state.database);
    if (u.pathname.endsWith("/workers/subdomain")) return ok({ subdomain: state.subdomain });
    return Response.json({ success: false, errors: [{ code: 10007 }] }, { status: 404 });
  }
  return { calls, options: { accountId: "synthetic-account", apiToken: "synthetic-token", publicHostname: "admin.example.test", fetchImpl } };
}

test("resolves every identifier from the Worker serving the public hostname and masks each one", async () => {
  const f = fixture();
  const { values, masks } = await resolveDeployRuntime(f.options);
  assert.deepEqual(values, {
    CF_WORKER_NAME: "synthetic-web", CF_D1_DATABASE_ID: dbId, CF_D1_DATABASE_NAME: "synthetic-db",
    CF_IDENTITY_SERVICE: "synthetic-identity-dev", CYID_LOOKUP_SERVICE: "synthetic-identity-dev",
    CF_IDENTITY_APPLICATION_ID: "CYWEB", CF_IDENTITY_WORKSPACE_ID: "synthetic-workspace", CF_HR_FILES_R2_BUCKET: "synthetic-hr",
  });
  for (const value of [...Object.values(values), "synthetic-identity-prod", "synthetic-sub"]) assert.ok(masks.includes(value), value);
});

test("identity seed maps back to the live production binding", () => {
  assert.equal(identitySeedFor("cycloud-identity-prod"), "cycloud-identity-dev");
  assert.equal(identitySeedFor("x-production"), "x-development");
  assert.throws(() => identitySeedFor("cycloud-identity"), /CYWEB_DEPLOY_IDENTITY_NAME_UNSUPPORTED/);
});

test("refuses an unverified hostname, a non-CY Web Worker and missing or ambiguous bindings", async () => {
  const cases = [
    [s => { s.domains = []; }, /CYWEB_DEPLOY_DOMAIN_UNVERIFIED/],
    [s => { s.domains.push({ ...s.domains[0], service: "other" }); }, /CYWEB_DEPLOY_DOMAIN_UNVERIFIED/],
    [s => { s.domains[0].environment = "staging"; }, /CYWEB_DEPLOY_DOMAIN_UNVERIFIED/],
    [s => { s.bindings = s.bindings.filter(b => b.name !== "SOURCE_VERSION"); }, /CYWEB_DEPLOY_WORKER_NOT_CYWEB/],
    [s => { s.bindings = s.bindings.filter(b => b.name !== "DB"); }, /CYWEB_DEPLOY_DB_UNBOUND/],
    [s => { s.bindings.push({ type: "d1", name: "DB", id: dbId }); }, /CYWEB_DEPLOY_BINDING_AMBIGUOUS DB/],
    [s => { s.database.uuid = "41111111-1111-4111-8111-111111111111"; }, /CYWEB_DEPLOY_DB_METADATA_MISMATCH/],
    [s => { s.bindings = s.bindings.filter(b => b.name !== "IDENTITY"); }, /CYWEB_DEPLOY_IDENTITY_UNBOUND/],
    [s => { s.bindings.find(b => b.name === "IDENTITY_WORKSPACE_ID").text = "x"; }, /CYWEB_DEPLOY_IDENTITY_SCOPE_INVALID/],
  ];
  for (const [change, error] of cases) await assert.rejects(resolveDeployRuntime(fixture(change).options), error);
});

test("backup targets come from the live Worker only when the backup switch is on", async () => {
  await assert.rejects(resolveDeployRuntime({ ...fixture().options, backupEnabled: "true" }), /CYWEB_DEPLOY_BACKUP_TARGET_UNBOUND/);
  const f = fixture(s => s.bindings.push({ type: "r2_bucket", name: "BACKUP_R2", bucket_name: "synthetic-backup" }, plain("GCS_BUCKET", "synthetic-gcs")));
  const { values } = await resolveDeployRuntime({ ...f.options, backupEnabled: "true" });
  assert.equal(values.CF_BACKUP_R2_BUCKET, "synthetic-backup");
  assert.equal(values.GCS_BUCKET, "synthetic-gcs");
});

test("error codes carry no identifiers", async () => {
  const f = fixture(s => { s.database.uuid = "x"; });
  await assert.rejects(resolveDeployRuntime(f.options), error => !error.message.includes(dbId) && !error.message.includes("synthetic-web"));
});

test("deploy and identity audit jobs never read resource identifiers from GitHub variables", () => {
  const workflow = fs.readFileSync(".github/workflows/development-deploy.yml", "utf8");
  const jobs = { "deploy-development": "audit-identity", "audit-identity": "backup-audit-inputs" };
  for (const [job, next] of Object.entries(jobs)) {
    const section = workflow.slice(workflow.indexOf(`\n  ${job}:`), workflow.indexOf(`\n  ${next}:`));
    for (const name of ["CF_WORKER_NAME", "CF_D1_DATABASE_ID", "CF_D1_DATABASE_NAME", "CF_IDENTITY_SERVICE", "CF_IDENTITY_APPLICATION_ID",
      "CF_IDENTITY_WORKSPACE_ID", "CF_HR_FILES_R2_BUCKET", "CF_BACKUP_R2_BUCKET", "GCS_BUCKET", "CF_CYINVOICE_RECOVERY_SERVICE"])
      assert.doesNotMatch(section, new RegExp(`vars\\.${name}\\b`), `${job} reads ${name}`);
    assert.ok(section.indexOf("node scripts/resolve-deploy-runtime.mjs") > 0, job);
  }
  const deploy = workflow.slice(workflow.indexOf("\n  deploy-development:"), workflow.indexOf("\n  audit-identity:"));
  assert.ok(deploy.indexOf("node scripts/resolve-deploy-runtime.mjs") < deploy.indexOf("node scripts/resolve-production-identity.mjs"));
});
