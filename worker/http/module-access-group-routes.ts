import { CYWEB_MODULES, isCyWebModuleCode, type CyWebModuleCode } from "../../shared/modules";
import { ensureAppMemberProjection, resolveAppMember } from "../auth/app-access";
import { requireIdentity } from "../auth/guard";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { canManageModuleAccess, identityTarget } from "./module-access-routes";
import { failure, success } from "./response";

/**
 * 權限群組 (BD-057). A group is a named set of CY Web modules; a member of a group has exactly
 * that set. Every write materializes the members' app_member_module_access rows in one batch,
 * so runtime authorization keeps reading only the direct grant table.
 */

export interface ModuleAccessGroupView {
  id: number;
  name: string;
  modules: CyWebModuleCode[];
  revision: number;
  memberCount: number;
}

export async function loadModuleAccessGroups(db: D1Database): Promise<{ groups: ModuleAccessGroupView[]; memberships: { employee_id: string; group_id: number }[] }> {
  const [groups, modules, members] = await db.batch([
    db.prepare("SELECT id,name,revision FROM module_access_groups ORDER BY name"),
    db.prepare("SELECT group_id,module_code FROM module_access_group_modules ORDER BY group_id,module_code"),
    db.prepare(`SELECT m.identity_employee_id AS employee_id, g.group_id
                  FROM app_member_module_groups g JOIN app_members m ON m.id = g.member_id ORDER BY m.identity_employee_id`),
  ]);
  const moduleRows = (modules.results ?? []) as { group_id: number; module_code: string }[];
  const memberships = (members.results ?? []) as { employee_id: string; group_id: number }[];
  return {
    groups: ((groups.results ?? []) as { id: number; name: string; revision: number }[]).map((group) => ({
      ...group,
      modules: moduleRows.filter((row) => row.group_id === group.id && isCyWebModuleCode(row.module_code)).map((row) => row.module_code as CyWebModuleCode),
      memberCount: memberships.filter((row) => row.group_id === group.id).length,
    })),
    memberships,
  };
}

type Gate = Extract<Awaited<ReturnType<typeof requireIdentity>>, { ok: true }>;

async function adminGate(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<Gate | Response> {
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503);
  const gate = await requireIdentity(provider, request);
  if (!gate.ok) return failure({ code: gate.code, message: "Authentication required" }, requestId, gate.status);
  if (!canManageModuleAccess(gate.principal.workspaceRole, gate.principal.isIdentityAdmin)) {
    return failure({ code: "ACCESS_DENIED", message: "Module Access administration is not allowed" }, requestId, 403);
  }
  return gate;
}

async function body(request: Request): Promise<Record<string, unknown>> {
  const value = await request.json().catch(() => null);
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function groupInput(raw: Record<string, unknown>): { name: string; modules: CyWebModuleCode[] } | null {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name || name.length > 60 || !Array.isArray(raw.modules)) return null;
  const modules = [...new Set(raw.modules)];
  if (!modules.every((code): code is CyWebModuleCode => typeof code === "string" && isCyWebModuleCode(code))) return null;
  return { name, modules };
}

/** One upsert per catalog module: members get exactly the group's set. */
function materialize(db: D1Database, memberScope: { groupId: number } | { memberId: number }, modules: readonly string[], now: string, actorId: number): D1PreparedStatement[] {
  const enabled = new Set(modules);
  return CYWEB_MODULES.map((module) => "groupId" in memberScope
    ? db.prepare(`INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at,updated_by)
        SELECT member_id, ?2, ?3, ?4, ?5 FROM app_member_module_groups WHERE group_id = ?1
        ON CONFLICT(member_id,module_code) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
        .bind(memberScope.groupId, module.code, enabled.has(module.code) ? 1 : 0, now, actorId)
    : db.prepare(`INSERT INTO app_member_module_access(member_id,module_code,enabled,updated_at,updated_by) VALUES(?1,?2,?3,?4,?5)
        ON CONFLICT(member_id,module_code) DO UPDATE SET enabled=excluded.enabled, updated_at=excluded.updated_at, updated_by=excluded.updated_by`)
        .bind(memberScope.memberId, module.code, enabled.has(module.code) ? 1 : 0, now, actorId));
}

function audit(db: D1Database, entityKey: string, action: string, actorId: number, now: string, requestId: string, before: unknown, after: unknown): D1PreparedStatement {
  return db.prepare(`INSERT INTO audit_events(entity_type, entity_key, action, actor_employee_id, occurred_at, request_id, before_json, after_json, metadata_json)
    VALUES('module_access_group', ?1, ?2, ?3, ?4, ?5, ?6, ?7, NULL)`)
    .bind(entityKey, action, actorId, now, requestId, before === null ? null : JSON.stringify(before), after === null ? null : JSON.stringify(after));
}

async function groupState(db: D1Database, id: number): Promise<{ id: number; name: string; revision: number; modules: string[] } | null> {
  const row = await db.prepare("SELECT id,name,revision FROM module_access_groups WHERE id=?1").bind(id).first<{ id: number; name: string; revision: number }>();
  if (!row) return null;
  const modules = await db.prepare("SELECT module_code FROM module_access_group_modules WHERE group_id=?1 ORDER BY module_code").bind(id).all<{ module_code: string }>();
  return { ...row, modules: (modules.results ?? []).map((item) => item.module_code) };
}

async function nameTaken(db: D1Database, name: string, exceptId?: number): Promise<boolean> {
  const row = await db.prepare("SELECT id FROM module_access_groups WHERE name=?1 AND id IS NOT ?2 LIMIT 1").bind(name, exceptId ?? null).first<{ id: number }>();
  return Boolean(row);
}

export async function createGroup(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<Response> {
  const gate = await adminGate(request, env, requestId);
  if (gate instanceof Response) return gate;
  const input = groupInput(await body(request));
  if (!input) return failure({ code: "INVALID_MODULE_ACCESS_GROUP", message: "請填寫群組名稱（60 字以內）並選擇有效的模組。" }, requestId, 400);
  if (await nameTaken(env.DB, input.name)) return failure({ code: "MODULE_ACCESS_GROUP_NAME_TAKEN", message: "已有同名的權限群組。" }, requestId, 409);
  const now = new Date().toISOString();
  const actor = await resolveAppMember(env.DB, gate.principal, now);
  const created = await env.DB.prepare(`INSERT INTO module_access_groups(name,revision,created_at,created_by,updated_at,updated_by)
    VALUES(?1,1,?2,?3,?2,?3) RETURNING id`).bind(input.name, now, actor.id).first<{ id: number }>();
  if (!created) return failure({ code: "MODULE_ACCESS_GROUP_CONFLICT", message: "權限群組未能建立，請重試。" }, requestId, 409);
  await env.DB.batch([
    ...input.modules.map((code) => env.DB.prepare("INSERT INTO module_access_group_modules(group_id,module_code) VALUES(?1,?2)").bind(created.id, code)),
    audit(env.DB, String(created.id), "module_access_group.created", actor.id, now, requestId, null, input),
  ]);
  return success({ group: { id: created.id, name: input.name, modules: input.modules, revision: 1, memberCount: 0 } }, requestId, { status: 201 });
}

export async function updateGroup(request: Request, env: IdentityRuntimeEnv, requestId: string, idRaw: string): Promise<Response> {
  const gate = await adminGate(request, env, requestId);
  if (gate instanceof Response) return gate;
  const id = Number(idRaw);
  const raw = await body(request);
  const input = groupInput(raw);
  const expectedRevision = raw.expectedRevision;
  if (!Number.isSafeInteger(id) || id <= 0 || !input || !Number.isSafeInteger(expectedRevision)) {
    return failure({ code: "INVALID_MODULE_ACCESS_GROUP", message: "請填寫群組名稱（60 字以內）並選擇有效的模組。" }, requestId, 400);
  }
  const current = await groupState(env.DB, id);
  if (!current) return failure({ code: "MODULE_ACCESS_GROUP_NOT_FOUND", message: "找不到這個權限群組。" }, requestId, 404);
  if (current.revision !== expectedRevision) return failure({ code: "MODULE_ACCESS_GROUP_REVISION_CONFLICT", message: "群組已被其他人修改，請重新整理後再試。" }, requestId, 409);
  if (await nameTaken(env.DB, input.name, id)) return failure({ code: "MODULE_ACCESS_GROUP_NAME_TAKEN", message: "已有同名的權限群組。" }, requestId, 409);
  const now = new Date().toISOString();
  const actor = await resolveAppMember(env.DB, gate.principal, now);
  // The guarded revision bump comes first; if it matches nothing the json('') guard aborts the batch.
  await env.DB.batch([
    env.DB.prepare("UPDATE module_access_groups SET name=?1, revision=revision+1, updated_at=?2, updated_by=?3 WHERE id=?4 AND revision=?5")
      .bind(input.name, now, actor.id, id, expectedRevision),
    env.DB.prepare("SELECT CASE WHEN changes() = 1 THEN 1 ELSE json('') END"),
    env.DB.prepare("DELETE FROM module_access_group_modules WHERE group_id=?1").bind(id),
    ...input.modules.map((code) => env.DB.prepare("INSERT INTO module_access_group_modules(group_id,module_code) VALUES(?1,?2)").bind(id, code)),
    ...materialize(env.DB, { groupId: id }, input.modules, now, actor.id),
    audit(env.DB, String(id), "module_access_group.updated", actor.id, now, requestId, { name: current.name, modules: current.modules }, input),
  ]).catch(() => { throw new GroupConflict(); });
  return success({ group: { id, ...input, revision: current.revision + 1 } }, requestId);
}

class GroupConflict extends Error {}

export async function deleteGroup(request: Request, env: IdentityRuntimeEnv, requestId: string, idRaw: string): Promise<Response> {
  const gate = await adminGate(request, env, requestId);
  if (gate instanceof Response) return gate;
  const id = Number(idRaw);
  const expectedRevision = (await body(request)).expectedRevision;
  if (!Number.isSafeInteger(id) || id <= 0 || !Number.isSafeInteger(expectedRevision)) {
    return failure({ code: "INVALID_MODULE_ACCESS_GROUP", message: "群組資料不正確。" }, requestId, 400);
  }
  const current = await groupState(env.DB, id);
  if (!current) return failure({ code: "MODULE_ACCESS_GROUP_NOT_FOUND", message: "找不到這個權限群組。" }, requestId, 404);
  if (current.revision !== expectedRevision) return failure({ code: "MODULE_ACCESS_GROUP_REVISION_CONFLICT", message: "群組已被其他人修改，請重新整理後再試。" }, requestId, 409);
  const now = new Date().toISOString();
  const actor = await resolveAppMember(env.DB, gate.principal, now);
  // Members leave the group and keep their current grants as their own settings.
  await env.DB.batch([
    env.DB.prepare("DELETE FROM app_member_module_groups WHERE group_id=?1").bind(id),
    env.DB.prepare("DELETE FROM module_access_groups WHERE id=?1 AND revision=?2").bind(id, expectedRevision),
    env.DB.prepare("SELECT CASE WHEN changes() = 1 THEN 1 ELSE json('') END"),
    audit(env.DB, String(id), "module_access_group.deleted", actor.id, now, requestId, { name: current.name, modules: current.modules }, null),
  ]).catch(() => { throw new GroupConflict(); });
  return success({ deleted: true, groupId: id }, requestId);
}

export async function setEmployeeGroup(request: Request, env: IdentityRuntimeEnv, requestId: string, employeeIdRaw: string): Promise<Response> {
  const gate = await adminGate(request, env, requestId);
  if (gate instanceof Response) return gate;
  const employeeId = employeeIdRaw.trim();
  const groupRaw = (await body(request)).groupId;
  const groupId = groupRaw === null ? null : Number(groupRaw);
  if (!employeeId || employeeId.length > 128 || (groupId !== null && (!Number.isSafeInteger(groupId) || groupId <= 0))) {
    return failure({ code: "INVALID_MODULE_ACCESS_GROUP", message: "群組資料不正確。" }, requestId, 400);
  }
  if (gate.principal.employeeId === employeeId) {
    return failure({ code: "SELF_ACCESS_CHANGE_NOT_ALLOWED", message: "Identity Admin cannot change their own Module Access" }, requestId, 409);
  }
  const targetResult = await identityTarget(request, env, employeeId);
  if (targetResult.status === "unauthorized") return failure({ code: "ACCESS_DENIED", message: "Identity authorization failed" }, requestId, 403);
  if (targetResult.status === "unavailable") return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503);
  if (targetResult.status === "missing") return failure({ code: "EMPLOYEE_NOT_FOUND", message: "Employee was not found" }, requestId, 404);
  if (targetResult.employee.workspace_role === "SUPER_ADMIN") {
    return failure({ code: "SUPER_ADMIN_ACCESS_PROTECTED", message: "Super Admin Module Access is automatic and cannot be changed" }, requestId, 409);
  }
  const group = groupId === null ? null : await groupState(env.DB, groupId);
  if (groupId !== null && !group) return failure({ code: "MODULE_ACCESS_GROUP_NOT_FOUND", message: "找不到這個權限群組。" }, requestId, 404);

  const now = new Date().toISOString();
  const [actor, member] = await Promise.all([
    resolveAppMember(env.DB, gate.principal, now),
    ensureAppMemberProjection(env.DB, targetResult.employee.employee_id, targetResult.employee.employee_no, now),
  ]);
  const previous = await env.DB.prepare("SELECT group_id FROM app_member_module_groups WHERE member_id=?1").bind(member.id).first<{ group_id: number }>();
  if ((previous?.group_id ?? null) === groupId) return success({ employeeId, groupId }, requestId);
  const statements: D1PreparedStatement[] = group
    ? [env.DB.prepare(`INSERT INTO app_member_module_groups(member_id,group_id,assigned_at,assigned_by) VALUES(?1,?2,?3,?4)
        ON CONFLICT(member_id) DO UPDATE SET group_id=excluded.group_id, assigned_at=excluded.assigned_at, assigned_by=excluded.assigned_by`)
        .bind(member.id, group.id, now, actor.id), ...materialize(env.DB, { memberId: member.id }, group.modules, now, actor.id)]
    // Leaving keeps the current grants as the person's own settings.
    : [env.DB.prepare("DELETE FROM app_member_module_groups WHERE member_id=?1").bind(member.id)];
  statements.push(env.DB.prepare(`INSERT INTO audit_events(entity_type, entity_key, action, actor_employee_id, occurred_at, request_id, before_json, after_json, metadata_json)
    VALUES('module_access', ?1, 'module_access.group_assigned', ?2, ?3, ?4, ?5, ?6, ?7)`)
    .bind(employeeId, actor.id, now, requestId, JSON.stringify({ groupId: previous?.group_id ?? null }), JSON.stringify({ groupId }),
      JSON.stringify({ targetEmployeeId: employeeId })));
  await env.DB.batch(statements);
  return success({ employeeId, groupId }, requestId);
}

/** A grouped member's modules follow the group; individual changes are refused. */
export async function memberGroupId(db: D1Database, memberId: number): Promise<number | null> {
  const row = await db.prepare("SELECT group_id FROM app_member_module_groups WHERE member_id=?1").bind(memberId).first<{ group_id: number }>();
  return row?.group_id ?? null;
}

export function groupConflictResponse(error: unknown, requestId: string): Response | null {
  return error instanceof GroupConflict
    ? failure({ code: "MODULE_ACCESS_GROUP_REVISION_CONFLICT", message: "群組已被其他人修改，請重新整理後再試。" }, requestId, 409)
    : null;
}
