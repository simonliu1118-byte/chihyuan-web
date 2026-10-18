import type { SettingsSnapshot } from "../../../shared/settings";
import { apiRequest } from "../../api/client";

export interface AuditActor {
  id:number;employeeNo:string|null;displayName:string|null;
}
export interface AuditEvent {
  id: number; entityType: string; entityKey: string; action: string;
  actorEmployeeId: number | null; actor: AuditActor | null; occurredAt: string;
  statusFrom: string | null; statusTo: string | null;
  requestId: string | null; before: Record<string, unknown> | null;
  after: Record<string, unknown> | null; metadata: Record<string, unknown> | null;
}
export function loadSettings(): Promise<SettingsSnapshot> {
  return apiRequest("/api/admin/settings", { method: "GET" });
}
export function saveSetting(path: string, method: "POST" | "PATCH" | "PUT", input: unknown): Promise<{ saved: true }> {
  return apiRequest(`/api/admin/settings/${path}`, { method, json: input });
}
export function loadAudit(query: Record<string, string>): Promise<{ events: AuditEvent[]; nextCursor: string | null; actors: AuditActor[] }> {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value.trim()) params.set(key, value.trim());
  return apiRequest(`/api/admin/audit?${params}`, { method: "GET" });
}
