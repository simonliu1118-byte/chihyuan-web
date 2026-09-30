import type {
  ChangeCustomerNumberRequest,
  CreateCustomerRequest,
  CustomerAddressInput,
  CustomerContactInput,
  CustomerNoteInput,
  CustomerPhoneInput,
  UpdateCustomerRequest,
} from "../../shared/customer";
import { FieldValidationError, ValidationBag } from "../validation/fields";

const MAX_PROFILE_ROWS = 50;

export interface NormalizedCustomerProfile {
  customerNo: string | null;
  shortName: string;
  fullName: string | null;
  taxId: string | null;
  customerCategoryId: number | null;
  regionId: number | null;
  ownerDepartmentId: number | null;
  ownerEmployeeId: number | null;
  fax: string | null;
  customerStatusId: number | null;
  phones: readonly CustomerPhoneInput[];
  contacts: readonly CustomerContactInput[];
  addresses: readonly CustomerAddressInput[];
  notes: readonly CustomerNoteInput[];
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
    return {
      id: optionalChildId(row, path, errors),
      phoneNumber: requiredTextFrom(row, "phoneNumber", errors, 120),
      extension: optionalTextFrom(row, "extension", errors, 40),
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
      name: requiredTextFrom(row, "name", errors, 120),
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
    return {
      id: optionalChildId(row, path, errors),
      postalCode: optionalTextFrom(row, "postalCode", errors, 16),
      address: requiredTextFrom(row, "address", errors, 500),
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
    return {
      id: optionalChildId(row, path, errors),
      content: requiredTextFrom(row, "content", errors, 2000),
      sortOrder: sortOrderFrom(row, path, index, errors),
    };
  });
}

function normalizeProfile(raw: unknown): NormalizedCustomerProfile {
  const input = asObject(raw);
  const bag = new ValidationBag(input);
  const errors: Record<string, string> = {};

  const customerNo = bag.optionalText("customerNo", { maxLength: 64 });
  const shortName = bag.requiredText("shortName", { maxLength: 120 }) ?? "";
  const fullName = bag.optionalText("fullName", { maxLength: 240 });
  const taxId = bag.optionalText("taxId", { maxLength: 8 });
  const fax = bag.optionalText("fax", { maxLength: 120 });
  const customerCategoryId = bag.optionalPositiveInteger("customerCategoryId");
  const regionId = bag.optionalPositiveInteger("regionId");
  const ownerDepartmentId = bag.optionalPositiveInteger("ownerDepartmentId");
  const ownerEmployeeId = bag.optionalPositiveInteger("ownerEmployeeId");
  const customerStatusId = bag.optionalPositiveInteger("customerStatusId");

  Object.assign(errors, bag.fields());

  if (taxId != null && !/^\d{8}$/.test(taxId)) {
    errors.taxId = "統一編號需為 8 碼數字";
  }

  const phones = normalizePhones(input, errors);
  const contacts = normalizeContacts(input, errors);
  const addresses = normalizeAddresses(input, errors);
  const notes = normalizeNotes(input, errors);
  const confirmDuplicateTaxId = optionalBoolean(input, "confirmDuplicateTaxId", errors);

  if (Object.keys(errors).length > 0) throw new FieldValidationError(errors);

  return {
    customerNo,
    shortName,
    fullName,
    taxId,
    customerCategoryId,
    regionId,
    ownerDepartmentId,
    ownerEmployeeId,
    fax,
    customerStatusId,
    phones,
    contacts,
    addresses,
    notes,
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
  const newCustomerNo = bag.optionalText("newCustomerNo", { maxLength: 64 });
  const expectedRevision = bag.requiredPositiveInteger("expectedRevision");
  const changeReason = bag.optionalText("changeReason", { maxLength: 240 });
  bag.throwIfInvalid();
  return {
    newCustomerNo,
    expectedRevision: expectedRevision ?? 0,
    changeReason,
  };
}
