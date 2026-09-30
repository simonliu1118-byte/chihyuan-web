import type { OutsourcingModuleLookups } from "../../../shared/business-lookups";
import type {
  BomDetail,
  BomListResult,
  BomSearchQuery,
  ContractorDetail,
  ContractorListResult,
  ContractorSearchQuery,
  ContractorStockBalance,
  CreateBomRequest,
  CreateContractorRequest,
  CreateOutsourcingRequest,
  OutsourcingDetail,
  OutsourcingListResult,
  OutsourcingSearchQuery,
  OutsourcingTransitionRequest,
  PriceOutsourcingRequest,
  ReceiveOutsourcingRequest,
  SetContractorPriceRequest,
  UpdateBomRequest,
  UpdateContractorRequest,
  UpdateOutsourcingRequest,
} from "../../../shared/contractor-outsourcing";
import { apiRequest } from "../../api/client";

function paramsFrom(entries: Record<string, string | number | boolean | undefined>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (value == null || value === "") continue;
    params.set(key, String(value));
  }
  const encoded = params.toString();
  return encoded ? `?${encoded}` : "";
}

export function loadOutsourcingLookups(selected: {
  itemIds?: readonly number[];
  itemQuery?: string;
  limit?: number;
} = {}): Promise<OutsourcingModuleLookups> {
  return apiRequest(
    `/api/business/outsourcing/lookups${paramsFrom({
      itemIds: selected.itemIds?.length ? [...new Set(selected.itemIds)].join(",") : undefined,
      itemQ: selected.itemQuery?.trim() || undefined,
      limit: selected.limit ?? 100,
    })}`,
    { method: "GET" },
  );
}

export function searchContractors(query: ContractorSearchQuery = {}): Promise<ContractorListResult> {
  return apiRequest(
    `/api/business/outsourcing/contractors${paramsFrom({
      q: query.q?.trim() || undefined,
      isActive: query.isActive,
      entityType: query.entityType,
      limit: query.limit,
      cursor: query.cursor,
    })}`,
    { method: "GET" },
  );
}

export function loadContractorDetail(contractorId: number): Promise<ContractorDetail> {
  return apiRequest(`/api/business/outsourcing/contractors/${contractorId}`, { method: "GET" });
}

export function createContractor(input: CreateContractorRequest): Promise<ContractorDetail> {
  return apiRequest("/api/business/outsourcing/contractors", { method: "POST", json: input });
}

export function updateContractor(contractorId: number, input: UpdateContractorRequest): Promise<ContractorDetail> {
  return apiRequest(`/api/business/outsourcing/contractors/${contractorId}`, { method: "PATCH", json: input });
}

export function setContractorPrice(
  contractorId: number,
  input: SetContractorPriceRequest,
): Promise<ContractorDetail> {
  return apiRequest(`/api/business/outsourcing/contractors/${contractorId}/prices`, { method: "PUT", json: input });
}

export function deleteContractor(
  contractorId: number,
  expectedRevision: number,
): Promise<{ deleted: true; contractorId: number }> {
  return apiRequest(`/api/business/outsourcing/contractors/${contractorId}`, {
    method: "DELETE",
    json: { expectedRevision },
  });
}

export function searchBoms(query: BomSearchQuery = {}): Promise<BomListResult> {
  return apiRequest(
    `/api/business/outsourcing/boms${paramsFrom({
      q: query.q?.trim() || undefined,
      finishedItemId: query.finishedItemId,
      isActive: query.isActive,
      limit: query.limit,
      cursor: query.cursor,
    })}`,
    { method: "GET" },
  );
}

export function loadBomDetail(bomId: number): Promise<BomDetail> {
  return apiRequest(`/api/business/outsourcing/boms/${bomId}`, { method: "GET" });
}

export function createBom(input: CreateBomRequest): Promise<BomDetail> {
  return apiRequest("/api/business/outsourcing/boms", { method: "POST", json: input });
}

export function updateBom(bomId: number, input: UpdateBomRequest): Promise<BomDetail> {
  return apiRequest(`/api/business/outsourcing/boms/${bomId}`, { method: "PATCH", json: input });
}

export function loadContractorStock(contractorId: number): Promise<readonly ContractorStockBalance[]> {
  return apiRequest<{ items: readonly ContractorStockBalance[] }>(
    `/api/business/outsourcing/stock?contractorId=${encodeURIComponent(String(contractorId))}`,
    { method: "GET" },
  ).then((result) => result.items);
}

export function searchOutsourcingOrders(query: OutsourcingSearchQuery = {}): Promise<OutsourcingListResult> {
  return apiRequest(
    `/api/business/outsourcing/orders${paramsFrom({
      q: query.q?.trim() || undefined,
      statusCode: query.statusCode,
      contractorId: query.contractorId,
      orderDateFrom: query.orderDateFrom,
      orderDateTo: query.orderDateTo,
      limit: query.limit,
      cursor: query.cursor,
    })}`,
    { method: "GET" },
  );
}

export function loadOutsourcingDetail(orderId: number): Promise<OutsourcingDetail> {
  return apiRequest(`/api/business/outsourcing/orders/${orderId}`, { method: "GET" });
}

export function createOutsourcingOrder(input: CreateOutsourcingRequest): Promise<OutsourcingDetail> {
  return apiRequest("/api/business/outsourcing/orders", { method: "POST", json: input });
}

export function updateOutsourcingPending(orderId: number, input: UpdateOutsourcingRequest): Promise<OutsourcingDetail> {
  return apiRequest(`/api/business/outsourcing/orders/${orderId}`, { method: "PATCH", json: input });
}

function orderAction<T>(
  orderId: number,
  action: string,
  input: T,
): Promise<OutsourcingDetail> {
  return apiRequest(`/api/business/outsourcing/orders/${orderId}/${action}`, { method: "POST", json: input });
}

export function confirmOutsourcingOutbound(orderId: number, input: OutsourcingTransitionRequest): Promise<OutsourcingDetail> {
  return orderAction(orderId, "confirm-outbound", input);
}

export function correctOutsourcingOutbound(
  orderId: number,
  input: UpdateOutsourcingRequest & { reason?: string | null },
): Promise<OutsourcingDetail> {
  return orderAction(orderId, "correct-outbound", input);
}

export function cancelOutsourcingOutbound(orderId: number, input: OutsourcingTransitionRequest): Promise<OutsourcingDetail> {
  return orderAction(orderId, "cancel-outbound", input);
}

export function receiveOutsourcing(orderId: number, input: ReceiveOutsourcingRequest): Promise<OutsourcingDetail> {
  return orderAction(orderId, "receive", input);
}

export function cancelOutsourcingReceipt(orderId: number, input: OutsourcingTransitionRequest): Promise<OutsourcingDetail> {
  return orderAction(orderId, "cancel-receipt", input);
}

export function priceOutsourcing(orderId: number, input: PriceOutsourcingRequest): Promise<OutsourcingDetail> {
  return orderAction(orderId, "price", input);
}

export function cancelOutsourcingPricing(orderId: number, input: OutsourcingTransitionRequest): Promise<OutsourcingDetail> {
  return orderAction(orderId, "cancel-pricing", input);
}

export function markOutsourcingPaid(orderId: number, input: OutsourcingTransitionRequest): Promise<OutsourcingDetail> {
  return orderAction(orderId, "paid", input);
}

export function cancelOutsourcingPayment(orderId: number, input: OutsourcingTransitionRequest): Promise<OutsourcingDetail> {
  return orderAction(orderId, "cancel-payment", input);
}

export function deleteOutsourcingPending(
  orderId: number,
  expectedRevision: number,
): Promise<{ deleted: true; orderId: number }> {
  return apiRequest(`/api/business/outsourcing/orders/${orderId}`, {
    method: "DELETE",
    json: { expectedRevision },
  });
}
