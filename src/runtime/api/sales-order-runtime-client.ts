import type { SalesWorkOrderModuleLookups } from "../../../shared/business-lookups";
import type {
  CreateSalesWorkOrderRequest,
  DeleteSalesWorkOrderRequest,
  FillOrCorrectErpRequest,
  SalesWorkOrderDetail,
  SalesWorkOrderListResult,
  SalesWorkOrderSearchQuery,
  SalesWorkOrderTransitionRequest,
  UpdateSalesWorkOrderRequest,
} from "../../../shared/sales-work-order";
import { apiRequest } from "../../api/client";

function searchPath(query: SalesWorkOrderSearchQuery): string {
  const params = new URLSearchParams();
  if (query.q?.trim()) params.set("q", query.q.trim());
  if (query.statusCode) params.set("statusCode", query.statusCode);
  if (query.customerId != null) params.set("customerId", String(query.customerId));
  if (query.operatorEmployeeId != null) params.set("operatorEmployeeId", String(query.operatorEmployeeId));
  if (query.orderDateFrom) params.set("orderDateFrom", query.orderDateFrom);
  if (query.orderDateTo) params.set("orderDateTo", query.orderDateTo);
  if (query.limit != null) params.set("limit", String(query.limit));
  if (query.cursor) params.set("cursor", query.cursor);
  const encoded = params.toString();
  return encoded ? `/api/business/orders?${encoded}` : "/api/business/orders";
}

export function loadSalesOrderLookups(selected: {
  customerId?: number | null;
  itemIds?: readonly number[];
  operatorId?: number | null;
  customerQuery?: string;
  itemQuery?: string;
  limit?: number;
} = {}): Promise<SalesWorkOrderModuleLookups> {
  const params = new URLSearchParams();
  if (selected.customerId != null) params.set("customerId", String(selected.customerId));
  if (selected.itemIds?.length) params.set("itemIds", [...new Set(selected.itemIds)].join(","));
  if (selected.operatorId != null) params.set("operatorId", String(selected.operatorId));
  if (selected.customerQuery?.trim()) params.set("customerQ", selected.customerQuery.trim());
  if (selected.itemQuery?.trim()) params.set("itemQ", selected.itemQuery.trim());
  params.set("limit", String(selected.limit ?? 100));
  return apiRequest<SalesWorkOrderModuleLookups>(
    `/api/business/orders/lookups?${params.toString()}`,
    { method: "GET" },
  );
}

export function searchSalesOrders(query: SalesWorkOrderSearchQuery): Promise<SalesWorkOrderListResult> {
  return apiRequest<SalesWorkOrderListResult>(searchPath(query), { method: "GET" });
}

export function loadSalesOrderDetail(orderId: number): Promise<SalesWorkOrderDetail> {
  return apiRequest<SalesWorkOrderDetail>(
    `/api/business/orders/${encodeURIComponent(String(orderId))}`,
    { method: "GET" },
  );
}

export function createSalesOrder(input: CreateSalesWorkOrderRequest): Promise<SalesWorkOrderDetail> {
  return apiRequest<SalesWorkOrderDetail>("/api/business/orders", { method: "POST", json: input });
}

export function updateSalesOrder(orderId: number, input: UpdateSalesWorkOrderRequest): Promise<SalesWorkOrderDetail> {
  return apiRequest<SalesWorkOrderDetail>(
    `/api/business/orders/${encodeURIComponent(String(orderId))}`,
    { method: "PATCH", json: input },
  );
}

export function fillOrCorrectSalesOrderErp(orderId: number, input: FillOrCorrectErpRequest): Promise<SalesWorkOrderDetail> {
  return apiRequest<SalesWorkOrderDetail>(
    `/api/business/orders/${encodeURIComponent(String(orderId))}/erp`,
    { method: "POST", json: input },
  );
}

function transition(
  orderId: number,
  action: "waiting-stock" | "picked" | "shipped" | "reverse-shipment" | "void",
  input: SalesWorkOrderTransitionRequest,
): Promise<SalesWorkOrderDetail> {
  return apiRequest<SalesWorkOrderDetail>(
    `/api/business/orders/${encodeURIComponent(String(orderId))}/${action}`,
    { method: "POST", json: input },
  );
}

export function markSalesOrderWaitingStock(orderId: number, input: SalesWorkOrderTransitionRequest): Promise<SalesWorkOrderDetail> {
  return transition(orderId, "waiting-stock", input);
}

export function markSalesOrderPicked(orderId: number, input: SalesWorkOrderTransitionRequest): Promise<SalesWorkOrderDetail> {
  return transition(orderId, "picked", input);
}

export function markSalesOrderShipped(orderId: number, input: SalesWorkOrderTransitionRequest): Promise<SalesWorkOrderDetail> {
  return transition(orderId, "shipped", input);
}

export function reverseSalesOrderShipment(orderId: number, input: SalesWorkOrderTransitionRequest): Promise<SalesWorkOrderDetail> {
  return transition(orderId, "reverse-shipment", input);
}

export function voidSalesOrder(orderId: number, input: SalesWorkOrderTransitionRequest): Promise<SalesWorkOrderDetail> {
  return transition(orderId, "void", input);
}

export function deleteSalesOrderDraft(orderId: number, input: DeleteSalesWorkOrderRequest): Promise<{ deleted: true; orderId: number }> {
  return apiRequest(
    `/api/business/orders/${encodeURIComponent(String(orderId))}`,
    { method: "DELETE", json: input },
  );
}
