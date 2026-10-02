import type { SalesWorkOrderStatusCode } from "../../shared/sales-work-order";
import { AuditService } from "../audit/audit-service";
import type {
  SalesWorkOrderCustomerRef,
  SalesWorkOrderItemRef,
  SalesWorkOrderRecordState,
} from "./sales-order-repository";
import type {
  NormalizedFillOrCorrectErpRequest,
  NormalizedSalesWorkOrderProfile,
  NormalizedSalesWorkOrderTransitionRequest,
  NormalizedUpdateSalesWorkOrderRequest,
} from "./sales-order-validation";

export interface SalesWorkOrderMutationContext {
  actorMemberId: number;
  now: string;
  requestId?: string | null;
  allowHardDelete?: boolean;
  allowShipmentReversal?: boolean;
}

export interface ResolvedSalesWorkOrderProfile {
  customer: SalesWorkOrderCustomerRef | null;
  customerNameOnly: string | null;
  itemById: ReadonlyMap<number, SalesWorkOrderItemRef>;
}

function assertContext(context: SalesWorkOrderMutationContext): void {
  if (!Number.isInteger(context.actorMemberId) || context.actorMemberId <= 0) {
    throw new Error("SALES_WORK_ORDER_MUTATION_ACTOR_REQUIRED");
  }
  if (!context.now || Number.isNaN(Date.parse(context.now))) {
    throw new Error("SALES_WORK_ORDER_MUTATION_TIMESTAMP_REQUIRED");
  }
}

function customerSnapshot(resolved: ResolvedSalesWorkOrderProfile): {
  id: number | null;
  customerNo: string | null;
  customerName: string;
} {
  if (resolved.customer) {
    return {
      id: resolved.customer.id,
      customerNo: resolved.customer.customerNo,
      customerName: resolved.customer.customerName,
    };
  }
  if (!resolved.customerNameOnly) throw new Error("SALES_WORK_ORDER_CUSTOMER_UNRESOLVED");
  return { id: null, customerNo: null, customerName: resolved.customerNameOnly };
}

function lineStatements(
  db: D1Database,
  input: NormalizedSalesWorkOrderProfile,
  resolved: ResolvedSalesWorkOrderProfile,
  orderIdSql: string,
  orderIdValues: readonly (string | number | null)[],
  revisionGate?: { orderId: number; expectedRevision: number },
): D1PreparedStatement[] {
  return input.lines.map((line) => {
    const item = resolved.itemById.get(line.itemId);
    if (!item) throw new Error(`SALES_WORK_ORDER_ITEM_UNRESOLVED:${line.itemId}`);
    const gateSql = revisionGate
      ? `AND EXISTS (
           SELECT 1 FROM sales_work_orders
            WHERE id = ? AND revision = ? AND status_code = 'created' AND erp_no IS NULL
         )`
      : "";
    return db.prepare(`
      INSERT INTO sales_work_order_items (
        sales_work_order_id, item_id, item_no_snapshot, item_name_snapshot, spec_snapshot,
        quantity, unit_snapshot, unit_price, note, sort_order
      )
      SELECT ${orderIdSql}, ?, ?, ?, ?, ?, ?, ?, ?, ?
       WHERE 1 = 1
       ${gateSql}
    `).bind(
      ...orderIdValues,
      item.id,
      item.itemNo,
      item.itemName,
      item.spec,
      line.quantity,
      line.unit,
      line.unitPrice,
      line.note,
      line.sortOrder,
      ...(revisionGate ? [revisionGate.orderId, revisionGate.expectedRevision] : []),
    );
  });
}

export class SalesWorkOrderPersistence {
  private readonly audit: AuditService;

  constructor(private readonly db: D1Database) {
    this.audit = new AuditService(db);
  }

  async create(
    workOrderRef: string,
    input: NormalizedSalesWorkOrderProfile,
    resolved: ResolvedSalesWorkOrderProfile,
    context: SalesWorkOrderMutationContext,
  ): Promise<number> {
    assertContext(context);
    const customer = customerSnapshot(resolved);
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`
        INSERT INTO sales_work_orders (
          work_order_ref,
          customer_id, customer_no_snapshot, customer_name_snapshot,
          order_date, operator_employee_id, note, status_code, erp_no,
          hide_price_on_sales_document, invoice_type_code, receipt_option_code,
          created_at, created_by, updated_at, updated_by, revision
        ) VALUES (
          ?1,
          ?2, ?3, ?4,
          ?5, ?6, ?7, 'created', NULL,
          ?8, ?9, ?10,
          ?11, ?12, ?11, ?12, 1
        )
      `).bind(
        workOrderRef,
        customer.id,
        customer.customerNo,
        customer.customerName,
        input.orderDate,
        input.operatorEmployeeId,
        input.note,
        input.hidePriceOnSalesDocument ? 1 : 0,
        input.invoiceTypeCode,
        input.receiptOptionCode,
        context.now,
        context.actorMemberId,
      ),
      ...lineStatements(
        this.db,
        input,
        resolved,
        "(SELECT MAX(id) FROM sales_work_orders)",
        [],
      ),
      this.db.prepare("SELECT MAX(id) AS order_id FROM sales_work_orders"),
    ];
    const results = await this.db.batch(statements);
    const row = results[results.length - 1]?.results?.[0] as { order_id?: number } | undefined;
    const orderId = Number(row?.order_id ?? 0);
    if (!Number.isSafeInteger(orderId) || orderId <= 0) {
      throw new Error("SALES_WORK_ORDER_CREATE_ID_UNAVAILABLE");
    }
    return orderId;
  }

  async updateDraft(
    orderId: number,
    input: NormalizedUpdateSalesWorkOrderRequest,
    resolved: ResolvedSalesWorkOrderProfile,
    context: SalesWorkOrderMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const customer = customerSnapshot(resolved);
    const gate = { orderId, expectedRevision: input.expectedRevision };
    const statements: D1PreparedStatement[] = [
      this.db.prepare(`
        DELETE FROM sales_work_order_items
         WHERE sales_work_order_id = ?1
           AND EXISTS (
             SELECT 1 FROM sales_work_orders
              WHERE id = ?1 AND revision = ?2 AND status_code = 'created' AND erp_no IS NULL
           )
      `).bind(orderId, input.expectedRevision),
      ...lineStatements(this.db, input, resolved, "?", [orderId], gate),
      this.db.prepare(`
        UPDATE sales_work_orders
           SET customer_id = ?1,
               customer_no_snapshot = ?2,
               customer_name_snapshot = ?3,
               order_date = ?4,
               operator_employee_id = ?5,
               note = ?6,
               hide_price_on_sales_document = ?7,
               invoice_type_code = ?8,
               receipt_option_code = ?9,
               updated_at = ?10,
               updated_by = ?11,
               revision = revision + 1
         WHERE id = ?12
           AND revision = ?13
           AND status_code = 'created'
           AND erp_no IS NULL
      `).bind(
        customer.id,
        customer.customerNo,
        customer.customerName,
        input.orderDate,
        input.operatorEmployeeId,
        input.note,
        input.hidePriceOnSalesDocument ? 1 : 0,
        input.invoiceTypeCode,
        input.receiptOptionCode,
        context.now,
        context.actorMemberId,
        orderId,
        input.expectedRevision,
      ),
    ];
    const results = await this.db.batch(statements);
    return Number(results[results.length - 1]?.meta?.changes ?? 0) === 1;
  }

  async fillOrCorrectErp(
    state: SalesWorkOrderRecordState,
    input: NormalizedFillOrCorrectErpRequest,
    customer: SalesWorkOrderCustomerRef,
    context: SalesWorkOrderMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const firstFill = state.statusCode === "created";
    const nextStatus: SalesWorkOrderStatusCode = firstFill ? "issued" : state.statusCode;
    const nextRevision = input.expectedRevision + 1;
    const action = firstFill ? "sales_work_order.erp.filled" : "sales_work_order.erp.corrected";

    // Audit immediately follows its guarded master UPDATE in this atomic batch.
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE sales_work_orders
           SET customer_id = ?1,
               customer_no_snapshot = ?2,
               customer_name_snapshot = ?3,
               erp_no = ?4,
               status_code = ?5,
               updated_at = ?6,
               updated_by = ?7,
               revision = revision + 1
         WHERE id = ?8
           AND revision = ?9
           AND status_code IN ('created', 'issued', 'waiting_stock', 'picked', 'shipped')
      `).bind(
        customer.id,
        customer.customerNo,
        customer.customerName,
        input.erpNo,
        nextStatus,
        context.now,
        context.actorMemberId,
        state.id,
        input.expectedRevision,
      ),
      this.audit.prepareRecord({
        entityType: "sales_work_order",
        entityKey: String(state.id),
        action,
        actorEmployeeId: context.actorMemberId,
        occurredAt: context.now,
        requestId: context.requestId,
        statusFrom: firstFill ? "created" : null,
        statusTo: firstFill ? "issued" : null,
        before: {
          customerId: state.customerId,
          customerNo: state.customerNoSnapshot,
          customerName: state.customerNameSnapshot,
          erpNo: state.erpNo,
        },
        after: {
          customerId: customer.id,
          customerNo: customer.customerNo,
          customerName: customer.customerName,
          erpNo: input.erpNo,
        },
        metadata: input.reason ? { reason: input.reason } : null,
      }, {
        sql: "changes() = 1 AND EXISTS (SELECT 1 FROM sales_work_orders WHERE id = ? AND revision = ? AND status_code = ? AND erp_no = ?)",
        values: [state.id, nextRevision, nextStatus, input.erpNo],
      }),
    ]);
    return Number(results[0]?.meta?.changes ?? 0) === 1;
  }

  async transition(
    state: SalesWorkOrderRecordState,
    toStatus: SalesWorkOrderStatusCode,
    action: string,
    input: NormalizedSalesWorkOrderTransitionRequest,
    context: SalesWorkOrderMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const nextRevision = input.expectedRevision + 1;
    const isVoid = toStatus === "voided";
    // Audit immediately follows its guarded master UPDATE in this atomic batch.
    const results = await this.db.batch([
      this.db.prepare(`
        UPDATE sales_work_orders
           SET status_code = ?1,
               voided_at = CASE WHEN ?1 = 'voided' THEN ?2 ELSE voided_at END,
               voided_by = CASE WHEN ?1 = 'voided' THEN ?3 ELSE voided_by END,
               updated_at = ?2,
               updated_by = ?3,
               revision = revision + 1
         WHERE id = ?4
           AND revision = ?5
           AND status_code = ?6
           AND erp_no IS NOT NULL
      `).bind(
        toStatus,
        context.now,
        context.actorMemberId,
        state.id,
        input.expectedRevision,
        state.statusCode,
      ),
      this.audit.prepareRecord({
        entityType: "sales_work_order",
        entityKey: String(state.id),
        action,
        actorEmployeeId: context.actorMemberId,
        occurredAt: context.now,
        requestId: context.requestId,
        statusFrom: state.statusCode,
        statusTo: toStatus,
        metadata: {
          ...(input.reason ? { reason: input.reason } : {}),
          ...(isVoid ? { erpNo: state.erpNo } : {}),
        },
      }, {
        sql: "changes() = 1 AND EXISTS (SELECT 1 FROM sales_work_orders WHERE id = ? AND revision = ? AND status_code = ?)",
        values: [state.id, nextRevision, toStatus],
      }),
    ]);
    return Number(results[0]?.meta?.changes ?? 0) === 1;
  }

  async deleteDraft(
    state: SalesWorkOrderRecordState,
    context: SalesWorkOrderMutationContext,
  ): Promise<boolean> {
    assertContext(context);
    const results = await this.db.batch([
      this.audit.prepareRecord({
        entityType: "sales_work_order",
        entityKey: String(state.id),
        action: "sales_work_order.deleted",
        actorEmployeeId: context.actorMemberId,
        occurredAt: context.now,
        requestId: context.requestId,
        before: {
          workOrderRef: state.workOrderRef,
          customerName: state.customerNameSnapshot,
          statusCode: state.statusCode,
          revision: state.revision,
        },
      }, {
        sql: "EXISTS (SELECT 1 FROM sales_work_orders WHERE id = ? AND revision = ? AND status_code = 'created' AND erp_no IS NULL)",
        values: [state.id, state.revision],
      }),
      this.db.prepare(`
        DELETE FROM sales_work_orders
         WHERE id = ?1
           AND revision = ?2
           AND status_code = 'created'
           AND erp_no IS NULL
        RETURNING id
      `).bind(state.id, state.revision),
    ]);
    // D1 meta.changes includes cascaded line deletions; returned master rows
    // identify this guarded deletion without misreporting success as conflict.
    return (results[1]?.results?.length ?? 0) === 1;
  }
}
