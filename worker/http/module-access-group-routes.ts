import { CYWEB_MODULES, isCyWebModuleCode, type CyWebModuleCode } from "../../shared/modules";
import { ensureAppMemberProjection, resolveAppMember } from "../auth/app-access";
import { requireIdentity } from "../auth/guard";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { CYWEB_IDENTITY_COOKIE, cookieValue, fetchIdentityProvider, normalizedApplicationId } from "../identity/provider-transport";
import { canManageModuleAccess, identitySnapshot, identityTarget } from "./module-access-routes";
import { failure, success } from "./response";

/**
 * 權限群組 (BD-057). A group is a named set of CY Web modules and other CY systems; a member of a
 * group has exactly that set. Every write materializes the members' app_member_module_access rows
 * in one batch, so runtime authorization keeps reading only the direct grant table. System access
 * lives in CYID and is synced there after the D1 write; members CYID could not update are
 * reported back (and stay visible as not applied) so the admin can re-sync.
 */

export interface ModuleAccessGroupView {
  id: number;
  name: string;
  modules: CyWebModuleCode[];
  applications: string[];
  revision: number;
  memberCount: number;
}

export async function loadModuleAccessGroups(db: D1Database): Promise<{ groups: ModuleAccessGroupView[]; memberships: { employee_id: string; group_id: number }[] }> {
  const [groups, modules, applications, members] = await db.batch([
    db.prepare("SELECT id,name,revision FROM module_access_groups ORDER BY name"),
    db.prepare("SELECT group_id,module_code FROM module_access_group_modules ORDER BY group_id,module_code"),
    db.prepare("SELECT group_id,application_id FROM module_access_group_applications ORDER BY group_id,application_id"),
    db.prepare(`SELECT m.identity_employee_id AS employee_id, g.group_id
                  FROM app_member_module_groups g JOIN app_members m ON m.id = g.member_id ORDER BY m.identity_employee_id`),
  ]);
  const moduleRows = (modules.results ?? []) as { group_id: number; module_code: string }[];
  const applicationRows = (applications.results ?? []) as { group_id: number; application_id: string }[];
  const memberships = (members.results ?? []) as { employee_id: string; group_id: number }[];
  return {
    groups: ((groups.results ?? []) as { id: number; name: string; revision: number }[]).map((group) => ({
      ...group,
      modules: moduleRows.filter((row) => row.group_id === group.id && isCyWebModuleCode(row.module_code)).map((row) => row.module_code as CyWebModuleCode),
      applications: applicationRows.filter((row) => row.group_id === group.id).map((row) => row.application_id),
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

interface GroupInput { name: string; modules: CyWebModuleCode[]; applications: string[] }

/** CY Web itself is always available, so the core application never belongs to a group. */
function groupInput(raw: Record<string, unknown>, env: IdentityRuntimeEnv): GroupInput | null {
  const name = typeof raw.name === "string" ? raw.name.trim() : "";
  if (!name || name.length > 60 || !Array.isArray(raw.modules) || !Array.isArray(raw.applications)) return null;
  const modules = [...new Set(raw.modules)];
  if (!modules.every((code): code is CyWebModuleCode => typeof code === "string" && isCyWebModuleCode(code))) return null;
  const core = normalizedApplicationId(env);
  const applications = [...new Set(raw.applications)];
  if (!applications.every((id): id is string => typeof id === "string" && /^[A-Z0-9_-]{2,64}$/.test(id) && id !== core)) return null;
  return { name, modules, applications };
}

function groupRows(db: D1Database, groupId: number, input: GroupInput): D1PreparedStatement[] {
  return [
    ...input.modules.map((code) => db.prepare("INSERT INTO module_access_group_modules(group_id,module_code) VALUES(?1,?2)").bind(groupId, code)),
    ...input.applications.map((id) => db.prepare("INSERT INTO module_access_group_applications(group_id,application_id) VALUES(?1,?2)").bind(groupId, id)),
  ];
}

/**
 * Sets each member's CYID access to exactly the group's systems (registered, enabled, non-core),
 * changing only cells that differ. Returns the employees CYID did not fully update.
 */
async function syncApplications(request: Request, env: IdentityRuntimeEnv, employeeIds: readonly string[], applications: readonly string[]): Promise<string[]> {
  if (!employeeIds.length) return [];
  const snapshot = await identitySnapshot(request, env);
  const token = cookieValue(request, CYWEB_IDENTITY_COOKIE);
  const applicationId = normalizedApplicationId(env);
  if (snapshot.status !== "ok" || !env.IDENTITY || !token || !applicationId) return [...employeeIds];
  const managed = snapshot.applications.filter((app) => app.enabled === 1 && app.core_access_locked !== 1 && app.application_id !== applicationId);
  const wanted = new Set(applications);
  const current = new Set(snapshot.directAccess.filter((row) => row.enabled === 1).map((row) => `${row.employee_id}:${row.application_id}`));
  const failed = new Set<string>();
  for (const employeeId of employeeIds) {
    for (const app of managed) {
      const enabled = wanted.has(app.application_id);
      if (current.has(`${employeeId}:${app.application_id}`) === enabled) continue;
      const response = await fetchIdentityProvider(env.IDENTITY, new Request(
        `https://identity.internal/v1/admin/identity/employees/${encodeURIComponent(employeeId)}/applications/${encodeURIComponent(app.application_id)}`,
        { method: "PUT", headers: { authorization: `Bearer ${token}`, "x-identity-application": applicationId, "content-type": "application/json; charset=utf-8" },
          body: JSON.stringify({ enabled }) }));
      const payload = response?.ok ? await response.json().catch(() => null) as { ok?: unknown } | null : null;
      if (!payload || payload.ok === false) failed.add(employeeId);
    }
  }
  return [...failed];
}

async function groupMembers(db: D1Database, groupId: number): Promise<string[]> {
  const rows = await db.prepare(`SELECT m.identity_employee_id AS employee_id FROM app_member_module_groups g
    JOIN app_members m ON m.id = g.member_id WHERE g.group_id=?1 ORDER BY m.identity_employee_id`).bind(groupId).all<{ employee_id: string }>();
  return (rows.results ?? []).map((row) => row.employee_id);
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

async function groupState(db: D1Database, id: number): Promise<{ id: number; name: string; revision: number; modules: string[]; applications: string[] } | null> {
  const row = await db.prepare("SELECT id,name,revision FROM module_access_groups WHERE id=?1").bind(id).first<{ id: number; name: string; revision: number }>();
  if (!row) return null;
  const [modules, applications] = await db.batch([
    db.prepare("SELECT module_code AS code FROM module_access_group_modules WHERE group_id=?1 ORDER BY module_code").bind(id),
    db.prepare("SELECT application_id AS code FROM module_access_group_applications WHERE group_id=?1 ORDER BY application_id").bind(id),
  ]);
  const codes = (result: D1Result) => ((result.results ?? []) as { code: string }[]).map((item) => item.code);
  return { ...row, modules: codes(modules), applications: codes(applications) };
}

async function nameTaken(db: D1Database, name: string, exceptId?: number): Promise<boolean> {
  const row = await db.prepare("SELECT id FROM module_access_groups WHERE name=?1 AND id IS NOT ?2 LIMIT 1").bind(name, exceptId ?? null).first<{ id: number }>();
  return Boolean(row);
}

export async function createGroup(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<Response> {
  const gate = await adminGate(request, env, requestId);
  if (gate instanceof Response) return gate;
  const input = groupInput(await body(request), env);
  if (!input) return failure({ code: "INVALID_MODULE_ACCESS_GROUP", message: "請填寫群組名稱（60 字以內）並選擇有效的系統與模組。" }, requestId, 400);
  if (await nameTaken(env.DB, input.name)) return failure({ code: "MODULE_ACCESS_GROUP_NAME_TAKEN", message: "已有同名的權限群組。" }, requestId, 409);
  const now = new Date().toISOString();
  const actor = await resolveAppMember(env.DB, gate.principal, now);
  const created = await env.DB.prepare(`INSERT INTO module_access_groups(name,revision,created_at,created_by,updated_at,updated_by)
    VALUES(?1,1,?2,?3,?2,?3) RETURNING id`).bind(input.name, now, actor.id).first<{ id: number }>();
  if (!created) return failure({ code: "MODULE_ACCESS_GROUP_CONFLICT", message: "權限群組未能建立，請重試。" }, requestId, 409);
  await env.DB.batch([
    ...groupRows(env.DB, created.id, input),
    audit(env.DB, String(created.id), "module_access_group.created", actor.id, now, requestId, null, input),
  ]);
  return success({ group: { id: created.id, ...input, revision: 1, memberCount: 0 } }, requestId, { status: 201 });
}

export async function updateGroup(request: Request, env: IdentityRuntimeEnv, requestId: string, idRaw: string): Promise<Response> {
  const gate = await adminGate(request, env, requestId);
  if (gate instanceof Response) return gate;
  const id = Number(idRaw);
  const raw = await body(request);
  const input = groupInput(raw, env);
  const expectedRevision = raw.expectedRevision;
  if (!Number.isSafeInteger(id) || id <= 0 || !input || !Number.isSafeInteger(expectedRevision)) {
    return failure({ code: "INVALID_MODULE_ACCESS_GROUP", message: "請填寫群組名稱（60 字以內）並選擇有效的系統與模組。" }, requestId, 400);
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
    env.DB.prepare("DELETE FROM module_access_group_applications WHERE group_id=?1").bind(id),
    ...groupRows(env.DB, id, input),
    ...materialize(env.DB, { groupId: id }, input.modules, now, actor.id),
    audit(env.DB, String(id), "module_access_group.updated", actor.id, now, requestId,
      { name: current.name, modules: current.modules, applications: current.applications }, input),
  ]).catch(() => { throw new GroupConflict(); });
  // CYID refuses a change to one's own access; those rows simply show as not applied.
  const members = (await groupMembers(env.DB, id)).filter((employeeId) => employeeId !== gate.principal.employeeId);
  const applicationSyncFailed = await syncApplications(request, env, members, input.applications);
  return success({ group: { id, ...input, revision: current.revision + 1 }, applicationSyncFailed }, requestId);
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
    audit(env.DB, String(id), "module_access_group.deleted", actor.id, now, requestId,
      { name: current.name, modules: current.modules, applications: current.applications }, null),
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
  const applicationSyncFailed = group ? await syncApplications(request, env, [employeeId], group.applications) : [];
  return success({ employeeId, groupId, applicationSyncFailed }, requestId);
}

/** Re-applies a group's systems in CYID for every member (after a failed or outside change). */
export async function syncGroup(request: Request, env: IdentityRuntimeEnv, requestId: string, idRaw: string): Promise<Response> {
  const gate = await adminGate(request, env, requestId);
  if (gate instanceof Response) return gate;
  const group = await groupState(env.DB, Number(idRaw));
  if (!group) return failure({ code: "MODULE_ACCESS_GROUP_NOT_FOUND", message: "找不到這個權限群組。" }, requestId, 404);
  const members = (await groupMembers(env.DB, group.id)).filter((employeeId) => employeeId !== gate.principal.employeeId);
  return success({ groupId: group.id, applicationSyncFailed: await syncApplications(request, env, members, group.applications) }, requestId);
}

/**
 * 權限群組 decide their members' system access too: CY Web's proxy for one person's system access
 * (PUT /api/identity/admin/employees/:id/applications/:app) is refused for a group member. Only an
 * access admin learns about the group; anyone else falls through to CYID's own answer. The group
 * sync writes CYID directly and is not affected.
 */
export async function groupManagedSystemAccess(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<Response | null> {
  const match = request.method === "PUT" ? /^\/api\/identity\/admin\/employees\/([^/]+)\/applications\/[^/]+$/.exec(new URL(request.url).pathname) : null;
  if (!match) return null;
  const grouped = await env.DB.prepare(`SELECT 1 AS grouped FROM app_member_module_groups g JOIN app_members m ON m.id = g.member_id
    WHERE m.identity_employee_id=?1 LIMIT 1`).bind(decodeURIComponent(match[1])).first<{ grouped: number }>();
  if (!grouped) return null;
  const provider = identityClient(env);
  const gate = provider ? await requireIdentity(provider, request) : null;
  if (!gate?.ok || !canManageModuleAccess(gate.principal.workspaceRole, gate.principal.isIdentityAdmin)) return null;
  return failure({ code: "MODULE_ACCESS_GROUP_MANAGED", message: "此人的系統使用權由權限群組決定，請改群組設定或先移出群組。" }, requestId, 409);
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
