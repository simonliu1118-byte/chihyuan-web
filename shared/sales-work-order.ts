import type { CustomerEmployeeRef } from "./customer";

export type SalesWorkOrderStatusCode =
  | "created"
  | "issued"
  | "waiting_stock"
  | "picked"
  | "shipped"
  | "voided";

export type InvoiceTypeCode = "two_copy" | "three_copy";
export type ReceiptOptionCode = "with_receipt" | "without_receipt";

export interface SalesWorkOrderLine {
  id: number;
  itemId: number;
  itemNoSnapshot: string;
  itemNameSnapshot: string;
  specSnapshot: string | null;
  quantity: string;
  unitSnapshot: string;
  unitPrice: string;
  note: string | null;
  sortOrder: number;
}

export interface SalesWorkOrderSummary {
  id: number;
  workOrderRef: string;
  customerId: number | null;
  customerNoSnapshot: string | null;
  customerNameSnapshot: string;
  orderDate: string;
  operator: CustomerEmployeeRef;
  statusCode: SalesWorkOrderStatusCode;
  erpNo: string | null;
  hidePriceOnSalesDocument: boolean;
  invoiceTypeCode: InvoiceTypeCode | null;
  receiptOptionCode: ReceiptOptionCode | null;
  voidedAt: string | null;
  revision: number;
  updatedAt: string;
}

export interface SalesWorkOrderDetail extends SalesWorkOrderSummary {
  note: string | null;
  lines: readonly SalesWorkOrderLine[];
  createdAt: string;
}

export interface SalesWorkOrderSearchQuery {
  q?: string;
  statusCode?: SalesWorkOrderStatusCode;
  customerId?: number;
  operatorEmployeeId?: number;
  orderDateFrom?: string;
  orderDateTo?: string;
  limit?: number;
  cursor?: string;
}

export interface SalesWorkOrderListResult {
  items: readonly SalesWorkOrderSummary[];
  nextCursor: string | null;
}

export interface SalesWorkOrderLineInput {
  itemId: number;
  quantity: string;
  unit: string;
  unitPrice: string;
  note?: string | null;
  sortOrder?: number;
}

export interface SalesWorkOrderProfileInput {
  /** Linked-Customer mode. Omit/null for explicit name-only field entry. */
  customerId?: number | null;
  /** Required only when customerId is null. Never used to guess a Customer. */
  customerName?: string | null;
  orderDate: string;
  operatorEmployeeId: number;
  note?: string | null;
  hidePriceOnSalesDocument?: boolean;
  invoiceTypeCode?: InvoiceTypeCode | null;
  receiptOptionCode?: ReceiptOptionCode | null;
  lines: readonly SalesWorkOrderLineInput[];
}

export interface CreateSalesWorkOrderRequest extends SalesWorkOrderProfileInput {}

export interface UpdateSalesWorkOrderRequest extends SalesWorkOrderProfileInput {
  expectedRevision: number;
}

export interface FillOrCorrectErpRequest {
  customerNo: string;
  erpNo: string;
  expectedRevision: number;
  reason?: string | null;
}

export interface SalesWorkOrderTransitionRequest {
  expectedRevision: number;
  reason?: string | null;
}

export interface DeleteSalesWorkOrderRequest {
  expectedRevision: number;
}
