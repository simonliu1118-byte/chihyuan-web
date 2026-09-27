import type {
  SalesWorkOrderDetail,
  SalesWorkOrderListResult,
  SalesWorkOrderSearchQuery,
  SalesWorkOrderStatusCode,
} from "../../shared/sales-work-order";
import { FieldValidationError } from "../validation/fields";
import {
  SalesWorkOrderPersistence,
  type ResolvedSalesWorkOrderProfile,
  type SalesWorkOrderMutationContext,
} from "./sales-order-persistence";
import {
  SalesWorkOrderRepository,
  type SalesWorkOrderRecordState,
} from "./sales-order-repository";
import {
  normalizeCreateSalesWorkOrderRequest,
  normalizeDeleteSalesWorkOrderRequest,
  normalizeFillOrCorrectErpRequest,
  normalizeSalesWorkOrderTransitionRequest,
  normalizeUpdateSalesWorkOrderRequest,
  type NormalizedSalesWorkOrderProfile,
} from "./sales-order-validation";

export interface SalesWorkOrderReferenceProvider {
  nextReference(): Promise<string>;
}

export type SalesWorkOrderServiceErrorCode =
  | "SALES_WORK_ORDER_NOT_FOUND"
  | "SALES_WORK_ORDER_REVISION_CONFLICT"
  | "SALES_WORK_ORDER_EDIT_NOT_ALLOWED"
  | "SALES_WORK_ORDER_TRANSITION_NOT_ALLOWED"
  | "SALES_WORK_ORDER_ERP_CUSTOMER_NOT_FOUND"
  | "SALES_WORK_ORDER_DELETE_NOT_ALLOWED"
  | "SALES_WORK_ORDER_REFERENCE_INVALID";

export class SalesWorkOrderServiceError extends Error {
  constructor(
    readonly code: SalesWorkOrderServiceErrorCode,
    readonly status: 403 | 404 | 409 | 422,
    message: string,
  ) {
    super(message);
    this.name = "SalesWorkOrderServiceError";
  }
}

const STATUS_CODES: readonly SalesWorkOrderStatusCode[] = [
  "created",
  "issued",
  "waiting_stock",
  "picked",
  "shipped",
  "voided",
];

function normalizeOrderId(orderId: number): number {
  if (!Number.isInteger(orderId) || orderId <= 0) {
    throw new FieldValidationError({ orderId: "必須是正整數" });
  }
  return orderId;
}

function assertRevision(state: SalesWorkOrderRecordState, expectedRevision: number): void {
  if (state.revision !== expectedRevision) {
    throw new SalesWorkOrderServiceError(
      "SALES_WORK_ORDER_REVISION_CONFLICT",
      409,
      "Sales Work Order has changed since it was loaded",
    );
  }
}

function validIsoDate(value: string | undefined): boolean {
  if (!value) return true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function normalizeSearchQuery(query: SalesWorkOrderSearchQuery): SalesWorkOrderSearchQuery {
  const errors: Record<string, string> = {};
  if (query.statusCode && !STATUS_CODES.includes(query.statusCode)) errors.statusCode = "狀態無效";
  if (!validIsoDate(query.orderDateFrom)) errors.orderDateFrom = "日期格式必須為 YYYY-MM-DD";
  if (!validIsoDate(query.orderDateTo)) errors.orderDateTo = "日期格式必須為 YYYY-MM-DD";
  if (query.orderDateFrom && query.orderDateTo && query.orderDateFrom > query.orderDateTo) {
    errors.orderDateTo = "結束日期不可早於開始日期";
  }
  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  return query;
}

export class SalesWorkOrderService {
  private readonly repository: SalesWorkOrderRepository;
  private readonly persistence: SalesWorkOrderPersistence;

  constructor(
    db: D1Database,
    private readonly referenceProvider: SalesWorkOrderReferenceProvider,
  ) {
    this.repository = new SalesWorkOrderRepository(db);
    this.persistence = new SalesWorkOrderPersistence(db);
  }

  async search(query: SalesWorkOrderSearchQuery): Promise<SalesWorkOrderListResult> {
    return this.repository.search(normalizeSearchQuery(query));
  }

  async getDetail(orderId: number): Promise<SalesWorkOrderDetail> {
    const id = normalizeOrderId(orderId);
    const detail = await this.repository.getDetail(id);
    if (!detail) {
      throw new SalesWorkOrderServiceError(
        "SALES_WORK_ORDER_NOT_FOUND",
        404,
        "Sales Work Order not found",
      );
    }
    return detail;
  }

  async create(raw: unknown, context: SalesWorkOrderMutationContext): Promise<SalesWorkOrderDetail> {
    const input = normalizeCreateSalesWorkOrderRequest(raw);
    const resolved = await this.resolveProfile(input);
    const workOrderRef = (await this.referenceProvider.nextReference()).trim();
    if (!workOrderRef || workOrderRef.length > 120) {
      throw new SalesWorkOrderServiceError(
        "SALES_WORK_ORDER_REFERENCE_INVALID",
        422,
        "Generated Sales Work Order reference is invalid",
      );
    }
    const orderId = await this.persistence.create(workOrderRef, input, resolved, context);
    return this.getDetail(orderId);
  }

  async updateDraft(
    orderId: number,
    raw: unknown,
    context: SalesWorkOrderMutationContext,
  ): Promise<SalesWorkOrderDetail> {
    const id = normalizeOrderId(orderId);
    const input = normalizeUpdateSalesWorkOrderRequest(raw);
    const state = await this.requireState(id);
    assertRevision(state, input.expectedRevision);
    if (state.statusCode !== "created" || state.erpNo != null) {
      throw new SalesWorkOrderServiceError(
        "SALES_WORK_ORDER_EDIT_NOT_ALLOWED",
        409,
        "Only a pre-ERP created Sales Work Order may be ordinarily edited",
      );
    }
    const resolved = await this.resolveProfile(input);
    const updated = await this.persistence.updateDraft(id, input, resolved, context);
    if (!updated) this.throwRevisionConflict();
    return this.getDetail(id);
  }

  async fillOrCorrectErp(
    orderId: number,
    raw: unknown,
    context: SalesWorkOrderMutationContext,
  ): Promise<SalesWorkOrderDetail> {
    const id = normalizeOrderId(orderId);
    const input = normalizeFillOrCorrectErpRequest(raw);
    const state = await this.requireState(id);
    assertRevision(state, input.expectedRevision);
    if (state.statusCode === "voided") {
      throw new SalesWorkOrderServiceError(
        "SALES_WORK_ORDER_EDIT_NOT_ALLOWED",
        409,
        "Voided Sales Work Order cannot accept ERP correction",
      );
    }
    if (state.statusCode === "created" && state.erpNo != null) {
      throw new SalesWorkOrderServiceError(
        "SALES_WORK_ORDER_EDIT_NOT_ALLOWED",
        409,
        "Created Sales Work Order contains inconsistent ERP state",
      );
    }

    const customer = await this.repository.resolveCustomerByNumber(input.customerNo);
    if (!customer || customer.customerNo !== input.customerNo) {
      throw new SalesWorkOrderServiceError(
        "SALES_WORK_ORDER_ERP_CUSTOMER_NOT_FOUND",
        422,
        "ERP Customer number must exactly match an existing Customer",
      );
    }

    const changed = await this.persistence.fillOrCorrectErp(state, input, customer, context);
    if (!changed) this.throwRevisionConflict();
    return this.getDetail(id);
  }

  async markWaitingStock(
    orderId: number,
    raw: unknown,
    context: SalesWorkOrderMutationContext,
  ): Promise<SalesWorkOrderDetail> {
    return this.transition(
      orderId,
      raw,
      context,
      ["issued"],
      "waiting_stock",
      "sales_work_order.waiting_stock",
    );
  }

  async markPicked(
    orderId: number,
    raw: unknown,
    context: SalesWorkOrderMutationContext,
  ): Promise<SalesWorkOrderDetail> {
    return this.transition(
      orderId,
      raw,
      context,
      ["issued", "waiting_stock"],
      "picked",
      "sales_work_order.picked",
    );
  }

  async markShipped(
    orderId: number,
    raw: unknown,
    context: SalesWorkOrderMutationContext,
  ): Promise<SalesWorkOrderDetail> {
    return this.transition(
      orderId,
      raw,
      context,
      ["picked"],
      "shipped",
      "sales_work_order.shipped",
    );
  }

  async reverseShipment(
    orderId: number,
    raw: unknown,
    context: SalesWorkOrderMutationContext,
  ): Promise<SalesWorkOrderDetail> {
    if (context.allowShipmentReversal !== true) {
      throw new SalesWorkOrderServiceError(
        "SALES_WORK_ORDER_TRANSITION_NOT_ALLOWED",
        403,
        "Shipment reversal permission is required",
      );
    }
    return this.transition(
      orderId,
      raw,
      context,
      ["shipped"],
      "picked",
      "sales_work_order.shipment.reversed",
    );
  }

  async void(
    orderId: number,
    raw: unknown,
    context: SalesWorkOrderMutationContext,
  ): Promise<SalesWorkOrderDetail> {
    return this.transition(
      orderId,
      raw,
      context,
      ["issued", "waiting_stock", "picked", "shipped"],
      "voided",
      "sales_work_order.voided",
    );
  }

  async deleteDraft(
    orderId: number,
    raw: unknown,
    context: SalesWorkOrderMutationContext,
  ): Promise<void> {
    const id = normalizeOrderId(orderId);
    const input = normalizeDeleteSalesWorkOrderRequest(raw);
    const state = await this.requireState(id);
    assertRevision(state, input.expectedRevision);
    if (state.statusCode !== "created" || state.erpNo != null || context.allowHardDelete !== true) {
      throw new SalesWorkOrderServiceError(
        "SALES_WORK_ORDER_DELETE_NOT_ALLOWED",
        context.allowHardDelete === true ? 409 : 403,
        "Sales Work Order hard delete is not allowed",
      );
    }
    const deleted = await this.persistence.deleteDraft(state, context);
    if (!deleted) this.throwRevisionConflict();
  }

  private async transition(
    orderId: number,
    raw: unknown,
    context: SalesWorkOrderMutationContext,
    allowedFrom: readonly SalesWorkOrderStatusCode[],
    toStatus: SalesWorkOrderStatusCode,
    action: string,
  ): Promise<SalesWorkOrderDetail> {
    const id = normalizeOrderId(orderId);
    const input = normalizeSalesWorkOrderTransitionRequest(raw);
    const state = await this.requireState(id);
    assertRevision(state, input.expectedRevision);
    if (!allowedFrom.includes(state.statusCode) || state.erpNo == null) {
      throw new SalesWorkOrderServiceError(
        "SALES_WORK_ORDER_TRANSITION_NOT_ALLOWED",
        422,
        `Sales Work Order cannot transition from ${state.statusCode} to ${toStatus}`,
      );
    }
    const changed = await this.persistence.transition(state, toStatus, action, input, context);
    if (!changed) this.throwRevisionConflict();
    return this.getDetail(id);
  }

  private async resolveProfile(input: NormalizedSalesWorkOrderProfile): Promise<ResolvedSalesWorkOrderProfile> {
    const errors: Record<string, string> = {};
    const [customer, operator, items] = await Promise.all([
      input.customerId == null ? Promise.resolve(null) : this.repository.resolveCustomerById(input.customerId),
      this.repository.resolveOperator(input.operatorEmployeeId),
      this.repository.resolveItems(input.lines.map((line) => line.itemId)),
    ]);

    if (input.customerId != null && !customer) errors.customerId = "客戶不存在";
    if (!operator) errors.operatorEmployeeId = "操作人員不存在或已停用";

    input.lines.forEach((line, index) => {
      const item = items.get(line.itemId);
      if (!item) {
        errors[`lines.${index}.itemId`] = "商品不存在";
        return;
      }
      if (!item.allowedUnits.has(line.unit)) {
        errors[`lines.${index}.unit`] = `單位必須是 ${[...item.allowedUnits].join(" / ")}`;
      }
    });

    if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
    return {
      customer,
      customerNameOnly: input.customerId == null ? input.customerName : null,
      itemById: items,
    };
  }

  private async requireState(orderId: number): Promise<SalesWorkOrderRecordState> {
    const state = await this.repository.getRecordState(orderId);
    if (!state) {
      throw new SalesWorkOrderServiceError(
        "SALES_WORK_ORDER_NOT_FOUND",
        404,
        "Sales Work Order not found",
      );
    }
    return state;
  }

  private throwRevisionConflict(): never {
    throw new SalesWorkOrderServiceError(
      "SALES_WORK_ORDER_REVISION_CONFLICT",
      409,
      "Sales Work Order has changed since it was loaded",
    );
  }
}
