import { isSharedAdmin, type IdentityPrincipal } from "../identity/contract";

export interface AppMemberRecord {
  id: number;
  identityEmployeeId: string;
  employeeNo: string | null;
  isActive: boolean;
}

export type ModuleAccessDecision =
  | { allowed: true; member: AppMemberRecord }
  | { allowed: false; reason: "app-member-inactive" | "module-not-granted"; member: AppMemberRecord };

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

/**
 * Resolve the local CY Web projection for a shared Identity employee.
 *
 * This deliberately avoids a write on every request. The row is inserted when
 * first seen, and employee_no is refreshed only when it actually changes.
 * Credentials and shared roles are never copied into CY Web D1.
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
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error("APP_MEMBER_INSERT_FAILED");
    }

    return {
      id,
      identityEmployeeId: principal.employeeId,
      employeeNo,
      isActive: true,
    };
  }

  const member = toAppMember(existing);
  if (member.employeeNo !== employeeNo) {
    await db
      .prepare(
        `UPDATE app_members
            SET employee_no = ?2,
                updated_at = ?3
          WHERE id = ?1`,
      )
      .bind(member.id, employeeNo, nowIso)
      .run();
    member.employeeNo = employeeNo;
  }

  return member;
}

/**
 * Shared ADMIN/SUPER_ADMIN authority remains shared-Identity authority.
 * Ordinary employees need at least one active CY Web tag granting the module.
 */
export async function checkModuleAccess(
  db: D1Database,
  principal: IdentityPrincipal,
  moduleCode: string,
): Promise<ModuleAccessDecision> {
  const normalizedModule = moduleCode.trim();
  if (normalizedModule.length === 0 || normalizedModule.length > 64) {
    throw new Error("INVALID_MODULE_CODE");
  }

  const member = await resolveAppMember(db, principal);
  if (!member.isActive) {
    return { allowed: false, reason: "app-member-inactive", member };
  }

  if (isSharedAdmin(principal.role)) {
    return { allowed: true, member };
  }

  const grant = await db
    .prepare(
      `SELECT 1 AS allowed
         FROM app_member_tags AS mt
         JOIN app_tags AS t
           ON t.id = mt.tag_id
          AND t.is_active = 1
         JOIN app_tag_modules AS tm
           ON tm.tag_id = t.id
        WHERE mt.member_id = ?1
          AND tm.module_code = ?2
        LIMIT 1`,
    )
    .bind(member.id, normalizedModule)
    .first<{ allowed: number }>();

  if (!grant) {
    return { allowed: false, reason: "module-not-granted", member };
  }

  return { allowed: true, member };
}
