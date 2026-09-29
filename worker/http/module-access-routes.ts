import { CYWEB_MODULES, isCyWebModuleCode, type CyWebModuleCode } from "../../shared/modules";
import { allowedModuleCodes, ensureAppMemberProjection, resolveAppMember } from "../auth/app-access";
import { requireIdentity, requireModuleAccess } from "../auth/guard";
import { CYWEB_IDENTITY_COOKIE } from "../identity/cycloud-identity-adapter";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { failure, success } from "./response";

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

function canManageModuleAccess(role: "SUPER_ADMIN" | "ADMIN" | "USER", isIdentityAdmin: boolean): boolean {
  return role === "SUPER_ADMIN" || (role === "ADMIN" && isIdentityAdmin);
}

function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(index + 1).trim()); } catch { return null; }
  }
  return null;
}

function normalizedApplicationId(env: IdentityRuntimeEnv): string | null {
  const value = env.IDENTITY_APPLICATION_ID?.trim().toUpperCase() ?? "";
  return value.length >= 2 && value.length <= 64 && !/[^A-Z0-9_-]/.test(value) ? value : null;
}

function isSessionToken(value: string | null): value is string {
  return Boolean(value && /^cyid_[0-9a-f]{64}$/.test(value));
}

async function identityTarget(
  request: Request,
  env: IdentityRuntimeEnv,
  employeeId: string,
): Promise<
  | { status: "ok"; employee: IdentitySnapshotEmployee }
  | { status: "unauthorized" }
  | { status: "unavailable" }
  | { status: "missing" }
> {
  const applicationId = normalizedApplicationId(env);
  const token = cookieValue(request, CYWEB_IDENTITY_COOKIE);
  if (!env.IDENTITY || typeof env.IDENTITY.fetch !== "function" || !applicationId) return { status: "unavailable" };
  if (!isSessionToken(token)) return { status: "unauthorized" };

  let response: Response;
  try {
    response = await env.IDENTITY.fetch(new Request("https://identity.internal/v1/admin/identity/snapshot", {
      method: "GET",
      headers: {
        authorization: `Bearer ${token}`,
        "x-identity-application": applicationId,
      },
    }));
  } catch {
    return { status: "unavailable" };
  }

  if (response.status === 401 || response.status === 403) return { status: "unauthorized" };
  if (!response.ok) return { status: "unavailable" };
  const payload = await response.json().catch(() => null) as IdentitySnapshotPayload | null;
  if (!payload || payload.ok === false || !Array.isArray(payload.employees)) return { status: "unavailable" };

  const employee = payload.employees.find((raw): raw is IdentitySnapshotEmployee => {
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

async function auditModuleAccess(
  env: IdentityRuntimeEnv,
  actorMemberId: number,
  targetEmployeeId: string,
  moduleCode: CyWebModuleCode,
  before: boolean,
  after: boolean,
  requestId: string,
): Promise<void> {
  await env.DB.prepare(
    `INSERT INTO audit_events(
       entity_type, entity_key, action, actor_employee_id, occurred_at,
       request_id, before_json, after_json, metadata_json
     ) VALUES(
       'module_access', ?1, 'module_access.updated', ?2, ?3, ?4, ?5, ?6, ?7
     )`,
  ).bind(
    `${targetEmployeeId}:${moduleCode}`,
    actorMemberId,
    new Date().toISOString(),
    requestId,
    JSON.stringify({ enabled: before }),
    JSON.stringify({ enabled: after }),
    JSON.stringify({ targetEmployeeId, moduleCode }),
  ).run();
}

async function currentAccess(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<Response> {
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503);
  const gate = await requireIdentity(provider, request);
  if (!gate.ok) return failure({ code: gate.code, message: gate.code === "ACCESS_DENIED" ? "Access denied" : "Authentication required" }, requestId, gate.status);

  const allowed = await allowedModuleCodes(env.DB, gate.principal);
  return success({
    modules: CYWEB_MODULES,
    allowedModules: allowed,
    implicitAll: gate.principal.workspaceRole === "SUPER_ADMIN",
  }, requestId);
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

  const previous = await env.DB.prepare(
    `SELECT enabled
       FROM app_member_module_access
      WHERE member_id = ?1 AND module_code = ?2
      LIMIT 1`,
  ).bind(targetMember.id, moduleCode).first<{ enabled: number }>();
  const before = previous?.enabled === 1;

  await env.DB.prepare(
    `INSERT INTO app_member_module_access(member_id, module_code, enabled, updated_at, updated_by)
     VALUES(?1, ?2, ?3, ?4, ?5)
     ON CONFLICT(member_id, module_code) DO UPDATE SET
       enabled = excluded.enabled,
       updated_at = excluded.updated_at,
       updated_by = excluded.updated_by`,
  ).bind(targetMember.id, moduleCode, enabled ? 1 : 0, now, actorMember.id).run();

  if (before !== enabled) {
    await auditModuleAccess(env, actorMember.id, target.employee_id, moduleCode, before, enabled, requestId);
  }

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

  match = /^\/api\/module-access\/check\/([^/]+)$/.exec(path);
  if (request.method === "GET" && match) {
    return checkAccess(request, env, requestId, decodeURIComponent(match[1]));
  }

  return null;
}
