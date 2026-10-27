import { apiRequest } from "../../api/client";
import type { ErpAgentControl, ErpAgentStatus, ErpQueryStatus, ErpQueryType, ErpHistoryRequest, ErpQueryResult, ErpReceivableScope } from "../../../shared/erp-item-query";

export type NewErpJob = Pick<ErpQueryResult,
  "id" | "queryType" | "itemNo" | "keyword" | "code" | "scope" | "dateFrom" | "dateTo"
  | "status" | "createdAt" | "includeHistory" | "historyFrom" | "historyTo" | "notBefore">;
/** Every ERP query request, one per query type (see worker/http/erp-item-query-routes.ts). */
export type ErpQueryRequest =
  | ({ queryType: "ITEM_NO"; itemNo: string } & ErpHistoryRequest)
  | { queryType: "ITEM_NAME" | "CUSTOMER_NAME" | "SUPPLIER_NAME"; keyword: string }
  | { queryType: "SUPPLIER_NO"; supplierCode: string }
  | { queryType: "PURCHASES"; supplierCode: string; dateFrom: string | null; dateTo: string | null }
  | { queryType: "CUSTOMER_NO"; customerCode: string }
  | { queryType: "SALES"; customerCode: string; dateFrom: string | null; dateTo: string | null }
  | { queryType: "RECEIVABLE"; scope: ErpReceivableScope; code: string | null }
  | { queryType: "ORDER"; orderNo: string }
  | { queryType: "RESTOCK"; dateFrom: string; dateTo: string };
/** afterHold: sent while ERP is paused, the query waits in the queue until the pause ends. */
export function createErpQuery(request: ErpQueryRequest, afterHold = false): Promise<NewErpJob> {
  // A RECEIVABLE ALL request carries no code at all.
  const json = request.queryType === "RECEIVABLE" && request.scope === "ALL" ? { queryType: request.queryType, scope: request.scope } : request;
  return apiRequest("/api/erp/item-queries", { method: "POST", json: afterHold ? { ...json, afterHold } : json });
}
export function loadErpItemQuery(id: string): Promise<ErpQueryResult> {
  return apiRequest(`/api/erp/item-queries/${encodeURIComponent(id)}`, { method: "GET" });
}
/** The member's ERP queries of the last 24 hours, newest first (any device). */
export interface RecentErpJob { id: string; queryType: ErpQueryType; status: ErpQueryStatus; createdAt: string }
export function loadRecentErpJobs(): Promise<RecentErpJob[]> {
  return apiRequest("/api/erp/item-queries/recent", { method: "GET" });
}
/** One query in the Agent's queue; target is left out of types the reader may not query. */
export interface ErpQueueJob {
  id: string; mine: boolean; member: string; queryType: ErpQueryType; target: string | null;
  status: "QUEUED" | "RUNNING"; createdAt: string; startedAt: string | null; notBefore: string | null;
  progress: { stage: "REPORT" | "STOCK"; done: number; total: number } | null; estimatedDoneAt: string;
}
export function loadErpQueue(): Promise<{ jobs: ErpQueueJob[]; maxPerMember: number }> {
  return apiRequest("/api/erp/queue");
}
export function loadErpAgentStatus(): Promise<ErpAgentStatus> {
  return apiRequest("/api/erp/agent-status", { method: "GET" });
}
/** ERP 關閉／暫停 (user 2026-10-27): close after the queue (minutes>0 also holds new queries), force-close, or lift a hold. */
export type ErpControlAction = { action: "CLOSE"; minutes: 0 | 15 | 30 | 60 } | { action: "CLOSE"; until: string } | { action: "FORCE_CLOSE" } | { action: "RESUME" };
export function controlErpAgent(action: ErpControlAction): Promise<ErpAgentControl> {
  return apiRequest("/api/erp/agent-control", { method: "POST", json: action });
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
