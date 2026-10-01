import { BackupService, taiwanBackupPolicy } from "../backup/backup-service";
import { R2BackupProvider } from "../backup/r2-provider";
import { exportPortableBackup, storeVerifiedCopy, type BackupStorageProvider } from "../backup/portable-backup";
function assert(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
export async function acceptTieredBackup(db: D1Database, bucket: R2Bucket): Promise<void> {
  const r2 = new R2BackupProvider(bucket), objects = new Map<string, Uint8Array>();
  let fail = true;
  const gcs: BackupStorageProvider = {
    async putObject(key, bytes) { if (fail) throw new Error("Synthetic outage"); objects.set(key, bytes.slice()); },
    async getObject(key) { return objects.get(key)?.slice() ?? null; },
    async listObjects(prefix) { return [...objects].filter(([key]) => key.startsWith(prefix)).map(([key, bytes]) => ({ key, byteSize: bytes.length, versionToken: "synthetic" })); },
    async deleteObject(key) { objects.delete(key); },
  };
  const scope = "acceptance-workspace", service = new BackupService(db, scope, "0.7.2", { r2, gcs });
  const context = { now: "2026-03-01T19:30:00.000Z", actorMemberId: null, requestId: "synthetic-backup-old" };
  assert(!taiwanBackupPolicy(context.now).gcs && taiwanBackupPolicy(context.now).date === "2026-03-02", "ACCEPT_BACKUP_TAIWAN_DAY");
  assert(taiwanBackupPolicy("2026-03-03T19:30:00.000Z").gcs, "ACCEPT_BACKUP_WEDNESDAY");
  assert(taiwanBackupPolicy("2026-03-07T19:30:00.000Z").gcs, "ACCEPT_BACKUP_SUNDAY");
  const oldId = await service.create("manual", context);
  const rows = await db.prepare("SELECT provider_code,status_code FROM backup_copies WHERE backup_id=? ORDER BY provider_code").bind(oldId).all<{ provider_code: string; status_code: string }>();
  assert(rows.results.some(r => r.provider_code === "r2" && r.status_code === "verified")
    && rows.results.some(r => r.provider_code === "gcs" && r.status_code === "failed"), "ACCEPT_BACKUP_PARTIAL_PROVIDER_STATE");
  const partial = (await service.list()).sets.find(row => row.backupId === oldId);
  assert(partial?.copies.length === 2 && partial.canRetry && partial.status === "verified", "ACCEPT_BACKUP_GROUPED_PARTIAL_HISTORY");
  const oldPrefix = `cyweb/${oldId}/`, original = await r2.getObject(oldPrefix + "data.json");
  assert(original, "ACCEPT_BACKUP_R2_READBACK");
  // Exercise actual R2 conditional create/read-back and collision rejection.
  const manifestBytes = await r2.getObject(oldPrefix + "manifest.json"); assert(manifestBytes, "ACCEPT_BACKUP_R2_MANIFEST");
  await storeVerifiedCopy(r2, { dataBytes: original, manifestBytes }, scope);
  let collision = false;
  try { await r2.putObject(oldPrefix + "data.json", new Uint8Array([1])); } catch { collision = true; }
  assert(collision, "ACCEPT_BACKUP_R2_COLLISION");
  const next = { ...context, now: "2026-04-02T19:30:00.000Z", requestId: "synthetic-backup-new" };
  await service.create("scheduled", next);
  assert(await r2.getObject(oldPrefix + "data.json"), "ACCEPT_BACKUP_PENDING_REPLICA_DELETED");
  fail = false;
  // A live change after export must not appear in retried bytes.
  await new BackupService(db, scope, "0.7.2", { r2, gcs }).retry(oldId, next);
  const replica = objects.get(oldPrefix + "data.json");
  assert(replica && replica.length === original.length && replica.every((v, i) => v === original[i]), "ACCEPT_BACKUP_RETRY_REEXPORTED");
  await service.create("manual", { ...next, requestId: "synthetic-backup-retention" });
  assert(await r2.getObject(oldPrefix + "data.json") === null, "ACCEPT_BACKUP_R2_30_DAY_RETENTION");
  assert(objects.has(oldPrefix + "data.json"), "ACCEPT_BACKUP_GCS_RETAIN_TOO_SHORT");
  const july = { ...next, now: "2026-09-02T19:30:00.000Z", requestId: "synthetic-backup-gcs-retention" };
  await service.create("manual", july);
  assert(!objects.has(oldPrefix + "data.json"), "ACCEPT_BACKUP_GCS_182_DAY_RETENTION");
  const first = await service.create("scheduled", july), duplicate = await service.create("scheduled", { ...july, requestId: "synthetic-repeat-cron" });
  assert(first === duplicate, "ACCEPT_BACKUP_DUPLICATE_CRON");
  const listing = await service.list();
  assert(listing.sets.filter(row => row.backupId === first).length === 1, "ACCEPT_BACKUP_DUPLICATE_LOGICAL_HISTORY");
  const other = new BackupService(db, "other-workspace", "0.7.2", { r2, gcs });
  assert((await other.list()).sets.length === 0, "ACCEPT_BACKUP_CROSS_SCOPE_LIST");
  let rejected = false; try { await other.retry(first, july); } catch { rejected = true; }
  assert(rejected, "ACCEPT_BACKUP_CROSS_SCOPE_RETRY");
  const live = await exportPortableBackup(db, { workspaceScope: scope, appVersion: "0.7.2" });
  assert(live.dataBytes.length > 0, "ACCEPT_BACKUP_BUSINESS_DATA_DELETED");
}
