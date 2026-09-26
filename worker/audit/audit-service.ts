export type AuditJsonPrimitive = string | number | boolean | null;
export type AuditJsonValue =
  | AuditJsonPrimitive
  | AuditJsonValue[]
  | { [key: string]: AuditJsonValue };

export type AuditPayload = Record<string, AuditJsonValue>;

export interface AuditEventInput {
  entityType: string;
  entityKey: string;
  action: string;
  actorEmployeeId?: number | null;
  occurredAt?: string;
  statusFrom?: string | null;
  statusTo?: string | null;
  requestId?: string | null;
  before?: AuditPayload | null;
  after?: AuditPayload | null;
  metadata?: AuditPayload | null;
}

export interface AuditEventRecord {
  id: number;
  entityType: string;
  entityKey: string;
  action: string;
  actorEmployeeId: number | null;
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

function assertNoSecretKeys(value: AuditJsonValue, path = "payload"): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoSecretKeys(item, `${path}[${index}]`));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, nested] of Object.entries(value)) {
    if (SECRET_KEY_PATTERN.test(key)) {
      throw new Error(`AUDIT_SECRET_FIELD_REJECTED:${path}.${key}`);
    }
    assertNoSecretKeys(nested, `${path}.${key}`);
  }
}

function encodePayload(value: AuditPayload | null | undefined): { json: string | null; bytes: number } {
  if (value == null) return { json: null, bytes: 0 };
  assertNoSecretKeys(value);
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

export class AuditService {
  constructor(private readonly db: D1Database) {}

  async record(input: AuditEventInput): Promise<number> {
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

    const result = await this.db
      .prepare(
        `INSERT INTO audit_events (
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
         ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)`,
      )
      .bind(
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
      )
      .run();

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
    const where: string[] = [];
    const values: unknown[] = [];

    const bind = (value: unknown): string => {
      values.push(value);
      return `?${values.length}`;
    };

    if (query.entityType) where.push(`entity_type = ${bind(normalizeCode(query.entityType, "entityType"))}`);
    if (query.entityKey) where.push(`entity_key = ${bind(normalizeEntityKey(query.entityKey))}`);
    if (query.action) where.push(`action = ${bind(normalizeCode(query.action, "action"))}`);
    if (query.actorEmployeeId != null) {
      if (!Number.isInteger(query.actorEmployeeId) || query.actorEmployeeId <= 0) {
        throw new Error("INVALID_AUDIT_ACTOR_ID");
      }
      where.push(`actor_employee_id = ${bind(query.actorEmployeeId)}`);
    }
    if (query.occurredFrom) where.push(`occurred_at >= ${bind(query.occurredFrom.trim())}`);
    if (query.occurredTo) where.push(`occurred_at <= ${bind(query.occurredTo.trim())}`);

    const limit = normalizeLimit(query.limit);
    const sql = `SELECT id,
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
                   FROM audit_events
                  ${where.length > 0 ? `WHERE ${where.join(" AND ")}` : ""}
                  ORDER BY occurred_at DESC, id DESC
                  LIMIT ${bind(limit)}`;

    const statement = this.db.prepare(sql);
    const result = await statement.bind(...values).all<{
      id: number;
      entity_type: string;
      entity_key: string;
      action: string;
      actor_employee_id: number | null;
      occurred_at: string;
      status_from: string | null;
      status_to: string | null;
      request_id: string | null;
      before_json: string | null;
      after_json: string | null;
      metadata_json: string | null;
    }>();

    return (result.results ?? []).map((row) => ({
      id: row.id,
      entityType: row.entity_type,
      entityKey: row.entity_key,
      action: row.action,
      actorEmployeeId: row.actor_employee_id,
      occurredAt: row.occurred_at,
      statusFrom: row.status_from,
      statusTo: row.status_to,
      requestId: row.request_id,
      before: parsePayload(row.before_json),
      after: parsePayload(row.after_json),
      metadata: parsePayload(row.metadata_json),
    }));
  }
}
