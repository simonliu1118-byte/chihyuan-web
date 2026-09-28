import type {
  CreateSalesWorkOrderRequest,
  DeleteSalesWorkOrderRequest,
  FillOrCorrectErpRequest,
  InvoiceTypeCode,
  ReceiptOptionCode,
  SalesWorkOrderLineInput,
  SalesWorkOrderProfileInput,
  SalesWorkOrderTransitionRequest,
  UpdateSalesWorkOrderRequest,
} from "../../shared/sales-work-order";
import { parseScaled4 } from "../../shared/fixed-point";
import { FieldValidationError, ValidationBag } from "../validation/fields";

const MAX_LINES = 100;

export interface NormalizedSalesWorkOrderLine {
  itemId: number;
  quantity: number;
  unit: string;
  unitPrice: number;
  note: string | null;
  sortOrder: number;
}

export interface NormalizedSalesWorkOrderProfile {
  customerId: number | null;
  customerName: string | null;
  orderDate: string;
  operatorEmployeeId: number;
  note: string | null;
  hidePriceOnSalesDocument: boolean;
  invoiceTypeCode: InvoiceTypeCode | null;
  receiptOptionCode: ReceiptOptionCode | null;
  lines: readonly NormalizedSalesWorkOrderLine[];
}

export interface NormalizedCreateSalesWorkOrderRequest extends NormalizedSalesWorkOrderProfile {}

export interface NormalizedUpdateSalesWorkOrderRequest extends NormalizedSalesWorkOrderProfile {
  expectedRevision: number;
}

export interface NormalizedFillOrCorrectErpRequest {
  customerNo: string;
  erpNo: string;
  expectedRevision: number;
  reason: string | null;
}

export interface NormalizedSalesWorkOrderTransitionRequest {
  expectedRevision: number;
  reason: string | null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new FieldValidationError({ _request: "Request body must be a JSON object" });
  }
  return value as Record<string, unknown>;
}

function optionalBoolean(input: Record<string, unknown>, field: string, errors: Record<string, string>): boolean {
  const value = input[field];
  if (value == null) return false;
  if (typeof value !== "boolean") {
    errors[field] = "必須是布林值";
    return false;
  }
  return value;
}

function optionalEnum<T extends string>(
  input: Record<string, unknown>,
  field: string,
  allowed: readonly T[],
  errors: Record<string, string>,
): T | null {
  const value = input[field];
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !allowed.includes(value as T)) {
    errors[field] = "選項無效";
    return null;
  }
  return value as T;
}

function requiredScaled4(
  raw: unknown,
  field: string,
  errors: Record<string, string>,
  options: { positive?: boolean; nonNegative?: boolean } = {},
): number {
  if (typeof raw !== "string") {
    errors[field] = "必填";
    return 0;
  }
  try {
    const parsed = parseScaled4(raw);
    if (options.positive && parsed <= 0) {
      errors[field] = "必須大於 0";
      return 0;
    }
    if (options.nonNegative && parsed < 0) {
      errors[field] = "不可小於 0";
      return 0;
    }
    return parsed;
  } catch {
    errors[field] = "格式錯誤，最多 4 位小數";
    return 0;
  }
}

function normalizeLine(raw: unknown, index: number, errors: Record<string, string>): NormalizedSalesWorkOrderLine {
  const path = `lines.${index}`;
  if (raw == null || typeof raw !== "object" || Array.isArray(raw)) {
    errors[path] = "格式錯誤";
    return { itemId: 0, quantity: 0, unit: "", unitPrice: 0, note: null, sortOrder: index };
  }
  const input = raw as Record<string, unknown>;
  const bag = new ValidationBag(input);
  const itemId = bag.requiredPositiveInteger("itemId") ?? 0;
  const unit = bag.requiredText("unit", { maxLength: 40 }) ?? "";
  const note = bag.optionalText("note", { maxLength: 500 });
  Object.entries(bag.fields()).forEach(([key, value]) => { errors[`${path}.${key}`] = value; });

  const quantity = requiredScaled4(input.quantity, `${path}.quantity`, errors, { positive: true });
  const unitPrice = requiredScaled4(input.unitPrice, `${path}.unitPrice`, errors, { nonNegative: true });

  let sortOrder = index;
  if (input.sortOrder != null) {
    if (typeof input.sortOrder !== "number" || !Number.isInteger(input.sortOrder) || input.sortOrder < 0) {
      errors[`${path}.sortOrder`] = "必須是 0 以上整數";
    } else {
      sortOrder = input.sortOrder;
    }
  }

  return { itemId, quantity, unit, unitPrice, note, sortOrder };
}

function normalizeProfile(raw: unknown): NormalizedSalesWorkOrderProfile {
  const input = asObject(raw as SalesWorkOrderProfileInput);
  const bag = new ValidationBag(input);
  const customerId = bag.optionalPositiveInteger("customerId");
  const customerName = bag.optionalText("customerName", { maxLength: 240 });
  const orderDate = bag.requiredIsoDate("orderDate") ?? "";
  const operatorEmployeeId = bag.requiredPositiveInteger("operatorEmployeeId") ?? 0;
  const note = bag.optionalText("note", { maxLength: 2000 });
  const errors: Record<string, string> = bag.fields();

  if (customerId == null && !customerName) {
    errors.customerName = "未選擇客戶時必須輸入客戶名稱";
  }
  if (customerId != null && customerName) {
    // A linked Customer's display name is server-derived, never accepted as an alternate truth.
    errors.customerName = "已選擇正式客戶時不可另外指定客戶名稱";
  }

  const hidePriceOnSalesDocument = optionalBoolean(input, "hidePriceOnSalesDocument", errors);
  const invoiceTypeCode = optionalEnum<InvoiceTypeCode>(
    input,
    "invoiceTypeCode",
    ["two_copy", "three_copy"],
    errors,
  );
  const receiptOptionCode = optionalEnum<ReceiptOptionCode>(
    input,
    "receiptOptionCode",
    ["with_receipt", "without_receipt"],
    errors,
  );

  if (!Array.isArray(input.lines)) {
    errors.lines = "至少需要 1 筆商品";
  } else if (input.lines.length < 1) {
    errors.lines = "至少需要 1 筆商品";
  } else if (input.lines.length > MAX_LINES) {
    errors.lines = `單張工單最多 ${MAX_LINES} 筆商品`;
  }

  const rawLines = Array.isArray(input.lines) ? input.lines.slice(0, MAX_LINES) : [];
  const lines = rawLines.map((line, index) => normalizeLine(line, index, errors));

  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  return {
    customerId,
    customerName,
    orderDate,
    operatorEmployeeId,
    note,
    hidePriceOnSalesDocument,
    invoiceTypeCode,
    receiptOptionCode,
    lines,
  };
}

export function normalizeCreateSalesWorkOrderRequest(raw: unknown): NormalizedCreateSalesWorkOrderRequest {
  return normalizeProfile(raw as CreateSalesWorkOrderRequest);
}

export function normalizeUpdateSalesWorkOrderRequest(raw: unknown): NormalizedUpdateSalesWorkOrderRequest {
  const input = asObject(raw as UpdateSalesWorkOrderRequest);
  const profile = normalizeProfile(input);
  const bag = new ValidationBag(input);
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  bag.throwIfInvalid();
  return { ...profile, expectedRevision: expectedRevision ?? 0 };
}

export function normalizeFillOrCorrectErpRequest(raw: unknown): NormalizedFillOrCorrectErpRequest {
  const input = asObject(raw as FillOrCorrectErpRequest);
  const bag = new ValidationBag(input);
  const customerNo = bag.requiredText("customerNo", { maxLength: 64 }) ?? "";
  const erpNo = bag.requiredText("erpNo", { maxLength: 120 }) ?? "";
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  const reason = bag.optionalText("reason", { maxLength: 1000 });
  bag.throwIfInvalid();
  return { customerNo, erpNo, expectedRevision: expectedRevision ?? 0, reason };
}

export function normalizeSalesWorkOrderTransitionRequest(raw: unknown): NormalizedSalesWorkOrderTransitionRequest {
  const input = asObject(raw as SalesWorkOrderTransitionRequest);
  const bag = new ValidationBag(input);
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  const reason = bag.optionalText("reason", { maxLength: 1000 });
  bag.throwIfInvalid();
  return { expectedRevision: expectedRevision ?? 0, reason };
}

export function normalizeDeleteSalesWorkOrderRequest(raw: unknown): NormalizedSalesWorkOrderTransitionRequest {
  return normalizeSalesWorkOrderTransitionRequest(raw as DeleteSalesWorkOrderRequest);
}
