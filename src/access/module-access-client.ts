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

export interface ModuleAccessAdminSnapshot {
  modules: ModuleCatalogItem[];
  grants: ModuleAccessGrant[];
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
