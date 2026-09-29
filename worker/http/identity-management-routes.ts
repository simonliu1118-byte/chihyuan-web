import { CYWEB_IDENTITY_COOKIE } from "../identity/cycloud-identity-adapter";
import type { IdentityRuntimeEnv } from "./auth-routes";
import { failure, success } from "./response";

interface ProviderError {
  code?: unknown;
  message?: unknown;
}

interface ProviderPayload {
  ok?: unknown;
  error?: ProviderError;
  [key: string]: unknown;
}

const PROVIDER_META_KEYS = new Set([
  "ok",
  "service",
  "serviceVersion",
  "apiVersion",
  "environment",
  "requestId",
  "timestamp",
  "error",
]);

function normalizedApplicationId(env: IdentityRuntimeEnv): string | null {
  const value = env.IDENTITY_APPLICATION_ID?.trim().toUpperCase() ?? "";
  return value.length >= 2 && value.length <= 64 && !/[^A-Z0-9_-]/.test(value) ? value : null;
}

function normalizedWorkspaceId(env: IdentityRuntimeEnv): string | null {
  const value = env.IDENTITY_WORKSPACE_ID?.trim() ?? "";
  return value.length >= 5 && value.length <= 80 && !/[^A-Za-z0-9_-]/.test(value) ? value : null;
}

function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0 || part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function isSessionToken(value: string | null): value is string {
  return Boolean(value && /^cyid_[0-9a-f]{64}$/.test(value));
}

function providerData(payload: ProviderPayload): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (!PROVIDER_META_KEYS.has(key)) data[key] = value;
  }
  return data;
}

async function providerResponse(
  env: IdentityRuntimeEnv,
  requestId: string,
  path: string,
  init: RequestInit,
): Promise<Response> {
  if (!env.IDENTITY || typeof env.IDENTITY.fetch !== "function") {
    return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is not configured" }, requestId, 503);
  }

  let response: Response;
  try {
    response = await env.IDENTITY.fetch(new Request(`https://identity.internal${path}`, init));
  } catch {
    return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider is unavailable" }, requestId, 503);
  }

  const payload = await response.json().catch(() => null) as ProviderPayload | null;
  if (!payload || typeof payload !== "object") {
    return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity provider response is invalid" }, requestId, 503);
  }

  if (!response.ok || payload.ok === false) {
    const code = typeof payload.error?.code === "string" ? payload.error.code : "IDENTITY_REQUEST_FAILED";
    const message = typeof payload.error?.message === "string" ? payload.error.message : "Identity request failed";
    return failure({ code, message }, requestId, response.status || 500);
  }

  return success(providerData(payload), requestId, { status: response.status });
}

async function readObject(request: Request): Promise<Record<string, unknown> | null> {
  return request.json().catch(() => null) as Promise<Record<string, unknown> | null>;
}

function authenticatedHeaders(request: Request, env: IdentityRuntimeEnv): Headers | null {
  const applicationId = normalizedApplicationId(env);
  const token = cookieValue(request, CYWEB_IDENTITY_COOKIE);
  if (!applicationId || !isSessionToken(token)) return null;
  const headers = new Headers({
    authorization: `Bearer ${token}`,
    "x-identity-application": applicationId,
    "content-type": "application/json; charset=utf-8",
  });
  const requestId = request.headers.get("x-request-id")?.trim();
  if (requestId) headers.set("x-request-id", requestId);
  return headers;
}

async function proxyAuthenticated(
  request: Request,
  env: IdentityRuntimeEnv,
  requestId: string,
  providerPath: string,
  method: string,
): Promise<Response> {
  const headers = authenticatedHeaders(request, env);
  if (!headers) return failure({ code: "AUTH_REQUIRED", message: "Authentication required" }, requestId, 401);

  let body: string | undefined;
  if (method !== "GET" && method !== "DELETE") {
    const value = await readObject(request);
    if (value === null) return failure({ code: "INVALID_REQUEST", message: "Request body is invalid" }, requestId, 400);
    body = JSON.stringify(value);
  }
  if (method === "GET" || method === "DELETE") headers.delete("content-type");
  return providerResponse(env, requestId, providerPath, { method, headers, body });
}

async function proxyPublicWorkspace(
  request: Request,
  env: IdentityRuntimeEnv,
  requestId: string,
  providerPath: string,
): Promise<Response> {
  const workspaceId = normalizedWorkspaceId(env);
  if (!workspaceId) {
    return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity Workspace is not configured" }, requestId, 503);
  }
  const value = await readObject(request);
  if (value === null) return failure({ code: "INVALID_REQUEST", message: "Request body is invalid" }, requestId, 400);
  return providerResponse(env, requestId, providerPath, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ ...value, workspaceId }),
  });
}

export async function handleIdentityManagementRoute(
  request: Request,
  env: IdentityRuntimeEnv,
  requestId: string,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  const publicRoutes: Record<string, string> = {
    "/api/identity/activation/start": "/v1/identity/activation/start",
    "/api/identity/activation/confirm": "/v1/identity/activation/confirm",
    "/api/identity/password-recovery/start": "/v1/identity/password-recovery/start",
    "/api/identity/password-recovery/confirm": "/v1/identity/password-recovery/confirm",
  };
  if (request.method === "POST" && publicRoutes[path]) {
    return proxyPublicWorkspace(request, env, requestId, publicRoutes[path]);
  }

  const selfRoutes: Record<string, string> = {
    "/api/identity/password/change": "/v1/identity/password/change",
    "/api/identity/email-change/start": "/v1/identity/email-change/start",
    "/api/identity/email-change/confirm": "/v1/identity/email-change/confirm",
    "/api/identity/email-verification/start-current": "/v1/identity/email-verification/start-current",
  };
  if (request.method === "POST" && selfRoutes[path]) {
    return proxyAuthenticated(request, env, requestId, selfRoutes[path], "POST");
  }

  if (request.method === "GET" && path === "/api/identity/admin/snapshot") {
    return proxyAuthenticated(request, env, requestId, "/v1/admin/identity/snapshot", "GET");
  }
  if (request.method === "GET" && path === "/api/identity/admin/authority") {
    return proxyAuthenticated(request, env, requestId, "/v1/admin/authority", "GET");
  }
  if ((request.method === "GET" || request.method === "PUT") && path === "/api/identity/admin/security-policy") {
    return proxyAuthenticated(request, env, requestId, "/v1/admin/security-policy", request.method);
  }
  if (request.method === "POST" && path === "/api/identity/admin/employees") {
    return proxyAuthenticated(request, env, requestId, "/v1/admin/identity/employees", "POST");
  }
  if (request.method === "POST" && path === "/api/identity/admin/authority-transfer/start") {
    return proxyAuthenticated(request, env, requestId, "/v1/admin/authority-transfer/start", "POST");
  }
  if (request.method === "POST" && path === "/api/identity/admin/authority-transfer/confirm") {
    return proxyAuthenticated(request, env, requestId, "/v1/admin/authority-transfer/confirm", "POST");
  }

  let match = /^\/api\/identity\/admin\/employees\/([^/]+)$/.exec(path);
  if ((request.method === "PATCH" || request.method === "DELETE") && match) {
    return proxyAuthenticated(
      request,
      env,
      requestId,
      `/v1/admin/identity/employees/${encodeURIComponent(match[1])}`,
      request.method,
    );
  }

  const employeeActionRoutes: Array<[RegExp, string]> = [
    [/^\/api\/identity\/admin\/employees\/([^/]+)\/activation\/resend$/, "activation/resend"],
    [/^\/api\/identity\/admin\/employees\/([^/]+)\/email-recovery$/, "email-recovery"],
    [/^\/api\/identity\/admin\/employees\/([^/]+)\/email-verification\/resend$/, "email-verification/resend"],
  ];
  for (const [pattern, suffix] of employeeActionRoutes) {
    match = pattern.exec(path);
    if (request.method === "POST" && match) {
      return proxyAuthenticated(
        request,
        env,
        requestId,
        `/v1/admin/identity/employees/${encodeURIComponent(match[1])}/${suffix}`,
        "POST",
      );
    }
  }

  match = /^\/api\/identity\/admin\/employees\/([^/]+)\/identity-admin$/.exec(path);
  if (request.method === "PUT" && match) {
    return proxyAuthenticated(
      request,
      env,
      requestId,
      `/v1/admin/identity/employees/${encodeURIComponent(match[1])}/identity-admin`,
      "PUT",
    );
  }

  match = /^\/api\/identity\/admin\/employees\/([^/]+)\/applications\/([^/]+)$/.exec(path);
  if (request.method === "PUT" && match) {
    return proxyAuthenticated(
      request,
      env,
      requestId,
      `/v1/admin/identity/employees/${encodeURIComponent(match[1])}/applications/${encodeURIComponent(match[2])}`,
      "PUT",
    );
  }

  // Legacy Group endpoints are deliberately not proxied by the new CY Web UI.
  // Provider-side compatibility routes may remain temporarily during migration.
  return null;
}
