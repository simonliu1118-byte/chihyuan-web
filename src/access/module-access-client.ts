import { apiRequest } from "../api/client";
import type { CyWebModuleCode } from "../../shared/modules";

export interface ModuleCatalogItem {
  code: CyWebModuleCode;
  route: string;
  label: string;
}

export interface CurrentModuleAccess {
  modules: ModuleCatalogItem[];
  allowedModules: CyWebModuleCode[];
  implicitAll: boolean;
}

export interface ModuleAccessGrant {
  employee_id: string;
  module_code: CyWebModuleCode;
  enabled: number;
  updated_at: string;
}

/** 權限群組: members use exactly the group's modules and systems (BD-057). */
export interface ModuleAccessGroup {
  id: number;
  name: string;
  modules: CyWebModuleCode[];
  applications: string[];
  revision: number;
  memberCount: number;
}

export interface ModuleAccessAdminSnapshot {
  modules: ModuleCatalogItem[];
  grants: ModuleAccessGrant[];
  groups: ModuleAccessGroup[];
  memberships: { employee_id: string; group_id: number }[];
}

export function loadCurrentModuleAccess(): Promise<CurrentModuleAccess> {
  return apiRequest<CurrentModuleAccess>("/api/module-access", { method: "GET" });
}

export function loadModuleAccessAdminSnapshot(): Promise<ModuleAccessAdminSnapshot> {
  return apiRequest<ModuleAccessAdminSnapshot>("/api/module-access/admin", { method: "GET" });
}

export function setEmployeeModuleAccess(employeeId: string, moduleCode: CyWebModuleCode, enabled: boolean) {
  return apiRequest<{ access: { employeeId: string; moduleCode: CyWebModuleCode; enabled: boolean; effectiveImmediately: boolean } }>(
    `/api/module-access/admin/employees/${encodeURIComponent(employeeId)}/modules/${encodeURIComponent(moduleCode)}`,
    { method: "PUT", json: { enabled } },
  );
}

export function checkModuleAccess(moduleCode: CyWebModuleCode) {
  return apiRequest<{ moduleCode: CyWebModuleCode; allowed: true }>(
    `/api/module-access/check/${encodeURIComponent(moduleCode)}`,
    { method: "GET" },
  );
}

export interface ModuleAccessGroupInput {
  name: string;
  modules: readonly CyWebModuleCode[];
  applications: readonly string[];
}

/** Employees whose system access CYID did not update; they show as not applied until re-synced. */
export interface ApplicationSyncResult {
  applicationSyncFailed: string[];
}

export function createModuleAccessGroup(input: ModuleAccessGroupInput) {
  return apiRequest<{ group: ModuleAccessGroup }>("/api/module-access/admin/groups", { method: "POST", json: input });
}

export function updateModuleAccessGroup(groupId: number, input: ModuleAccessGroupInput, expectedRevision: number) {
  return apiRequest<{ group: Omit<ModuleAccessGroup, "memberCount"> } & ApplicationSyncResult>(`/api/module-access/admin/groups/${groupId}`,
    { method: "PATCH", json: { ...input, expectedRevision } });
}

export function syncModuleAccessGroup(groupId: number) {
  return apiRequest<{ groupId: number } & ApplicationSyncResult>(`/api/module-access/admin/groups/${groupId}/sync`, { method: "POST", json: {} });
}

export function deleteModuleAccessGroup(groupId: number, expectedRevision: number) {
  return apiRequest<{ deleted: true; groupId: number }>(`/api/module-access/admin/groups/${groupId}`, { method: "DELETE", json: { expectedRevision } });
}

/** Joins a group (its modules and systems replace the person's) or leaves it with null (current settings are kept). */
export function setEmployeeModuleGroup(employeeId: string, groupId: number | null) {
  return apiRequest<{ employeeId: string; groupId: number | null } & ApplicationSyncResult>(
    `/api/module-access/admin/employees/${encodeURIComponent(employeeId)}/group`, { method: "PUT", json: { groupId } });
}
