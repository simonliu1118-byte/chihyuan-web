import fs from "node:fs";
import path from "node:path";
import { createPrivateKey } from "node:crypto";
import { fileURLToPath } from "node:url";

// This file belongs only in the protected runner's temporary directory.
export function renderBackupSecrets({ env = process.env, outputPath }) {
  if (!outputPath) throw new Error("Backup secret output path required");
  if (![undefined, "", "false", "true"].includes(env.CF_BACKUP_ENABLED)) throw new Error("Invalid CF_BACKUP_ENABLED");
  if (env.CF_BACKUP_ENABLED !== "true") return false;
  let account;
  try {
    account = JSON.parse(env.GCS_SERVICE_ACCOUNT_JSON ?? "");
    if (account.type !== "service_account" || typeof account.client_email !== "string"
      || !/^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/.test(account.client_email)
      || typeof account.private_key !== "string"
      || !account.private_key.includes("-----BEGIN PRIVATE KEY-----")
      || createPrivateKey(account.private_key).asymmetricKeyType !== "rsa") throw new Error();
  } catch {
    // Never include parser, crypto or credential content in a public CI error.
    throw new Error("Missing or invalid GCS_SERVICE_ACCOUNT_JSON");
  }
  const fd = fs.openSync(outputPath, "wx", 0o600);
  try {
    fs.writeFileSync(fd, JSON.stringify({ GCS_SERVICE_ACCOUNT_JSON: JSON.stringify({
      type: "service_account", client_email: account.client_email, private_key: account.private_key,
    }) }));
  } finally { fs.closeSync(fd); }
  return true;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const outputPath = process.argv[process.argv.indexOf("--output") + 1];
    if (!process.argv.includes("--output")) throw new Error("Backup secret output path required");
    const enabled = renderBackupSecrets({ outputPath });
    console.log(enabled ? "Backup credential validation passed; protected file prepared" : "Backup disabled; no credential uploaded");
  } catch (error) {
    console.error(error instanceof Error ? error.message : "Backup secret validation failed");
    process.exitCode = 1;
  }
}
