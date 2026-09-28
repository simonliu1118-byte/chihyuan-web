import type { CustomerEmployeeRef } from "./customer";

export interface CustomerRelatedPage<T> {
  items: readonly T[];
  nextCursor: string | null;
}

export interface CustomerRelatedQuery {
  limit?: number;
  cursor?: string;
}

export interface CustomerVisitRecord {
  id: number;
  customerId: number;
  visitDate: string;
  contactId: number | null;
  personSnapshot: string | null;
  employee: CustomerEmployeeRef;
  content: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface CustomerVisitInput {
  visitDate: string;
  contactId?: number | null;
  personSnapshot?: string | null;
  employeeId?: number | null;
  content: string;
}

export interface CreateCustomerVisitRequest extends CustomerVisitInput {}

export interface UpdateCustomerVisitRequest extends CustomerVisitInput {
  expectedRevision: number;
}

export interface DeleteCustomerVisitRequest {
  expectedRevision: number;
}

export interface CustomerFrequentItemFormalRef {
  id: number;
  itemNo: string;
  name: string;
  spec: string | null;
}

export interface CustomerFrequentItemRecord {
  id: number;
  customerId: number;
  item: CustomerFrequentItemFormalRef | null;
  customItemName: string | null;
  customCategoryName: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface CustomerFrequentItemInput {
  itemId?: number | null;
  customItemName?: string | null;
  customCategoryName?: string | null;
  sortOrder?: number;
}

export interface CreateCustomerFrequentItemRequest extends CustomerFrequentItemInput {}

export interface UpdateCustomerFrequentItemRequest extends CustomerFrequentItemInput {
  expectedUpdatedAt: string;
}

export interface DeleteCustomerFrequentItemRequest {
  expectedUpdatedAt: string;
}

export interface CustomerItemQuoteSummary {
  id: number;
  customerId: number;
  itemId: number;
  quoteDate: string;
  employee: CustomerEmployeeRef;
  itemNoSnapshot: string;
  itemNameSnapshot: string;
  specSnapshot: string | null;
  createdAt: string;
  updatedAt: string;
  revision: number;
}

export interface CustomerItemQuotePriceBreak {
  id: number;
  quantity: string;
  unit: string;
  unitPrice: string;
  note: string | null;
  sortOrder: number;
}

export interface CustomerItemQuoteDetail extends CustomerItemQuoteSummary {
  priceBreaks: readonly CustomerItemQuotePriceBreak[];
}

export interface CustomerItemQuotePriceBreakInput {
  quantity: string;
  unit: string;
  unitPrice: string;
  note?: string | null;
  sortOrder?: number;
}

export interface CustomerItemQuoteInput {
  itemId: number;
  quoteDate: string;
  employeeId?: number | null;
  priceBreaks: readonly CustomerItemQuotePriceBreakInput[];
}

export interface CreateCustomerItemQuoteRequest extends CustomerItemQuoteInput {}

export interface CorrectCustomerItemQuoteRequest extends CustomerItemQuoteInput {
  expectedRevision: number;
  correctionReason?: string | null;
}
