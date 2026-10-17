import test from "node:test";
import assert from "node:assert/strict";
import { provisionBackupRecovery } from "./provision-backup-recovery.mjs";
const primary = "11111111-1111-4111-8111-111111111111", isolated = "22222222-2222-4222-8222-222222222222";
const env = { CF_BACKUP_ENABLED: "true", CF_WORKER_NAME: "synthetic-web", CF_D1_DATABASE_ID: primary,
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32), CLOUDFLARE_API_TOKEN: "synthetic-secret" };
function fixture({ bound, inventory = [], created = isolated, used = false, tables = [{ name: "customers" }], failQuery = false } = {}) {
  const calls = [], migrations = [], masks = [];
  const fetchImpl = async (url, options) => {
    const route = new URL(url).pathname.split(`/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/`)[1];
    calls.push({ route, method: options.method });
    assert.equal(options.headers.Authorization, `Bearer ${env.CLOUDFLARE_API_TOKEN}`);
    let result;
    if (route.endsWith("/settings")) result = { bindings: [{ name: "DB", type: "d1", id: primary },
      ...(bound ? [{ name: "RECOVERY_DB", type: "d1", id: bound }] : [])] };
    else if (route === "d1/database") result = options.method === "GET" ? inventory : { uuid: created, name: "synthetic-web-recovery" };
    else if (route.endsWith("/query")) {
      if (failQuery) throw Error("secret provider details");
      assert.ok(!route.includes(primary));
      result = [{ success: true, results: JSON.parse(options.body).sql.startsWith("SELECT name") ? tables : [{ used_target: used ? 1 : 0 }] }];
    } else throw Error("unexpected route");
    return Response.json({ success: true, result });
  };
  const run = input => provisionBackupRecovery({ env: { ...env, ...input }, fetchImpl,
    migrate: async target => { migrations.push(target); }, mask: value => masks.push(value) });
  return { run, calls, migrations, masks };
}
test("disabled backups do not call any provider; fresh isolated target is migrated and masked", async () => {
  const f = fixture(); assert.equal(await f.run({ CF_BACKUP_ENABLED: "false" }), null); assert.equal(f.calls.length, 0);
  const result = await f.run();
  assert.equal(result.CF_RECOVERY_D1_DATABASE_ID, isolated); assert.equal(result.used, false);
  assert.equal(f.calls.filter(c => c.route === "d1/database" && c.method === "POST").length, 1);
  assert.equal(f.migrations.length, 1); assert.equal(f.migrations[0].id, isolated);
  assert.deepEqual(f.masks, [isolated, "synthetic-web-recovery"]);
});
test("existing exact Worker binding proves ownership; used target is preserved without migrations", async () => {
  for (const used of [false, true]) {
    const f = fixture({ bound: isolated, inventory: [{ uuid: isolated, name: "synthetic-web-recovery" }], used });
    assert.equal((await f.run()).used, used); assert.equal(f.migrations.length, used ? 0 : 1);
    assert.equal(f.calls.some(c => c.route === "d1/database" && c.method === "POST"), false);
  }
});
test("name alone, missing bound inventory, and primary-as-target never authorize ownership or writes", async () => {
  for (const options of [
    { inventory: [{ uuid: isolated, name: "synthetic-web-recovery" }] }, { bound: isolated },
    { bound: primary, inventory: [{ uuid: primary, name: "synthetic-web-recovery" }] }, { created: primary },
  ]) {
    const f = fixture(options); await assert.rejects(f.run(), /^Error: RECOVERY_(OWNER_CONFIRMATION_REQUIRED|TARGET_NOT_ISOLATED)$/);
    assert.equal(f.migrations.length, 0); assert.equal(f.calls.some(c => c.route.endsWith("/query")), false);
  }
});
test("query failure and unsafe schema names cannot cause migration or leak provider detail", async () => {
  for (const options of [{ failQuery: true }, { tables: [{ name: 'invalid";DELETE' }] }]) {
    const f = fixture(options); await assert.rejects(f.run(), /^Error: RECOVERY_(PROVIDER_UNAVAILABLE|SCHEMA_INVALID)$/);
    assert.equal(f.migrations.length, 0);
  }
});
