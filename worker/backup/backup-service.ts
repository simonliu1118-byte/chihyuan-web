import { AuditService } from "../audit/audit-service";
import type { BackupHistory, BackupProvider } from "../../shared/backups";
import { exportPortableBackup, restoreIntoEmptyDatabase, validateEmptyBackupTarget, storeVerifiedCopy, verifyPortableBackup, type BackupStorageProvider, type PortableBackup } from "./portable-backup";
import { BACKUP_ID, storageCheck } from "./storage-guard";

type ProviderCode = "r2" | "gcs";
export interface BackupContext { now: string; actorMemberId: number | null; requestId: string }
type Context = BackupContext;
interface SetRow { backup_id: string; created_at: string; data_sha256: string; data_byte_length: number; total_record_count: number; status_code: string }
export async function loadBackupHistory(db: D1Database, workspace: string, configured: boolean): Promise<BackupHistory> {
  const results = await db.batch([
    db.prepare(`SELECT backup_id, created_at, app_version, schema_version, data_sha256,
      data_byte_length, total_record_count, status_code, trigger_kind FROM backup_sets
      WHERE workspace_scope=? ORDER BY created_at DESC, backup_id DESC LIMIT 50`).bind(workspace),
    db.prepare(`SELECT backup_id, provider_code, status_code, verified_at, last_error_code, lease_until
      FROM backup_copies WHERE backup_id IN (SELECT backup_id FROM backup_sets WHERE workspace_scope=?
      ORDER BY created_at DESC, backup_id DESC LIMIT 50) ORDER BY backup_id, provider_code`).bind(workspace),
  ]);
  const copies = results[1].results as { backup_id: string; provider_code: BackupProvider; status_code: string;
    verified_at: string | null; last_error_code: string | null; lease_until: string | null }[];
  return { configured, sets: (results[0].results as (SetRow & { app_version: string; schema_version: string; trigger_kind: string })[]).map(row => {
    const children = copies.filter(copy => copy.backup_id === row.backup_id);
    return { backupId: row.backup_id, createdAt: row.created_at, appVersion: row.app_version, schemaVersion: row.schema_version,
      dataSha256: row.data_sha256, byteLength: row.data_byte_length, recordCount: row.total_record_count,
      status: row.status_code, triggerKind: row.trigger_kind,
      copies: children.map(copy => ({ provider: copy.provider_code, status: copy.status_code, verifiedAt: copy.verified_at, errorCode: copy.last_error_code })),
      canRetry: configured && children.some(copy => copy.provider_code === "r2" && copy.status_code === "verified")
        && children.some(copy => copy.provider_code === "gcs" && ["pending", "failed"].includes(copy.status_code)
          && (!copy.lease_until || copy.lease_until <= new Date().toISOString())),
    };
  }) };
}
export function taiwanBackupPolicy(time: string): { date: string; gcs: boolean } {
  const value = new Date(Date.parse(time) + 8 * 60 * 60 * 1000);
  storageCheck(Number.isFinite(value.getTime()), "BACKUP_TIME_INVALID");
  return { date: value.toISOString().slice(0, 10), gcs: [0, 3].includes(value.getUTCDay()) };
}
/** Internal orchestration: no restore writes or arbitrary object access. */
export class BackupService {
  constructor(private readonly db: D1Database, private readonly workspace: string, private readonly version: string,
    private readonly providers: Record<ProviderCode, BackupStorageProvider>) {
    storageCheck(workspace.trim() && /^\d+\.\d+\.\d+$/.test(version), "BACKUP_CONFIG_INVALID");
  }
  private audit(id: string, action: string, context: Context, provider?: ProviderCode) {
    return new AuditService(this.db).prepareRecord({ entityType: "backup", entityKey: id, action,
      actorEmployeeId: context.actorMemberId, occurredAt: context.now, requestId: context.requestId,
      metadata: provider ? { provider } : undefined });
  }
  async list(): Promise<BackupHistory> { return loadBackupHistory(this.db, this.workspace, true); }
  async loadVerified(id: string, onlyProvider?: ProviderCode): Promise<{ bundle: PortableBackup; provider: ProviderCode }> {
    storageCheck(BACKUP_ID.test(id), "BACKUP_ID_INVALID");
    const results = await this.db.batch([
      this.db.prepare("SELECT * FROM backup_sets WHERE backup_id=? AND workspace_scope=?").bind(id, this.workspace),
      this.db.prepare(`SELECT provider_code FROM backup_copies WHERE backup_id=? AND status_code='verified'
        AND EXISTS(SELECT 1 FROM backup_sets WHERE backup_id=? AND workspace_scope=?)`).bind(id, id, this.workspace),
    ]);
    const row = results[0].results[0] as (SetRow & { app_version: string; schema_version: string }) | undefined;
    storageCheck(row, "BACKUP_SCOPE_OR_ID_INVALID");
    for (const provider of onlyProvider ? [onlyProvider] : ["r2", "gcs"] as const) {
      if (!(results[1].results as { provider_code: string }[]).some(copy => copy.provider_code === provider)) continue;
      try {
        const prefix = `cyweb/${id}/`;
        const dataBytes = await this.providers[provider].getObject(prefix + "data.json");
        const manifestBytes = await this.providers[provider].getObject(prefix + "manifest.json");
        storageCheck(dataBytes && manifestBytes, "BACKUP_READBACK_MISSING");
        const bundle = { dataBytes, manifestBytes }, { manifest } = await verifyPortableBackup(bundle, this.workspace);
        storageCheck(manifest.backupId === id && manifest.createdAtUtc === row.created_at && manifest.dataSha256 === row.data_sha256
          && manifest.dataByteLength === row.data_byte_length && manifest.totalRecordCount === row.total_record_count
          && manifest.appVersion === row.app_version && manifest.schemaVersion === row.schema_version, "BACKUP_CATALOG_MISMATCH");
        return { bundle, provider };
      } catch {}
    }
    throw new Error("BACKUP_NO_VERIFIED_COPY_AVAILABLE");
  }
  async isolatedRecovery(target: D1Database, input: { backupId: string; selectionConfirmation: string;
    targetConfirmation: "isolated_empty_database"; role: string; isActive: boolean }, context: Context): Promise<{ safetyBackupId: string; provider: ProviderCode }> {
    storageCheck(input.role === "SUPER_ADMIN" && input.isActive && context.actorMemberId !== null, "BACKUP_RECOVERY_AUTHORITY_REQUIRED");
    storageCheck(input.selectionConfirmation === input.backupId && input.targetConfirmation === "isolated_empty_database", "BACKUP_RECOVERY_CONFIRMATION_REQUIRED");
    storageCheck(target !== this.db, "BACKUP_RECOVERY_TARGET_NOT_ISOLATED");
    const selected = await this.loadVerified(input.backupId);
    await validateEmptyBackupTarget(target, selected.bundle, this.workspace);
    // Resolve immutable selected bytes first. Safety export then captures current
    // source data, requires both verified providers, and never clears a target.
    const safetyBackupId = await this.create("pre_restore", { ...context, requestId: `${context.requestId}:safety` });
    storageCheck(safetyBackupId !== input.backupId, "BACKUP_RECOVERY_SAFETY_ID_INVALID");
    await this.loadVerified(safetyBackupId, "r2");
    await this.loadVerified(safetyBackupId, "gcs");
    await new AuditService(this.db).record({ entityType: "backup", entityKey: input.backupId, action: "backup.rehearsal.started",
      actorEmployeeId: context.actorMemberId, occurredAt: context.now, requestId: context.requestId,
      metadata: { safetyBackupId, provider: selected.provider, target: "isolated_empty_database" } });
    try {
      await restoreIntoEmptyDatabase(target, selected.bundle, this.workspace);
      await new AuditService(this.db).record({ entityType: "backup", entityKey: input.backupId, action: "backup.rehearsal.verified",
        actorEmployeeId: context.actorMemberId, occurredAt: context.now, requestId: context.requestId,
        metadata: { safetyBackupId, provider: selected.provider, target: "isolated_empty_database" } });
    } catch {
      await new AuditService(this.db).record({ entityType: "backup", entityKey: input.backupId, action: "backup.rehearsal.failed",
        actorEmployeeId: context.actorMemberId, occurredAt: context.now, requestId: context.requestId,
        metadata: { safetyBackupId, provider: selected.provider, target: "isolated_empty_database" } });
      throw new Error("BACKUP_ISOLATED_RECOVERY_FAILED");
    }
    return { safetyBackupId, provider: selected.provider };
  }
  async create(kind: "manual" | "scheduled" | "pre_restore", context: Context): Promise<string> {
    const policy = taiwanBackupPolicy(context.now), id = crypto.randomUUID();
    const claim = await this.db.prepare(`INSERT OR IGNORE INTO backup_sets
      (backup_id,created_at,schema_version,data_sha256,data_byte_length,total_record_count,status_code,
       workspace_scope,app_version,trigger_kind,trigger_key) VALUES (?,?,'0006_backup_catalog','pending',0,0,'creating',?,?,?,?)`)
      .bind(id, context.now, this.workspace, this.version, kind, kind === "scheduled" ? `daily:${policy.date}` : `${kind}:${context.requestId}`).run();
    if (claim.meta.changes === 0) {
      const previous = await this.db.prepare("SELECT backup_id FROM backup_sets WHERE workspace_scope=? AND trigger_key=?")
        .bind(this.workspace, kind === "scheduled" ? `daily:${policy.date}` : `${kind}:${context.requestId}`).first<{ backup_id: string }>();
      storageCheck(previous, "BACKUP_CLAIM_FAILED"); return previous.backup_id;
    }
    try {
      await this.audit(id, "backup.started", context).run();
      const bundle = await exportPortableBackup(this.db, { workspaceScope: this.workspace, appVersion: this.version }, { backupId: id, createdAtUtc: context.now });
      const { manifest } = await verifyPortableBackup(bundle, this.workspace);
      const both = kind !== "scheduled" || policy.gcs;
      await this.db.batch([
        this.db.prepare("UPDATE backup_sets SET data_sha256=?,data_byte_length=?,total_record_count=? WHERE backup_id=? AND workspace_scope=?")
          .bind(manifest.dataSha256, manifest.dataByteLength, manifest.totalRecordCount, id, this.workspace),
        ...(["r2", "gcs"] as const).map(provider => this.db.prepare(`INSERT INTO backup_copies
          (backup_id,provider_code,status_code,object_prefix,updated_at) VALUES (?,?,?,?,?)`)
          .bind(id, provider, provider === "r2" || both ? "pending" : "absent", `cyweb/${id}/`, context.now)),
      ]);
      if (!await this.copy(id, "r2", bundle, context)) return id;
      if (both) await this.copy(id, "gcs", bundle, context);
      await this.retain("r2", id, context);
      if (both) await this.retain("gcs", id, context);
    } catch {
      await this.db.batch([
        this.db.prepare(`UPDATE backup_sets SET status_code='failed' WHERE backup_id=? AND workspace_scope=?
          AND NOT EXISTS(SELECT 1 FROM backup_copies WHERE backup_id=? AND status_code='verified')`).bind(id, this.workspace, id),
        this.audit(id, "backup.failed", context),
      ]);
    }
    return id;
  }
  private async copy(id: string, provider: ProviderCode, bundle: PortableBackup, context: Context): Promise<boolean> {
    const lease = new Date(Date.parse(context.now) + 10 * 60 * 1000).toISOString();
    const claimed = await this.db.prepare(`UPDATE backup_copies SET lease_until=? WHERE backup_id=? AND provider_code=?
      AND status_code IN ('pending','failed') AND (lease_until IS NULL OR lease_until<=?)
      AND EXISTS(SELECT 1 FROM backup_sets WHERE backup_id=? AND workspace_scope=?)`)
      .bind(lease, id, provider, context.now, id, this.workspace).run();
    if (!claimed.meta.changes) return false;
    let ok = false;
    try { await storeVerifiedCopy(this.providers[provider], bundle, this.workspace); ok = true; } catch {}
    await this.db.batch([
      this.db.prepare(`UPDATE backup_copies SET status_code=?,verified_at=?,last_error_code=?,updated_at=?,lease_until=NULL
        WHERE backup_id=? AND provider_code=? AND lease_until=?`)
        .bind(ok ? "verified" : "failed", ok ? context.now : null, ok ? null : "BACKUP_COPY_FAILED", context.now, id, provider, lease),
      this.db.prepare(`UPDATE backup_sets SET status_code=CASE WHEN EXISTS
        (SELECT 1 FROM backup_copies WHERE backup_id=? AND status_code='verified') THEN 'verified' ELSE 'failed' END
        WHERE backup_id=? AND workspace_scope=?`).bind(id, id, this.workspace),
      this.audit(id, ok ? "backup.copy.verified" : "backup.copy.failed", context, provider),
    ]);
    return ok;
  }
  async retry(id: string, context: Context): Promise<void> {
    storageCheck(BACKUP_ID.test(id), "BACKUP_ID_INVALID");
    const row = await this.db.prepare(`SELECT bs.* FROM backup_sets bs JOIN backup_copies bc ON bc.backup_id=bs.backup_id
      WHERE bs.backup_id=? AND bs.workspace_scope=? AND bc.provider_code='r2' AND bc.status_code='verified'`)
      .bind(id, this.workspace).first<SetRow>();
    storageCheck(row, "BACKUP_VERIFIED_SOURCE_REQUIRED");
    const prefix = `cyweb/${id}/`;
    const dataBytes = await this.providers.r2.getObject(prefix + "data.json"), manifestBytes = await this.providers.r2.getObject(prefix + "manifest.json");
    storageCheck(dataBytes && manifestBytes, "BACKUP_READBACK_MISSING");
    const bundle = { dataBytes, manifestBytes }, { manifest } = await verifyPortableBackup(bundle, this.workspace);
    storageCheck(manifest.backupId === id && manifest.createdAtUtc === row.created_at && manifest.dataSha256 === row.data_sha256
      && manifest.dataByteLength === row.data_byte_length && manifest.totalRecordCount === row.total_record_count, "BACKUP_CATALOG_MISMATCH");
    await this.copy(id, "gcs", bundle, context);
    await this.retain("gcs", id, context);
  }
  async scheduled(context: Context): Promise<void> {
    await this.create("scheduled", context);
    const pending = await this.db.prepare(`SELECT bs.backup_id FROM backup_sets bs JOIN backup_copies bc ON bc.backup_id=bs.backup_id
      WHERE bs.workspace_scope=? AND bc.provider_code='gcs' AND bc.status_code IN ('pending','failed')
      AND (bc.lease_until IS NULL OR bc.lease_until<=?)
      AND EXISTS(SELECT 1 FROM backup_copies r WHERE r.backup_id=bs.backup_id AND r.provider_code='r2' AND r.status_code='verified')
      ORDER BY bs.created_at LIMIT 1`).bind(this.workspace, context.now).first<{ backup_id: string }>();
    if (pending) await this.retry(pending.backup_id, context);
  }
  private async retain(provider: ProviderCode, freshId: string, context: Context): Promise<void> {
    // At most one old copy per provider/event. Catalog scope, new verified-copy gate and
    // copy leases protect failed replicas; no bucket-wide delete or business SQL.
    const cutoff = new Date(Date.parse(context.now) - (provider === "r2" ? 30 : 182) * 86400000).toISOString();
    const candidates = await this.db.prepare(`SELECT bc.backup_id FROM backup_copies bc JOIN backup_sets bs ON bs.backup_id=bc.backup_id
      WHERE bs.workspace_scope=? AND bc.provider_code=? AND bc.status_code IN ('verified','deleting') AND bs.created_at<?
      AND EXISTS(SELECT 1 FROM backup_copies f WHERE f.backup_id=? AND f.provider_code=? AND f.status_code='verified')
      AND (bc.lease_until IS NULL OR bc.lease_until<=?)
      AND (?='gcs' OR NOT EXISTS(SELECT 1 FROM backup_copies g WHERE g.backup_id=bc.backup_id
        AND g.provider_code='gcs' AND (g.status_code IN ('pending','failed') OR g.lease_until>?)))
      ORDER BY bs.created_at LIMIT 1`).bind(this.workspace, provider, cutoff, freshId, provider, context.now, provider, context.now)
      .all<{ backup_id: string }>();
    for (const row of candidates.results) {
      const lease = new Date(Date.parse(context.now) + 10 * 60 * 1000).toISOString();
      const claimed = await this.db.prepare(`UPDATE backup_copies SET status_code='deleting',lease_until=?
        WHERE backup_id=? AND provider_code=? AND status_code IN ('verified','deleting')
        AND (lease_until IS NULL OR lease_until<=?)`).bind(lease, row.backup_id, provider, context.now).run();
      if (!claimed.meta.changes) continue;
      let deleted = false;
      try {
        const prefix = `cyweb/${row.backup_id}/`;
        const objects = await this.providers[provider].listObjects(prefix);
        for (const object of objects) await this.providers[provider].deleteObject(object.key, object.versionToken);
        deleted = true;
      } catch {}
      await this.db.batch([
        this.db.prepare(`UPDATE backup_copies SET status_code=?,last_error_code=?,updated_at=?,lease_until=NULL
          WHERE backup_id=? AND provider_code=? AND lease_until=?`)
          .bind(deleted ? "deleted" : "deleting", deleted ? null : "BACKUP_RETENTION_FAILED", context.now, row.backup_id, provider, lease),
        this.db.prepare(`UPDATE backup_sets SET status_code='expired' WHERE backup_id=? AND workspace_scope=?
          AND NOT EXISTS(SELECT 1 FROM backup_copies WHERE backup_id=? AND status_code='verified')`)
          .bind(row.backup_id, this.workspace, row.backup_id),
        this.audit(row.backup_id, deleted ? "backup.retention.deleted" : "backup.retention.failed", context, provider),
      ]);
    }
  }
}
