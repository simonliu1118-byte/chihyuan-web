// App-owned portable snapshot foundation. No public restore route or live overwrite.
export const BACKUP_TABLES = [
  "app_member_module_access", "app_member_tags", "app_members", "app_tag_modules", "app_tags", "audit_events",
  "bom_components", "bom_recipes", "contractor_contacts", "contractor_pricing", "contractor_stock_movements", "contractors",
  "customer_addresses", "customer_categories", "customer_contacts", "customer_frequent_items", "customer_item_quotes",
  "customer_notes", "customer_phones", "customer_statuses", "customer_visits", "customers", "defect_reports", "departments",
  "item_categories", "item_number_history", "item_unit_conversions", "items", "outsourcing_order_parts", "outsourcing_orders",
  "outsourcing_pricing_items", "outsourcing_pricings", "outsourcing_receipt_items", "outsourcing_receipts", "quote_price_breaks",
  "regions", "sales_work_order_items", "sales_work_orders", "work_log_categories", "work_log_entries", "work_log_entry_categories",
  "work_log_platforms", "work_log_scoring_config", "work_log_scoring_rows", "work_logs",
] as const;
const ALL_TABLES = [...BACKUP_TABLES, "backup_copies", "backup_sets"].sort();
const MAX_ROWS = 500;
const MAX_BYTES = 5 * 1024 * 1024;
const SCHEMA_VERSION = "0005_direct_module_access";
const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
type Cell = string | number | null;
interface TableData { columns: string[]; rows: Cell[][] }
interface Data { tables: Record<string, TableData> }
interface Scope { workspaceScope: string; appVersion: string }
interface Manifest {
  format: "CYBackupSet"; formatVersion: 1; backupId: string; appId: "cyweb"; appVersion: string;
  schemaVersion: string; schemaSha256: string; createdAtUtc: string; sourceDatabaseEngine: "d1";
  workspaceScope: string; recordCounts: Record<string, number>; totalRecordCount: number;
  dataObjectName: "data.json"; dataSha256: string; dataByteLength: number;
}
export interface PortableBackup { manifestBytes: Uint8Array; dataBytes: Uint8Array }
export interface BackupStorageProvider {
  putObject(key: string, bytes: Uint8Array): Promise<void>;
  getObject(key: string): Promise<Uint8Array | null>;
  listObjects(prefix: string): Promise<{ key: string; byteSize: number; versionToken?: string }[]>;
  deleteObject(key: string, versionToken?: string): Promise<void>;
}
function check(value: unknown, code: string): asserts value {
  if (!value) throw new Error(code);
}
function identifier(value: string): string {
  check(/^[a-z][a-z0-9_]*$/.test(value), "BACKUP_IDENTIFIER_INVALID");
  return `"${value}"`;
}
function same(a: unknown, b: unknown): boolean { return JSON.stringify(a) === JSON.stringify(b); }
function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.byteLength === b.byteLength && a.every((byte, index) => byte === b[index]);
}
function validScope(scope: Scope): void {
  check(typeof scope.workspaceScope === "string" && scope.workspaceScope.trim().length > 0, "BACKUP_SCOPE_REQUIRED");
  check(/^\d+\.\d+\.\d+$/.test(scope.appVersion), "BACKUP_APP_VERSION_INVALID");
}
async function sha256(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map(value => value.toString(16).padStart(2, "0")).join("");
}
const SCHEMA_SQL = `SELECT type, name, tbl_name, sql FROM sqlite_master
  WHERE tbl_name IN (${ALL_TABLES.map(value => `'${value}'`).join(",")}) ORDER BY type, name`;
async function layout(db: D1Database): Promise<{ schema: string; columns: Record<string, string[]> }> {
  const tables = await db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all<{ name: string }>();
  const appTables = tables.results.map(row => row.name).filter(name =>
    name !== "d1_migrations" && !name.startsWith("sqlite_") && !name.startsWith("_cf_"));
  check(same(appTables, ALL_TABLES), "BACKUP_TABLE_COVERAGE_MISMATCH");
  const results = await db.batch([
    db.prepare(SCHEMA_SQL),
    ...BACKUP_TABLES.map(table => db.prepare(`PRAGMA table_info(${identifier(table)})`)),
  ]);
  const columns: Record<string, string[]> = {};
  BACKUP_TABLES.forEach((table, index) => {
    columns[table] = (results[index + 1].results as { name: string }[]).map(row => row.name).sort();
    check(columns[table].length > 0, "BACKUP_COLUMNS_MISSING");
  });
  return { schema: JSON.stringify(results[0].results), columns };
}
function canonicalData(data: Data): Uint8Array {
  for (const table of BACKUP_TABLES) data.tables[table].rows.sort((a, b) => {
    const x = JSON.stringify(a), y = JSON.stringify(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return encoder.encode(JSON.stringify(data));
}
export async function exportPortableBackup(db: D1Database, scope: Scope): Promise<PortableBackup> {
  validScope(scope);
  const target = await layout(db);
  // Every data table is read in one D1 transaction; no provider-specific re-export.
  const results = await db.batch([
    db.prepare(SCHEMA_SQL),
    ...BACKUP_TABLES.map(table => db.prepare(`SELECT * FROM ${identifier(table)} LIMIT ${MAX_ROWS + 1}`)),
  ]);
  check(JSON.stringify(results[0].results) === target.schema, "BACKUP_SCHEMA_CHANGED");
  const data: Data = { tables: {} }, recordCounts: Record<string, number> = {};
  let totalRecordCount = 0;
  BACKUP_TABLES.forEach((table, index) => {
    const columns = target.columns[table];
    const rows = (results[index + 1].results as Record<string, Cell>[]).map(row => columns.map(column => row[column]));
    totalRecordCount += rows.length;
    check(totalRecordCount <= MAX_ROWS, "BACKUP_CAPACITY_EXCEEDED");
    for (const row of rows) for (const cell of row)
      check(cell === null || typeof cell === "string" || (typeof cell === "number" && Number.isSafeInteger(cell)), "BACKUP_UNSUPPORTED_CELL");
    data.tables[table] = { columns, rows };
    recordCounts[table] = rows.length;
  });
  const dataBytes = canonicalData(data);
  check(dataBytes.byteLength <= MAX_BYTES, "BACKUP_CAPACITY_EXCEEDED");
  const manifest: Manifest = {
    format: "CYBackupSet", formatVersion: 1, backupId: crypto.randomUUID(), appId: "cyweb", appVersion: scope.appVersion,
    schemaVersion: SCHEMA_VERSION, schemaSha256: await sha256(encoder.encode(target.schema)),
    createdAtUtc: new Date().toISOString(), sourceDatabaseEngine: "d1", workspaceScope: scope.workspaceScope,
    recordCounts, totalRecordCount, dataObjectName: "data.json", dataSha256: await sha256(dataBytes), dataByteLength: dataBytes.byteLength,
  };
  return { manifestBytes: encoder.encode(JSON.stringify(manifest)), dataBytes };
}
export async function verifyPortableBackup(bundle: PortableBackup, workspaceScope: string): Promise<{ manifest: Manifest; data: Data }> {
  check(bundle.manifestBytes.byteLength <= 65536 && bundle.dataBytes.byteLength <= MAX_BYTES, "BACKUP_CAPACITY_EXCEEDED");
  const manifest = JSON.parse(decoder.decode(bundle.manifestBytes)) as Manifest;
  check(manifest?.format === "CYBackupSet" && manifest.formatVersion === 1 && manifest.appId === "cyweb"
    && manifest.sourceDatabaseEngine === "d1" && manifest.schemaVersion === SCHEMA_VERSION
    && manifest.dataObjectName === "data.json", "BACKUP_FORMAT_UNSUPPORTED");
  check(typeof workspaceScope === "string" && workspaceScope.trim().length > 0 && manifest.workspaceScope === workspaceScope, "BACKUP_SCOPE_MISMATCH");
  check(/^[a-f0-9-]{36}$/.test(manifest.backupId) && /^\d+\.\d+\.\d+$/.test(manifest.appVersion)
    && /^[a-f0-9]{64}$/.test(manifest.schemaSha256) && new Date(manifest.createdAtUtc).toISOString() === manifest.createdAtUtc, "BACKUP_METADATA_INVALID");
  check(manifest.dataByteLength === bundle.dataBytes.byteLength && manifest.dataSha256 === await sha256(bundle.dataBytes), "BACKUP_INTEGRITY_FAILED");
  const data = JSON.parse(decoder.decode(bundle.dataBytes)) as Data;
  check(data?.tables && same(Object.keys(data.tables).sort(), [...BACKUP_TABLES].sort()), "BACKUP_TABLE_COVERAGE_MISMATCH");
  check(manifest.recordCounts && same(Object.keys(manifest.recordCounts).sort(), [...BACKUP_TABLES].sort()), "BACKUP_COUNTS_INVALID");
  let count = 0;
  for (const table of BACKUP_TABLES) {
    const value = data.tables[table];
    check(value && Array.isArray(value.columns) && value.columns.length > 0 && Array.isArray(value.rows), "BACKUP_TABLE_INVALID");
    check(value.columns.every(column => typeof column === "string" && /^[a-z][a-z0-9_]*$/.test(column))
      && new Set(value.columns).size === value.columns.length, "BACKUP_COLUMNS_INVALID");
    check(manifest.recordCounts[table] === value.rows.length, "BACKUP_COUNTS_INVALID");
    count += value.rows.length;
    check(count <= MAX_ROWS, "BACKUP_CAPACITY_EXCEEDED");
    for (const row of value.rows) {
      check(Array.isArray(row) && row.length === value.columns.length, "BACKUP_ROW_INVALID");
      for (const cell of row) check(cell === null || typeof cell === "string"
        || (typeof cell === "number" && Number.isSafeInteger(cell)), "BACKUP_UNSUPPORTED_CELL");
    }
  }
  check(count === manifest.totalRecordCount, "BACKUP_COUNTS_INVALID");
  return { manifest, data };
}
export async function storeVerifiedCopy(provider: BackupStorageProvider, bundle: PortableBackup, workspaceScope: string): Promise<void> {
  const { manifest } = await verifyPortableBackup(bundle, workspaceScope);
  const prefix = `cyweb/${manifest.backupId}/`;
  await provider.putObject(prefix + "data.json", bundle.dataBytes.slice());
  await provider.putObject(prefix + "manifest.json", bundle.manifestBytes.slice());
  const dataBytes = await provider.getObject(prefix + "data.json"), manifestBytes = await provider.getObject(prefix + "manifest.json");
  check(dataBytes && manifestBytes, "BACKUP_READBACK_MISSING");
  check(sameBytes(manifestBytes, bundle.manifestBytes) && sameBytes(dataBytes, bundle.dataBytes), "BACKUP_COPY_BYTES_CHANGED");
  await verifyPortableBackup({ manifestBytes, dataBytes }, workspaceScope);
}
// Internal fresh-database recovery primitive. Caller owns authorization, target isolation
// and confirmation. This module is deliberately absent from production HTTP routes.
export async function restoreIntoEmptyDatabase(db: D1Database, bundle: PortableBackup, workspaceScope: string): Promise<void> {
  const { manifest, data } = await verifyPortableBackup(bundle, workspaceScope);
  const target = await layout(db);
  check(manifest.schemaSha256 === await sha256(encoder.encode(target.schema)), "BACKUP_SCHEMA_MISMATCH");
  for (const table of BACKUP_TABLES) check(same(data.tables[table].columns, target.columns[table]), "BACKUP_COLUMNS_MISMATCH");
  const existing = (await db.batch(ALL_TABLES.map(table => db.prepare(`SELECT COUNT(*) AS n FROM ${identifier(table)}`))))
    .some(result => Number((result.results[0] as { n: number }).n) !== 0);
  check(!existing, "BACKUP_TARGET_NOT_EMPTY");
  // Recheck emptiness inside the same transaction as all inserts to close the race.
  // Malformed JSON makes a failed guard abort the entire batch without deleting data.
  const emptyGuard = ALL_TABLES.map(table => `NOT EXISTS(SELECT 1 FROM ${identifier(table)})`).join(" AND ");
  const statements = [db.prepare(`SELECT CASE WHEN ${emptyGuard} THEN 1 ELSE json('') END AS empty_target`),
    db.prepare("PRAGMA defer_foreign_keys = ON")];
  for (const table of BACKUP_TABLES) {
    const value = data.tables[table];
    const insert = db.prepare(`INSERT INTO ${identifier(table)} (${value.columns.map(identifier).join(",")}) VALUES (${value.columns.map(() => "?").join(",")})`);
    for (const row of value.rows) statements.push(insert.bind(...row));
  }
  await db.batch(statements);
  const restored = await exportPortableBackup(db, { workspaceScope, appVersion: manifest.appVersion });
  check(sameBytes(restored.dataBytes, bundle.dataBytes), "BACKUP_RECONCILIATION_FAILED");
}
