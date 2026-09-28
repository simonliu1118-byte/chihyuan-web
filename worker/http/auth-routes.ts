import { resolveAppMember } from "../auth/app-access";
import {
  clearIdentitySessionCookie,
  CYCloudIdentityClient,
  identitySessionCookie,
} from "../identity/cycloud-identity-adapter";
import type { IdentityPrincipal } from "../identity/contract";
import { failure, success } from "./response";

export interface IdentityBridgeEnv {
  DB: D1Database;
  IDENTITY?: Fetcher;
  IDENTITY_APPLICATION_ID?: string;
  IDENTITY_WORKSPACE_ID?: string;
}

function normalizedApplicationId(env: IdentityBridgeEnv): string | null {
  const value = env.IDENTITY_APPLICATION_ID?.trim().toUpperCase() ?? "";
  if (value.length < 2 || value.length > 64 || /[^A-Z0-9_-]/.test(value)) return null;
  return value;
}

function normalizedWorkspaceId(env: IdentityBridgeEnv): string | null {
  const value = env.IDENTITY_WORKSPACE_ID?.trim() ?? "";
  if (value.length < 5 || value.length > 80 || /[^A-Za-z0-9_-]/.test(value)) return null;
  return value;
}

function identityClient(env: IdentityBridgeEnv): CYCloudIdentityClient | null {
  if (!env.IDENTITY || typeof env.IDENTITY.fetch !== "function") return null;
  const applicationId = normalizedApplicationId(env);
  const workspaceId = normalizedWorkspaceId(env);
  if (!applicationId || !workspaceId) return null;
  return new CYCloudIdentityClient(env.IDENTITY, applicationId, workspaceId);
}

function user(principal: IdentityPrincipal) {
  return {
    employeeId: principal.employeeId,
    employeeNo: principal.employeeNo,
    displayName: principal.displayName,
    workspaceId: principal.workspaceId,
    isWorkspaceSuperAdmin: principal.isWorkspaceSuperAdmin,
    groupKeys: principal.groupKeys,
  };
}

function passwordLength(value: string): number {
  return Array.from(value).length;
}

async function login(
  request: Request,
  env: IdentityBridgeEnv,
  requestId: string,
): Promise<Response> {
  const provider = identityClient(env);
  if (!provider) {
    return failure(
      { code: "IDENTITY_UNAVAILABLE", message: "Identity provider is not configured" },
      requestId,
      503,
    );
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const employeeNo = typeof body?.employeeNo === "string" ? body.employeeNo.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  const length = passwordLength(password);
  if (!/^\d{4}$/.test(employeeNo) || length < 8 || length > 16) {
    return failure(
      { code: "INVALID_LOGIN_REQUEST", message: "Employee number or password format is invalid" },
      requestId,
      400,
    );
  }

  const result = await provider.login(request, employeeNo, password);
  if (result.status === "invalid") {
    return failure({ code: "LOGIN_FAILED", message: "Authentication failed" }, requestId, 401);
  }
  if (result.status === "denied") {
    return failure({ code: "ACCESS_DENIED", message: "Application access denied" }, requestId, 403);
  }
  if (result.status === "rate_limited") {
    const response = failure(
      { code: "LOGIN_RATE_LIMITED", message: "Too many login attempts" },
      requestId,
      429,
    );
    response.headers.set("retry-after", String(result.retryAfterSeconds));
    return response;
  }
  if (result.status === "invalid_response") {
    return failure(
      { code: "IDENTITY_UNAVAILABLE", message: "Identity provider response is invalid" },
      requestId,
      503,
    );
  }
  if (result.status === "unavailable") {
    return failure(
      { code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" },
      requestId,
      503,
    );
  }

  const member = await resolveAppMember(env.DB, result.principal);
  if (!member.isActive) {
    await provider.revokeToken(request, result.token);
    return failure({ code: "ACCESS_DENIED", message: "CY Web access is disabled" }, requestId, 403);
  }

  return success(
    {
      user: user(result.principal),
      expiresAt: result.expiresAt,
    },
    requestId,
    { headers: { "set-cookie": identitySessionCookie(result.token, result.expiresAt) } },
  );
}

async function me(request: Request, env: IdentityBridgeEnv, requestId: string): Promise<Response> {
  const provider = identityClient(env);
  if (!provider) {
    return failure(
      { code: "IDENTITY_UNAVAILABLE", message: "Identity provider is not configured" },
      requestId,
      503,
    );
  }

  const resolution = await provider.resolve(request);
  if (resolution.status === "authenticated") {
    const member = await resolveAppMember(env.DB, resolution.principal);
    if (!member.isActive) {
      return failure({ code: "ACCESS_DENIED", message: "CY Web access is disabled" }, requestId, 403);
    }
    return success(
      { user: user(resolution.principal), expiresAt: resolution.expiresAt },
      requestId,
    );
  }
  if (resolution.status === "unavailable") {
    return failure(
      { code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" },
      requestId,
      503,
    );
  }

  const response = failure(
    {
      code: resolution.reason === "invalid" ? "AUTH_INVALID" : "AUTH_REQUIRED",
      message: resolution.reason === "invalid" ? "Session is invalid" : "Authentication required",
    },
    requestId,
    401,
  );
  if (resolution.reason === "invalid") {
    response.headers.set("set-cookie", clearIdentitySessionCookie());
  }
  return response;
}

async function logout(request: Request, env: IdentityBridgeEnv, requestId: string): Promise<Response> {
  const provider = identityClient(env);
  if (!provider) {
    return failure(
      { code: "IDENTITY_UNAVAILABLE", message: "Identity provider is not configured" },
      requestId,
      503,
    );
  }

  const result = await provider.logout(request);
  if (result.status === "unavailable") {
    return failure(
      { code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" },
      requestId,
      503,
    );
  }

  return success(
    { loggedOut: true },
    requestId,
    { headers: { "set-cookie": clearIdentitySessionCookie() } },
  );
}

export async function handleAuthRoute(
  request: Request,
  env: IdentityBridgeEnv,
  requestId: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method === "POST" && url.pathname === "/api/auth/login") {
    return login(request, env, requestId);
  }
  if (request.method === "GET" && url.pathname === "/api/auth/me") {
    return me(request, env, requestId);
  }
  if (request.method === "POST" && url.pathname === "/api/auth/logout") {
    return logout(request, env, requestId);
  }
  return null;
}
