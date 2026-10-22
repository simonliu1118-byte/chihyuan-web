import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { auditBackupConfiguration } from "./audit-backup-configuration.mjs";

const { privateKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
const credential = JSON.stringify({ type: "service_account", client_email: "synthetic@test.iam.gserviceaccount.com",
  private_key: privateKey.export({ type: "pkcs8", format: "pem" }) });
const env = { GCS_BUCKET: "synthetic-web-bucket", GCS_SERVICE_ACCOUNT_JSON: credential };
const providerFactory = () => ({ async verifyAccess() {} });

test("GCS audit distinguishes working credentials from enabled backup configuration", async () => {
  const result = await auditBackupConfiguration({ env, providerFactory });
  assert.equal(result.gcsAccessVerified, true);
  assert.equal(result.backupEnabled, false);
  assert.equal(result.manualConfigurationReady, false);
  assert.equal(result.scheduleEnabled, false);
  const ready = await auditBackupConfiguration({ env: { ...env, CF_BACKUP_R2_BUCKET: "synthetic-r2", CF_BACKUP_ENABLED: "true" }, providerFactory });
  assert.equal(ready.manualConfigurationReady, true);
  assert.equal(ready.scheduleEnabled, false);
  for (const value of [env.GCS_BUCKET, credential, "private_key", "client_email"]) assert.ok(!JSON.stringify(result).includes(value));
});

test("missing or malformed credentials never reach a provider", async () => {
  let calls = 0;
  for (const input of [{}, { ...env, GCS_SERVICE_ACCOUNT_JSON: "PRIVATE-INVALID-CREDENTIAL" }]) {
    const result = await auditBackupConfiguration({ env: input, providerFactory: () => { calls++; } });
    assert.equal(result.gcsAccessVerified, false);
    assert.match(result.code, /^BACKUP_GCS_(INPUTS_MISSING|CREDENTIAL_INVALID)$/);
    assert.ok(!JSON.stringify(result).includes("PRIVATE-INVALID-CREDENTIAL"));
  }
  assert.equal(calls, 0);
});

test("permission and network failures expose stable codes without provider details", async () => {
  for (const message of ["BACKUP_GCS_PERMISSIONS_MISSING", "sensitive provider response"]) {
    const result = await auditBackupConfiguration({ env, providerFactory: () => ({ async verifyAccess() { throw Error(message); } }) });
    assert.equal(result.gcsAccessVerified, false);
    assert.equal(result.code, message.startsWith("BACKUP_GCS_") ? message : "BACKUP_GCS_AUDIT_FAILED");
    assert.ok(!JSON.stringify(result).includes("sensitive provider response"));
  }
});
