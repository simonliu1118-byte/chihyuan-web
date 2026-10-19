export type AuditJsonPrimitive = string | number | boolean | null;
export type AuditJsonValue =
  | AuditJsonPrimitive
  | readonly AuditJsonValue[]
  | { readonly [key: string]: AuditJsonValue };

/** Stored/read Audit payload after JSON serialization. */
export type AuditPayload = Readonly<Record<string, AuditJsonValue>>;
/**
 * Domain services may pass typed rows, readonly arrays, or D1 values without
 * weakening their own types. AuditService performs the JSON/sensitive-key
 * validation at the persistence boundary before anything is written.
 */
export type AuditInputPayload = Readonly<Record<string, unknown>>;
export type AuditSqlScalar = string | number | null;

export interface AuditEventInput {
  entityType: string;
  entityKey: string;
  action: string;
  actorEmployeeId?: number | null;
  occurredAt?: string;
  statusFrom?: string | null;
  statusTo?: string | null;
  requestId?: string | null;
  before?: AuditInputPayload | null;
  after?: AuditInputPayload | null;
  metadata?: AuditInputPayload | null;
}

export interface AuditInsertCondition {
  /**
   * Trusted server-side SQL expression appended after WHERE. Use anonymous `?`
   * placeholders only; values are bound after the audit values. This is intended
   * for atomic domain-mutation batches, never for client-provided SQL.
   */
  sql: string;
  values?: readonly AuditSqlScalar[];
}

export interface AuditEventRecord {
  id: number;
  entityType: string;
  entityKey: string;
  action: string;
  actorEmployeeId: number | null;
  actor: { id: number; employeeNo: string | null; displayName: string | null } | null;
  occurredAt: string;
  statusFrom: string | null;
  statusTo: string | null;
  requestId: string | null;
  before: AuditPayload | null;
  after: AuditPayload | null;
  metadata: AuditPayload | null;
}

export interface AuditTimelineItem {
  id: number;
  action: string;
  actorEmployeeId: number | null;
  actorEmployeeNo: string | null;
  occurredAt: string;
  statusFrom: string | null;
  statusTo: string | null;
}

export interface AuditQuery {
  entityType?: string;
  entityKey?: string;
  action?: string;
  actorEmployeeId?: number;
  occurredFrom?: string;
  occurredTo?: string;
  entityTypes?: string[];
  q?: string;
  cursor?: string;
  relatedCustomerId?: number;
  includeErpQueries?: boolean;
  includeHrEvents?: boolean;
  limit?: number;
}

const CODE_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;
const MAX_ENTITY_KEY_LENGTH = 160;
const MAX_REQUEST_ID_LENGTH = 128;
const MAX_JSON_BYTES_EACH = 8 * 1024;
const MAX_JSON_BYTES_TOTAL = 16 * 1024;
const DEFAULT_QUERY_LIMIT = 50;
const MAX_QUERY_LIMIT = 200;

const SECRET_KEY_PATTERN = /(password|passwd|secret|token|credential|api[_-]?key|authorization)/i;

function normalizeCode(value: string, field: "entityType" | "action"): string {
  const normalized = value.trim().toLowerCase();
  if (!CODE_PATTERN.test(normalized)) {
    throw new Error(`INVALID_AUDIT_${field === "entityType" ? "ENTITY_TYPE" : "ACTION"}`);
  }
  return normalized;
}

function normalizeEntityKey(value: string): string {
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > MAX_ENTITY_KEY_LENGTH) {
    throw new Error("INVALID_AUDIT_ENTITY_KEY");
  }
  return normalized;
}

function normalizeOptionalText(value: string | null | undefined, maxLength = 80): string | null {
  if (value == null) return null;
  const normalized = value.trim();
  if (normalized.length === 0) return null;
  if (normalized.length > maxLength) throw new Error("AUDIT_TEXT_TOO_LONG");
  return normalized;
}

function assertJsonCompatible(value: unknown, path = "payload"): asserts value is AuditJsonValue {
  if (value == null || typeof value === "string" || typeof value === "boolean") return;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error(`AUDIT_NON_JSON_VALUE:${path}`);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertJsonCompatible(item, `${path}[${index}]`));
    return;
  }
  if (typeof value !== "object") {
    throw new Error(`AUDIT_NON_JSON_VALUE:${path}`);
  }

  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`AUDIT_SECRET_FIELD_REJECTED:${path}.${key}`);
    }
    assertJsonCompatible(nested, `${path}.${key}`);
  }
}

function encodePayload(value: AuditInputPayload | null | undefined): { json: string | null; bytes: number } {
  if (value == null) return { json: null, bytes: 0 };
  assertJsonCompatible(value);
  const json = JSON.stringify(value);
  const bytes = new TextEncoder().encode(json).byteLength;
  if (bytes > MAX_JSON_BYTES_EACH) {
    throw new Error("AUDIT_PAYLOAD_TOO_LARGE");
  }
  return { json, bytes };
}

function parsePayload(value: string | null): AuditPayload | null {
  if (!value) return null;
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    return parsed as AuditPayload;
  } catch {
    return null;
  }
}

function normalizeLimit(value: number | undefined): number {
  if (value == null) return DEFAULT_QUERY_LIMIT;
  if (!Number.isInteger(value) || value < 1 || value > MAX_QUERY_LIMIT) {
    throw new Error("INVALID_AUDIT_QUERY_LIMIT");
  }
  return value;
}

function normalizedAuditValues(input: AuditEventInput): readonly AuditSqlScalar[] {
  const entityType = normalizeCode(input.entityType, "entityType");
  const entityKey = normalizeEntityKey(input.entityKey);
  const action = normalizeCode(input.action, "action");
  const statusFrom = normalizeOptionalText(input.statusFrom);
  const statusTo = normalizeOptionalText(input.statusTo);
  const requestId = normalizeOptionalText(input.requestId, MAX_REQUEST_ID_LENGTH);
  const occurredAt = input.occurredAt?.trim() || new Date().toISOString();

  const before = encodePayload(input.before);
  const after = encodePayload(input.after);
  const metadata = encodePayload(input.metadata);
  if (before.bytes + after.bytes + metadata.bytes > MAX_JSON_BYTES_TOTAL) {
    throw new Error("AUDIT_PAYLOAD_TOTAL_TOO_LARGE");
  }

  return [
    entityType,
    entityKey,
    action,
    input.actorEmployeeId ?? null,
    occurredAt,
    statusFrom,
    statusTo,
    requestId,
    before.json,
    after.json,
    metadata.json,
  ];
}

export class AuditService {
  constructor(private readonly db: D1Database) {}

  prepareRecord(input: AuditEventInput, condition?: AuditInsertCondition): D1PreparedStatement {
    const values = normalizedAuditValues(input);
    const columns = `
      entity_type,
      entity_key,
      action,
      actor_employee_id,
      occurred_at,
      status_from,
      status_to,
      request_id,
      before_json,
      after_json,
      metadata_json
    `;

    if (!condition) {
      return this.db.prepare(`
        INSERT INTO audit_events (${columns})
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(...values);
    }

    const conditionSql = condition.sql.trim();
    if (!conditionSql || conditionSql.includes(";")) {
      throw new Error("INVALID_AUDIT_INSERT_CONDITION");
    }

    return this.db.prepare(`
      INSERT INTO audit_events (${columns})
      SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE (${conditionSql})
    `).bind(...values, ...(condition.values ?? []));
  }

  async record(input: AuditEventInput): Promise<number> {
    const result = await this.prepareRecord(input).run();
    const id = Number(result.meta.last_row_id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("AUDIT_INSERT_FAILED");
    return id;
  }

  async listTimeline(entityType: string, entityKey: string, limit = 30): Promise<AuditTimelineItem[]> {
    const normalizedType = normalizeCode(entityType, "entityType");
    const normalizedKey = normalizeEntityKey(entityKey);
    const normalizedLimit = Math.min(normalizeLimit(limit), 100);

    const result = await this.db
      .prepare(
        `SELECT ae.id,
                ae.action,
                ae.actor_employee_id,
                am.employee_no AS actor_employee_no,
                ae.occurred_at,
                ae.status_from,
                ae.status_to
           FROM audit_events AS ae
           LEFT JOIN app_members AS am ON am.id = ae.actor_employee_id
          WHERE ae.entity_type = ?1
            AND ae.entity_key = ?2
          ORDER BY ae.occurred_at DESC, ae.id DESC
          LIMIT ?3`,
      )
      .bind(normalizedType, normalizedKey, normalizedLimit)
      .all<{
        id: number;
        action: string;
        actor_employee_id: number | null;
        actor_employee_no: string | null;
        occurred_at: string;
        status_from: string | null;
        status_to: string | null;
      }>();

    return (result.results ?? []).map((row) => ({
      id: row.id,
      action: row.action,
      actorEmployeeId: row.actor_employee_id,
      actorEmployeeNo: row.actor_employee_no,
      occurredAt: row.occurred_at,
      statusFrom: row.status_from,
      statusTo: row.status_to,
    }));
  }

  async listDetailed(query: AuditQuery): Promise<AuditEventRecord[]> {
    return (await this.listDetailedPage(query)).events;
  }

  async listActors(): Promise<{ id: number; employeeNo: string | null; displayName: string | null }[]> {
    const rows = await this.db.prepare(`SELECT DISTINCT m.id, m.employee_no, m.display_name FROM app_members m
      JOIN audit_events ae ON ae.actor_employee_id = m.id ORDER BY COALESCE(m.display_name,m.employee_no),m.id`)
      .all<{ id: number; employee_no: string | null; display_name: string | null }>();
    return (rows.results ?? []).map(r => ({ id:r.id, employeeNo:r.employee_no, displayName:r.display_name }));
  }

  async listDetailedPage(query: AuditQuery): Promise<{ events: AuditEventRecord[]; nextCursor: string | null }> {
    const where: string[] = [];
    const values: AuditSqlScalar[] = [];

    const bind = (value: AuditSqlScalar): string => {
      values.push(value);
      return `?${values.length}`;
    };

    // ERP query lifecycle events are operational noise, except for a Super Admin
    // who explicitly opts in. Submission events remain hidden even then.
    where.push(query.includeErpQueries
      ? "(ae.entity_type <> 'erp_item_query' OR ae.action <> 'erp_item_query.created')"
      : "ae.entity_type <> 'erp_item_query'");
    if (!query.includeHrEvents) where.push("ae.entity_type NOT LIKE 'hr_%'");
    if (query.entityType) where.push(`ae.entity_type = ${bind(normalizeCode(query.entityType, "entityType"))}`);
    if (query.entityKey) where.push(`ae.entity_key = ${bind(normalizeEntityKey(query.entityKey))}`);
    if (query.action) where.push(`ae.action = ${bind(normalizeCode(query.action, "action"))}`);
    if (query.actorEmployeeId != null) {
      if (!Number.isInteger(query.actorEmployeeId) || query.actorEmployeeId <= 0) {
        throw new Error("INVALID_AUDIT_ACTOR_ID");
      }
      where.push(`ae.actor_employee_id = ${bind(query.actorEmployeeId)}`);
    }
    if (query.occurredFrom) where.push(`ae.occurred_at >= ${bind(query.occurredFrom.trim())}`);
    if (query.occurredTo) where.push(`ae.occurred_at <= ${bind(query.occurredTo.trim())}`);
    if (query.entityTypes?.length) {
      const types = [...new Set(query.entityTypes.map(type => normalizeCode(type, "entityType")))];
      where.push(`ae.entity_type IN (${types.map(type => bind(type)).join(",")})`);
    }
    if (query.q?.trim()) {
      const term = bind(query.q.trim().slice(0, 100));
      where.push(`(instr(ae.entity_key, ${term}) > 0 OR
        instr(COALESCE(ae.before_json,''), ${term}) > 0 OR
        instr(COALESCE(ae.after_json,''), ${term}) > 0)`);
    }
    if (query.relatedCustomerId != null) {
      if (!Number.isSafeInteger(query.relatedCustomerId) || query.relatedCustomerId < 1) throw new Error("INVALID_CUSTOMER_ID");
      const cid = String(query.relatedCustomerId);
      where.push(`((ae.entity_type = 'customer' AND ae.entity_key = ${bind(cid)}) OR
        (ae.entity_type IN ('customer_visit','customer_item_quote','customer_frequent_item')
          AND json_valid(COALESCE(ae.metadata_json,'{}'))
          AND CAST(json_extract(ae.metadata_json,'$.customerId') AS TEXT) = ${bind(cid)}))`);
    }
    if (query.cursor) {
      let stamp: string, id: number;
      try {
        const decoded = atob(query.cursor.replace(/-/g,"+").replace(/_/g,"/"));
        [stamp, id] = JSON.parse(decoded) as [string, number];
      } catch { throw new Error("INVALID_AUDIT_CURSOR"); }
      if (typeof stamp !== "string" || stamp.length > 50 || !Number.isSafeInteger(id) || id < 1) throw new Error("INVALID_AUDIT_CURSOR");
      where.push(`(ae.occurred_at < ${bind(stamp)} OR (ae.occurred_at = ${bind(stamp)} AND ae.id < ${bind(id)}))`);
    }

    const limit = normalizeLimit(query.limit);
    const sql = `SELECT ae.*, m.employee_no AS actor_employee_no, m.display_name AS actor_display_name
                   FROM audit_events ae
                   LEFT JOIN app_members m ON m.id = ae.actor_employee_id
                  ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
                  ORDER BY ae.occurred_at DESC, ae.id DESC
                  LIMIT ${bind(limit + 1)}`;

    const statement = this.db.prepare(sql);
    const result = await statement.bind(...values).all<{
      id: number;
      entity_type: string;
      entity_key: string;
      action: string;
      actor_employee_id: number | null;
      actor_employee_no: string | null;
      actor_display_name: string | null;
      occurred_at: string;
      status_from: string | null;
      status_to: string | null;
      request_id: string | null;
      before_json: string | null;
      after_json: string | null;
      metadata_json: string | null;
    }>();

    const page = result.results ?? [];
    const visible = page.slice(0, limit);
    const last = visible.at(-1);
    const nextCursor = page.length > limit && last ? btoa(JSON.stringify([last.occurred_at,last.id])).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/,"") : null;
    return { events: visible.map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityKey: row.entity_key,
      action: row.action,
      actorEmployeeId: row.actor_employee_id,
      actor: row.actor_employee_id == null ? null : { id: row.actor_employee_id, employeeNo: row.actor_employee_no, displayName: row.actor_display_name },
      occurredAt: row.occurred_at,
      statusFrom: row.status_from,
      statusTo: row.status_to,
      requestId: row.request_id,
      before: parsePayload(row.before_json),
      after: parsePayload(row.after_json),
      metadata: parsePayload(row.metadata_json),
    })), nextCursor };
  }
}
