import { BackupService } from "../backup/backup-service";
import { R2BackupProvider } from "../backup/r2-provider";
import { exportPortableBackup, type BackupStorageProvider } from "../backup/portable-backup";
function assert(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
async function rejects(action: () => Promise<unknown>, code: string) { let failed = false; try { await action(); } catch { failed = true; } assert(failed, code); }
export async function acceptIsolatedRecovery(db: D1Database, target: D1Database, bucket: R2Bucket): Promise<void> {
  const stored = new Map<string, Uint8Array>(), binding = new R2BackupProvider(bucket);
  let unavailablePrefix = "", failGcs = false;
  const r2: BackupStorageProvider = {
    putObject: (key, bytes) => binding.putObject(key, bytes),
    getObject: key => { if (key.startsWith(unavailablePrefix) && unavailablePrefix) throw new Error("Synthetic R2 outage"); return binding.getObject(key); },
    listObjects: prefix => binding.listObjects(prefix), deleteObject: (key, version) => binding.deleteObject(key, version),
  };
  const gcs: BackupStorageProvider = {
    async putObject(key, bytes) { if (failGcs) throw new Error("Synthetic GCS outage"); stored.set(key, bytes.slice()); },
    async getObject(key) { return stored.get(key)?.slice() ?? null; },
    async listObjects(prefix) { return [...stored].filter(([key]) => key.startsWith(prefix)).map(([key, value]) => ({ key, byteSize: value.length, versionToken: "synthetic" })); },
    async deleteObject(key) { stored.delete(key); },
  };
  const workspaceScope = "acceptance-workspace", service = new BackupService(db, workspaceScope, "0.7.3", { r2, gcs });
  const context = { now: "2026-10-01T11:00:00.000Z", actorMemberId: 1, requestId: "synthetic-rehearsal-select" };
  const id = await service.create("manual", context);
  const input = { backupId: id, selectionConfirmation: id, targetConfirmation: "isolated_empty_database" as const, role: "SUPER_ADMIN", isActive: true };
  const before = await db.prepare("SELECT COUNT(*) AS n FROM backup_sets").first<{ n: number }>();
  await rejects(() => service.isolatedRecovery(target, { ...input, role: "ADMIN" }, context), "ACCEPT_RECOVERY_ADMIN_ACCESS");
  await rejects(() => service.isolatedRecovery(target, { ...input, isActive: false }, context), "ACCEPT_RECOVERY_INACTIVE_ACCESS");
  await rejects(() => service.isolatedRecovery(target, { ...input, selectionConfirmation: "other" }, context), "ACCEPT_RECOVERY_SELECTION_CONFIRMATION");
  await rejects(() => service.isolatedRecovery(target, input, { ...context, actorMemberId: null }), "ACCEPT_RECOVERY_MISSING_ACTOR");
  await rejects(() => service.isolatedRecovery(db, input, context), "ACCEPT_RECOVERY_SOURCE_AS_TARGET");
  const after = await db.prepare("SELECT COUNT(*) AS n FROM backup_sets").first<{ n: number }>();
  assert(before?.n === after?.n, "ACCEPT_RECOVERY_DENIAL_STARTED_BACKUP");
  const preferred = await service.loadVerified(id);
  assert(preferred.provider === "r2", "ACCEPT_RECOVERY_R2_PREFERENCE");
  unavailablePrefix = `cyweb/${id}/`;
  assert((await service.loadVerified(id)).provider === "gcs", "ACCEPT_RECOVERY_GCS_FALLBACK");
  // Digest-valid portable bytes still need catalog agreement.
  const original = stored.get(unavailablePrefix + "manifest.json")!;
  const changed = JSON.parse(new TextDecoder().decode(original)); changed.createdAtUtc = "2026-09-01T00:00:00.000Z";
  stored.set(unavailablePrefix + "manifest.json", new TextEncoder().encode(JSON.stringify(changed)));
  await rejects(() => service.loadVerified(id), "ACCEPT_RECOVERY_CATALOG_MISMATCH");
  stored.set(unavailablePrefix + "manifest.json", original);
  failGcs = true;
  await rejects(() => service.isolatedRecovery(target, input, { ...context, requestId: "synthetic-rehearsal-safety-failed" }), "ACCEPT_RECOVERY_UNVERIFIED_SAFETY_COPY");
  assert(JSON.parse(new TextDecoder().decode((await exportPortableBackup(target, { workspaceScope, appVersion: "0.7.3" })).manifestBytes)).totalRecordCount === 0,
    "ACCEPT_RECOVERY_TARGET_CHANGED_BEFORE_SAFETY");
  failGcs = false;
  const liveCustomers = await db.prepare("SELECT * FROM customers ORDER BY id").all();
  const result = await service.isolatedRecovery(target, input, { ...context, requestId: "synthetic-rehearsal-success" });
  assert(result.provider === "gcs" && result.safetyBackupId !== id, "ACCEPT_RECOVERY_SOURCE_OR_SAFETY_ID");
  const recovered = await exportPortableBackup(target, { workspaceScope, appVersion: "0.7.3" });
  assert(recovered.dataBytes.length === preferred.bundle.dataBytes.length && recovered.dataBytes.every((v, i) => v === preferred.bundle.dataBytes[i]), "ACCEPT_RECOVERY_DATA_RECONCILIATION");
  assert(JSON.stringify((await db.prepare("SELECT * FROM customers ORDER BY id").all()).results) === JSON.stringify(liveCustomers.results), "ACCEPT_RECOVERY_LIVE_CUSTOMERS_CHANGED");
  const audit = await db.prepare("SELECT action,actor_employee_id,metadata_json FROM audit_events WHERE request_id=? AND action LIKE 'backup.rehearsal.%' ORDER BY id")
    .bind("synthetic-rehearsal-success").all<{ action: string; actor_employee_id: number; metadata_json: string }>();
  assert(audit.results.length === 2 && audit.results.every(row => row.actor_employee_id === 1 && JSON.parse(row.metadata_json).safetyBackupId === result.safetyBackupId)
    && audit.results[1].action === "backup.rehearsal.verified", "ACCEPT_RECOVERY_STRUCTURED_AUDIT");
  await rejects(() => service.isolatedRecovery(target, input, { ...context, requestId: "synthetic-rehearsal-nonempty" }), "ACCEPT_RECOVERY_NONEMPTY_TARGET");
}
