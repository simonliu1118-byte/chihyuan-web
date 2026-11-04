import type {
  ChangeCustomerNumberRequest,
  CreateCustomerRequest,
  CustomerAddressInput,
  CustomerContactInput,
  CustomerNoteInput,
  CustomerPhoneInput,
  UpdateCustomerRequest,
} from "../../shared/customer";
import { BUSINESS_PROFILE_LIMITS, CUSTOMER_LIMITS, CUSTOMER_NO_PATTERN, PROFILE_NOTE_CATEGORIES, PROSPECT_STAGES } from "../../shared/customer";
import type { CustomerProfileNoteInput, CustomerProspectItemInput, ProfileNoteCategory, ProspectStage } from "../../shared/customer";
import { FieldValidationError, ValidationBag } from "../validation/fields";

const MAX_PROFILE_ROWS = 50;

export interface NormalizedCustomerProfile {
  customerNo: string | null;
  shortName: string;
  fullName: string | null;
  taxId: string | null;
  paymentTerms: string | null;
  invoiceType: string | null;
  customerCategoryId: number | null;
  regionId: number | null;
  ownerDepartmentId: number | null;
  ownerEmployeeId: number | null;
  customerStatusId: number | null;
  phones: readonly CustomerPhoneInput[];
  contacts: readonly CustomerContactInput[];
  addresses: readonly CustomerAddressInput[];
  notes: readonly CustomerNoteInput[];
  profileNotes: readonly CustomerProfileNoteInput[];
  prospectItems: readonly CustomerProspectItemInput[];
  confirmDuplicateTaxId: boolean;
}

export interface NormalizedCreateCustomerRequest extends NormalizedCustomerProfile {}

export interface NormalizedUpdateCustomerRequest extends NormalizedCustomerProfile {
  expectedRevision: number;
}

export interface NormalizedChangeCustomerNumberRequest {
  newCustomerNo: string | null;
  expectedRevision: number;
  changeReason: string | null;
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

function optionalTextFrom(
  input: Record<string, unknown>,
  field: string,
  errors: Record<string, string>,
  maxLength: number,
): string | null {
  const value = input[field];
  if (value == null || value === "") return null;
  if (typeof value !== "string") {
    errors[field] = "格式錯誤";
    return null;
  }
  const normalized = value.trim();
  if (!normalized) return null;
  if (normalized.length > maxLength) {
    errors[field] = `不可超過 ${maxLength} 個字元`;
    return null;
  }
  return normalized;
}

function requiredTextFrom(
  input: Record<string, unknown>,
  field: string,
  errors: Record<string, string>,
  maxLength: number,
): string {
  const value = optionalTextFrom(input, field, errors, maxLength);
  if (value == null && !(field in errors)) errors[field] = "必填";
  return value ?? "";
}

function optionalPositiveIntegerFrom(
  input: Record<string, unknown>,
  field: string,
  errors: Record<string, string>,
): number | null {
  const value = input[field];
  if (value == null || value === "") return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    errors[field] = "必須是正整數";
    return null;
  }
  return value;
}

function optionalChildId(
  input: Record<string, unknown>,
  path: string,
  errors: Record<string, string>,
): number | undefined {
  const value = input.id;
  if (value == null) return undefined;
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    errors[`${path}.id`] = "必須是正整數";
    return undefined;
  }
  return value;
}

function sortOrderFrom(
  input: Record<string, unknown>,
  path: string,
  index: number,
  errors: Record<string, string>,
): number {
  const value = input.sortOrder;
  if (value == null) return index;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    errors[`${path}.sortOrder`] = "必須是 0 以上整數";
    return index;
  }
  return value;
}

function arrayFrom(input: Record<string, unknown>, field: string, errors: Record<string, string>): readonly unknown[] {
  const value = input[field];
  if (value == null) return [];
  if (!Array.isArray(value)) {
    errors[field] = "必須是陣列";
    return [];
  }
  if (value.length > MAX_PROFILE_ROWS) {
    errors[field] = `單次最多 ${MAX_PROFILE_ROWS} 筆`;
    return value.slice(0, MAX_PROFILE_ROWS);
  }
  return value;
}

function normalizePhones(input: Record<string, unknown>, errors: Record<string, string>): readonly CustomerPhoneInput[] {
  return arrayFrom(input, "phones", errors).map((raw, index) => {
    const path = `phones.${index}`;
    const row = raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
    if (Object.keys(row).length === 0) errors[path] = "格式錯誤";
    const kind = row.kind == null ? "PHONE" : row.kind;
    if (kind !== "PHONE" && kind !== "FAX") errors[`${path}.kind`] = "格式錯誤";
    const phoneNumber = requiredTextFrom(row, "phoneNumber", errors, 20);
    if (phoneNumber && !/^\d{6,15}$/.test(phoneNumber)) errors[`${path}.phoneNumber`] = "電話需為 6～15 位數字";
    const extension = optionalTextFrom(row, "extension", errors, 10);
    if (extension && !/^\d+$/.test(extension)) errors[`${path}.extension`] = "分機需為數字";
    return {
      id: optionalChildId(row, path, errors),
      kind: kind === "FAX" ? "FAX" as const : "PHONE" as const,
      phoneNumber,
      extension: kind === "FAX" ? null : extension,
      note: optionalTextFrom(row, "note", errors, 240),
      sortOrder: sortOrderFrom(row, path, index, errors),
    };
  });
}

function normalizeContacts(input: Record<string, unknown>, errors: Record<string, string>): readonly CustomerContactInput[] {
  return arrayFrom(input, "contacts", errors).map((raw, index) => {
    const path = `contacts.${index}`;
    const row = raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
    if (Object.keys(row).length === 0) errors[path] = "格式錯誤";
    const isActive = row.isActive == null ? true : row.isActive;
    if (typeof isActive !== "boolean") errors[`${path}.isActive`] = "必須是布林值";
    return {
      id: optionalChildId(row, path, errors),
      name: optionalTextFrom(row, "name", errors, 120),
      departmentName: optionalTextFrom(row, "departmentName", errors, 120),
      title: optionalTextFrom(row, "title", errors, 120),
      phone: optionalTextFrom(row, "phone", errors, 120),
      mobile: optionalTextFrom(row, "mobile", errors, 120),
      note: optionalTextFrom(row, "note", errors, 240),
      sortOrder: sortOrderFrom(row, path, index, errors),
      isActive: typeof isActive === "boolean" ? isActive : true,
    };
  });
}

function normalizeAddresses(input: Record<string, unknown>, errors: Record<string, string>): readonly CustomerAddressInput[] {
  return arrayFrom(input, "addresses", errors).map((raw, index) => {
    const path = `addresses.${index}`;
    const row = raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
    if (Object.keys(row).length === 0) errors[path] = "格式錯誤";
    const postalCode = optionalTextFrom(row, "postalCode", errors, 6);
    if (postalCode && !/^\d{3}(\d{3})?$/.test(postalCode)) errors[`${path}.postalCode`] = "郵遞區號需為 3 碼或 6 碼數字";
    return {
      id: optionalChildId(row, path, errors),
      postalCode,
      address: optionalTextFrom(row, "address", errors, 500),
      note: optionalTextFrom(row, "note", errors, 240),
      sortOrder: sortOrderFrom(row, path, index, errors),
    };
  });
}

function normalizeNotes(input: Record<string, unknown>, errors: Record<string, string>): readonly CustomerNoteInput[] {
  return arrayFrom(input, "notes", errors).map((raw, index) => {
    const path = `notes.${index}`;
    const row = raw != null && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
    if (Object.keys(row).length === 0) errors[path] = "格式錯誤";
    const content = requiredTextFrom(row, "content", errors, CUSTOMER_LIMITS.noteLength);
    if (/[\r\n]/.test(content)) errors[`${path}.content`] = "備註為單行";
    const isImportant = row.isImportant == null ? false : row.isImportant;
    if (typeof isImportant !== "boolean") errors[`${path}.isImportant`] = "必須是布林值";
    return {
      id: optionalChildId(row, path, errors),
      content,
      isImportant: isImportant === true,
      sortOrder: sortOrderFrom(row, path, index, errors),
    };
  });
}

const NOTE_CATEGORIES = new Set<string>(PROFILE_NOTE_CATEGORIES.map(row => row.code));
const STAGES = new Set<string>(PROSPECT_STAGES.map(row => row.code));

/** 客戶描述: a category and one line each (V0.10.4). */
function normalizeProfileNotes(input: Record<string, unknown>, errors: Record<string, string>): readonly CustomerProfileNoteInput[] {
  const rows = arrayFrom(input, "profileNotes", errors);
  if (rows.length > BUSINESS_PROFILE_LIMITS.rows) errors.profileNotes = `客戶描述最多 ${BUSINESS_PROFILE_LIMITS.rows} 筆`;
  return rows.map((raw, index) => {
    const path = `profileNotes.${index}`;
    const row = raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const category = typeof row.category === "string" && NOTE_CATEGORIES.has(row.category) ? row.category as ProfileNoteCategory : "OTHER";
    if (row.category != null && !NOTE_CATEGORIES.has(String(row.category))) errors[`${path}.category`] = "類別無效";
    const content = requiredTextFrom(row, "content", errors, BUSINESS_PROFILE_LIMITS.content);
    if (/[\r\n]/.test(content)) errors[`${path}.content`] = "客戶描述為單行";
    return { category, content, sortOrder: index };
  });
}

/** 潛在銷售品項: one of our items or a typed name, plus stage, brand and note (V0.10.4). */
function normalizeProspectItems(input: Record<string, unknown>, errors: Record<string, string>): readonly CustomerProspectItemInput[] {
  const rows = arrayFrom(input, "prospectItems", errors);
  if (rows.length > BUSINESS_PROFILE_LIMITS.rows) errors.prospectItems = `潛在銷售品項最多 ${BUSINESS_PROFILE_LIMITS.rows} 筆`;
  return rows.map((raw, index) => {
    const path = `prospectItems.${index}`;
    const row = raw != null && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
    const itemId = row.itemId == null ? null : Number(row.itemId);
    if (itemId != null && (!Number.isInteger(itemId) || itemId <= 0)) errors[`${path}.itemId`] = "商品無效";
    const itemName = optionalTextFrom(row, "itemName", errors, BUSINESS_PROFILE_LIMITS.itemName);
    if (itemId == null && !itemName) errors[`${path}.itemName`] = "請選商品或填寫品項名稱";
    const stage = row.stage == null || row.stage === "" ? null : String(row.stage);
    if (stage != null && !STAGES.has(stage)) errors[`${path}.stage`] = "現況無效";
    return {
      itemId, itemName: itemId != null ? null : itemName, stage: stage as ProspectStage | null,
      brand: optionalTextFrom(row, "brand", errors, BUSINESS_PROFILE_LIMITS.brand),
      note: optionalTextFrom(row, "note", errors, BUSINESS_PROFILE_LIMITS.note),
      sortOrder: index,
    };
  });
}

function normalizeProfile(raw: unknown): NormalizedCustomerProfile {
  const input = asObject(raw);
  const bag = new ValidationBag(input);
  const errors: Record<string, string> = {};

  const customerNo = bag.optionalText("customerNo", { maxLength: CUSTOMER_LIMITS.customerNo });
  const shortName = bag.requiredText("shortName", { maxLength: CUSTOMER_LIMITS.shortName }) ?? "";
  // Required (user 2026-11-03): 簡稱、全稱、分類、地區、狀態. Contacts and addresses are optional throughout.
  const fullName = bag.requiredText("fullName", { maxLength: 240 });
  const taxId = bag.optionalText("taxId", { maxLength: 8 });
  const paymentTerms = bag.optionalText("paymentTerms", { maxLength: CUSTOMER_LIMITS.termsLength });
  const invoiceType = bag.optionalText("invoiceType", { maxLength: CUSTOMER_LIMITS.termsLength });
  const customerCategoryId = bag.requiredPositiveInteger("customerCategoryId");
  const regionId = bag.requiredPositiveInteger("regionId");
  const ownerDepartmentId = bag.optionalPositiveInteger("ownerDepartmentId");
  const ownerEmployeeId = bag.optionalPositiveInteger("ownerEmployeeId");
  const customerStatusId = bag.requiredPositiveInteger("customerStatusId");

  Object.assign(errors, bag.fields());

  if (taxId != null && !/^\d{8}$/.test(taxId)) {
    errors.taxId = "統一編號需為 8 碼數字";
  }
  if (customerNo != null && !CUSTOMER_NO_PATTERN.test(customerNo)) errors.customerNo = "客戶編號只能是英文或數字";

  const phones = normalizePhones(input, errors);
  const contacts = normalizeContacts(input, errors);
  const addresses = normalizeAddresses(input, errors);
  const notes = normalizeNotes(input, errors);
  const profileNotes = normalizeProfileNotes(input, errors);
  const prospectItems = normalizeProspectItems(input, errors);
  if (phones.filter(row => row.kind === "FAX").length > CUSTOMER_LIMITS.faxes) errors.phones = `傳真最多 ${CUSTOMER_LIMITS.faxes} 筆`;
  if (notes.length > CUSTOMER_LIMITS.notes) errors.notes = `備註最多 ${CUSTOMER_LIMITS.notes} 筆`;
  else if (notes.filter(row => row.isImportant).length > CUSTOMER_LIMITS.importantNotes) errors.notes = `重要備註最多 ${CUSTOMER_LIMITS.importantNotes} 筆`;
  const confirmDuplicateTaxId = optionalBoolean(input, "confirmDuplicateTaxId", errors);

  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);

  return {
    customerNo,
    shortName,
    fullName,
    taxId,
    paymentTerms,
    invoiceType,
    customerCategoryId,
    regionId,
    ownerDepartmentId,
    ownerEmployeeId,
    customerStatusId,
    phones,
    contacts,
    addresses,
    notes,
    profileNotes,
    prospectItems,
    confirmDuplicateTaxId,
  };
}

export function normalizeCreateCustomerRequest(raw: unknown): NormalizedCreateCustomerRequest {
  return normalizeProfile(raw as CreateCustomerRequest);
}

export function normalizeUpdateCustomerRequest(raw: unknown): NormalizedUpdateCustomerRequest {
  const input = asObject(raw as UpdateCustomerRequest);
  const normalized = normalizeProfile(input);
  const bag = new ValidationBag(input);
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  bag.throwIfInvalid();
  return { ...normalized, expectedRevision: expectedRevision ?? 0 };
}

export function normalizeChangeCustomerNumberRequest(raw: unknown): NormalizedChangeCustomerNumberRequest {
  const input = asObject(raw as ChangeCustomerNumberRequest);
  const bag = new ValidationBag(input);
  const newCustomerNo = bag.optionalText("newCustomerNo", { maxLength: CUSTOMER_LIMITS.customerNo });
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  const changeReason = bag.optionalText("changeReason", { maxLength: 240 });
  bag.throwIfInvalid();
  if (newCustomerNo != null && !CUSTOMER_NO_PATTERN.test(newCustomerNo)) throw new FieldValidationError({ newCustomerNo: "客戶編號只能是英文或數字" });
  return {
    newCustomerNo,
    expectedRevision: expectedRevision ?? 0,
    changeReason,
  };
}
