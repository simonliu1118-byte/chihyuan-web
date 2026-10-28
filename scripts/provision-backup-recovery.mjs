import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { nonSeedRowCondition } from "../shared/backup-migration-seeds.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const NAME = /^[a-z0-9][a-z0-9_-]{1,62}$/i;
export const RECOVERY_ROTATION_CONFIRMATION = "ROTATE_ISOLATED_RECOVERY_TARGET";
const SCHEMA_SQL = "SELECT type, name, tbl_name, sql FROM sqlite_master WHERE tbl_name != 'd1_migrations' AND tbl_name != 'program_catalog_state' AND tbl_name NOT GLOB 'sqlite_*' AND tbl_name NOT GLOB '_cf_*' ORDER BY type, name";
function balancedOr(items) {
  if (items.length === 0) return "0=1";
  if (items.length === 1) return items[0];
  const mid = Math.floor(items.length / 2);
  return "(" + balancedOr(items.slice(0, mid)) + " OR " + balancedOr(items.slice(mid)) + ")";
}
function rotationGeneration(env) {
  const gen = String(env.CF_RECOVERY_ROTATION_GENERATION ?? "").trim();
  const confirmation = String(env.CF_RECOVERY_ROTATION_CONFIRMATION ?? "");
  if (!gen && !confirmation) return null;
  check(/^[0-9]{8}[a-z0-9]{1,6}$/.test(gen)
    && confirmation === RECOVERY_ROTATION_CONFIRMATION
    && env.CF_RECOVERY_ROTATION_OPERATION === "rotate-recovery"
    && env.GITHUB_EVENT_NAME === "workflow_dispatch"
    && env.GITHUB_REF === "refs/heads/main"
    && !!env.GITHUB_ENV, "RECOVERY_ROTATION_NOT_APPROVED");
  return gen;
}
function check(ok, code) { if (!ok) throw Error(code); }

/** Protected deployment only. A name collision is never proof of ownership.
 * Existing targets must already be bound to this exact Worker. Never reset data. */
export async function provisionBackupRecovery({ env, fetchImpl = fetch, migrate = migrateTarget, mask = () => {} }) {
  if (env.CF_BACKUP_ENABLED !== "true") {
    check(!env.CF_RECOVERY_ROTATION_GENERATION && !env.CF_RECOVERY_ROTATION_CONFIRMATION, "RECOVERY_ROTATION_NOT_APPROVED");
    return null;
  }
  check(NAME.test(env.CF_WORKER_NAME ?? "") && UUID.test(env.CF_D1_DATABASE_ID ?? "")
    && /^[0-9a-f]{32}$/i.test(env.CLOUDFLARE_ACCOUNT_ID ?? "") && !!env.CLOUDFLARE_API_TOKEN, "RECOVERY_INPUT_INVALID");
  const generation = rotationGeneration(env);
  const standardName = `${env.CF_WORKER_NAME}-recovery`;
  const name = generation ? `${standardName}-v${generation}` : standardName;
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
  const owned = db => NAME.test(db.name ?? "") && (
    db.name === standardName || (db.name.startsWith(standardName + "-v")
      && /^[0-9]{8}[a-z0-9]{1,6}$/.test(db.name.slice((standardName + "-v").length))));
  const masked = new Set();
  const maskOnce = value => { if (!masked.has(value)) { mask(value); masked.add(value); } };
  const boundTarget = bound.length ? databases.find(db => db.uuid === bound[0].id) : null;
  // A binding whose D1 no longer exists (deleted in Cloudflare) is simply dropped below;
  // an existing D1 must carry this Worker's recovery name.
  if (boundTarget) check(owned(boundTarget), "RECOVERY_OWNER_CONFIRMATION_REQUIRED");
  const matching = databases.filter(db => db.name === name);
  check(matching.length <= 1, "RECOVERY_OWNER_CONFIRMATION_REQUIRED");
  async function query(id, sql) {
    const result = (await api(`d1/database/${id}/query`, { sql })).result;
    check(Array.isArray(result) && result.length === 1 && result[0].success === true && Array.isArray(result[0].results),
      "RECOVERY_QUERY_FAILED");
    return result[0].results;
  }
  async function tablesFor(id) {
    const tables = await query(id, "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' AND name NOT IN ('d1_migrations','program_catalog_state') ORDER BY name");
    check(tables.length <= 128 && tables.every(t => /^[a-z][a-z0-9_]*$/.test(t.name)), "RECOVERY_SCHEMA_INVALID");
    return tables;
  }
  async function alreadyUsed(id) {
    const tables = await tablesFor(id);
    if (!tables.length) return false;
    const checkSql = balancedOr(tables.map(t => nonSeedRowCondition(t.name)));
    const result = await query(id, `SELECT CASE WHEN ${checkSql} THEN 1 ELSE 0 END AS used_target`);
    check(result.length === 1 && [0, 1].includes(result[0].used_target), "RECOVERY_QUERY_FAILED");
    return result[0].used_target === 1;
  }
  let target, used = false;
  if (generation) {
    // Protected manual rotation only. Do not reuse even an empty name collision:
    // it could be an orphan from a prior interrupted run.
    // A detached Worker (the previous target was used and unbound) may rotate;
    // a still-bound unused target must be rehearsed first, not replaced.
    check(matching.length === 0, "RECOVERY_ROTATION_NAME_ALREADY_EXISTS");
    if (boundTarget) check(await alreadyUsed(boundTarget.uuid), "RECOVERY_ROTATION_PREVIOUS_TARGET_UNUSED");
    // PRE-CREATE fail-closed gate: remote primary must already be fully migrated
    // to the exact reviewed main source; do not leave an orphan candidate when
    // the deployment has not yet applied new migrations to the primary DB.
    const repoMigrations = fs.readdirSync(new URL("../migrations/", import.meta.url))
      .filter(filename => filename.endsWith(".sql")).sort();
    check(repoMigrations.length > 0 && repoMigrations.length <= 128
      && repoMigrations.every(filename => /^[0-9]{4}_[a-z0-9_]+\.sql$/.test(filename)),
      "RECOVERY_ROTATION_MIGRATIONS_INVALID");
    const applied = await query(env.CF_D1_DATABASE_ID, "SELECT name FROM d1_migrations ORDER BY name");
    check(applied.length === repoMigrations.length
      && applied.every((row, index) => row.name === repoMigrations[index]),
      "RECOVERY_ROTATION_PRIMARY_MIGRATIONS_OUTDATED");
    target = (await api("d1/database", { name })).result;
    check(target?.name === name && UUID.test(target?.uuid ?? "") && target.uuid !== env.CF_D1_DATABASE_ID
      && target.uuid !== boundTarget?.uuid && !databases.some(db => db.uuid === target.uuid),
      "RECOVERY_TARGET_NOT_ISOLATED");
    maskOnce(target.uuid); maskOnce(target.name);
    // A fresh D1 must contain no application tables *before* canonical forward
    // migrations. Never migrate a previously observed/nonempty candidate.
    check((await tablesFor(target.uuid)).length === 0, "RECOVERY_ROTATION_TARGET_NOT_NEW");
    await migrate({ id: target.uuid, name, env });
    // Fail closed before switching bindings if source migrations are not an
    // exact DDL match to the authoritative business DB.
    const [sourceSchema, targetSchema] = await Promise.all([
      query(env.CF_D1_DATABASE_ID, SCHEMA_SQL), query(target.uuid, SCHEMA_SQL),
    ]);
    check(sourceSchema.length > 0 && sourceSchema.length <= 512 && targetSchema.length <= 512
      && JSON.stringify(sourceSchema) === JSON.stringify(targetSchema), "RECOVERY_ROTATION_SCHEMA_MISMATCH");
    // Use the same exact canonical row predicates as the Worker restore guard.
    // Mere HR migration fixtures do not mark a fresh target as used.
    check(!await alreadyUsed(target.uuid), "RECOVERY_ROTATION_TARGET_NOT_EMPTY");
    // The old D1 has not been mutated or deleted. Only a subsequent
    // reviewed Worker deploy may bind the new ID.
  } else if (boundTarget) {
    target = boundTarget;
    used = await alreadyUsed(target.uuid);
    // A used target can never be rehearsed again, so stop binding it: the D1
    // keeps its data untouched and the user may delete it. The next rehearsal
    // needs an approved rotation. A fresh, un-used target receives forward migrations.
    if (used) return { detached: true, used: true, rotated: false };
    await migrate({ id: target.uuid, name: target.name, env });
  } else {
    // Normal deployments never create a D1; only the approved rotation does.
    return { detached: true, used: false, rotated: false };
  }
  check(target?.name && owned(target) && UUID.test(target.uuid) && target.uuid !== env.CF_D1_DATABASE_ID,
    "RECOVERY_TARGET_NOT_ISOLATED");
  maskOnce(target.uuid); maskOnce(target.name);

  return { CF_RECOVERY_D1_DATABASE_ID: target.uuid, CF_RECOVERY_D1_DATABASE_NAME: target.name, used, rotated: !!generation };
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
      const { used, rotated, detached, ...values } = result;
      if (detached) values.CF_RECOVERY_DETACHED = "true";
      fs.appendFileSync(process.env.GITHUB_ENV, Object.entries(values).map(([key, value]) => `${key}=${value}\n`).join(""));
      console.log(rotated ? "RECOVERY_NEW_TARGET_PREPARED_OLD_PRESERVED"
        : detached ? (used ? "RECOVERY_USED_TARGET_DETACHED" : "RECOVERY_TARGET_NOT_BOUND") : "RECOVERY_EMPTY_TARGET_PREPARED");
    }
  } catch (error) {
    console.error(/^RECOVERY_[A-Z_]+$/.test(error?.message ?? "") ? error.message : "RECOVERY_SETUP_FAILED"); process.exitCode = 1;
  }
}
