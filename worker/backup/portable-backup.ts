// App-owned portable snapshot foundation. Guarded isolated rehearsal only; no live overwrite.
import { BACKUP_COLUMNS } from "./schema-columns";
export const BACKUP_TABLES = Object.keys(BACKUP_COLUMNS).sort();
// Operational queue, heartbeat and revocable credential hashes are intentionally
// excluded from durable backup. After recovery the Super Admin reissues the Agent token.
// The ERP sales history (進貨輔助, 2026-10-21) is copied from SMART ERP, which stays its source:
// it is rebuilt by running 進貨輔助 again, and is far larger than this snapshot allows.
const EPHEMERAL_TABLES = ["erp_item_queries", "erp_item_agent_status", "erp_item_agent_credentials",
  "erp_sales_daily", "erp_sales_days", "erp_sales_items",
  // WO-0.9.26: the portable backup currently limits all rows to 500; temporarily exclude ordering until capacity expansion.
  "ordering_sources", "ordering_orders", "ordering_lines", "ordering_receipts", "ordering_receipt_lines",
  // Personal vendor tab preference refers to ordering_sources, excluded until portable backup expansion.
  "ordering_vendor_items", "ordering_item_last_source", "ordering_revisions", "ordering_user_preferences"] as const;
const ALL_TABLES = [...BACKUP_TABLES, "backup_copies", "backup_sets", ...EPHEMERAL_TABLES].sort();
// Newly migrated D1 has canonical HR reference rows before any operator data.
// Allow only these *unaltered* migration fixtures as a fresh restore destination.
// All other tables still must be empty. Predicates are fixed source strings, never user input.
const MIGRATION_SEEDS: Record<string,{count:number;predicate:string}> = {
  hr_stores:{count:1,predicate:"id=1 AND name='志遠高雄門市' AND sort_order=0 AND is_active=1 AND cycle_anchor_date='2026-09-28' AND rules_template=''"},
  hr_job_titles:{count:5,predicate:"(id=1 AND name='店長' AND sort_order=1) OR (id=2 AND name='門市' AND sort_order=2) OR (id=3 AND name='業務' AND sort_order=3) OR (id=4 AND name='美編' AND sort_order=4) OR (id=5 AND name='兼職' AND sort_order=5)"},
  hr_shift_types:{count:6,predicate:"(id=1 AND code='早' AND start_time='09:00' AND end_time='17:30' AND normal_minutes=480) OR (id=2 AND code='晚' AND start_time='12:30' AND end_time='21:00' AND normal_minutes=480) OR (id=3 AND code='日' AND start_time='10:30' AND end_time='19:00' AND normal_minutes=480) OR (id=4 AND code='A' AND normal_minutes=240) OR (id=5 AND code='B' AND normal_minutes=240) OR (id=6 AND code='C' AND normal_minutes=240)"},
  hr_leave_types:{count:18,predicate:["特","事","病","生","婚","喪","產","檢","陪","家","公","傷","颱","國","補","換","獎","院"].map((code,i)=>"(id="+(i+1)+" AND code='"+code+"' AND sort_order="+(i+1)+" AND is_active="+(code==="換"?0:1)+" AND is_statutory="+(i<12||code==="院"?1:0)+")").join(" OR ")}
};
function balancedAnd(items:string[]):string {
  if(items.length===0)return "1=1";
  if(items.length===1)return items[0];
  const mid=Math.floor(items.length/2);
  return "("+balancedAnd(items.slice(0,mid))+" AND "+balancedAnd(items.slice(mid))+")";
}
function emptyTargetGuard() {
  return balancedAnd(ALL_TABLES.map(table=>{
    const identifierTable=identifier(table),seed=MIGRATION_SEEDS[table];
    return seed
      ? "((SELECT COUNT(*) FROM "+identifierTable+")="+seed.count+" AND NOT EXISTS(SELECT 1 FROM "+identifierTable+" WHERE NOT ("+seed.predicate+")))"
      : "NOT EXISTS(SELECT 1 FROM "+identifierTable+")";
  }));
}

const MAX_ROWS = 500;
const MAX_BYTES = 5 * 1024 * 1024;
const SCHEMA_VERSION = "0007_retired_entity_ids";
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
  WHERE tbl_name != 'd1_migrations' AND tbl_name != 'program_catalog_state'
    AND tbl_name NOT GLOB 'sqlite_*' AND tbl_name NOT GLOB '_cf_*' ORDER BY type, name`;
async function layout(db: D1Database): Promise<{ schema: string; columns: Record<string, string[]> }> {
  const result = await db.prepare(SCHEMA_SQL).all<{ type: string; name: string }>();
  const tables = result.results.filter(row => row.type === "table").map(row => row.name).sort();
  check(same(tables, ALL_TABLES), "BACKUP_TABLE_COVERAGE_MISMATCH");
  const columnResult = await db.prepare(`SELECT sm.name AS table_name, col.name AS name FROM sqlite_master sm
    JOIN pragma_table_info(sm.name) col WHERE sm.type='table' AND sm.name IN (${BACKUP_TABLES.map(t => `'${t}'`).join(",")})`)
    .all<{ table_name: string; name: string }>();
  const columns = columnResult.results;
  for (const table of BACKUP_TABLES) check(same(columns.filter(row => row.table_name === table).map(row => row.name).sort(), BACKUP_COLUMNS[table]), "BACKUP_COLUMNS_MISMATCH");
  return { schema: JSON.stringify(result.results), columns: BACKUP_COLUMNS };
}
const DATA_SQL = "WITH snapshots(table_name, rows_json) AS (VALUES " + BACKUP_TABLES.map(table => {
  const columns = BACKUP_COLUMNS[table].map(identifier).join(",");
  return `('${table}', (SELECT json_group_array(json_array(${columns}))
    FROM (SELECT ${columns} FROM ${identifier(table)} LIMIT ${MAX_ROWS + 1})))`;
}).join(",") + ") SELECT table_name, rows_json FROM snapshots";
function canonicalData(data: Data): Uint8Array {
  for (const table of BACKUP_TABLES) data.tables[table].rows.sort((a, b) => {
    const x = JSON.stringify(a), y = JSON.stringify(b);
    return x < y ? -1 : x > y ? 1 : 0;
  });
  return encoder.encode(JSON.stringify(data));
}
export async function exportPortableBackup(db: D1Database, scope: Scope, event?: { backupId: string; createdAtUtc: string }): Promise<PortableBackup> {
  validScope(scope);
  const target = await layout(db);
  // Every data table is read in one D1 transaction; no provider-specific re-export.
  const results = await db.batch([
    db.prepare(SCHEMA_SQL),
    db.prepare(DATA_SQL),
  ]);
  check(JSON.stringify(results[0].results) === target.schema, "BACKUP_SCHEMA_CHANGED");
  const data: Data = { tables: {} }, recordCounts: Record<string, number> = {};
  const tableResults = results.slice(1).flatMap(result => result.results);
  let totalRecordCount = 0;
  BACKUP_TABLES.forEach((table, index) => {
    const columns = target.columns[table];
    const result = tableResults[index] as { table_name: string; rows_json: string };
    check(result.table_name === table, "BACKUP_TABLE_COVERAGE_MISMATCH");
    const rows = JSON.parse(result.rows_json) as Cell[][];
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
    format: "CYBackupSet", formatVersion: 1, backupId: event?.backupId ?? crypto.randomUUID(), appId: "cyweb", appVersion: scope.appVersion,
    schemaVersion: SCHEMA_VERSION, schemaSha256: await sha256(encoder.encode(target.schema)),
    createdAtUtc: event?.createdAtUtc ?? new Date().toISOString(), sourceDatabaseEngine: "d1", workspaceScope: scope.workspaceScope,
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
// and confirmation. Production access is through the guarded backup rehearsal route.
export async function validateEmptyBackupTarget(db: D1Database, bundle: PortableBackup, workspaceScope: string): Promise<{ manifest: Manifest; data: Data }> {
  const { manifest, data } = await verifyPortableBackup(bundle, workspaceScope);
  const target = await layout(db);
  check(manifest.schemaSha256 === await sha256(encoder.encode(target.schema)), "BACKUP_SCHEMA_MISMATCH");
  for (const table of BACKUP_TABLES) check(same(data.tables[table].columns, target.columns[table]), "BACKUP_COLUMNS_MISMATCH");
  const guard = emptyTargetGuard();
  const empty = await db.prepare(`SELECT CASE WHEN ${guard} THEN 1 ELSE 0 END AS empty_target`).first<{ empty_target: number }>();
  check(empty?.empty_target === 1, "BACKUP_TARGET_NOT_EMPTY");
  return { manifest, data };
}
export async function restoreIntoEmptyDatabase(db: D1Database, bundle: PortableBackup, workspaceScope: string): Promise<void> {
  const { manifest, data } = await validateEmptyBackupTarget(db, bundle, workspaceScope);
  // Recheck emptiness inside the same transaction as all inserts to close the race.
  // Malformed JSON makes a failed guard abort the entire batch without deleting data.
  const emptyGuard = emptyTargetGuard();
  const statements = [db.prepare(`SELECT CASE WHEN ${emptyGuard} THEN 1 ELSE json('') END AS empty_target`),
    db.prepare("PRAGMA defer_foreign_keys = ON")];
  for(const table of ["hr_leave_types","hr_shift_types","hr_job_titles","hr_stores"])
    statements.push(db.prepare(`DELETE FROM ${identifier(table)}`));
  for (const table of BACKUP_TABLES) {
    const value = data.tables[table];
    const insert = db.prepare(`INSERT INTO ${identifier(table)} (${value.columns.map(identifier).join(",")}) VALUES (${value.columns.map(() => "?").join(",")})`);
    for (const row of value.rows) statements.push(insert.bind(...row));
  }
  await db.batch(statements);
  const restored = await exportPortableBackup(db, { workspaceScope, appVersion: manifest.appVersion });
  check(sameBytes(restored.dataBytes, bundle.dataBytes), "BACKUP_RECONCILIATION_FAILED");
}
