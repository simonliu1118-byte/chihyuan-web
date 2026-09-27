import type {
  ContractorEntityType,
  ContractorProfileInput,
  CreateContractorRequest,
  SetContractorPriceRequest,
  UpdateContractorRequest,
} from "../../shared/contractor-outsourcing";
import { parseScaled4 } from "../../shared/fixed-point";
import { FieldValidationError, ValidationBag } from "../validation/fields";

const ENTITY_TYPES = new Set<ContractorEntityType>(["person", "organization"]);
const MAX_CONTACTS = 50;

export interface NormalizedContractorContact {
  id: number | null;
  name: string;
  title: string | null;
  phone: string | null;
  mobile: string | null;
  note: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface NormalizedContractorProfile {
  entityType: ContractorEntityType;
  displayName: string;
  legalName: string | null;
  taxId: string | null;
  phone: string | null;
  address: string | null;
  note: string | null;
  isActive: boolean;
  contacts: readonly NormalizedContractorContact[];
}

export interface NormalizedUpdateContractorRequest extends NormalizedContractorProfile {
  expectedRevision: number;
}

export interface NormalizedContractorPriceRequest {
  itemId: number;
  pricingUnit: string;
  unitPriceScaled4: number;
  note: string | null;
  expectedRevision: number | null;
}

function asObject(value: unknown): Record<string, unknown> {
  if (value == null || typeof value !== "object" || Array.isArray(value)) {
    throw new FieldValidationError({ _request: "Request body must be a JSON object" });
  }
  return value as Record<string, unknown>;
}

function optionalBoolean(value: unknown, fallback: boolean, path: string, errors: Record<string, string>): boolean {
  if (value == null) return fallback;
  if (typeof value !== "boolean") {
    errors[path] = "必須是布林值";
    return fallback;
  }
  return value;
}

function normalizeContacts(raw: unknown, errors: Record<string, string>): readonly NormalizedContractorContact[] {
  if (raw == null) return [];
  if (!Array.isArray(raw)) {
    errors.contacts = "必須是陣列";
    return [];
  }
  if (raw.length > MAX_CONTACTS) errors.contacts = `聯絡人最多 ${MAX_CONTACTS} 筆`;

  return raw.slice(0, MAX_CONTACTS).map((entry, index) => {
    const path = `contacts.${index}`;
    const row = entry != null && typeof entry === "object" && !Array.isArray(entry)
      ? entry as Record<string, unknown>
      : {};
    const bag = new ValidationBag(row);
    const name = bag.requiredText("name", { maxLength: 160 }) ?? "";
    const title = bag.optionalText("title", { maxLength: 160 });
    const phone = bag.optionalText("phone", { maxLength: 80 });
    const mobile = bag.optionalText("mobile", { maxLength: 80 });
    const note = bag.optionalText("note", { maxLength: 1000 });
    Object.entries(bag.fields()).forEach(([key, message]) => { errors[`${path}.${key}`] = message; });

    let id: number | null = null;
    if (row.id != null) {
      if (typeof row.id !== "number" || !Number.isInteger(row.id) || row.id <= 0) errors[`${path}.id`] = "ID 格式錯誤";
      else id = row.id;
    }
    let sortOrder = index;
    if (row.sortOrder != null) {
      if (typeof row.sortOrder !== "number" || !Number.isInteger(row.sortOrder) || row.sortOrder < 0) errors[`${path}.sortOrder`] = "必須是 0 以上整數";
      else sortOrder = row.sortOrder;
    }
    const isActive = optionalBoolean(row.isActive, true, `${path}.isActive`, errors);
    return { id, name, title, phone, mobile, note, sortOrder, isActive };
  });
}

function normalizeProfile(raw: unknown): NormalizedContractorProfile {
  const input = asObject(raw as ContractorProfileInput);
  const bag = new ValidationBag(input);
  const displayName = bag.requiredText("displayName", { maxLength: 240 }) ?? "";
  const legalName = bag.optionalText("legalName", { maxLength: 300 });
  const taxId = bag.optionalText("taxId", { maxLength: 40 });
  const phone = bag.optionalText("phone", { maxLength: 80 });
  const address = bag.optionalText("address", { maxLength: 1000 });
  const note = bag.optionalText("note", { maxLength: 4000 });
  const errors: Record<string, string> = { ...bag.fields() };

  const entityTypeRaw = input.entityType;
  const entityType = typeof entityTypeRaw === "string" && ENTITY_TYPES.has(entityTypeRaw as ContractorEntityType)
    ? entityTypeRaw as ContractorEntityType
    : "person";
  if (entityTypeRaw !== entityType) errors.entityType = "類型必須為 person 或 organization";

  const isActive = optionalBoolean(input.isActive, true, "isActive", errors);
  const contacts = normalizeContacts(input.contacts, errors);
  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  return { entityType, displayName, legalName, taxId, phone, address, note, isActive, contacts };
}

export function normalizeCreateContractorRequest(raw: unknown): NormalizedContractorProfile {
  return normalizeProfile(raw as CreateContractorRequest);
}

export function normalizeUpdateContractorRequest(raw: unknown): NormalizedUpdateContractorRequest {
  const input = asObject(raw as UpdateContractorRequest);
  const profile = normalizeProfile(input);
  const bag = new ValidationBag(input);
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  bag.throwIfInvalid();
  return { ...profile, expectedRevision: expectedRevision ?? 0 };
}

export function normalizeContractorPriceRequest(raw: unknown): NormalizedContractorPriceRequest {
  const input = asObject(raw as SetContractorPriceRequest);
  const bag = new ValidationBag(input);
  const itemId = bag.requiredPositiveInteger("itemId") ?? 0;
  const pricingUnit = bag.requiredText("pricingUnit", { maxLength: 40 }) ?? "";
  const note = bag.optionalText("note", { maxLength: 1000 });
  let expectedRevision: number | null = null;
  if (input.expectedRevision != null) {
    expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  }
  const errors: Record<string, string> = { ...bag.fields() };
  let unitPriceScaled4 = 0;
  if (typeof input.unitPrice !== "string") errors.unitPrice = "請以十進位文字輸入";
  else {
    try {
      unitPriceScaled4 = parseScaled4(input.unitPrice);
      if (unitPriceScaled4 < 0) errors.unitPrice = "不可小於 0";
    } catch {
      errors.unitPrice = "最多支援 4 位小數";
    }
  }
  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);
  return { itemId, pricingUnit, unitPriceScaled4, note, expectedRevision };
}
