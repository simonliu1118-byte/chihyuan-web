import type {
  DefectDetail,
  DefectListResult,
  DefectSearchQuery,
  DefectStatusCode,
  DefectSummary,
} from "../../shared/defect";

type D1Scalar = string | number | null;

type DefectRow = {
  id: number;
  reported_date: string;
  customer_id: number;
  customer_no_snapshot: string | null;
  customer_name_snapshot: string;
  item_id: number;
  item_no_snapshot: string;
  item_name_snapshot: string;
  spec_snapshot: string | null;
  owner_employee_id: number;
  owner_employee_no: string | null;
  defect_description: string;
  handling: string | null;
  status_code: DefectStatusCode;
  invalidated_at: string | null;
  invalidated_by: number | null;
  created_at: string;
  created_by: number | null;
  updated_at: string;
  revision: number;
};

export interface DefectReferenceSnapshot {
  customer: {
    id: number;
    customerNo: string | null;
    customerName: string;
  } | null;
  item: {
    id: number;
    itemNo: string;
    itemName: string;
    spec: string | null;
  } | null;
  owner: {
    id: number;
    employeeNo: string | null;
  } | null;
}

export interface DefectRecordState {
  id: number;
  statusCode: DefectStatusCode;
  revision: number;
  createdByEmployeeId: number | null;
  invalidatedAt: string | null;
}

const DEFECT_SELECT = `
  SELECT d.id,
         d.reported_date,
         d.customer_id,
         d.customer_no_snapshot,
         d.customer_name_snapshot,
         d.item_id,
         d.item_no_snapshot,
         d.item_name_snapshot,
         d.spec_snapshot,
         d.owner_employee_id,
         am.employee_no AS owner_employee_no,
         d.defect_description,
         d.handling,
         d.status_code,
         d.invalidated_at,
         d.invalidated_by,
         d.created_at,
         d.created_by,
         d.updated_at,
         d.revision
    FROM defect_reports AS d
    LEFT JOIN app_members AS am ON am.id = d.owner_employee_id
`;

function toSummary(row: DefectRow): DefectSummary {
  return {
    id: row.id,
    reportedDate: row.reported_date,
    customerId: row.customer_id,
    customerNoSnapshot: row.customer_no_snapshot,
    customerNameSnapshot: row.customer_name_snapshot,
    itemId: row.item_id,
    itemNoSnapshot: row.item_no_snapshot,
    itemNameSnapshot: row.item_name_snapshot,
    specSnapshot: row.spec_snapshot,
    ownerEmployee: {
      id: row.owner_employee_id,
      employeeNo: row.owner_employee_no,
      displayName: null,
    },
    defectDescription: row.defect_description,
    handling: row.handling,
    statusCode: row.status_code,
    invalidatedAt: row.invalidated_at,
    invalidatedByEmployeeId: row.invalidated_by,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
}

function normalizeLimit(value: number | undefined): number {
  if (value == null || !Number.isInteger(value) || value <= 0) return 30;
  return Math.min(value, 100);
}

function positive(value: number | undefined): number | null {
  return value != null && Number.isInteger(value) && value > 0 ? value : null;
}

function encodeCursor(id: number): string {
  return btoa(String(id)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function decodeCursor(cursor: string | undefined): number | null {
  if (!cursor) return null;
  if (!/^[A-Za-z0-9_-]{1,32}$/.test(cursor)) return null;
  try {
    const normalized = cursor.replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
    const id = Number(atob(padded));
    return Number.isSafeInteger(id) && id > 0 ? id : null;
  } catch {
    return null;
  }
}

function isIsoDate(value: string | undefined): value is string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

export class DefectRepository {
  constructor(private readonly db: D1Database) {}

  async search(query: DefectSearchQuery): Promise<DefectListResult> {
    const where: string[] = [];
    const params: D1Scalar[] = [];
    const keyword = query.q?.trim() ?? "";

    if (keyword) {
      const like = `%${escapeLike(keyword)}%`;
      where.push(`(
        d.customer_no_snapshot LIKE ? ESCAPE '\\'
        OR d.customer_name_snapshot LIKE ? ESCAPE '\\'
        OR d.item_no_snapshot LIKE ? ESCAPE '\\'
        OR d.item_name_snapshot LIKE ? ESCAPE '\\'
        OR d.defect_description LIKE ? ESCAPE '\\'
        OR d.handling LIKE ? ESCAPE '\\'
      )`);
      params.push(like, like, like, like, like, like);
    }

    const filters: readonly [string, number | null][] = [
      ["d.customer_id", positive(query.customerId)],
      ["d.item_id", positive(query.itemId)],
      ["d.owner_employee_id", positive(query.ownerEmployeeId)],
    ];
    for (const [column, value] of filters) {
      if (value == null) continue;
      where.push(`${column} = ?`);
      params.push(value);
    }

    if (query.statusCode && ["created", "processing", "resolved"].includes(query.statusCode)) {
      where.push("d.status_code = ?");
      params.push(query.statusCode);
    }

    if (query.includeInvalid !== true) {
      where.push("d.invalidated_at IS NULL");
    }

    if (isIsoDate(query.reportedFrom)) {
      where.push("d.reported_date >= ?");
      params.push(query.reportedFrom);
    }
    if (isIsoDate(query.reportedTo)) {
      where.push("d.reported_date <= ?");
      params.push(query.reportedTo);
    }

    const cursorId = decodeCursor(query.cursor);
    if (query.cursor && cursorId == null) return { items: [], nextCursor: null };
    if (cursorId != null) {
      where.push("d.id < ?");
      params.push(cursorId);
    }

    const limit = normalizeLimit(query.limit);
    params.push(limit + 1);
    const result = await this.db.prepare(`${DEFECT_SELECT}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY d.id DESC
      LIMIT ?
    `).bind(...params).all<DefectRow>();
    const rows = result.results ?? [];
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible[visible.length - 1];
    return {
      items: visible.map(toSummary),
      nextCursor: hasMore && last ? encodeCursor(last.id) : null,
    };
  }

  async getDetail(defectId: number): Promise<DefectDetail | null> {
    const row = await this.db.prepare(`${DEFECT_SELECT} WHERE d.id = ? LIMIT 1`)
      .bind(defectId)
      .first<DefectRow>();
    if (!row) return null;
    return {
      ...toSummary(row),
      createdAt: row.created_at,
      createdByEmployeeId: row.created_by,
    };
  }

  async getRecordState(defectId: number): Promise<DefectRecordState | null> {
    const row = await this.db.prepare(`
      SELECT id, status_code, revision, created_by, invalidated_at
        FROM defect_reports
       WHERE id = ?
       LIMIT 1
    `).bind(defectId).first<{
      id: number;
      status_code: DefectStatusCode;
      revision: number;
      created_by: number | null;
      invalidated_at: string | null;
    }>();
    if (!row) return null;
    return {
      id: row.id,
      statusCode: row.status_code,
      revision: row.revision,
      createdByEmployeeId: row.created_by,
      invalidatedAt: row.invalidated_at,
    };
  }

  async resolveReferences(
    customerId: number,
    itemId: number,
    ownerEmployeeId: number,
  ): Promise<DefectReferenceSnapshot> {
    const results = await this.db.batch([
      this.db.prepare(`
        SELECT id, customer_no, short_name
          FROM customers
         WHERE id = ?
         LIMIT 1
      `).bind(customerId),
      this.db.prepare(`
        SELECT id, item_no, name, spec
          FROM items
         WHERE id = ?
         LIMIT 1
      `).bind(itemId),
      this.db.prepare(`
        SELECT id, employee_no
          FROM app_members
         WHERE id = ?
           AND is_active = 1
         LIMIT 1
      `).bind(ownerEmployeeId),
    ]);

    const customer = results[0]?.results?.[0] as {
      id: number;
      customer_no: string | null;
      short_name: string;
    } | undefined;
    const item = results[1]?.results?.[0] as {
      id: number;
      item_no: string;
      name: string;
      spec: string | null;
    } | undefined;
    const owner = results[2]?.results?.[0] as {
      id: number;
      employee_no: string | null;
    } | undefined;

    return {
      customer: customer ? {
        id: customer.id,
        customerNo: customer.customer_no,
        customerName: customer.short_name,
      } : null,
      item: item ? {
        id: item.id,
        itemNo: item.item_no,
        itemName: item.name,
        spec: item.spec,
      } : null,
      owner: owner ? {
        id: owner.id,
        employeeNo: owner.employee_no,
      } : null,
    };
  }
}
