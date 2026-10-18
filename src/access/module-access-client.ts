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

/** 權限群組: members use exactly the group's modules (BD-057). */
export interface ModuleAccessGroup {
  id: number;
  name: string;
  modules: CyWebModuleCode[];
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

export function createModuleAccessGroup(name: string, modules: readonly CyWebModuleCode[]) {
  return apiRequest<{ group: ModuleAccessGroup }>("/api/module-access/admin/groups", { method: "POST", json: { name, modules } });
}

export function updateModuleAccessGroup(groupId: number, name: string, modules: readonly CyWebModuleCode[], expectedRevision: number) {
  return apiRequest<{ group: Omit<ModuleAccessGroup, "memberCount"> }>(`/api/module-access/admin/groups/${groupId}`,
    { method: "PATCH", json: { name, modules, expectedRevision } });
}

export function deleteModuleAccessGroup(groupId: number, expectedRevision: number) {
  return apiRequest<{ deleted: true; groupId: number }>(`/api/module-access/admin/groups/${groupId}`, { method: "DELETE", json: { expectedRevision } });
}

/** Joins a group (its modules replace the person's) or leaves it with null (current modules are kept). */
export function setEmployeeModuleGroup(employeeId: string, groupId: number | null) {
  return apiRequest<{ employeeId: string; groupId: number | null }>(
    `/api/module-access/admin/employees/${encodeURIComponent(employeeId)}/group`, { method: "PUT", json: { groupId } });
}
