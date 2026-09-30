import type {
  CustomerItemOption,
  CustomerModuleLookups,
} from "../../../shared/business-lookups";
import type {
  ChangeCustomerNumberRequest,
  CreateCustomerRequest,
  CustomerDetail,
  CustomerListResult,
  CustomerSearchQuery,
  CustomerTaxIdCheckResult,
  UpdateCustomerRequest,
} from "../../../shared/customer";
import type {
  CorrectCustomerItemQuoteRequest,
  CreateCustomerFrequentItemRequest,
  CreateCustomerItemQuoteRequest,
  CreateCustomerVisitRequest,
  CustomerFrequentItemRecord,
  CustomerItemQuoteDetail,
  CustomerItemQuoteSummary,
  CustomerRelatedPage,
  CustomerVisitRecord,
  DeleteCustomerFrequentItemRequest,
  DeleteCustomerVisitRequest,
  UpdateCustomerFrequentItemRequest,
  UpdateCustomerVisitRequest,
} from "../../../shared/customer-related";
import { apiRequest } from "../../api/client";

function searchPath(query: CustomerSearchQuery): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.customerCategoryId != null) params.set("customerCategoryId", String(query.customerCategoryId));
  if (query.customerStatusId != null) params.set("customerStatusId", String(query.customerStatusId));
  if (query.regionId != null) params.set("regionId", String(query.regionId));
  if (query.ownerDepartmentId != null) params.set("ownerDepartmentId", String(query.ownerDepartmentId));
  if (query.ownerEmployeeId != null) params.set("ownerEmployeeId", String(query.ownerEmployeeId));
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const encoded = params.toString();
  return encoded ? `/api/business/customers?${encoded}` : "/api/business/customers";
}

export function loadCustomerLookups(): Promise<CustomerModuleLookups> {
  return apiRequest<CustomerModuleLookups>("/api/business/customers/lookups", { method: "GET" });
}

export function searchCustomerItemOptions(q = "", limit = 100): Promise<readonly CustomerItemOption[]> {
  const params = new URLSearchParams({ limit: String(limit) });
  if (q.trim()) params.set("q", q.trim());
  return apiRequest<readonly CustomerItemOption[]>(
    `/api/business/customers/item-options?${params.toString()}`,
    { method: "GET" },
  );
}

export function searchCustomers(query: CustomerSearchQuery): Promise<CustomerListResult> {
  return apiRequest<CustomerListResult>(searchPath(query), { method: "GET" });
}

export function loadCustomerDetail(customerId: number): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>(
    `/api/business/customers/${encodeURIComponent(String(customerId))}`,
    { method: "GET" },
  );
}

export function checkCustomerTaxId(taxId: string, excludeCustomerId?: number): Promise<CustomerTaxIdCheckResult> {
  const params = new URLSearchParams({ taxId });
  if (excludeCustomerId != null) params.set("excludeCustomerId", String(excludeCustomerId));
  return apiRequest<CustomerTaxIdCheckResult>(
    `/api/business/customers/tax-id-check?${params.toString()}`,
    { method: "GET" },
  );
}

export function createCustomer(input: CreateCustomerRequest): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>("/api/business/customers", { method: "POST", json: input });
}

export function updateCustomer(customerId: number, input: UpdateCustomerRequest): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>(
    `/api/business/customers/${encodeURIComponent(String(customerId))}`,
    { method: "PATCH", json: input },
  );
}

export function changeCustomerNumber(customerId: number, input: ChangeCustomerNumberRequest): Promise<CustomerDetail> {
  return apiRequest<CustomerDetail>(
    `/api/business/customers/${encodeURIComponent(String(customerId))}/number`,
    { method: "POST", json: input },
  );
}

export function loadCustomerVisits(customerId: number, limit = 100): Promise<CustomerRelatedPage<CustomerVisitRecord>> {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiRequest<CustomerRelatedPage<CustomerVisitRecord>>(
    `/api/business/customers/${encodeURIComponent(String(customerId))}/visits?${params.toString()}`,
    { method: "GET" },
  );
}

export function createCustomerVisit(customerId: number, input: CreateCustomerVisitRequest): Promise<CustomerVisitRecord> {
  return apiRequest<CustomerVisitRecord>(
    `/api/business/customers/${encodeURIComponent(String(customerId))}/visits`,
    { method: "POST", json: input },
  );
}

export function updateCustomerVisit(
  customerId: number,
  visitId: number,
  input: UpdateCustomerVisitRequest,
): Promise<CustomerVisitRecord> {
  return apiRequest<CustomerVisitRecord>(
    `/api/business/customers/${encodeURIComponent(String(customerId))}/visits/${encodeURIComponent(String(visitId))}`,
    { method: "PATCH", json: input },
  );
}

export function deleteCustomerVisit(
  customerId: number,
  visitId: number,
  input: DeleteCustomerVisitRequest,
): Promise<{ deleted: true; customerId: number; visitId: number }> {
  return apiRequest(
    `/api/business/customers/${encodeURIComponent(String(customerId))}/visits/${encodeURIComponent(String(visitId))}`,
    { method: "DELETE", json: input },
  );
}

export function loadCustomerFrequentItems(customerId: number): Promise<readonly CustomerFrequentItemRecord[]> {
  return apiRequest<{ items: readonly CustomerFrequentItemRecord[] }>(
    `/api/business/customers/${encodeURIComponent(String(customerId))}/frequent-items?limit=100`,
    { method: "GET" },
  ).then((result) => result.items);
}

export function createCustomerFrequentItem(
  customerId: number,
  input: CreateCustomerFrequentItemRequest,
): Promise<{ customerId: number; frequentItemId: number }> {
  return apiRequest(
    `/api/business/customers/${encodeURIComponent(String(customerId))}/frequent-items`,
    { method: "POST", json: input },
  );
}

export function updateCustomerFrequentItem(
  customerId: number,
  frequentItemId: number,
  input: UpdateCustomerFrequentItemRequest,
): Promise<{ updated: true; customerId: number; frequentItemId: number }> {
  return apiRequest(
    `/api/business/customers/${encodeURIComponent(String(customerId))}/frequent-items/${encodeURIComponent(String(frequentItemId))}`,
    { method: "PATCH", json: input },
  );
}

export function deleteCustomerFrequentItem(
  customerId: number,
  frequentItemId: number,
  input: DeleteCustomerFrequentItemRequest,
): Promise<{ deleted: true; customerId: number; frequentItemId: number }> {
  return apiRequest(
    `/api/business/customers/${encodeURIComponent(String(customerId))}/frequent-items/${encodeURIComponent(String(frequentItemId))}`,
    { method: "DELETE", json: input },
  );
}

export function loadCustomerQuotes(
  customerId: number,
  limit = 100,
): Promise<CustomerRelatedPage<CustomerItemQuoteSummary>> {
  const params = new URLSearchParams({ limit: String(limit) });
  return apiRequest<CustomerRelatedPage<CustomerItemQuoteSummary>>(
    `/api/business/customers/${encodeURIComponent(String(customerId))}/quotes?${params.toString()}`,
    { method: "GET" },
  );
}

export function loadCustomerQuote(customerId: number, quoteId: number): Promise<CustomerItemQuoteDetail> {
  return apiRequest<CustomerItemQuoteDetail>(
    `/api/business/customers/${encodeURIComponent(String(customerId))}/quotes/${encodeURIComponent(String(quoteId))}`,
    { method: "GET" },
  );
}

export function createCustomerQuote(
  customerId: number,
  input: CreateCustomerItemQuoteRequest,
): Promise<CustomerItemQuoteDetail> {
  return apiRequest<CustomerItemQuoteDetail>(
    `/api/business/customers/${encodeURIComponent(String(customerId))}/quotes`,
    { method: "POST", json: input },
  );
}

export function correctCustomerQuote(
  customerId: number,
  quoteId: number,
  input: CorrectCustomerItemQuoteRequest,
): Promise<CustomerItemQuoteDetail> {
  return apiRequest<CustomerItemQuoteDetail>(
    `/api/business/customers/${encodeURIComponent(String(customerId))}/quotes/${encodeURIComponent(String(quoteId))}/correct`,
    { method: "POST", json: input },
  );
}
