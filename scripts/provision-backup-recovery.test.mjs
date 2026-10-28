import test from "node:test";
import assert from "node:assert/strict";
import { provisionBackupRecovery, RECOVERY_ROTATION_CONFIRMATION } from "./provision-backup-recovery.mjs";
const primary = "11111111-1111-4111-8111-111111111111";
const isolated = "22222222-2222-4222-8222-222222222222";
const candidate = "33333333-3333-4333-8333-333333333333";
const env = { CF_BACKUP_ENABLED: "true", CF_WORKER_NAME: "synthetic-web", CF_D1_DATABASE_ID: primary,
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "synthetic-secret" };
const generation = "20261028a";
const candidateName = "synthetic-web-recovery-v" + generation;
const approval = { CF_RECOVERY_ROTATION_GENERATION: generation,
  CF_RECOVERY_ROTATION_CONFIRMATION: RECOVERY_ROTATION_CONFIRMATION, CF_RECOVERY_ROTATION_OPERATION: "rotate-recovery",
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_ENV: "/tmp/synthetic-environment" };
function fixture({ bound, inventory = [], created = isolated, used = false, tables = [{ name: "customers" }],
  failQuery = false, schemaMismatch = false, candidateDirty = false, createdHasTables = false } = {}) {
  const calls = [], migrations = [], masks = [];
  let justCreated = null, wasMigrated = false;
  const fetchImpl = async (url, options) => {
    const route = new URL(url).pathname.split(`/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/`)[1];
    calls.push({ route, method: options.method, body: options.body ? JSON.parse(options.body) : null });
    assert.equal(options.headers.Authorization, `Bearer ${env.CLOUDFLARE_API_TOKEN}`);
    let result;
    if (route.endsWith("/settings")) result = { bindings: [{ name: "DB", type: "d1", id: primary },
      ...(bound ? [{ name: "RECOVERY_DB", type: "d1", id: bound }] : [])] };
    else if (route === "d1/database") {
      if (options.method === "GET") result = inventory;
      else { justCreated = created; result = { uuid: created, name: JSON.parse(options.body).name }; }
    } else if (route.endsWith("/query")) {
      if (failQuery) throw Error("secret provider details");
      const databaseId = route.split("/")[2], sql = JSON.parse(options.body).sql;
      if (databaseId === primary && !sql.startsWith("SELECT type"))
        throw Error("no primary business data reads allowed");
      if (sql.startsWith("SELECT name")) result = [{
        success: true, results: justCreated === databaseId && !wasMigrated && !createdHasTables ? [] : tables,
      }];
      else if (sql.startsWith("SELECT type")) result = [{
        success: true, results: databaseId !== primary && schemaMismatch ? [{ type: "table", name: "unexpected" }]
          : [{ type: "table", name: "customers", tbl_name: "customers", sql: "CREATE TABLE customers (...)" }],
      }];
      else if (sql.includes("dirty_target")) result = [{ success: true, results: [{ dirty_target: candidateDirty ? 1 : 0 }] }];
      else result = [{ success: true, results: [{ used_target: used ? 1 : 0 }] }];
    } else throw Error("unexpected route");
    return Response.json({ success: true, result });
  };
  const run = input => provisionBackupRecovery({ env: { ...env, ...input }, fetchImpl,
    migrate: async target => { migrations.push(target); wasMigrated = true; }, mask: value => masks.push(value) });
  return { run, calls, migrations, masks };
}
test("disabled backups make no provider calls; fresh target is migrated exactly once", async () => {
  const f = fixture(); assert.equal(await f.run({ CF_BACKUP_ENABLED: "false" }), null); assert.equal(f.calls.length, 0);
  const result = await f.run();
  assert.equal(result.CF_RECOVERY_D1_DATABASE_ID, isolated); assert.equal(result.used, false);
  assert.equal(result.rotated, false);
  assert.equal(f.calls.filter(c => c.route === "d1/database" && c.method === "POST").length, 1);
  assert.equal(f.migrations.length, 1); assert.equal(f.migrations[0].id, isolated);
  assert.deepEqual(f.masks, [isolated, "synthetic-web-recovery"]);
});
test("exact Worker binding proves ownership; used target remains untouched during normal deployment", async () => {
  for (const used of [false, true]) {
    const f = fixture({ bound: isolated, inventory: [{ uuid: isolated, name: "synthetic-web-recovery" }], used });
    assert.equal((await f.run()).used, used); assert.equal(f.migrations.length, used ? 0 : 1);
    assert.equal(f.calls.some(c => c.route === "d1/database" && c.method === "POST"), false);
  }
});
test("versioned rotated Worker target persists on all later normal deployments", async () => {
  const f = fixture({ bound: isolated, inventory: [{ uuid: isolated, name: candidateName }], used: true });
  const result = await f.run();
  assert.equal(result.CF_RECOVERY_D1_DATABASE_ID, isolated);
  assert.equal(result.CF_RECOVERY_D1_DATABASE_NAME, candidateName);
  assert.equal(result.used, true); assert.equal(f.migrations.length, 0);
});
test("name collision, missing binding inventory and primary as target cannot authorize migration", async () => {
  for (const options of [
    { inventory: [{ uuid: isolated, name: "synthetic-web-recovery" }] },
    { bound: isolated },
    { bound: primary, inventory: [{ uuid: primary, name: "synthetic-web-recovery" }] },
    { created: primary },
  ]) {
    const f = fixture(options);
    await assert.rejects(f.run(), /^Error: RECOVERY_(OWNER_CONFIRMATION_REQUIRED|TARGET_NOT_ISOLATED)$/);
    assert.equal(f.migrations.length, 0);
  }
});
test("failed provider query, occupied new target or unsafe schema cannot trigger migration", async () => {
  for (const options of [{ failQuery: true }, { tables: [{ name: 'invalid";DELETE' }], createdHasTables: true }, { createdHasTables: true }]) {
    const f = fixture(options);
    await assert.rejects(f.run(), /^Error: RECOVERY_(PROVIDER_UNAVAILABLE|SCHEMA_INVALID|TARGET_NOT_EMPTY)$/);
    assert.equal(f.migrations.length, 0);
  }
});
test("protected manual rotation prepares a distinct new canonical D1; old target is never migrated or deleted", async () => {
  const f = fixture({ bound: isolated, inventory: [{ uuid: isolated, name: "synthetic-web-recovery" }],
    created: candidate, used: true });
  const result = await f.run(approval);
  assert.equal(result.rotated, true); assert.equal(result.used, false);
  assert.equal(result.CF_RECOVERY_D1_DATABASE_ID, candidate);
  assert.equal(result.CF_RECOVERY_D1_DATABASE_NAME, candidateName);
  assert.deepEqual(f.migrations.map(x => x.id), [candidate]);
  assert.equal(f.calls.filter(c => c.route === "d1/database" && c.method === "POST").length, 1);
  assert.ok(f.calls.some(c => c.route === `d1/database/${primary}/query`));
  assert.ok(!f.calls.some(c => c.method === "DELETE" || c.method === "PATCH" || c.method === "PUT"));
  assert.ok(!f.calls.some(c => c.route.endsWith("/query") && c.body?.sql?.includes("DELETE")));
  assert.deepEqual(f.masks, [candidate, candidateName]);
});
test("rotation cannot be triggered by ordinary dispatch, branch, push, absent confirmation or disabled backup", async () => {
  for (const bad of [
    { CF_RECOVERY_ROTATION_CONFIRMATION: "" }, { GITHUB_REF: "refs/heads/deploy/cyweb-development" },
    { GITHUB_EVENT_NAME: "push" }, { CF_RECOVERY_ROTATION_OPERATION: "deploy-development" },
    { GITHUB_ENV: "" }, { CF_RECOVERY_ROTATION_GENERATION: "../path" },
    { CF_BACKUP_ENABLED: "false" },
  ]) {
    const f = fixture({ bound: isolated, inventory: [{ uuid: isolated, name: "synthetic-web-recovery" }], used: true });
    await assert.rejects(f.run({ ...approval, ...bad }), /^Error: RECOVERY_ROTATION_NOT_APPROVED$/);
    assert.equal(f.calls.length, 0); assert.equal(f.migrations.length, 0);
  }
});
test("rotation refuses occupied generation or un-used existing target without Cloudflare writes", async () => {
  for (const [used, inventory, code] of [
    [true, [{ uuid: isolated, name: "synthetic-web-recovery" }, { uuid: candidate, name: candidateName }], "RECOVERY_ROTATION_NAME_ALREADY_EXISTS"],
    [false, [{ uuid: isolated, name: "synthetic-web-recovery" }], "RECOVERY_ROTATION_PREVIOUS_TARGET_UNUSED"],
  ]) {
    const f = fixture({ bound: isolated, inventory, used, created: candidate });
    await assert.rejects(f.run(approval), new RegExp(code));
    assert.equal(f.migrations.length, 0);
    assert.equal(f.calls.filter(c => c.route === "d1/database" && c.method === "POST").length, 0);
  }
});
test("rotation failures after creation leave new resource unbound and old target untouched", async () => {
  for (const [config, code] of [
    [{ schemaMismatch: true }, "RECOVERY_ROTATION_SCHEMA_MISMATCH"],
    [{ candidateDirty: true }, "RECOVERY_ROTATION_TARGET_NOT_EMPTY"],
    [{ createdHasTables: true }, "RECOVERY_ROTATION_TARGET_NOT_NEW"],
  ]) {
    const f = fixture({ bound: isolated, inventory: [{ uuid: isolated, name: "synthetic-web-recovery" }],
      created: candidate, used: true, ...config });
    await assert.rejects(f.run(approval), new RegExp(code));
    assert.equal(f.calls.filter(c => c.route === "d1/database" && c.method === "POST").length, 1);
    assert.equal(f.calls.filter(c => c.method === "DELETE" || c.method === "PATCH").length, 0);
  }
});
