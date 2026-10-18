import { CYWEB_MODULES, isCyWebModuleCode, type CyWebModuleCode } from "../../shared/modules";
import type { IdentityPrincipal } from "../identity/contract";

export interface AppMemberRecord {
  id: number;
  identityEmployeeId: string;
  employeeNo: string | null;
  displayName: string | null;
  isActive: boolean;
}

export type ModuleAccessDecision =
  | { allowed: true; member: AppMemberRecord }
  | { allowed: false; reason: "app-member-inactive" | "module-not-granted"; member: AppMemberRecord };

type AppMemberRow = {
  id: number;
  identity_employee_id: string;
  employee_no: string | null;
  display_name: string | null;
  is_active: number;
};

function toAppMember(row: AppMemberRow): AppMemberRecord {
  return {
    id: row.id,
    identityEmployeeId: row.identity_employee_id,
    employeeNo: row.employee_no,
    displayName: row.display_name,
    isActive: row.is_active === 1,
  };
}

function normalizeEmployeeNo(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export async function ensureAppMemberProjection(
  db: D1Database,
  identityEmployeeId: string,
  employeeNo: string | null,
  nowIso = new Date().toISOString(),
  displayName?: string | null,
): Promise<AppMemberRecord> {
  const name = displayName?.trim() || null;
  const validName = name && name.length <= 120 ? name : null;
  const normalizedIdentityEmployeeId = identityEmployeeId.trim();
  if (!normalizedIdentityEmployeeId || normalizedIdentityEmployeeId.length > 128) {
    throw new Error("INVALID_IDENTITY_EMPLOYEE_ID");
  }

  const existing = await db
    .prepare(
      `SELECT id, identity_employee_id, employee_no, display_name, is_active
         FROM app_members
        WHERE identity_employee_id = ?1
        LIMIT 1`,
    )
    .bind(normalizedIdentityEmployeeId)
    .first<AppMemberRow>();

  const normalizedEmployeeNo = normalizeEmployeeNo(employeeNo);
  if (!existing) {
    const result = await db
      .prepare(
        `INSERT INTO app_members (
           identity_employee_id, employee_no, display_name, is_active, created_at, updated_at
         ) VALUES (?1, ?2, ?4, 1, ?3, ?3)`,
      )
      .bind(normalizedIdentityEmployeeId, normalizedEmployeeNo, nowIso, validName)
      .run();
    const id = Number(result.meta.last_row_id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("APP_MEMBER_INSERT_FAILED");
    return { id, identityEmployeeId: normalizedIdentityEmployeeId, employeeNo: normalizedEmployeeNo, displayName: validName, isActive: true };
  }

  const member = toAppMember(existing);
  if (member.employeeNo !== normalizedEmployeeNo || (validName && member.displayName !== validName)) {
    await db.prepare(
      `UPDATE app_members SET employee_no = ?2, display_name = COALESCE(?4, display_name), updated_at = ?3 WHERE id = ?1`,
    ).bind(member.id, normalizedEmployeeNo, nowIso, validName).run();
    member.employeeNo = normalizedEmployeeNo;
    if (validName) member.displayName = validName;
  }
  return member;
}

/** Local CY Web projection only. It is never a CY Web shell-entry authority. */
export async function resolveAppMember(
  db: D1Database,
  principal: IdentityPrincipal,
  nowIso = new Date().toISOString(),
): Promise<AppMemberRecord> {
  return ensureAppMemberProjection(db, principal.employeeId, principal.employeeNo, nowIso, principal.displayName);
}

export async function allowedModuleCodes(
  db: D1Database,
  principal: IdentityPrincipal,
): Promise<CyWebModuleCode[]> {
  if (principal.workspaceRole === "SUPER_ADMIN") return CYWEB_MODULES.map((module) => module.code);

  const member = await resolveAppMember(db, principal);
  if (!member.isActive) return [];

  const result = await db.prepare(
    `SELECT module_code
       FROM app_member_module_access
      WHERE member_id = ?1
        AND enabled = 1
      ORDER BY module_code`,
  ).bind(member.id).all<{ module_code: string }>();

  return (result.results ?? [])
    .map((row) => row.module_code)
    .filter(isCyWebModuleCode);
}

/** One app-local projection shape for the existing access route and auth refresh. */
export async function currentModuleAccess(db: D1Database, principal: IdentityPrincipal) {
  return {
    modules: CYWEB_MODULES,
    allowedModules: await allowedModuleCodes(db, principal),
    implicitAll: principal.workspaceRole === "SUPER_ADMIN",
  };
}

/**
 * CY Web module authorization. Super Admin always has every module. Other
 * Employees use direct CY Web-local Employee × Module grants; local state cannot
 * revoke the core CY Web account shell established by CYCloud Identity.
 */
export async function checkModuleAccess(
  db: D1Database,
  principal: IdentityPrincipal,
  moduleCode: string,
): Promise<ModuleAccessDecision> {
  const normalizedModule = moduleCode.trim().toUpperCase();
  if (!isCyWebModuleCode(normalizedModule)) throw new Error("INVALID_MODULE_CODE");

  const member = await resolveAppMember(db, principal);
  if (principal.workspaceRole === "SUPER_ADMIN") return { allowed: true, member };
  if (!member.isActive) return { allowed: false, reason: "app-member-inactive", member };

  const grant = await db
    .prepare(
      `SELECT 1 AS allowed
         FROM app_member_module_access
        WHERE member_id = ?1
          AND module_code = ?2
          AND enabled = 1
        LIMIT 1`,
    )
    .bind(member.id, normalizedModule)
    .first<{ allowed: number }>();

  if (!grant) return { allowed: false, reason: "module-not-granted", member };
  return { allowed: true, member };
}
