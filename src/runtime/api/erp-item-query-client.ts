import { apiRequest } from "../../api/client";
import type { ErpAgentStatus, ErpHistoryRequest, ErpQueryResult } from "../../../shared/erp-item-query";

export type NewErpJob = Pick<ErpQueryResult,
  "id" | "queryType" | "itemNo" | "keyword" | "status" | "createdAt" | "includeHistory" | "historyFrom" | "historyTo">;
export function createErpItemQuery(itemNo: string, history: ErpHistoryRequest): Promise<NewErpJob> {
  return apiRequest("/api/erp/item-queries", { method: "POST", json: { queryType:"ITEM_NO", itemNo, ...history } });
}
export function createErpNameSearch(keyword: string): Promise<NewErpJob> {
  return apiRequest("/api/erp/item-queries", { method: "POST", json: { queryType:"ITEM_NAME", keyword } });
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
