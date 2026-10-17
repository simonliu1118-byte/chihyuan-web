import { apiRequest } from "../../api/client";
import type { ErpAgentStatus, ErpHistoryRequest, ErpQueryResult, ErpReceivableScope } from "../../../shared/erp-item-query";

export type NewErpJob = Pick<ErpQueryResult,
  "id" | "queryType" | "itemNo" | "keyword" | "code" | "scope" | "dateFrom" | "dateTo"
  | "status" | "createdAt" | "includeHistory" | "historyFrom" | "historyTo">;
/** Every ERP query request, one per query type (see worker/http/erp-item-query-routes.ts). */
export type ErpQueryRequest =
  | ({ queryType: "ITEM_NO"; itemNo: string } & ErpHistoryRequest)
  | { queryType: "ITEM_NAME" | "CUSTOMER_NAME" | "SUPPLIER_NAME"; keyword: string }
  | { queryType: "SUPPLIER_NO"; supplierCode: string }
  | { queryType: "PURCHASES"; supplierCode: string; dateFrom: string | null; dateTo: string | null }
  | { queryType: "CUSTOMER_NO"; customerCode: string }
  | { queryType: "SALES"; customerCode: string; dateFrom: string | null; dateTo: string | null }
  | { queryType: "RECEIVABLE"; scope: ErpReceivableScope; code: string | null }
  | { queryType: "ORDER"; orderNo: string };
export function createErpQuery(request: ErpQueryRequest): Promise<NewErpJob> {
  // A RECEIVABLE ALL request carries no code at all.
  const json = request.queryType === "RECEIVABLE" && request.scope === "ALL" ? { queryType: request.queryType, scope: request.scope } : request;
  return apiRequest("/api/erp/item-queries", { method: "POST", json });
}
export function loadErpItemQuery(id: string): Promise<ErpQueryResult> {
  return apiRequest(`/api/erp/item-queries/${encodeURIComponent(id)}`, { method: "GET" });
}
export function loadErpAgentStatus(): Promise<ErpAgentStatus> {
  return apiRequest("/api/erp/agent-status", { method: "GET" });
}

export interface ErpAgentCredentialStatus {
  configured: boolean;
  createdAt: string | null;
  revokedAt: string | null;
}
export function loadErpAgentCredentialStatus(): Promise<ErpAgentCredentialStatus> {
  return apiRequest("/api/erp/agent-credentials", { method: "GET" });
}
export function issueErpAgentCredential(): Promise<{ token: string; createdAt: string }> {
  return apiRequest("/api/erp/agent-credentials", { method: "POST" });
}
export function revokeErpAgentCredential(): Promise<{ configured: false; revokedAt: string }> {
  return apiRequest("/api/erp/agent-credentials", { method: "DELETE" });
}
