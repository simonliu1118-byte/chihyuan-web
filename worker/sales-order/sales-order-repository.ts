import type {
  SalesWorkOrderDetail,
  SalesWorkOrderLine,
  SalesWorkOrderListResult,
  SalesWorkOrderSearchQuery,
  SalesWorkOrderStatusCode,
  SalesWorkOrderSummary,
} from "../../shared/sales-work-order";
import { formatScaled4 } from "../../shared/fixed-point";

type D1Scalar = string | number | null;

type OrderRow = {
  id: number;
  work_order_ref: string;
  customer_id: number | null;
  customer_no_snapshot: string | null;
  customer_name_snapshot: string;
  order_date: string;
  operator_employee_id: number;
  operator_employee_no: string | null;
  note?: string | null;
  status_code: SalesWorkOrderStatusCode;
  erp_no: string | null;
  hide_price_on_sales_document: number;
  invoice_type_code: "two_copy" | "three_copy" | null;
  receipt_option_code: "with_receipt" | "without_receipt" | null;
  voided_at: string | null;
  created_at?: string;
  revision: number;
  updated_at: string;
};

type LineRow = {
  id: number;
  item_id: number;
  item_no_snapshot: string;
  item_name_snapshot: string;
  spec_snapshot: string | null;
  quantity: number;
  unit_snapshot: string;
  unit_price: number;
  note: string | null;
  sort_order: number;
};

export interface SalesWorkOrderRecordState {
  id: number;
  workOrderRef: string;
  customerId: number | null;
  customerNoSnapshot: string | null;
  customerNameSnapshot: string;
  statusCode: SalesWorkOrderStatusCode;
  erpNo: string | null;
  revision: number;
}

export interface SalesWorkOrderCustomerRef {
  id: number;
  customerNo: string | null;
  customerName: string;
}

export interface SalesWorkOrderItemRef {
  id: number;
  itemNo: string;
  itemName: string;
  spec: string | null;
  baseUnit: string;
  allowedUnits: ReadonlySet<string>;
}

export interface SalesWorkOrderOperatorRef {
  id: number;
  employeeNo: string | null;
}

const SELECT_FIELDS = `
  o.id,
  o.work_order_ref,
  o.customer_id,
  o.customer_no_snapshot,
  o.customer_name_snapshot,
  o.order_date,
  o.operator_employee_id,
  m.employee_no AS operator_employee_no,
  o.status_code,
  o.erp_no,
  o.hide_price_on_sales_document,
  o.invoice_type_code,
  o.receipt_option_code,
  o.voided_at,
  o.revision,
  o.updated_at
`;

const FROM_SQL = `
  FROM sales_work_orders AS o
  JOIN app_members AS m ON m.id = o.operator_employee_id
`;

function toSummary(row: OrderRow): SalesWorkOrderSummary {
  return {
    id: row.id,
    workOrderRef: row.work_order_ref,
    customerId: row.customer_id,
    customerNoSnapshot: row.customer_no_snapshot,
    customerNameSnapshot: row.customer_name_snapshot,
    orderDate: row.order_date,
    operator: {
      id: row.operator_employee_id,
      employeeNo: row.operator_employee_no,
      displayName: null,
    },
    statusCode: row.status_code,
    erpNo: row.erp_no,
    hidePriceOnSalesDocument: row.hide_price_on_sales_document === 1,
    invoiceTypeCode: row.invoice_type_code,
    receiptOptionCode: row.receipt_option_code,
    voidedAt: row.voided_at,
    revision: row.revision,
    updatedAt: row.updated_at,
  };
}

function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (match) => `\\${match}`);
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

function normalizeLimit(limit: number | undefined): number {
  if (limit == null || !Number.isInteger(limit) || limit < 1) return 30;
  return Math.min(limit, 100);
}

export class SalesWorkOrderRepository {
  constructor(private readonly db: D1Database) {}

  async search(query: SalesWorkOrderSearchQuery): Promise<SalesWorkOrderListResult> {
    const where: string[] = [];
    const params: D1Scalar[] = [];
    const keyword = query.q?.trim() ?? "";
    if (keyword) {
      const like = `%${escapeLike(keyword)}%`;
      where.push(`(
        o.work_order_ref LIKE ? ESCAPE '\\'
        OR o.erp_no LIKE ? ESCAPE '\\'
        OR o.customer_no_snapshot LIKE ? ESCAPE '\\'
        OR o.customer_name_snapshot LIKE ? ESCAPE '\\'
      )`);
      params.push(like, like, like, like);
    }
    if (query.statusCode) {
      where.push("o.status_code = ?");
      params.push(query.statusCode);
    }
    if (query.customerId != null && Number.isInteger(query.customerId) && query.customerId > 0) {
      where.push("o.customer_id = ?");
      params.push(query.customerId);
    }
    if (query.operatorEmployeeId != null && Number.isInteger(query.operatorEmployeeId) && query.operatorEmployeeId > 0) {
      where.push("o.operator_employee_id = ?");
      params.push(query.operatorEmployeeId);
    }
    if (query.orderDateFrom) {
      where.push("o.order_date >= ?");
      params.push(query.orderDateFrom);
    }
    if (query.orderDateTo) {
      where.push("o.order_date <= ?");
      params.push(query.orderDateTo);
    }

    const cursorId = decodeCursor(query.cursor);
    if (query.cursor && cursorId == null) return { items: [], nextCursor: null };
    if (cursorId != null) {
      where.push("o.id < ?");
      params.push(cursorId);
    }

    const limit = normalizeLimit(query.limit);
    params.push(limit + 1);
    const result = await this.db.prepare(`
      SELECT ${SELECT_FIELDS}
      ${FROM_SQL}
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY o.id DESC
      LIMIT ?
    `).bind(...params).all<OrderRow>();

    const rows = result.results ?? [];
    const hasMore = rows.length > limit;
    const visible = hasMore ? rows.slice(0, limit) : rows;
    const last = visible[visible.length - 1];
    return {
      items: visible.map(toSummary),
      nextCursor: hasMore && last ? encodeCursor(last.id) : null,
    };
  }

  async getDetail(orderId: number): Promise<SalesWorkOrderDetail | null> {
    const results = await this.db.batch([
      this.db.prepare(`
        SELECT ${SELECT_FIELDS}, o.note, o.created_at
        ${FROM_SQL}
        WHERE o.id = ?
        LIMIT 1
      `).bind(orderId),
      this.db.prepare(`
        SELECT id, item_id, item_no_snapshot, item_name_snapshot, spec_snapshot,
               quantity, unit_snapshot, unit_price, note, sort_order
          FROM sales_work_order_items
         WHERE sales_work_order_id = ?
         ORDER BY sort_order ASC, id ASC
      `).bind(orderId),
    ]);
    const master = (results[0]?.results?.[0] ?? null) as OrderRow | null;
    if (!master) return null;
    const lines = (results[1]?.results ?? []) as LineRow[];
    return {
      ...toSummary(master),
      note: master.note ?? null,
      createdAt: master.created_at ?? master.updated_at,
      lines: lines.map<SalesWorkOrderLine>((row) => ({
        id: row.id,
        itemId: row.item_id,
        itemNoSnapshot: row.item_no_snapshot,
        itemNameSnapshot: row.item_name_snapshot,
        specSnapshot: row.spec_snapshot,
        quantity: formatScaled4(row.quantity),
        unitSnapshot: row.unit_snapshot,
        unitPrice: formatScaled4(row.unit_price),
        note: row.note,
        sortOrder: row.sort_order,
      })),
    };
  }

  async getRecordState(orderId: number): Promise<SalesWorkOrderRecordState | null> {
    const row = await this.db.prepare(`
      SELECT id, work_order_ref, customer_id, customer_no_snapshot, customer_name_snapshot,
             status_code, erp_no, revision
        FROM sales_work_orders
       WHERE id = ?
       LIMIT 1
    `).bind(orderId).first<{
      id: number;
      work_order_ref: string;
      customer_id: number | null;
      customer_no_snapshot: string | null;
      customer_name_snapshot: string;
      status_code: SalesWorkOrderStatusCode;
      erp_no: string | null;
      revision: number;
    }>();
    return row ? {
      id: row.id,
      workOrderRef: row.work_order_ref,
      customerId: row.customer_id,
      customerNoSnapshot: row.customer_no_snapshot,
      customerNameSnapshot: row.customer_name_snapshot,
      statusCode: row.status_code,
      erpNo: row.erp_no,
      revision: row.revision,
    } : null;
  }

  async resolveCustomerById(customerId: number): Promise<SalesWorkOrderCustomerRef | null> {
    const row = await this.db.prepare(`
      SELECT id, customer_no, short_name
        FROM customers
       WHERE id = ?
       LIMIT 1
    `).bind(customerId).first<{ id: number; customer_no: string | null; short_name: string }>();
    return row ? { id: row.id, customerNo: row.customer_no, customerName: row.short_name } : null;
  }

  async resolveCustomerByNumber(customerNo: string): Promise<SalesWorkOrderCustomerRef | null> {
    const row = await this.db.prepare(`
      SELECT id, customer_no, short_name
        FROM customers
       WHERE customer_no = ?
       LIMIT 1
    `).bind(customerNo).first<{ id: number; customer_no: string | null; short_name: string }>();
    return row ? { id: row.id, customerNo: row.customer_no, customerName: row.short_name } : null;
  }

  async resolveOperator(employeeId: number): Promise<SalesWorkOrderOperatorRef | null> {
    const row = await this.db.prepare(`
      SELECT id, employee_no
        FROM app_members
       WHERE id = ? AND is_active = 1
       LIMIT 1
    `).bind(employeeId).first<{ id: number; employee_no: string | null }>();
    return row ? { id: row.id, employeeNo: row.employee_no } : null;
  }

  async resolveItems(itemIds: readonly number[]): Promise<Map<number, SalesWorkOrderItemRef>> {
    const ids = [...new Set(itemIds.filter((id) => Number.isInteger(id) && id > 0))];
    if (ids.length === 0) return new Map();
    const placeholders = ids.map(() => "?").join(", ");
    const [itemResult, conversionResult] = await this.db.batch([
      this.db.prepare(`
        SELECT id, item_no, name, spec, base_unit
          FROM items
         WHERE id IN (${placeholders})
      `).bind(...ids),
      this.db.prepare(`
        SELECT item_id, from_unit
          FROM item_unit_conversions
         WHERE item_id IN (${placeholders})
      `).bind(...ids),
    ]);

    const unitMap = new Map<number, Set<string>>();
    for (const raw of conversionResult?.results ?? []) {
      const row = raw as { item_id: number; from_unit: string };
      const set = unitMap.get(row.item_id) ?? new Set<string>();
      set.add(row.from_unit);
      unitMap.set(row.item_id, set);
    }

    const entries = (itemResult?.results ?? []).map((raw) => {
      const row = raw as {
        id: number;
        item_no: string;
        name: string;
        spec: string | null;
        base_unit: string;
      };
      const allowedUnits = unitMap.get(row.id) ?? new Set<string>();
      allowedUnits.add(row.base_unit);
      return [row.id, {
        id: row.id,
        itemNo: row.item_no,
        itemName: row.name,
        spec: row.spec,
        baseUnit: row.base_unit,
        allowedUnits,
      }] as const;
    });
    return new Map(entries);
  }
}
