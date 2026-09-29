import type { IdentityPrincipal } from "../identity/contract";

export interface AppMemberRecord {
  id: number;
  identityEmployeeId: string;
  employeeNo: string | null;
  isActive: boolean;
}

export type ModuleAccessDecision =
  | { allowed: true; member: AppMemberRecord }
  | { allowed: false; reason: "module-not-granted"; member: AppMemberRecord };

type AppMemberRow = {
  id: number;
  identity_employee_id: string;
  employee_no: string | null;
  is_active: number;
};

function toAppMember(row: AppMemberRow): AppMemberRecord {
  return {
    id: row.id,
    identityEmployeeId: row.identity_employee_id,
    employeeNo: row.employee_no,
    isActive: row.is_active === 1,
  };
}

function normalizeEmployeeNo(value: string | null): string | null {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function normalizeModuleCode(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  if (!normalized || normalized.length > 64 || /[^a-z0-9_-]/.test(normalized)) return null;
  return normalized;
}

/**
 * Resolve the CY Web projection for business-domain foreign keys. This row is not
 * a second account-status authority: every enabled CYID Employee may enter the CY
 * Web account shell regardless of historical app_members.is_active state.
 */
export async function resolveAppMember(
  db: D1Database,
  principal: IdentityPrincipal,
  nowIso = new Date().toISOString(),
): Promise<AppMemberRecord> {
  const existing = await db
    .prepare(
      `SELECT id, identity_employee_id, employee_no, is_active
         FROM app_members
        WHERE identity_employee_id = ?1
        LIMIT 1`,
    )
    .bind(principal.employeeId)
    .first<AppMemberRow>();

  const employeeNo = normalizeEmployeeNo(principal.employeeNo);

  if (!existing) {
    const result = await db
      .prepare(
        `INSERT INTO app_members (
           identity_employee_id,
           employee_no,
           is_active,
           created_at,
           updated_at
         ) VALUES (?1, ?2, 1, ?3, ?3)`,
      )
      .bind(principal.employeeId, employeeNo, nowIso)
      .run();

    const id = Number(result.meta.last_row_id);
    if (!Number.isInteger(id) || id <= 0) throw new Error("APP_MEMBER_INSERT_FAILED");
    return { id, identityEmployeeId: principal.employeeId, employeeNo, isActive: true };
  }

  const member = toAppMember(existing);
  if (member.employeeNo !== employeeNo || !member.isActive) {
    await db
      .prepare(
        `UPDATE app_members
            SET employee_no = ?2,
                is_active = 1,
                updated_at = ?3
          WHERE id = ?1`,
      )
      .bind(member.id, employeeNo, nowIso)
      .run();
    member.employeeNo = employeeNo;
    member.isActive = true;
  }
  return member;
}

/**
 * Super Admin automatically owns every CY Web module. All other Employees use a
 * direct CY Web-local Employee -> Module grant keyed by the stable CYID Employee
 * id. Workspace ADMIN with a granted module is a full administrator of that
 * module; finer USER permissions are intentionally outside this phase.
 */
export async function checkModuleAccess(
  db: D1Database,
  principal: IdentityPrincipal,
  moduleCode: string,
): Promise<ModuleAccessDecision> {
  const normalizedModule = normalizeModuleCode(moduleCode);
  if (!normalizedModule) throw new Error("INVALID_MODULE_CODE");

  const member = await resolveAppMember(db, principal);
  if (principal.workspaceRole === "SUPER_ADMIN") return { allowed: true, member };

  const grant = await db
    .prepare(
      `SELECT 1 AS allowed
         FROM identity_module_access
        WHERE identity_employee_id = ?1
          AND module_code = ?2
          AND enabled = 1
        LIMIT 1`,
    )
    .bind(principal.employeeId, normalizedModule)
    .first<{ allowed: number }>();

  return grant
    ? { allowed: true, member }
    : { allowed: false, reason: "module-not-granted", member };
}
