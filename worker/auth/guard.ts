import type { IdentityAdapter, IdentityPrincipal } from "../identity/contract";
import { checkModuleAccess, type AppMemberRecord } from "./app-access";

export interface AuthGateFailure {
  ok: false;
  status: 401 | 403 | 503;
  code: "AUTH_REQUIRED" | "AUTH_INVALID" | "ACCESS_DENIED" | "IDENTITY_UNAVAILABLE";
}

export interface IdentityGateSuccess {
  ok: true;
  principal: IdentityPrincipal;
}

export interface ModuleGateSuccess extends IdentityGateSuccess {
  member: AppMemberRecord;
}

export type IdentityGateResult = IdentityGateSuccess | AuthGateFailure;
export type ModuleGateResult = ModuleGateSuccess | AuthGateFailure;

export async function requireIdentity(
  adapter: IdentityAdapter,
  request: Request,
): Promise<IdentityGateResult> {
  const resolution = await adapter.resolve(request);

  if (resolution.status === "authenticated") {
    return { ok: true, principal: resolution.principal };
  }

  if (resolution.status === "unavailable") {
    return { ok: false, status: 503, code: "IDENTITY_UNAVAILABLE" };
  }

  if (resolution.reason === "invalid") {
    return { ok: false, status: 401, code: "AUTH_INVALID" };
  }

  return { ok: false, status: 401, code: "AUTH_REQUIRED" };
}

export async function requireModuleAccess(
  adapter: IdentityAdapter,
  db: D1Database,
  request: Request,
  moduleCode: string,
): Promise<ModuleGateResult> {
  const identity = await requireIdentity(adapter, request);
  if (!identity.ok) return identity;

  const access = await checkModuleAccess(db, identity.principal, moduleCode);
  if (!access.allowed) {
    return { ok: false, status: 403, code: "ACCESS_DENIED" };
  }

  return {
    ok: true,
    principal: identity.principal,
    member: access.member,
  };
}
