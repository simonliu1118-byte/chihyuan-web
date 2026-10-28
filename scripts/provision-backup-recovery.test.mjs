import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { nonSeedRowCondition, MIGRATION_SEEDS } from "../shared/backup-migration-seeds.ts";
import { provisionBackupRecovery, RECOVERY_ROTATION_CONFIRMATION } from "./provision-backup-recovery.mjs";
const primary = "11111111-1111-4111-8111-111111111111";
const isolated = "22222222-2222-4222-8222-222222222222";
const candidate = "33333333-3333-4333-8333-333333333333";
const env = { CF_BACKUP_ENABLED: "true", CF_WORKER_NAME: "synthetic-web", CF_D1_DATABASE_ID: primary,
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "synthetic-secret" };
const generation = "20261028a";
const candidateName = "synthetic-web-recovery-v" + generation;
const migrationNames = fs.readdirSync(new URL("../migrations/", import.meta.url)).filter(x => x.endsWith(".sql")).sort();
const approval = { CF_RECOVERY_ROTATION_GENERATION: generation,
  CF_RECOVERY_ROTATION_CONFIRMATION: RECOVERY_ROTATION_CONFIRMATION, CF_RECOVERY_ROTATION_OPERATION: "rotate-recovery",
  GITHUB_EVENT_NAME: "workflow_dispatch", GITHUB_REF: "refs/heads/main", GITHUB_ENV: "/tmp/synthetic-environment" };
function fixture({ bound, inventory = [], created = isolated, used = false, tables = [{ name: "customers" }],
  failQuery = false, schemaMismatch = false, candidateDirty = false, createdHasTables = false,
  appliedMigrations = migrationNames } = {}) {
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
      if (databaseId === primary && !sql.startsWith("SELECT type") && !sql.startsWith("SELECT name FROM d1_migrations"))
        throw Error("no primary business data reads allowed");
      if (sql.startsWith("SELECT name FROM d1_migrations")) result = [{ success: true,
        results: appliedMigrations.map(name => ({ name })) }];
      else if (sql.startsWith("SELECT name")) result = [{
        success: true, results: justCreated === databaseId && !wasMigrated && !createdHasTables ? [] : tables,
      }];
      else if (sql.startsWith("SELECT type")) result = [{
        success: true, results: databaseId !== primary && schemaMismatch ? [{ type: "table", name: "unexpected" }]
          : [{ type: "table", name: "customers", tbl_name: "customers", sql: "CREATE TABLE customers (...)" }],
      }];
      else result = [{ success: true, results: [{
        used_target: databaseId === justCreated && wasMigrated ? (candidateDirty ? 1 : 0) : (used ? 1 : 0),
      }] }];
    } else throw Error("unexpected route");
    return Response.json({ success: true, result });
  };
  const run = input => provisionBackupRecovery({ env: { ...env, ...input }, fetchImpl,
    migrate: async target => { migrations.push(target); wasMigrated = true; }, mask: value => masks.push(value) });
  return { run, calls, migrations, masks };
}
test("disabled backups make no provider calls; normal deployment never creates a D1", async () => {
  const f = fixture(); assert.equal(await f.run({ CF_BACKUP_ENABLED: "false" }), null); assert.equal(f.calls.length, 0);
  for (const inventory of [[], [{ uuid: isolated, name: "synthetic-web-recovery" }], [{ uuid: isolated, name: candidateName }]]) {
    const g = fixture({ inventory });
    assert.deepEqual(await g.run(), { detached: true, used: false, rotated: false });
    assert.equal(g.calls.filter(c => c.method === "POST").length, 0);
    assert.equal(g.migrations.length, 0);
  }
});
test("exact Worker binding proves ownership; unused target stays bound, used target is detached untouched", async () => {
  for (const name of ["synthetic-web-recovery", candidateName]) {
    const fresh = fixture({ bound: isolated, inventory: [{ uuid: isolated, name }] });
    const kept = await fresh.run();
    assert.equal(kept.CF_RECOVERY_D1_DATABASE_ID, isolated); assert.equal(kept.CF_RECOVERY_D1_DATABASE_NAME, name);
    assert.equal(kept.used, false); assert.equal(fresh.migrations.length, 1);
    const used = fixture({ bound: isolated, inventory: [{ uuid: isolated, name }], used: true });
    assert.deepEqual(await used.run(), { detached: true, used: true, rotated: false });
    assert.equal(used.migrations.length, 0);
    assert.ok(!used.calls.some(c => c.method === "POST" && !c.route.endsWith("/query")));
    assert.ok(!used.calls.some(c => c.route.endsWith("/query") && /DELETE|DROP|UPDATE|INSERT/.test(c.body?.sql ?? "")));
  }
});
test("a deleted bound D1 is dropped; unowned name and primary as target cannot authorize migration", async () => {
  const gone = fixture({ bound: isolated });
  assert.deepEqual(await gone.run(), { detached: true, used: false, rotated: false });
  assert.equal(gone.migrations.length, 0);
  for (const options of [
    { bound: primary, inventory: [{ uuid: primary, name: "synthetic-web-recovery" }] },
    { bound: isolated, inventory: [{ uuid: isolated, name: "unrelated-d1" }] },
  ]) {
    const f = fixture(options);
    await assert.rejects(f.run(), /^Error: RECOVERY_(OWNER_CONFIRMATION_REQUIRED|TARGET_NOT_ISOLATED)$/);
    assert.equal(f.migrations.length, 0);
  }
});
test("failed provider query, occupied new target or unsafe schema cannot trigger migration", async () => {
  for (const options of [{ failQuery: true }, { tables: [{ name: 'invalid";DELETE' }], createdHasTables: true }, { createdHasTables: true }]) {
    const f = fixture({ created: candidate, ...options });
    await assert.rejects(f.run(approval), /^Error: RECOVERY_(PROVIDER_UNAVAILABLE|SCHEMA_INVALID|ROTATION_TARGET_NOT_NEW)$/);
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
test("a detached Worker rotates to a new target without any previous binding", async () => {
  const f = fixture({ inventory: [{ uuid: isolated, name: "synthetic-web-recovery" }], created: candidate });
  const result = await f.run(approval);
  assert.equal(result.rotated, true); assert.equal(result.CF_RECOVERY_D1_DATABASE_ID, candidate);
  assert.deepEqual(f.migrations.map(x => x.id), [candidate]);
  const primaryTarget = fixture({ created: primary });
  await assert.rejects(primaryTarget.run(approval), /^Error: RECOVERY_TARGET_NOT_ISOLATED$/);
  assert.equal(primaryTarget.migrations.length, 0);
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

test("a provider response recycling another known D1 UUID cannot activate that resource", async () => {
  const f = fixture({ bound: isolated, inventory: [
    { uuid: isolated, name: "synthetic-web-recovery" },
    { uuid: candidate, name: "unrelated-existing-d1" },
  ], created: candidate, used: true });
  await assert.rejects(f.run(approval), /^Error: RECOVERY_TARGET_NOT_ISOLATED$/);
  assert.equal(f.migrations.length, 0);
  assert.ok(!f.calls.some(c => c.method === "DELETE" || c.method === "PATCH"));
});

test("canonical seed predicate treats exact seed as unused and edited or extra rows as used", () => {
  const db = new DatabaseSync(":memory:");
  try {
    db.exec("CREATE TABLE hr_stores (id INTEGER, name TEXT, sort_order INTEGER, is_active INTEGER, cycle_anchor_date TEXT, rules_template TEXT)");
    const isUsed = () => db.prepare("SELECT CASE WHEN " + nonSeedRowCondition("hr_stores") + " THEN 1 ELSE 0 END AS used").get().used;
    db.prepare("INSERT INTO hr_stores VALUES (1, ?, 0, 1, '2026-09-28', '')").run("志遠高雄門市");
    assert.equal(isUsed(), 0);
    db.exec("UPDATE hr_stores SET name='modified seed' WHERE id=1");
    assert.equal(isUsed(), 1);
    db.exec("UPDATE hr_stores SET name=NULL WHERE id=1");
    assert.equal(isUsed(), 1, "NULL-modified migration seed must be protected");
    db.exec("UPDATE hr_stores SET name='志遠高雄門市' WHERE id=1");
    db.exec("INSERT INTO hr_stores VALUES (2, 'extra', 1, 1, '2026-09-28', '')");
    assert.equal(isUsed(), 1);
    assert.equal(MIGRATION_SEEDS.hr_stores.count, 1);
    assert.match(nonSeedRowCondition("hr_leave_types"), /is_statutory/);
    assert.throws(() => nonSeedRowCondition('unsafe";DROP TABLE'), /RECOVERY_SCHEMA_INVALID/);
  } finally { db.close(); }
});
test("seed-only versioned target receives new forward migrations during subsequent normal deployment", async () => {
  const f = fixture({ bound: isolated, inventory: [{ uuid: isolated, name: candidateName }],
    tables: [{ name: "hr_stores" }], used: false });
  const result = await f.run();
  assert.equal(result.used, false);
  assert.equal(result.CF_RECOVERY_D1_DATABASE_NAME, candidateName);
  assert.deepEqual(f.migrations.map(x => x.id), [isolated]);
  const checks = f.calls.filter(x => x.route === `d1/database/${isolated}/query`).map(x => x.body.sql);
  assert.ok(checks.some(sql => sql.includes("COUNT(*)") && sql.includes("cycle_anchor_date") && sql.includes("NOT (")));
});
test("modified or additional HR seed rows preserve existing D1 and prevent migration", async () => {
  for (const reason of ["modified seed", "extra row"]) {
    const f = fixture({ bound: isolated, inventory: [{ uuid: isolated, name: candidateName }],
      tables: [{ name: "hr_stores" }], used: true });
    assert.equal((await f.run()).used, true, reason);
    assert.equal(f.migrations.length, 0);
    assert.ok(f.calls.some(x => x.body?.sql?.includes("id=1 AND name=") && x.body.sql.includes("IS TRUE")));
  }
});
test("primary schema migration lag, unexpected additions or ordering abort rotation before D1 creation", async () => {
  for (const appliedMigrations of [
    migrationNames.slice(0, -1), [...migrationNames, "0030_unreviewed.sql"], migrationNames.slice().reverse(),
  ]) {
    const f = fixture({ bound: isolated, inventory: [{ uuid: isolated, name: "synthetic-web-recovery" }],
      created: candidate, used: true, appliedMigrations });
    await assert.rejects(f.run(approval), /^Error: RECOVERY_ROTATION_PRIMARY_MIGRATIONS_OUTDATED$/);
    assert.equal(f.calls.some(x => x.route === "d1/database" && x.method === "POST"), false);
    assert.equal(f.migrations.length, 0);
    assert.ok(f.calls.some(x => x.route === `d1/database/${primary}/query` && x.body?.sql?.includes("d1_migrations")));
  }
});
