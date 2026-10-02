import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { generateKeyPairSync } from "node:crypto";
import { renderBackupSecrets } from "./render-backup-secrets.mjs";
import { renderDeployConfig } from "./render-deploy-config.mjs";

const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "cyweb-deploy-config-"));
const output = path.join(temporary, "wrangler.generated.jsonc");

const env = {
  CF_SOURCE_COMMIT: "a".repeat(40),
  CF_WORKER_NAME: "cyweb-ci",
  CF_PUBLIC_HOSTNAME: "admin.chihyuancm.com",
  CF_D1_DATABASE_NAME: "cyweb-ci-db",
  CF_D1_DATABASE_ID: "11111111-1111-4111-8111-111111111111",
  CF_IDENTITY_SERVICE: "cycloud-identity-ci-placeholder",
  CF_IDENTITY_APPLICATION_ID: "CYWEB",
  CF_IDENTITY_WORKSPACE_ID: "ws_11111111-1111-4111-8111-111111111111",
};

try {
  renderDeployConfig({ env, outputPath: output });
  const raw = fs.readFileSync(output, "utf8");
  const config = JSON.parse(raw);

  if (config.vars.SOURCE_COMMIT !== env.CF_SOURCE_COMMIT) throw new Error("source commit mismatch");
  for (const sourceCommit of [undefined, "invalid", "https://sensitive.invalid/token"]) {
    let rejected = false;
    try { renderDeployConfig({ env: { ...env, CF_SOURCE_COMMIT: sourceCommit }, outputPath: output }); }
    catch (error) { rejected = error.message === "Invalid or missing CF_SOURCE_COMMIT"; }
    if (!rejected) throw new Error("invalid source provenance accepted");
  }
  if (config.name !== env.CF_WORKER_NAME) throw new Error("worker name mismatch");
  if (config.workers_dev !== true) throw new Error("workers.dev fallback must remain enabled");
  if (config.routes?.length !== 1) throw new Error("canonical Custom Domain route missing");
  if (config.routes[0]?.pattern !== env.CF_PUBLIC_HOSTNAME) throw new Error("public hostname mismatch");
  if (config.routes[0]?.custom_domain !== true) throw new Error("public hostname must be a Custom Domain");
  if (config.d1_databases?.[0]?.binding !== "DB") throw new Error("DB binding missing");
  if (config.d1_databases?.[0]?.database_id !== env.CF_D1_DATABASE_ID) {
    throw new Error("D1 database id mismatch");
  }
  if (config.services?.[0]?.binding !== "IDENTITY") throw new Error("IDENTITY binding missing");
  if (config.services?.[0]?.service !== env.CF_IDENTITY_SERVICE) {
    throw new Error("IDENTITY service mismatch");
  }
  if (config.vars?.IDENTITY_APPLICATION_ID !== env.CF_IDENTITY_APPLICATION_ID) {
    throw new Error("Identity application mismatch");
  }
  if (config.vars?.IDENTITY_WORKSPACE_ID !== env.CF_IDENTITY_WORKSPACE_ID) {
    throw new Error("Identity Workspace mismatch");
  }
  if (config.vars?.SOURCE_VERSION !== fs.readFileSync(new URL("../VERSION", import.meta.url), "utf8").trim()) throw new Error("deployed source marker mismatch");
  if (config.vars?.IDENTITY_CONSUMER_VERSION !== fs.readFileSync(new URL("../CYID_CONSUMER_VERSION", import.meta.url), "utf8").trim()) throw new Error("consumer declaration missing from deployed health marker");
  if (/__CF_[A-Z0-9_]+__/.test(raw)) throw new Error("unresolved placeholder remains");
  if (config.triggers?.crons?.length !== 0 || config.r2_buckets || config.vars.BACKUP_ENABLED) throw new Error("backup activated without opt-in");
  renderDeployConfig({ env: { ...env, CF_BACKUP_ENABLED: "true", CF_BACKUP_R2_BUCKET: "cyweb-ci-backup", GCS_BUCKET: "cyweb-ci-gcs" }, outputPath: output });
  const enabled = JSON.parse(fs.readFileSync(output, "utf8"));
  if (enabled.r2_buckets?.[0]?.binding !== "BACKUP_R2" || enabled.vars.BACKUP_ENABLED !== "true"
    || enabled.vars.GCS_BUCKET !== "cyweb-ci-gcs" || enabled.vars.BACKUP_SCHEDULE_ENABLED !== "false"
    || enabled.triggers?.crons?.length !== 0) throw new Error("backup opt-in contract mismatch");
  let backupRejected = false;
  try { renderDeployConfig({ env: { ...env, CF_BACKUP_ENABLED: "true" }, outputPath: output }); } catch { backupRejected = true; }
  if (!backupRejected) throw new Error("backup enabled without bucket");

  const manualEnv = { ...env, CF_BACKUP_ENABLED: "true", CF_BACKUP_R2_BUCKET: "cyweb-ci-backup", GCS_BUCKET: "cyweb-ci-gcs" };
  renderDeployConfig({ env: { ...manualEnv, CF_BACKUP_SCHEDULE_ENABLED: "true" }, outputPath: output });
  const scheduled = JSON.parse(fs.readFileSync(output, "utf8"));
  if (scheduled.vars.BACKUP_SCHEDULE_ENABLED !== "true" || scheduled.triggers.crons.join() !== "30 19 * * *") throw new Error("schedule opt-in mismatch");
  for (const invalid of [
    { ...env, CF_BACKUP_SCHEDULE_ENABLED: "true" },
    { ...manualEnv, CF_BACKUP_SCHEDULE_ENABLED: "yes" },
    { ...manualEnv, GCS_BUCKET: "" },
    { ...manualEnv, GCS_BUCKET: "https://invalid" },
  ]) {
    let rejected = false;
    try { renderDeployConfig({ env: invalid, outputPath: output }); } catch { rejected = true; }
    if (!rejected) throw new Error("invalid backup activation accepted");
  }
  const secretOutput = path.join(temporary, "secrets.json");
  if (renderBackupSecrets({ env, outputPath: secretOutput }) || fs.existsSync(secretOutput)) throw new Error("secret created while backup disabled");
  for (const credential of [undefined, "sensitive-invalid-value", JSON.stringify({ type: "service_account", private_key: "sensitive-invalid-key" })]) {
    let rejected = false;
    try { renderBackupSecrets({ env: { ...manualEnv, GCS_SERVICE_ACCOUNT_JSON: credential }, outputPath: secretOutput }); }
    catch (error) {
      rejected = true;
      if (error.message !== "Missing or invalid GCS_SERVICE_ACCOUNT_JSON") throw new Error("credential detail leaked");
    }
    if (!rejected || fs.existsSync(secretOutput)) throw new Error("invalid secret accepted");
  }
  const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  const account = { type: "service_account", client_email: "ci@placeholder.iam.gserviceaccount.com",
    private_key: privateKey.export({ type: "pkcs8", format: "pem" }), ignored: "omit" };
  renderBackupSecrets({ env: { ...manualEnv, GCS_SERVICE_ACCOUNT_JSON: JSON.stringify(account) }, outputPath: secretOutput });
  if ((fs.statSync(secretOutput).mode & 0o777) !== 0o600) throw new Error("unsafe secret file permission");
  const stored = JSON.parse(JSON.parse(fs.readFileSync(secretOutput, "utf8")).GCS_SERVICE_ACCOUNT_JSON);
  if (stored.private_key !== account.private_key || stored.client_email !== account.client_email || stored.ignored) throw new Error("secret projection mismatch");
  if (fs.readFileSync(output, "utf8").includes("PRIVATE KEY")) throw new Error("secret included in deployment config");

  let missingRejected = false;
  try {
    renderDeployConfig({ env: { ...env, CF_PUBLIC_HOSTNAME: "" }, outputPath: output });
  } catch {
    missingRejected = true;
  }
  if (!missingRejected) throw new Error("missing deployment variable was not rejected");

  let invalidRejected = false;
  try {
    renderDeployConfig({ env: { ...env, CF_PUBLIC_HOSTNAME: "https://admin.chihyuancm.com" }, outputPath: output });
  } catch {
    invalidRejected = true;
  }
  if (!invalidRejected) throw new Error("hostname with URL scheme was not rejected");

  console.log("PASS Cloudflare deployment config render contract");
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
