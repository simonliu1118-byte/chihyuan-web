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
  category: CustomerLookupRef | null;
  region: CustomerLookupRef | null;
  ownerDepartment: CustomerLookupRef | null;
  ownerEmployee: CustomerEmployeeRef | null;
  status: CustomerLookupRef | null;
  revision: number;
  updatedAt: string;
}

export interface CustomerPhone {
  id: number;
  phoneNumber: string;
  extension: string | null;
  note: string | null;
  sortOrder: number;
}

export interface CustomerContact {
  id: number;
  name: string;
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
  address: string;
  note: string | null;
  sortOrder: number;
}

export interface CustomerNote {
  id: number;
  content: string;
  sortOrder: number;
}

export interface CustomerDetail extends CustomerSummary {
  fax: string | null;
  phones: readonly CustomerPhone[];
  contacts: readonly CustomerContact[];
  addresses: readonly CustomerAddress[];
  notes: readonly CustomerNote[];
  createdAt: string;
}

export interface CustomerPhoneInput {
  id?: number;
  phoneNumber: string;
  extension?: string | null;
  note?: string | null;
  sortOrder: number;
}

export interface CustomerContactInput {
  id?: number;
  name: string;
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
  address: string;
  note?: string | null;
  sortOrder: number;
}

export interface CustomerNoteInput {
  id?: number;
  content: string;
  sortOrder: number;
}

export interface CustomerProfileInput {
  customerNo?: string | null;
  shortName: string;
  fullName?: string | null;
  taxId?: string | null;
  customerCategoryId?: number | null;
  regionId?: number | null;
  ownerDepartmentId?: number | null;
  ownerEmployeeId?: number | null;
  fax?: string | null;
  customerStatusId?: number | null;
  phones?: readonly CustomerPhoneInput[];
  contacts?: readonly CustomerContactInput[];
  addresses?: readonly CustomerAddressInput[];
  notes?: readonly CustomerNoteInput[];
  confirmDuplicateTaxId?: boolean;
}

export interface CreateCustomerRequest extends CustomerProfileInput {}

export interface UpdateCustomerRequest extends CustomerProfileInput {
  expectedRevision: number;
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

export interface ChangeCustomerNumberRequest {
  newCustomerNo: string;
  expectedRevision: number;
  changeSource?: string | null;
}

export interface DeleteCustomerRequest {
  expectedRevision: number;
}

export interface CustomerDeletionEligibility {
  deletable: boolean;
  reason: "NEVER_USED" | "REFERENCED_BUSINESS_HISTORY";
}

export interface CustomerMutationResult {
  customer: CustomerDetail;
}