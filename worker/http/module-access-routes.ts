import { CYWEB_MODULES, isCyWebModuleCode, type CyWebModuleCode } from "../../shared/modules";
import { currentModuleAccess, ensureAppMemberProjection, resolveAppMember } from "../auth/app-access";
import { requireIdentity, requireModuleAccess } from "../auth/guard";
import { CYWEB_IDENTITY_COOKIE, cookieValue, isSessionToken, normalizedApplicationId, fetchIdentityProvider } from "../identity/provider-transport";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { failure, success } from "./response";
import { createGroup, deleteGroup, groupConflictResponse, loadModuleAccessGroups, memberGroupId, setEmployeeGroup, syncGroup, updateGroup } from "./module-access-group-routes";

interface IdentitySnapshotEmployee {
  employee_id: string;
  employee_no: string;
  workspace_role: "SUPER_ADMIN" | "ADMIN" | "USER";
  identity_admin: number;
}

interface IdentitySnapshotPayload {
  ok?: unknown;
  employees?: unknown;
}

export function canManageModuleAccess(role: "SUPER_ADMIN" | "ADMIN" | "USER", isIdentityAdmin: boolean): boolean {
  return role === "SUPER_ADMIN" || (role === "ADMIN" && isIdentityAdmin);
}

interface IdentitySnapshotApplication { application_id: string; enabled: number; core_access_locked: number }
interface IdentitySnapshotAccess { employee_id: string; application_id: string; enabled: number }

/** The CYID admin snapshot read with the caller's session: people, applications and direct application access. */
export async function identitySnapshot(request: Request, env: IdentityRuntimeEnv): Promise<
  | { status: "ok"; employees: unknown[]; applications: IdentitySnapshotApplication[]; directAccess: IdentitySnapshotAccess[] }
  | { status: "unauthorized" }
  | { status: "unavailable" }
> {
  const applicationId = normalizedApplicationId(env);
  const token = cookieValue(request, CYWEB_IDENTITY_COOKIE);
  if (!env.IDENTITY || typeof env.IDENTITY.fetch !== "function" || !applicationId) return { status: "unavailable" };
  if (!isSessionToken(token)) return { status: "unauthorized" };

  const response = await fetchIdentityProvider(env.IDENTITY, new Request("https://identity.internal/v1/admin/identity/snapshot", {
    method: "GET",
    headers: { authorization: `Bearer ${token}`, "x-identity-application": applicationId },
  }));
  if (!response) return { status: "unavailable" };

  if (response.status === 401 || response.status === 403) return { status: "unauthorized" };
  if (!response.ok) return { status: "unavailable" };
  const payload = await response.json().catch(() => null) as (IdentitySnapshotPayload & { applications?: unknown; directAccess?: unknown }) | null;
  if (!payload || payload.ok === false || !Array.isArray(payload.employees)) return { status: "unavailable" };
  return {
    status: "ok",
    employees: payload.employees,
    applications: Array.isArray(payload.applications) ? payload.applications as IdentitySnapshotApplication[] : [],
    directAccess: Array.isArray(payload.directAccess) ? payload.directAccess as IdentitySnapshotAccess[] : [],
  };
}

export async function identityTarget(
  request: Request,
  env: IdentityRuntimeEnv,
  employeeId: string,
): Promise<
  | { status: "ok"; employee: IdentitySnapshotEmployee }
  | { status: "unauthorized" }
  | { status: "unavailable" }
  | { status: "missing" }
> {
  const snapshot = await identitySnapshot(request, env);
  if (snapshot.status !== "ok") return snapshot;
  const employee = snapshot.employees.find((raw): raw is IdentitySnapshotEmployee => {
    if (!raw || typeof raw !== "object") return false;
    const row = raw as Partial<IdentitySnapshotEmployee>;
    return row.employee_id === employeeId
      && typeof row.employee_no === "string"
      && (row.workspace_role === "SUPER_ADMIN" || row.workspace_role === "ADMIN" || row.workspace_role === "USER")
      && (row.identity_admin === 0 || row.identity_admin === 1);
  });
  return employee ? { status: "ok", employee } : { status: "missing" };
}

async function readEnabled(request: Request): Promise<boolean | null> {
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  return typeof body?.enabled === "boolean" ? body.enabled : null;
}

async function currentAccess(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<Response> {
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503);
  const gate = await requireIdentity(provider, request);
  if (!gate.ok) return failure({ code: gate.code, message: gate.code === "ACCESS_DENIED" ? "Access denied" : "Authentication required" }, requestId, gate.status);

  return success(await currentModuleAccess(env.DB, gate.principal), requestId);
}

async function adminSnapshot(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<Response> {
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503);
  const gate = await requireIdentity(provider, request);
  if (!gate.ok) return failure({ code: gate.code, message: "Authentication required" }, requestId, gate.status);
  if (!canManageModuleAccess(gate.principal.workspaceRole, gate.principal.isIdentityAdmin)) {
    return failure({ code: "ACCESS_DENIED", message: "Module Access administration is not allowed" }, requestId, 403);
  }

  const rows = await env.DB.prepare(
    `SELECT m.identity_employee_id AS employee_id,
            a.module_code,
            a.enabled,
            a.updated_at
       FROM app_member_module_access a
       JOIN app_members m ON m.id = a.member_id
      ORDER BY m.identity_employee_id, a.module_code`,
  ).all<{ employee_id: string; module_code: string; enabled: number; updated_at: string }>();

  return success({
    modules: CYWEB_MODULES,
    grants: (rows.results ?? []).filter((row) => isCyWebModuleCode(row.module_code)),
    ...await loadModuleAccessGroups(env.DB),
  }, requestId);
}

async function putEmployeeModule(
  request: Request,
  env: IdentityRuntimeEnv,
  requestId: string,
  employeeIdRaw: string,
  moduleCodeRaw: string,
): Promise<Response> {
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503);
  const gate = await requireIdentity(provider, request);
  if (!gate.ok) return failure({ code: gate.code, message: "Authentication required" }, requestId, gate.status);
  if (!canManageModuleAccess(gate.principal.workspaceRole, gate.principal.isIdentityAdmin)) {
    return failure({ code: "ACCESS_DENIED", message: "Module Access administration is not allowed" }, requestId, 403);
  }

  const employeeId = employeeIdRaw.trim();
  const moduleCode = moduleCodeRaw.trim().toUpperCase();
  const enabled = await readEnabled(request);
  if (!employeeId || employeeId.length > 128 || !isCyWebModuleCode(moduleCode) || enabled === null) {
    return failure({ code: "INVALID_MODULE_ACCESS", message: "Module Access input is invalid" }, requestId, 400);
  }
  if (gate.principal.employeeId === employeeId) {
    return failure({ code: "SELF_ACCESS_CHANGE_NOT_ALLOWED", message: "Identity Admin cannot change their own Module Access" }, requestId, 409);
  }

  const targetResult = await identityTarget(request, env, employeeId);
  if (targetResult.status === "unauthorized") return failure({ code: "ACCESS_DENIED", message: "Identity authorization failed" }, requestId, 403);
  if (targetResult.status === "unavailable") return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503);
  if (targetResult.status === "missing") return failure({ code: "EMPLOYEE_NOT_FOUND", message: "Employee was not found" }, requestId, 404);
  const target = targetResult.employee;
  if (target.workspace_role === "SUPER_ADMIN") {
    return failure({ code: "SUPER_ADMIN_ACCESS_PROTECTED", message: "Super Admin Module Access is automatic and cannot be changed" }, requestId, 409);
  }

  const now = new Date().toISOString();
  const [actorMember, targetMember] = await Promise.all([
    resolveAppMember(env.DB, gate.principal, now),
    ensureAppMemberProjection(env.DB, target.employee_id, target.employee_no, now),
  ]);

  if (await memberGroupId(env.DB, targetMember.id) !== null) {
    return failure({ code: "MODULE_ACCESS_GROUP_MANAGED", message: "此人的模組使用權由權限群組決定，請改群組設定或先移出群組。" }, requestId, 409);
  }

  const previous = await env.DB.prepare(
    `SELECT enabled
       FROM app_member_module_access
      WHERE member_id = ?1 AND module_code = ?2
      LIMIT 1`,
  ).bind(targetMember.id, moduleCode).first<{ enabled: number }>();
  const before = previous?.enabled === 1;

  const statements: D1PreparedStatement[] = [
    env.DB.prepare(
      `INSERT INTO app_member_module_access(member_id, module_code, enabled, updated_at, updated_by)
       VALUES(?1, ?2, ?3, ?4, ?5)
       ON CONFLICT(member_id, module_code) DO UPDATE SET
         enabled = excluded.enabled,
         updated_at = excluded.updated_at,
         updated_by = excluded.updated_by`,
    ).bind(targetMember.id, moduleCode, enabled ? 1 : 0, now, actorMember.id),
  ];

  if (before !== enabled) {
    statements.push(
      env.DB.prepare(
        `INSERT INTO audit_events(
           entity_type, entity_key, action, actor_employee_id, occurred_at,
           request_id, before_json, after_json, metadata_json
         ) VALUES(
           'module_access', ?1, 'module_access.updated', ?2, ?3, ?4, ?5, ?6, ?7
         )`,
      ).bind(
        `${target.employee_id}:${moduleCode}`,
        actorMember.id,
        now,
        requestId,
        JSON.stringify({ enabled: before }),
        JSON.stringify({ enabled }),
        JSON.stringify({ targetEmployeeId: target.employee_id, moduleCode }),
      ),
    );
  }
  await env.DB.batch(statements);

  return success({
    access: {
      employeeId: target.employee_id,
      moduleCode,
      enabled,
      effectiveImmediately: true,
    },
  }, requestId);
}

async function checkAccess(
  request: Request,
  env: IdentityRuntimeEnv,
  requestId: string,
  moduleCodeRaw: string,
): Promise<Response> {
  const moduleCode = moduleCodeRaw.trim().toUpperCase();
  if (!isCyWebModuleCode(moduleCode)) {
    return failure({ code: "INVALID_MODULE_ACCESS", message: "Unknown module" }, requestId, 400);
  }
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503);
  const gate = await requireModuleAccess(provider, env.DB, request, moduleCode);
  if (!gate.ok) return failure({ code: gate.code, message: gate.code === "ACCESS_DENIED" ? "Module access denied" : "Authentication required" }, requestId, gate.status);
  return success({ moduleCode, allowed: true }, requestId);
}

export async function handleModuleAccessRoute(
  request: Request,
  env: IdentityRuntimeEnv,
  requestId: string,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (request.method === "GET" && path === "/api/module-access") return currentAccess(request, env, requestId);
  if (request.method === "GET" && path === "/api/module-access/admin") return adminSnapshot(request, env, requestId);

  let match = /^\/api\/module-access\/admin\/employees\/([^/]+)\/modules\/([^/]+)$/.exec(path);
  if (request.method === "PUT" && match) {
    return putEmployeeModule(request, env, requestId, decodeURIComponent(match[1]), decodeURIComponent(match[2]));
  }

  match = /^\/api\/module-access\/admin\/employees\/([^/]+)\/group$/.exec(path);
  if (request.method === "PUT" && match) return setEmployeeGroup(request, env, requestId, decodeURIComponent(match[1]));
  try {
    if (request.method === "POST" && path === "/api/module-access/admin/groups") return await createGroup(request, env, requestId);
    match = /^\/api\/module-access\/admin\/groups\/(\d+)$/.exec(path);
    if (match && request.method === "PATCH") return await updateGroup(request, env, requestId, match[1]);
    if (match && request.method === "DELETE") return await deleteGroup(request, env, requestId, match[1]);
    match = /^\/api\/module-access\/admin\/groups\/(\d+)\/sync$/.exec(path);
    if (match && request.method === "POST") return await syncGroup(request, env, requestId, match[1]);
  } catch (error) {
    const conflict = groupConflictResponse(error, requestId);
    if (conflict) return conflict;
    throw error;
  }

  match = /^\/api\/module-access\/check\/([^/]+)$/.exec(path);
  if (request.method === "GET" && match) {
    return checkAccess(request, env, requestId, decodeURIComponent(match[1]));
  }

  return null;
}
