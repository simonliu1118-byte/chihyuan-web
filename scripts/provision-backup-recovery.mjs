import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAME = /^[a-z0-9][a-z0-9_-]{1,62}$/i;
function check(ok, code) { if (!ok) throw Error(code); }

/** Protected deployment only. A name collision is never proof of ownership.
 * Existing targets must already be bound to this exact Worker. Never reset data. */
export async function provisionBackupRecovery({ env, fetchImpl = fetch, migrate = migrateTarget, mask = () => {} }) {
  if (env.CF_BACKUP_ENABLED !== "true") return null;
  check(NAME.test(env.CF_WORKER_NAME ?? "") && UUID.test(env.CF_D1_DATABASE_ID ?? "")
    && /^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID ?? "") && !!env.CLOUDFLARE_API_TOKEN, "RECOVERY_INPUT_INVALID");
  const name = `${env.CF_WORKER_NAME}-recovery`;
  check(NAME.test(name), "RECOVERY_INPUT_INVALID");
  async function api(route, body) {
    let response, payload;
    try {
      response = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/${route}`, {
        method: body ? "POST" : "GET", headers: { Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`, "Content-Type": "application/json" },
        ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(30000),
      });
      payload = await response.json();
    } catch { throw Error("RECOVERY_PROVIDER_UNAVAILABLE"); }
    check(response.ok && payload.success === true, "RECOVERY_PROVIDER_UNAVAILABLE");
    return payload;
  }
  const settings = (await api(`workers/scripts/${encodeURIComponent(env.CF_WORKER_NAME)}/settings`)).result;
  check(Array.isArray(settings?.bindings), "RECOVERY_BINDINGS_INVALID");
  const primary = settings.bindings.filter(b => b.name === "DB");
  check(primary.length === 1 && primary[0].type === "d1" && primary[0].id === env.CF_D1_DATABASE_ID, "RECOVERY_PRIMARY_MISMATCH");
  const bound = settings.bindings.filter(b => b.name === "RECOVERY_DB");
  check(bound.length <= 1 && (!bound.length || (bound[0].type === "d1" && UUID.test(bound[0].id)
    && bound[0].id !== env.CF_D1_DATABASE_ID)), "RECOVERY_TARGET_NOT_ISOLATED");
  const databases = [];
  for (let page = 1; ; page++) {
    const inventory = await api(`d1/database?per_page=100&page=${page}`);
    check(Array.isArray(inventory.result) && page <= 100, "RECOVERY_INVENTORY_INVALID");
    databases.push(...inventory.result);
    if (inventory.result.length < 100) break;
  }
  const matching = databases.filter(db => db.name === name);
  check(matching.length <= 1, "RECOVERY_OWNER_CONFIRMATION_REQUIRED");
  let target;
  if (bound.length) {
    check(matching.length === 1 && matching[0].uuid === bound[0].id, "RECOVERY_OWNER_CONFIRMATION_REQUIRED");
    target = matching[0];
  } else {
    check(matching.length === 0, "RECOVERY_OWNER_CONFIRMATION_REQUIRED");
    target = (await api("d1/database", { name })).result;
  }
  check(target?.name === name && UUID.test(target?.uuid ?? "") && target.uuid !== env.CF_D1_DATABASE_ID, "RECOVERY_TARGET_NOT_ISOLATED");
  mask(target.uuid); mask(name);
  async function query(sql) {
    const result = (await api(`d1/database/${target.uuid}/query`, { sql })).result;
    check(Array.isArray(result) && result.length === 1 && result[0].success === true && Array.isArray(result[0].results), "RECOVERY_QUERY_FAILED");
    return result[0].results;
  }
  const tables = await query("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' AND name NOT IN ('d1_migrations','program_catalog_state') ORDER BY name");
  check(tables.length <= 128 && tables.every(t => /^[a-z][a-z0-9_]*$/.test(t.name)), "RECOVERY_SCHEMA_INVALID");
  let used = false;
  if (tables.length) {
    const results = await query(`SELECT CASE WHEN ${tables.map(t => `EXISTS(SELECT 1 FROM "${t.name}")`).join(" OR ")} THEN 1 ELSE 0 END AS used_target`);
    check(results.length === 1 && [0, 1].includes(results[0].used_target), "RECOVERY_QUERY_FAILED");
    used = results[0].used_target === 1;
  }
  // Retain a successful rehearsal byte-for-byte across subsequent releases.
  if (!used) await migrate({ id: target.uuid, name, env });
  return { CF_RECOVERY_D1_DATABASE_ID: target.uuid, CF_RECOVERY_D1_DATABASE_NAME: name, used };
}

function migrateTarget({ id, name, env }) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cyweb-recovery-"));
  try {
    const config = path.join(directory, "wrangler.json");
    fs.writeFileSync(config, JSON.stringify({ name: "cyweb-recovery-migration", compatibility_date: "2026-09-26",
      d1_databases: [{ binding: "RECOVERY_DB", database_id: id, database_name: name,
        migrations_dir: fileURLToPath(new URL("../migrations", import.meta.url)) }] }), { mode: 0o600 });
    execFileSync("npx", ["--no-install", "wrangler", "d1", "migrations", "apply", "RECOVERY_DB", "--remote", "--config", config],
      { env: { ...env, CI: "true" }, stdio: "pipe", timeout: 180000 });
  } catch { throw Error("RECOVERY_MIGRATION_FAILED"); }
  finally { fs.rmSync(directory, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    check(!!process.env.GITHUB_ENV, "RECOVERY_PROTECTED_RUNNER_REQUIRED");
    const result = await provisionBackupRecovery({ env: process.env, mask: value => console.log(`::add-mask::${value}`) });
    if (result) {
      const { used, ...values } = result;
      fs.appendFileSync(process.env.GITHUB_ENV, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(""));
      console.log(used ? "RECOVERY_USED_TARGET_PRESERVED" : "RECOVERY_EMPTY_TARGET_PREPARED");
    }
  } catch (error) {
    console.error(/^RECOVERY_[A-Z_]+$/.test(error?.message ?? "") ? error.message : "RECOVERY_SETUP_FAILED"); process.exitCode = 1;
  }
}
