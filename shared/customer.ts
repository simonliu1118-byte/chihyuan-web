export interface CustomerLookupRef {
  id: number;
  code: string | null;
  name: string;
}

export interface CustomerEmployeeRef {
  id: number;
  employeeNo: string | null;
  displayName: string | null;
}

export interface CustomerSummary {
  id: number;
  customerNo: string | null;
  shortName: string;
  fullName: string | null;
  taxId: string | null;
  /** 付款條件 and 發票開立 (V0.9.97): a preset (月結／收現, 外加／內含) or the user's own text. */
  paymentTerms: string | null;
  invoiceType: string | null;
  category: CustomerLookupRef | null;
  region: CustomerLookupRef | null;
  ownerDepartment: CustomerLookupRef | null;
  ownerEmployee: CustomerEmployeeRef | null;
  status: CustomerLookupRef | null;
  revision: number;
  updatedAt: string;
}

/** Row limits and formats agreed for the customer sheet (user 2026-11-03); the Worker enforces them. */
export const CUSTOMER_LIMITS = { customerNo: 10, shortName: 10, faxes: 3, notes: 20, importantNotes: 5, noteLength: 100, visitSubject: 16, termsLength: 20 } as const;
/** Preset choices for 付款條件 and 發票開立; anything else is typed under 其他 (user 2026-11-03). */
export const PAYMENT_TERMS_PRESETS = ["月結", "收現"] as const;
export const INVOICE_TYPE_PRESETS = ["外加", "內含"] as const;
export const CUSTOMER_NO_PATTERN = /^[A-Za-z0-9]+$/;
export type CustomerPhoneKind = "PHONE" | "FAX";

export interface CustomerPhone {
  id: number;
  kind: CustomerPhoneKind;
  phoneNumber: string;
  extension: string | null;
  note: string | null;
  sortOrder: number;
}

export interface CustomerContact {
  id: number;
  name: string | null;
  departmentName: string | null;
  title: string | null;
  phone: string | null;
  mobile: string | null;
  note: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CustomerAddress {
  id: number;
  postalCode: string | null;
  address: string | null;
  note: string | null;
  sortOrder: number;
}

export interface CustomerNote {
  id: number;
  content: string;
  /** Important notes show at the top of the record and lead the 備註 list. */
  isImportant: boolean;
  sortOrder: number;
}

/** 客戶描述 categories and 潛在銷售品項 stages (V0.10.4, user 2026-11-04). */
export const PROFILE_NOTE_CATEGORIES = [
  { code: "CONDITION", label: "診所狀況" }, { code: "EQUIPMENT", label: "使用器材" }, { code: "BRAND", label: "使用品牌" },
  { code: "CAUTION", label: "注意事項" }, { code: "OTHER", label: "其他" },
] as const;
export type ProfileNoteCategory = typeof PROFILE_NOTE_CATEGORIES[number]["code"];
export const PROSPECT_STAGES = [
  { code: "USING_OTHER", label: "在用他牌" }, { code: "RECOMMEND", label: "可推薦" }, { code: "QUOTED", label: "已報價" }, { code: "OTHER", label: "其他" },
] as const;
export type ProspectStage = typeof PROSPECT_STAGES[number]["code"];
export const BUSINESS_PROFILE_LIMITS = { rows: 30, content: 100, itemName: 60, brand: 40, note: 100 } as const;

export interface CustomerProfileNote { id: number; category: ProfileNoteCategory; content: string; sortOrder: number }
export interface CustomerProspectItem {
  id: number;
  item: { id: number; itemNo: string; name: string } | null;
  itemName: string | null;
  stage: ProspectStage | null;
  brand: string | null;
  note: string | null;
  sortOrder: number;
}
export interface CustomerProfileNoteInput { category: ProfileNoteCategory; content: string; sortOrder: number }
export interface CustomerProspectItemInput { itemId?: number | null; itemName?: string | null; stage?: ProspectStage | null; brand?: string | null; note?: string | null; sortOrder: number }

export interface CustomerDetail extends CustomerSummary {
  updatedBy: CustomerEmployeeRef | null;
  phones: readonly CustomerPhone[];
  contacts: readonly CustomerContact[];
  addresses: readonly CustomerAddress[];
  notes: readonly CustomerNote[];
  profileNotes: readonly CustomerProfileNote[];
  prospectItems: readonly CustomerProspectItem[];
  createdAt: string;
}

export interface CustomerPhoneInput {
  id?: number;
  kind?: CustomerPhoneKind;
  phoneNumber: string;
  extension?: string | null;
  note?: string | null;
  sortOrder: number;
}

export interface CustomerContactInput {
  id?: number;
  name?: string | null;
  departmentName?: string | null;
  title?: string | null;
  phone?: string | null;
  mobile?: string | null;
  note?: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface CustomerAddressInput {
  id?: number;
  postalCode?: string | null;
  address?: string | null;
  note?: string | null;
  sortOrder: number;
}

export interface CustomerNoteInput {
  id?: number;
  content: string;
  isImportant?: boolean;
  sortOrder: number;
}

export interface CustomerProfileInput {
  customerNo?: string | null;
  shortName: string;
  fullName?: string | null;
  taxId?: string | null;
  paymentTerms?: string | null;
  invoiceType?: string | null;
  customerCategoryId?: number | null;
  regionId?: number | null;
  ownerDepartmentId?: number | null;
  ownerEmployeeId?: number | null;
  customerStatusId?: number | null;
  phones?: readonly CustomerPhoneInput[];
  contacts?: readonly CustomerContactInput[];
  addresses?: readonly CustomerAddressInput[];
  notes?: readonly CustomerNoteInput[];
  profileNotes?: readonly CustomerProfileNoteInput[];
  prospectItems?: readonly CustomerProspectItemInput[];
  confirmDuplicateTaxId?: boolean;
}

export interface CreateCustomerRequest extends CustomerProfileInput {}

export interface UpdateCustomerRequest extends CustomerProfileInput {
  expectedRevision: number;
}

export interface ChangeCustomerNumberRequest {
  newCustomerNo: string | null;
  expectedRevision: number;
  changeReason?: string | null;
}

export interface CustomerSearchQuery {
  q?: string;
  customerCategoryId?: number;
  customerStatusId?: number;
  regionId?: number;
  ownerDepartmentId?: number;
  ownerEmployeeId?: number;
  limit?: number;
  cursor?: string;
}

export interface CustomerListResult {
  items: readonly CustomerSummary[];
  nextCursor: string | null;
}

export interface CustomerTaxIdMatch {
  id: number;
  customerNo: string | null;
  shortName: string;
  fullName: string | null;
  status: CustomerLookupRef | null;
}

export interface CustomerTaxIdCheckResult {
  taxId: string | null;
  matches: readonly CustomerTaxIdMatch[];
  requiresConfirmation: boolean;
}

export interface CustomerMutationResult {
  customer: CustomerDetail;
}