import { BackupService, taiwanBackupPolicy } from "../backup/backup-service";
import { R2BackupProvider } from "../backup/r2-provider";
import { exportPortableBackup, storeVerifiedCopy, type BackupStorageProvider } from "../backup/portable-backup";
function assert(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
export async function acceptTieredBackup(db: D1Database, bucket: R2Bucket): Promise<void> {
  const r2 = new R2BackupProvider(bucket), objects = new Map<string, Uint8Array>();
  let fail = true, failureCode = "Synthetic private provider detail";
  const gcs: BackupStorageProvider = {
    async putObject(key, bytes) { if (fail) throw new Error(failureCode); objects.set(key, bytes.slice()); },
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
  assert(partial.copies.find(copy => copy.provider === "gcs")?.errorCode === "BACKUP_COPY_FAILED", "ACCEPT_BACKUP_PROVIDER_DETAIL_LEAKED");
  failureCode = "BACKUP_GCS_UPLOAD_DENIED";
  await service.retry(oldId, { ...context, requestId: "synthetic-diagnostic-retry" });
  assert((await service.list()).sets.find(row => row.backupId === oldId)?.copies.find(copy => copy.provider === "gcs")?.errorCode === failureCode,
    "ACCEPT_BACKUP_STABLE_DIAGNOSTIC_LOST");
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

  // A Cloudflare storage outage must not suppress the cross-cloud copy.
  const unavailableR2: BackupStorageProvider = {
    async putObject() { throw new Error("Synthetic R2 outage"); },
    getObject: key => r2.getObject(key), listObjects: prefix => r2.listObjects(prefix),
    deleteObject: (key, token) => r2.deleteObject(key, token),
  };
  const isolated = new BackupService(db, scope, "0.7.2", { r2: unavailableR2, gcs });
  for (const kind of ["manual", "pre_restore", "scheduled"] as const) {
    const now = kind === "scheduled" ? "2026-10-06T19:30:00.000Z" : "2026-10-05T04:00:00.000Z";
    const id = await isolated.create(kind, { ...context, now, requestId: `synthetic-r2-outage-${kind}` });
    const entry = (await isolated.list()).sets.find(row => row.backupId === id);
    assert(entry?.copies.some(copy => copy.provider === "r2" && copy.status === "failed")
      && entry.copies.some(copy => copy.provider === "gcs" && copy.status === "verified")
      && entry.status === "verified", "ACCEPT_BACKUP_R2_OUTAGE_BLOCKED_GCS");
    assert((await isolated.loadVerified(id)).provider === "gcs", "ACCEPT_BACKUP_GCS_ONLY_NOT_RECOVERABLE");
  }
  const count = objects.size;
  const monday = await isolated.create("scheduled", { ...context, now: "2026-10-11T19:30:00.000Z", requestId: "synthetic-r2-only-outage" });
  const absent = (await isolated.list()).sets.find(row => row.backupId === monday);
  assert(objects.size === count && absent?.copies.some(copy => copy.provider === "gcs" && copy.status === "absent"),
    "ACCEPT_BACKUP_R2_OUTAGE_CHANGED_GCS_SCHEDULE");
  fail = true;
  const failedId = await isolated.create("manual", { ...context, now: "2026-10-12T04:00:00.000Z", requestId: "synthetic-both-outage" });
  const failed = (await isolated.list()).sets.find(row => row.backupId === failedId);
  assert(failed?.status === "failed" && failed.copies.every(copy => copy.status === "failed"), "ACCEPT_BACKUP_BOTH_FAILURES_MASKED");

  // 03:30 fails outright; 03:45 makes one fresh attempt; later runs that day do nothing more.
  let down = true;
  const flaky: BackupStorageProvider = {
    async putObject(key, bytes) { if (down) throw new Error("Synthetic R2 outage"); await r2.putObject(key, bytes); },
    getObject: key => r2.getObject(key), listObjects: prefix => r2.listObjects(prefix),
    deleteObject: (key, token) => r2.deleteObject(key, token),
  };
  const nightly = new BackupService(db, scope, "0.7.2", { r2: flaky, gcs });
  const day = (time: string) => ({ ...context, now: "2026-10-12T" + time + ":00.000Z", requestId: "synthetic-nightly-" + time });
  const keys = async () => (await db.prepare("SELECT trigger_key,status_code FROM backup_sets WHERE workspace_scope=? AND trigger_key LIKE 'daily:2026-10-13%' ORDER BY trigger_key").bind(scope).all<{ trigger_key: string; status_code: string }>()).results;
  await nightly.scheduled(day("19:30"));
  assert(JSON.stringify((await keys()).map(k => k.status_code)) === '["failed"]', "ACCEPT_BACKUP_NIGHTLY_FIRST_FAILURE");
  down = false; fail = false;
  await nightly.scheduled(day("19:45"));
  const after = await keys();
  assert(after.length === 2 && after[1].trigger_key === "daily:2026-10-13:retry" && after[1].status_code === "verified", "ACCEPT_BACKUP_NIGHTLY_RETRY");
  await nightly.scheduled({ ...day("19:45"), requestId: "synthetic-nightly-again" });
  assert((await keys()).length === 2, "ACCEPT_BACKUP_NIGHTLY_RETRY_ONCE");
}
