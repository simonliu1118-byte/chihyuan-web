import { apiRequest } from "../../api/client";
import type { ErpAgentStatus, ErpQueryResult } from "../../../shared/erp-item-query";

export function createErpItemQuery(itemNo: string): Promise<Pick<ErpQueryResult, "id" | "itemNo" | "status" | "createdAt">> {
  return apiRequest("/api/erp/item-queries", { method: "POST", json: { itemNo } });
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
