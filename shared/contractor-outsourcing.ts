export type ContractorEntityType = "person" | "organization";

export interface ContractorContact {
  id: number;
  name: string;
  title: string | null;
  phone: string | null;
  mobile: string | null;
  note: string | null;
  sortOrder: number;
  isActive: boolean;
}

export interface ContractorPrice {
  id: number;
  itemId: number;
  itemNo: string;
  itemName: string;
  pricingUnit: string;
  unitPrice: string;
  note: string | null;
  revision: number;
  updatedAt: string;
}

export interface ContractorSummary {
  id: number;
  entityType: ContractorEntityType;
  displayName: string;
  legalName: string | null;
  taxId: string | null;
  phone: string | null;
  isActive: boolean;
  revision: number;
  updatedAt: string;
}

export interface ContractorDetail extends ContractorSummary {
  address: string | null;
  note: string | null;
  contacts: readonly ContractorContact[];
  pricing: readonly ContractorPrice[];
  createdAt: string;
}

export interface ContractorContactInput {
  id?: number;
  name: string;
  title?: string | null;
  phone?: string | null;
  mobile?: string | null;
  note?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export interface ContractorProfileInput {
  entityType: ContractorEntityType;
  displayName: string;
  legalName?: string | null;
  taxId?: string | null;
  phone?: string | null;
  address?: string | null;
  note?: string | null;
  isActive?: boolean;
  contacts?: readonly ContractorContactInput[];
}

export interface CreateContractorRequest extends ContractorProfileInput {}
export interface UpdateContractorRequest extends ContractorProfileInput { expectedRevision: number }

export interface SetContractorPriceRequest {
  itemId: number;
  pricingUnit: string;
  unitPrice: string;
  note?: string | null;
  expectedRevision?: number;
}

export interface ContractorSearchQuery {
  q?: string;
  isActive?: boolean;
  entityType?: ContractorEntityType;
  limit?: number;
  cursor?: string;
}

export interface ContractorListResult {
  items: readonly ContractorSummary[];
  nextCursor: string | null;
}

export interface BomComponent {
  id: number;
  itemId: number;
  itemNo: string;
  itemName: string;
  quantity: string;
  unit: string;
  sortOrder: number;
}

export interface BomSummary {
  id: number;
  recipeRef: string;
  finishedItemId: number;
  finishedItemNo: string;
  finishedItemName: string;
  outputQuantity: string;
  outputUnit: string;
  isActive: boolean;
  revision: number;
  updatedAt: string;
}

export interface BomDetail extends BomSummary {
  components: readonly BomComponent[];
  createdAt: string;
}

export interface BomComponentInput {
  itemId: number;
  quantity: string;
  unit: string;
  sortOrder?: number;
}

export interface CreateBomRequest {
  recipeRef: string;
  finishedItemId: number;
  outputQuantity: string;
  outputUnit: string;
  isActive?: boolean;
  components: readonly BomComponentInput[];
}

export interface UpdateBomRequest extends CreateBomRequest {
  expectedRevision: number;
}

export interface BomSearchQuery {
  q?: string;
  finishedItemId?: number;
  isActive?: boolean;
  limit?: number;
  cursor?: string;
}

export interface BomListResult {
  items: readonly BomSummary[];
  nextCursor: string | null;
}

export type OutsourcingStatusCode =
  | "pending_outbound"
  | "outbound"
  | "received"
  | "priced"
  | "paid"
  | "voided";

export interface OutsourcingPart {
  id: number;
  bomRecipeId: number | null;
  finishedItemId: number | null;
  finishedItemNoSnapshot: string | null;
  finishedItemNameSnapshot: string | null;
  finishedSpecSnapshot: string | null;
  componentItemId: number;
  componentItemNoSnapshot: string;
  componentItemNameSnapshot: string;
  componentSpecSnapshot: string | null;
  quantity: string;
  unitSnapshot: string;
  note: string | null;
  sortOrder: number;
}

export interface OutsourcingReceiptItem {
  id: number;
  itemId: number;
  bomRecipeId: number | null;
  itemNoSnapshot: string;
  itemNameSnapshot: string;
  specSnapshot: string | null;
  quantity: string;
  unitSnapshot: string;
  note: string | null;
  sortOrder: number;
}

export interface OutsourcingReceipt {
  id: number;
  receivedDate: string;
  operatorEmployeeId: number;
  createdAt: string;
  items: readonly OutsourcingReceiptItem[];
}

export interface OutsourcingPricingItem {
  id: number;
  itemId: number;
  itemNoSnapshot: string;
  itemNameSnapshot: string;
  unitSnapshot: string;
  quantity: string;
  unitPrice: string;
  subtotal: string;
  note: string | null;
  sortOrder: number;
}

export interface OutsourcingPricing {
  id: number;
  pricedDate: string;
  operatorEmployeeId: number;
  totalAmount: string;
  revision: number;
  createdAt: string;
  items: readonly OutsourcingPricingItem[];
}

export interface OutsourcingSummary {
  id: number;
  outsourcingRef: string;
  statusCode: OutsourcingStatusCode;
  contractorId: number;
  contractorNameSnapshot: string;
  orderDate: string;
  outboundDate: string | null;
  paidAt: string | null;
  voidedAt: string | null;
  operatorEmployeeId: number;
  revision: number;
  updatedAt: string;
}

export interface OutsourcingDetail extends OutsourcingSummary {
  createdAt: string;
  parts: readonly OutsourcingPart[];
  receipt: OutsourcingReceipt | null;
  pricing: OutsourcingPricing | null;
}

export interface OutsourcingPartInput {
  bomRecipeId?: number | null;
  finishedItemId?: number | null;
  componentItemId: number;
  quantity: string;
  unit: string;
  note?: string | null;
  sortOrder?: number;
}

export interface CreateOutsourcingRequest {
  contractorId: number;
  operatorEmployeeId: number;
  orderDate: string;
  parts: readonly OutsourcingPartInput[];
}

export interface UpdateOutsourcingRequest extends CreateOutsourcingRequest {
  expectedRevision: number;
}

export interface OutsourcingTransitionRequest {
  expectedRevision: number;
  effectiveDate?: string | null;
  reason?: string | null;
}

export interface ReceiveOutsourcingItemInput {
  itemId: number;
  bomRecipeId?: number | null;
  quantity: string;
  unit: string;
  note?: string | null;
  sortOrder?: number;
}

export interface ReceiveOutsourcingRequest {
  expectedRevision: number;
  receivedDate: string;
  operatorEmployeeId: number;
  items: readonly ReceiveOutsourcingItemInput[];
}

export interface PriceOutsourcingRequest {
  expectedRevision: number;
  pricedDate: string;
  operatorEmployeeId: number;
}

export interface OutsourcingSearchQuery {
  q?: string;
  statusCode?: OutsourcingStatusCode;
  contractorId?: number;
  orderDateFrom?: string;
  orderDateTo?: string;
  limit?: number;
  cursor?: string;
}

export interface OutsourcingListResult {
  items: readonly OutsourcingSummary[];
  nextCursor: string | null;
}

export interface ContractorStockBalance {
  contractorId: number;
  itemId: number;
  itemNo: string;
  itemName: string;
  quantity: string;
}
