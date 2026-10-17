import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL, fileURLToPath } from "node:url";
import { build } from "esbuild";
import { renderBackupSecrets } from "./render-backup-secrets.mjs";

export async function auditBackupConfiguration({ env, providerFactory }) {
  const fields = Object.fromEntries(["GCS_SERVICE_ACCOUNT_JSON", "GCS_BUCKET", "CF_BACKUP_R2_BUCKET",
    "CF_BACKUP_ENABLED", "CF_BACKUP_SCHEDULE_ENABLED"].map(name => [name, !!env[name]]));
  const result = { fields, gcsAccessVerified: false, manualConfigurationReady: false,
    backupEnabled: env.CF_BACKUP_ENABLED === "true", scheduleEnabled: env.CF_BACKUP_SCHEDULE_ENABLED === "true", code: "" };
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cyweb-backup-audit-"));
  try {
    if (!fields.GCS_SERVICE_ACCOUNT_JSON || !fields.GCS_BUCKET) throw Error("BACKUP_GCS_INPUTS_MISSING");
    renderBackupSecrets({ env: { ...env, CF_BACKUP_ENABLED: "true" }, outputPath: path.join(directory, "credential.json") });
    const provider = await providerFactory(env.GCS_BUCKET, env.GCS_SERVICE_ACCOUNT_JSON);
    await provider.verifyAccess();
    result.gcsAccessVerified = true;
    result.manualConfigurationReady = fields.CF_BACKUP_R2_BUCKET && result.backupEnabled;
    result.code = "BACKUP_GCS_ACCESS_VERIFIED";
  } catch (error) {
    const codes = new Set(["BACKUP_GCS_INPUTS_MISSING", "BACKUP_GCS_CONFIG_INVALID", "BACKUP_GCS_AUTH_FAILED",
      "BACKUP_GCS_REQUEST_FAILED", "BACKUP_GCS_PERMISSION_CHECK_FAILED", "BACKUP_GCS_PERMISSIONS_MISSING"]);
    result.code = error.message === "Missing or invalid GCS_SERVICE_ACCOUNT_JSON" ? "BACKUP_GCS_CREDENTIAL_INVALID"
      : codes.has(error.message) ? error.message : "BACKUP_GCS_AUDIT_FAILED";
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "cyweb-backup-provider-"));
  try {
    const output = path.join(directory, "provider.mjs");
    await build({ entryPoints: [fileURLToPath(new URL("../worker/backup/gcs-provider.ts", import.meta.url))],
      outfile: output, bundle: true, platform: "node", format: "esm", logLevel: "silent" });
    const { GCSBackupProvider } = await import(pathToFileURL(output));
    const result = await auditBackupConfiguration({ env: process.env,
      providerFactory: (bucket, credential) => new GCSBackupProvider(bucket, credential) });
    console.log(JSON.stringify(result));
    if (!result.gcsAccessVerified) process.exitCode = 1;
  } catch {
    console.error("BACKUP_GCS_AUDIT_FAILED"); process.exitCode = 1;
  } finally { fs.rmSync(directory, { recursive: true, force: true }); }
}
