import { resolveAppMember } from "../auth/app-access";
import {
  clearIdentitySessionCookie,
  CYCloudIdentityClient,
  identitySessionCookie,
  type IdentityLoginResult,
} from "../identity/cycloud-identity-adapter";
import type { IdentityPrincipal } from "../identity/contract";
import { failure, success } from "./response";

export interface IdentityRuntimeEnv {
  DB: D1Database;
  IDENTITY?: Fetcher;
  IDENTITY_APPLICATION_ID?: string;
  IDENTITY_WORKSPACE_ID?: string;
}

function normalizedApplicationId(env: IdentityRuntimeEnv): string | null {
  const value = env.IDENTITY_APPLICATION_ID?.trim().toUpperCase() ?? "";
  if (value.length < 2 || value.length > 64 || /[^A-Z0-9_-]/.test(value)) return null;
  return value;
}
function normalizedWorkspaceId(env: IdentityRuntimeEnv): string | null {
  const value = env.IDENTITY_WORKSPACE_ID?.trim() ?? "";
  if (value.length < 5 || value.length > 80 || /[^A-Za-z0-9_-]/.test(value)) return null;
  return value;
}
function identityClient(env: IdentityRuntimeEnv): CYCloudIdentityClient | null {
  if (!env.IDENTITY || typeof env.IDENTITY.fetch !== "function") return null;
  const applicationId = normalizedApplicationId(env);
  const workspaceId = normalizedWorkspaceId(env);
  if (!applicationId || !workspaceId) return null;
  return new CYCloudIdentityClient(env.IDENTITY, applicationId, workspaceId);
}
function user(principal: IdentityPrincipal) {
  return { employeeId: principal.employeeId, employeeNo: principal.employeeNo, displayName: principal.displayName,
    workspaceId: principal.workspaceId, workspaceRole: principal.workspaceRole, isIdentityAdmin: principal.isIdentityAdmin,
    emailVerified: principal.emailVerified, isWorkspaceSuperAdmin: principal.isWorkspaceSuperAdmin };
}
function passwordLength(value: string): number { return Array.from(value).length; }

async function authenticatedResponse(result: Extract<IdentityLoginResult, { status: "authenticated" }>, env: IdentityRuntimeEnv, requestId: string) {
  await resolveAppMember(env.DB, result.principal);
  return success({ user: user(result.principal), expiresAt: result.expiresAt }, requestId,
    { headers: { "set-cookie": identitySessionCookie(result.token, result.expiresAt) } });
}

function providerFailure(result: Exclude<IdentityLoginResult, { status: "authenticated" } | { status: "password_change_required" }>, requestId: string): Response {
  if (result.status === "invalid") return failure({ code: "LOGIN_FAILED", message: "Authentication failed" }, requestId, 401);
  if (result.status === "denied") return failure({ code: "ACCESS_DENIED", message: "Application access denied" }, requestId, 403);
  if (result.status === "rate_limited") {
    const response = failure({ code: "LOGIN_RATE_LIMITED", message: "Too many login attempts" }, requestId, 429);
    response.headers.set("retry-after", String(result.retryAfterSeconds));
    return response;
  }
  return failure({ code: "IDENTITY_UNAVAILABLE", message: result.status === "invalid_response" ? "Identity provider response is invalid" : "Identity provider is unavailable" }, requestId, 503);
}

async function login(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<Response> {
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is not configured" }, requestId, 503);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const employeeNo = typeof body?.employeeNo === "string" ? body.employeeNo.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const length = passwordLength(password);
  if (!/^\d{4}$/.test(employeeNo) || length < 8 || length > 16) return failure({ code: "INVALID_LOGIN_REQUEST", message: "Employee number or password format is invalid" }, requestId, 400);

  const result = await provider.login(request, employeeNo, password);
  if (result.status === "password_change_required") {
    return success({ passwordChangeRequired: true, firstLogin: { token: result.token, employeeNo: result.employeeNo, displayName: result.displayName, expiresAt: result.expiresAt } }, requestId);
  }
  if (result.status !== "authenticated") return providerFailure(result, requestId);
  return authenticatedResponse(result, env, requestId);
}

async function completeFirstLogin(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<Response> {
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is not configured" }, requestId, 503);
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!/^cyif_[0-9a-f]{64}$/.test(token) || passwordLength(password) < 8 || passwordLength(password) > 16) {
    return failure({ code: "INVALID_FIRST_LOGIN", message: "First login completion is invalid" }, requestId, 400);
  }
  const result = await provider.completeFirstLogin(request, token, password);
  if (result.status !== "authenticated") {
    if (result.status === "invalid" || result.status === "password_change_required") return failure({ code: "FIRST_LOGIN_EXPIRED", message: "First login verification is no longer valid" }, requestId, 400);
    return providerFailure(result, requestId);
  }
  return authenticatedResponse(result, env, requestId);
}

async function me(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<Response> {
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is not configured" }, requestId, 503);
  const resolution = await provider.resolve(request);
  if (resolution.status === "authenticated") {
    await resolveAppMember(env.DB, resolution.principal);
    return success({ user: user(resolution.principal), expiresAt: resolution.expiresAt }, requestId);
  }
  if (resolution.status === "unavailable") return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503);
  const response = failure({ code: resolution.reason === "invalid" ? "AUTH_INVALID" : "AUTH_REQUIRED", message: resolution.reason === "invalid" ? "Session is invalid" : "Authentication required" }, requestId, 401);
  if (resolution.reason === "invalid") response.headers.set("set-cookie", clearIdentitySessionCookie());
  return response;
}

async function logout(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<Response> {
  const provider = identityClient(env);
  if (!provider) return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is not configured" }, requestId, 503);
  const result = await provider.logout(request);
  if (result.status === "unavailable") return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503);
  return success({ loggedOut: true }, requestId, { headers: { "set-cookie": clearIdentitySessionCookie() } });
}

export async function handleAuthRoute(request: Request, env: IdentityRuntimeEnv, requestId: string): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/api/auth/login") return login(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/api/auth/first-login/complete") return completeFirstLogin(request, env, requestId);
  if (request.method === "GET" && url.pathname === "/api/auth/me") return me(request, env, requestId);
  if (request.method === "POST" && url.pathname === "/api/auth/logout") return logout(request, env, requestId);
  return null;
}
