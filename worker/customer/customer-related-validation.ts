import type {
  CorrectCustomerItemQuoteRequest,
  CreateCustomerFrequentItemRequest,
  CreateCustomerItemQuoteRequest,
  CreateCustomerVisitRequest,
  DeleteCustomerFrequentItemRequest,
  DeleteCustomerVisitRequest,
  UpdateCustomerFrequentItemRequest,
  UpdateCustomerVisitRequest,
} from "../../shared/customer-related";
import { parseScaled4 } from "../../shared/fixed-point";
import { FieldValidationError, ValidationBag } from "../validation/fields";

const MAX_QUOTE_BREAKS = 10;

export interface NormalizedVisitInput {
  visitDate: string;
  contactId: number | null;
  personSnapshot: string | null;
  employeeId: number | null;
  content: string;
}

export interface NormalizedCreateVisitRequest extends NormalizedVisitInput {}
export interface NormalizedUpdateVisitRequest extends NormalizedVisitInput {
  expectedRevision: number;
}

export interface NormalizedDeleteVisitRequest {
  expectedRevision: number;
}

export interface NormalizedFrequentItemInput {
  itemId: number | null;
  customItemName: string | null;
  customCategoryName: string | null;
  sortOrder: number;
}

export interface NormalizedCreateFrequentItemRequest extends NormalizedFrequentItemInput {}
export interface NormalizedUpdateFrequentItemRequest extends NormalizedFrequentItemInput {
  expectedUpdatedAt: string;
}

export interface NormalizedDeleteFrequentItemRequest {
  expectedUpdatedAt: string;
}

export interface NormalizedQuoteBreakInput {
  quantity: number;
  unit: string;
  unitPrice: number;
  note: string | null;
  sortOrder: number;
}

export interface NormalizedQuoteInput {
  itemId: number;
  quoteDate: string;
  employeeId: number | null;
  priceBreaks: readonly NormalizedQuoteBreakInput[];
}

export interface NormalizedCreateQuoteRequest extends NormalizedQuoteInput {}
export interface NormalizedCorrectQuoteRequest extends NormalizedQuoteInput {
  expectedRevision: number;
  correctionReason: string | null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new FieldValidationError({ _request: "Request body must be a JSON object" });
  }
  return value as Record<string, unknown>;
}

function optionalNonNegativeInteger(
  input: Record<string, unknown>,
  field: string,
  errors: Record<string, string>,
  fallback = 0,
  errorField = field,
): number {
  const value = input[field];
  if (value == null || value === "") return fallback;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    errors[errorField] = "必須是 0 以上整數";
    return fallback;
  }
  return value;
}

function requiredTimestamp(input: Record<string, unknown>, field: string, errors: Record<string, string>): string {
  const value = input[field];
  if (typeof value !== "string" || !value.trim()) {
    errors[field] = "必填";
    return "";
  }
  const normalized = value.trim();
  if (normalized.length > 64 || Number.isNaN(Date.parse(normalized))) {
    errors[field] = "時間格式錯誤";
    return "";
  }
  return normalized;
}

function normalizeVisit(raw: unknown): NormalizedVisitInput {
  const input = asObject(raw);
  const bag = new ValidationBag(input);
  const visitDate = bag.requiredIsoDate("visitDate") ?? "";
  const contactId = bag.optionalPositiveInteger("contactId");
  const personSnapshot = bag.optionalText("personSnapshot", { maxLength: 200 });
  const employeeId = bag.optionalPositiveInteger("employeeId");
  const content = bag.requiredText("content", { maxLength: 10000 }) ?? "";
  bag.throwIfInvalid();
  return { visitDate, contactId, personSnapshot, employeeId, content };
}

export function normalizeCreateVisitRequest(raw: unknown): NormalizedCreateVisitRequest {
  return normalizeVisit(raw as CreateCustomerVisitRequest);
}

export function normalizeUpdateVisitRequest(raw: unknown): NormalizedUpdateVisitRequest {
  const input = asObject(raw as UpdateCustomerVisitRequest);
  const normalized = normalizeVisit(input);
  const bag = new ValidationBag(input);
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  bag.throwIfInvalid();
  return { ...normalized, expectedRevision: expectedRevision ?? 0 };
}

export function normalizeDeleteVisitRequest(raw: unknown): NormalizedDeleteVisitRequest {
  const input = asObject(raw as DeleteCustomerVisitRequest);
  const bag = new ValidationBag(input);
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  bag.throwIfInvalid();
  return { expectedRevision: expectedRevision ?? 0 };
}

function normalizeFrequentItem(raw: unknown): NormalizedFrequentItemInput {
  const input = asObject(raw);
  const bag = new ValidationBag(input);
  const itemId = bag.optionalPositiveInteger("itemId");
  const customItemName = bag.optionalText("customItemName", { maxLength: 240 });
  const customCategoryName = bag.optionalText("customCategoryName", { maxLength: 160 });
  const errors = bag.fields();
  const sortOrder = optionalNonNegativeInteger(input, "sortOrder", errors);

  if (itemId != null && (customItemName != null || customCategoryName != null)) {
    errors._identity = "正式商品與未建檔文字不可同時指定";
  }
  if (itemId == null && customItemName == null) {
    errors._identity = "請明確選擇正式商品，或輸入未建檔商品名稱";
  }

  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  return { itemId, customItemName, customCategoryName, sortOrder };
}

export function normalizeCreateFrequentItemRequest(raw: unknown): NormalizedCreateFrequentItemRequest {
  return normalizeFrequentItem(raw as CreateCustomerFrequentItemRequest);
}

export function normalizeUpdateFrequentItemRequest(raw: unknown): NormalizedUpdateFrequentItemRequest {
  const input = asObject(raw as UpdateCustomerFrequentItemRequest);
  const normalized = normalizeFrequentItem(input);
  const errors: Record<string, string> = {};
  const expectedUpdatedAt = requiredTimestamp(input, "expectedUpdatedAt", errors);
  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  return { ...normalized, expectedUpdatedAt };
}

export function normalizeDeleteFrequentItemRequest(raw: unknown): NormalizedDeleteFrequentItemRequest {
  const input = asObject(raw as DeleteCustomerFrequentItemRequest);
  const errors: Record<string, string> = {};
  const expectedUpdatedAt = requiredTimestamp(input, "expectedUpdatedAt", errors);
  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  return { expectedUpdatedAt };
}

function normalizeQuote(raw: unknown): NormalizedQuoteInput {
  const input = asObject(raw);
  const bag = new ValidationBag(input);
  const itemId = bag.requiredPositiveInteger("itemId") ?? 0;
  const quoteDate = bag.requiredIsoDate("quoteDate") ?? "";
  const employeeId = bag.optionalPositiveInteger("employeeId");
  const errors = bag.fields();

  const rawBreaks = input.priceBreaks;
  if (!Array.isArray(rawBreaks) || rawBreaks.length === 0) {
    errors.priceBreaks = "至少需要一筆數量／單價資料";
  } else if (rawBreaks.length > MAX_QUOTE_BREAKS) {
    errors.priceBreaks = `單筆報價最多 ${MAX_QUOTE_BREAKS} 個級距`;
  }

  const priceBreaks = (Array.isArray(rawBreaks) ? rawBreaks.slice(0, MAX_QUOTE_BREAKS) : []).map(
    (rawBreak, index): NormalizedQuoteBreakInput => {
      const path = `priceBreaks.${index}`;
      const row = rawBreak != null && typeof rawBreak === "object" && !Array.isArray(rawBreak)
        ? rawBreak as Record<string, unknown>
        : {};
      if (Object.keys(row).length === 0) errors[path] = "格式錯誤";

      const quantityText = typeof row.quantity === "string" ? row.quantity.trim() : "";
      const priceText = typeof row.unitPrice === "string" ? row.unitPrice.trim() : "";
      let quantity = 0;
      let unitPrice = 0;
      try {
        quantity = parseScaled4(quantityText);
        if (quantity <= 0) throw new Error("NON_POSITIVE");
      } catch {
        errors[`${path}.quantity`] = "數量必須大於 0，最多 4 位小數";
      }
      try {
        unitPrice = parseScaled4(priceText);
        if (unitPrice < 0) throw new Error("NEGATIVE");
      } catch {
        errors[`${path}.unitPrice`] = "單價必須為 0 以上，最多 4 位小數";
      }

      const unit = typeof row.unit === "string" ? row.unit.trim() : "";
      if (!unit) errors[`${path}.unit`] = "必填";
      else if (unit.length > 40) errors[`${path}.unit`] = "不可超過 40 個字元";

      let note: string | null = null;
      if (row.note != null && row.note !== "") {
        if (typeof row.note !== "string") errors[`${path}.note`] = "格式錯誤";
        else {
          const text = row.note.trim();
          if (text.length > 120) errors[`${path}.note`] = "不可超過 120 個字元";
          else note = text || null;
        }
      }

      const sortOrder = optionalNonNegativeInteger(
        row,
        "sortOrder",
        errors,
        index,
        `${path}.sortOrder`,
      );
      return { quantity, unit, unitPrice, note, sortOrder };
    },
  );

  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  return { itemId, quoteDate, employeeId, priceBreaks };
}

export function normalizeCreateQuoteRequest(raw: unknown): NormalizedCreateQuoteRequest {
  return normalizeQuote(raw as CreateCustomerItemQuoteRequest);
}

export function normalizeCorrectQuoteRequest(raw: unknown): NormalizedCorrectQuoteRequest {
  const input = asObject(raw as CorrectCustomerItemQuoteRequest);
  const normalized = normalizeQuote(input);
  const bag = new ValidationBag(input);
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  const correctionReason = bag.optionalText("correctionReason", { maxLength: 240 });
  bag.throwIfInvalid();
  return {
    ...normalized,
    expectedRevision: expectedRevision ?? 0,
    correctionReason,
  };
}
