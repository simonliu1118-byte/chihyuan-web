import { CYWEB_MODULES, isCyWebModuleCode } from "../../shared/module-access";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { failure, success } from "./response";

function isAccessAdministrator(role: string, isIdentityAdmin: boolean): boolean {
  return role === "SUPER_ADMIN" || (role === "ADMIN" && isIdentityAdmin);
}

async function resolveActor(request: Request, env: IdentityRuntimeEnv) {
  const provider = identityClient(env);
  if (!provider) return { kind: "unavailable" as const };
  const resolution = await provider.resolve(request);
  if (resolution.status === "unavailable") return { kind: "unavailable" as const };
  if (resolution.status !== "authenticated") return { kind: "unauthenticated" as const };
  return { kind: "authenticated" as const, principal: resolution.principal };
}

export async function handleModuleAccessRoute(
  request: Request,
  env: IdentityRuntimeEnv,
  requestId: string,
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const isOwnAccess = request.method === "GET" && path === "/api/identity/module-access/me";
  const isAdminAccess = path.startsWith("/api/identity/admin/module-access");
  if (!isOwnAccess && !isAdminAccess) return null;

  const actor = await resolveActor(request, env);
  if (actor.kind === "unavailable") {
    return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503);
  }
  if (actor.kind === "unauthenticated") {
    return failure({ code: "AUTH_REQUIRED", message: "Authentication required" }, requestId, 401);
  }

  if (isOwnAccess) {
    if (actor.principal.workspaceRole === "SUPER_ADMIN") {
      return success({ modules: CYWEB_MODULES, allowed: CYWEB_MODULES.map((module) => module.code) }, requestId);
    }
    const rows = await env.DB.prepare(
      `SELECT module_code
         FROM identity_module_access
        WHERE identity_employee_id = ?1
          AND enabled = 1
        ORDER BY module_code`,
    ).bind(actor.principal.employeeId).all<{ module_code: string }>();
    return success({
      modules: CYWEB_MODULES,
      allowed: (rows.results ?? []).map((row) => row.module_code).filter(isCyWebModuleCode),
    }, requestId);
  }

  if (!isAccessAdministrator(actor.principal.workspaceRole, actor.principal.isIdentityAdmin)) {
    return failure({ code: "IDENTITY_ADMIN_REQUIRED", message: "Identity administration authority is required" }, requestId, 403);
  }

  if (request.method === "GET" && path === "/api/identity/admin/module-access") {
    const rows = await env.DB.prepare(
      `SELECT identity_employee_id, module_code, enabled
         FROM identity_module_access
        ORDER BY identity_employee_id, module_code`,
    ).all<{ identity_employee_id: string; module_code: string; enabled: number }>();
    return success({ modules: CYWEB_MODULES, grants: rows.results ?? [] }, requestId);
  }

  const match = /^\/api\/identity\/admin\/module-access\/([^/]+)\/([^/]+)$/.exec(path);
  if (request.method !== "PUT" || !match) return null;

  let employeeId: string;
  let moduleCode: string;
  try {
    employeeId = decodeURIComponent(match[1]).trim();
    moduleCode = decodeURIComponent(match[2]).trim().toLowerCase();
  } catch {
    return failure({ code: "INVALID_MODULE_ACCESS", message: "Module access path is invalid" }, requestId, 400);
  }
  if (!employeeId || employeeId.length > 128 || !isCyWebModuleCode(moduleCode)) {
    return failure({ code: "INVALID_MODULE_ACCESS", message: "Module access input is invalid" }, requestId, 400);
  }
  if (employeeId === actor.principal.employeeId) {
    return failure({ code: "SELF_ACCESS_CHANGE_NOT_ALLOWED", message: "Identity administrators cannot change their own module access" }, requestId, 409);
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const enabled = typeof body?.enabled === "boolean" ? body.enabled : null;
  if (enabled === null) {
    return failure({ code: "INVALID_MODULE_ACCESS", message: "Module access input is invalid" }, requestId, 400);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO identity_module_access(
       identity_employee_id, module_code, enabled, created_at, updated_at
     ) VALUES(?1, ?2, ?3, ?4, ?4)
     ON CONFLICT(identity_employee_id, module_code) DO UPDATE SET
       enabled = excluded.enabled,
       updated_at = excluded.updated_at`,
  ).bind(employeeId, moduleCode, enabled ? 1 : 0, now).run();

  return success({ access: { employeeId, moduleCode, enabled } }, requestId);
}
