import { exportPortableBackup, restoreIntoEmptyDatabase, storeVerifiedCopy, verifyPortableBackup,
  type PortableBackup, type BackupStorageProvider } from "../backup/portable-backup";

function assert(value: unknown, code: string): asserts value { if (!value) throw new Error(code); }
async function rejects(action: () => Promise<unknown>, code: string): Promise<void> {
  let rejected = false;
  try { await action(); } catch { rejected = true; }
  assert(rejected, code);
}
async function change(bundle: PortableBackup, edit: (data: any, manifest: any) => void): Promise<PortableBackup> {
  const encoder = new TextEncoder(), decoder = new TextDecoder();
  const data = JSON.parse(decoder.decode(bundle.dataBytes)), manifest = JSON.parse(decoder.decode(bundle.manifestBytes));
  edit(data, manifest);
  const dataBytes = encoder.encode(JSON.stringify(data));
  manifest.dataByteLength = dataBytes.byteLength;
  manifest.dataSha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", dataBytes))].map(n => n.toString(16).padStart(2, "0")).join("");
  return { dataBytes, manifestBytes: encoder.encode(JSON.stringify(manifest)) };
}
function memoryProvider(): BackupStorageProvider & { objects: Map<string, Uint8Array>; corrupt: boolean; fail: boolean } {
  return {
    objects: new Map(), corrupt: false, fail: false,
    async putObject(key, bytes) { if (this.fail) throw new Error("Synthetic storage outage"); this.objects.set(key, bytes.slice()); },
    async getObject(key) { const bytes = this.objects.get(key)?.slice() ?? null; if (bytes && this.corrupt) bytes[0] ^= 1; return bytes; },
    async listObjects(prefix) { return [...this.objects].filter(([key]) => key.startsWith(prefix)).map(([key, bytes]) => ({ key, byteSize: bytes.byteLength })); },
    async deleteObject(key) { this.objects.delete(key); },
  };
}
export async function acceptPortableRecovery(source: D1Database, target: D1Database): Promise<void> {
  const scope = { workspaceScope: "acceptance-workspace", appVersion: "0.7.1" };
  // Ordering is operator data: far more than the old 500-row cap, decimal quantities,
  // JSON-looking text and a JSON preference must all survive the round trip unchanged.
  const now = "2026-10-26T00:00:00.000Z";
  const orderingSource = await source.prepare("INSERT INTO ordering_sources(name,kind,created_at,updated_at) VALUES('備份驗收來源','VENDOR',?,?) RETURNING id").bind(now, now).first<{ id: number }>();
  const orderingOrder = await source.prepare("INSERT INTO ordering_orders(source_id,note,created_at,updated_at) VALUES(?,'{\"note\":[1]}',?,?) RETURNING id").bind(orderingSource!.id, now, now).first<{ id: number }>();
  await source.prepare(`WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i+1 FROM n WHERE i<1200)
    INSERT INTO ordering_lines(order_id,sort_order,item_name,quantity_text,quantity,unit) SELECT ?,i,'驗收品 '||i,'1.5',1.5,'個' FROM n`).bind(orderingOrder!.id).run();
  await source.prepare("INSERT INTO ordering_user_preferences(member_id,vendor_order_json,updated_at) VALUES(1,?,?)").bind(JSON.stringify([orderingSource!.id]), now).run();
  const bundle = await exportPortableBackup(source, scope);
  const verified = await verifyPortableBackup(bundle, scope.workspaceScope);
  assert(verified.manifest.totalRecordCount > 0 && verified.data.tables.customers.rows.length > 0, "ACCEPT_BACKUP_EMPTY_FIXTURE");
  assert(!("backup_sets" in verified.data.tables) && !("web_sessions" in verified.data.tables)
    && !("program_catalog_state" in verified.data.tables), "ACCEPT_BACKUP_AUTH_OR_CATALOG_EXPORTED");
  await rejects(() => verifyPortableBackup(bundle, "other-workspace"), "ACCEPT_BACKUP_CROSS_SCOPE");
  const fresh = await verifyPortableBackup(await exportPortableBackup(target,scope),scope.workspaceScope);
  const freshSeedCounts = JSON.stringify(fresh.manifest.recordCounts);
  const corrupt = { manifestBytes: bundle.manifestBytes, dataBytes: bundle.dataBytes.slice() }; corrupt.dataBytes[0] ^= 1;
  await rejects(() => restoreIntoEmptyDatabase(target, corrupt, scope.workspaceScope), "ACCEPT_BACKUP_CORRUPTION");
  for (const edit of [
    (_: any, m: any) => { m.appId = "cyacc"; },
    (_: any, m: any) => { m.formatVersion = 99; },
    (_: any, m: any) => { m.totalRecordCount += 1; },
    (_: any, m: any) => { m.schemaSha256 = "0".repeat(64); },
    (d: any) => { delete d.tables.customers; },
    (d: any) => { d.tables.customers.columns[0] = "name); DROP TABLE customers;--"; },
    (d: any) => { d.tables.customers.columns[0] = "unknown_column"; },
  ]) {
    const invalid = await change(bundle, edit);
    await rejects(() => restoreIntoEmptyDatabase(target, invalid, scope.workspaceScope), "ACCEPT_BACKUP_UNSAFE_MANIFEST_OR_LAYOUT");
  }
  // Valid digest but invalid FK must roll back *all* earlier inserts in real D1.
  const badForeignKey = await change(bundle, d => {
    const t = d.tables.customers; t.rows[0][t.columns.indexOf("owner_employee_id")] = 999999;
  });
  await rejects(() => restoreIntoEmptyDatabase(target, badForeignKey, scope.workspaceScope), "ACCEPT_BACKUP_FOREIGN_KEY_FAILURE");
  const afterFailure = await exportPortableBackup(target, scope);
  assert(JSON.stringify((await verifyPortableBackup(afterFailure, scope.workspaceScope)).manifest.recordCounts) === freshSeedCounts, "ACCEPT_BACKUP_PARTIAL_RESTORE");
  const duplicate = await change(bundle, (d, m) => {
    d.tables.customers.rows.push(d.tables.customers.rows[0]); m.recordCounts.customers += 1; m.totalRecordCount += 1;
  });
  await rejects(() => restoreIntoEmptyDatabase(target, duplicate, scope.workspaceScope), "ACCEPT_BACKUP_DUPLICATE_KEY");
  const afterDuplicate = await exportPortableBackup(target, scope);
  assert(JSON.stringify((await verifyPortableBackup(afterDuplicate, scope.workspaceScope)).manifest.recordCounts) === freshSeedCounts, "ACCEPT_BACKUP_DUPLICATE_PARTIAL_RESTORE");
  const r2 = memoryProvider(), gcs = memoryProvider();
  await storeVerifiedCopy(r2, bundle, scope.workspaceScope);
  gcs.fail = true;
  await rejects(() => storeVerifiedCopy(gcs, bundle, scope.workspaceScope), "ACCEPT_BACKUP_PROVIDER_FAILURE");
  await storeVerifiedCopy(r2, bundle, scope.workspaceScope); // Existing verified copy remains readable.
  gcs.fail = false;
  await storeVerifiedCopy(gcs, bundle, scope.workspaceScope); // Retry has no source-DB argument or export.
  assert([...r2.objects].every(([key, bytes]) => JSON.stringify([...bytes]) === JSON.stringify([...(gcs.objects.get(key) ?? [])])), "ACCEPT_BACKUP_REPLICA_BYTES");
  gcs.corrupt = true;
  await rejects(() => storeVerifiedCopy(gcs, bundle, scope.workspaceScope), "ACCEPT_BACKUP_CORRUPT_READBACK");
  await restoreIntoEmptyDatabase(target, bundle, scope.workspaceScope);
  const fk = await target.prepare("PRAGMA foreign_key_check").all();
  assert(fk.results.length === 0, "ACCEPT_BACKUP_RESTORED_FOREIGN_KEYS");
  const restoredOrdering = await target.prepare("SELECT COUNT(*) AS n, SUM(quantity) AS total, typeof(MAX(quantity)) AS kind FROM ordering_lines WHERE order_id=?").bind(orderingOrder!.id).first<{ n: number; total: number; kind: string }>();
  assert(restoredOrdering?.n === 1200 && restoredOrdering.total === 1800 && restoredOrdering.kind === "real", "ACCEPT_BACKUP_ORDERING_ROUND_TRIP");
  const restoredNote = await target.prepare("SELECT note, typeof(note) AS kind FROM ordering_orders WHERE id=?").bind(orderingOrder!.id).first<{ note: string; kind: string }>();
  assert(restoredNote?.note === '{"note":[1]}' && restoredNote.kind === "text", "ACCEPT_BACKUP_TEXT_ROUND_TRIP");
  await rejects(() => restoreIntoEmptyDatabase(target, bundle, scope.workspaceScope), "ACCEPT_BACKUP_NONEMPTY_TARGET");
  const unchangedSource = await exportPortableBackup(source, scope);
  assert(JSON.stringify([...bundle.dataBytes]) === JSON.stringify([...unchangedSource.dataBytes]), "ACCEPT_BACKUP_SOURCE_MUTATED");
}
