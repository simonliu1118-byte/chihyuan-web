import { resolveAppMember } from "../auth/app-access";
import { CYInvoiceWebAuthProvider } from "../identity/cyinvoice-web-auth-provider";
import {
  clearSessionCookie,
  createIdentitySession,
  D1SessionIdentityAdapter,
  destroyIdentitySession,
} from "../identity/d1-session-adapter";
import { failure, success } from "./response";

export interface IdentityBridgeEnv {
  DB: D1Database;
  IDENTITY?: Fetcher;
  /**
   * Temporary provider application/audience name injected at deployment time.
   * The current compatibility deployment may use the existing CYInvoice Web Auth
   * audience; later Shared Identity extraction changes this provider boundary,
   * not CY Web business modules.
   */
  IDENTITY_LOGIN_APPLICATION?: string;
}

function normalizedApplication(env: IdentityBridgeEnv): string | null {
  const value = env.IDENTITY_LOGIN_APPLICATION?.trim() ?? "";
  return value.length > 0 && value.length <= 64 ? value : null;
}

function user(principal: {
  employeeId: string;
  employeeNo: string | null;
  displayName: string;
  role: string;
  workspaceId: string | null;
}) {
  return {
    employeeId: principal.employeeId,
    employeeNo: principal.employeeNo,
    displayName: principal.displayName,
    role: principal.role,
    workspaceId: principal.workspaceId,
  };
}

async function login(
  request: Request,
  env: IdentityBridgeEnv,
  requestId: string,
): Promise<Response> {
  if (!env.IDENTITY || typeof env.IDENTITY.fetch !== "function") {
    return failure(
      { code: "IDENTITY_UNAVAILABLE", message: "Identity provider is not configured" },
      requestId,
      503,
    );
  }
  const application = normalizedApplication(env);
  if (!application) {
    return failure(
      { code: "IDENTITY_UNAVAILABLE", message: "Identity provider application is not configured" },
      requestId,
      503,
    );
  }

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const employeeNo = typeof body?.employeeNo === "string" ? body.employeeNo.trim() : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!/^\d{4}$/.test(employeeNo) || password.length < 1 || password.length > 200) {
    return failure(
      { code: "INVALID_LOGIN_REQUEST", message: "Employee number or password format is invalid" },
      requestId,
      400,
    );
  }

  const provider = new CYInvoiceWebAuthProvider(env.IDENTITY, application);
  const result = await provider.authenticate(request, { employeeNo, password });

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
    return failure({ code: "ACCESS_DENIED", message: "CY Web access is disabled" }, requestId, 403);
  }

  const session = await createIdentitySession(env.DB, result.principal, result.metadata);
  return success(
    {
      user: user(result.principal),
      expiresAt: session.expiresAt,
    },
    requestId,
    { headers: { "set-cookie": session.setCookie } },
  );
}

async function me(request: Request, env: IdentityBridgeEnv, requestId: string): Promise<Response> {
  const resolution = await new D1SessionIdentityAdapter(env.DB).resolve(request);
  if (resolution.status === "authenticated") {
    const member = await resolveAppMember(env.DB, resolution.principal);
    if (!member.isActive) {
      return failure({ code: "ACCESS_DENIED", message: "CY Web access is disabled" }, requestId, 403);
    }
    return success({ user: user(resolution.principal) }, requestId);
  }
  if (resolution.status === "unavailable") {
    return failure(
      { code: "IDENTITY_UNAVAILABLE", message: "Session store is unavailable" },
      requestId,
      503,
    );
  }
  return failure(
    {
      code: resolution.reason === "invalid" ? "AUTH_INVALID" : "AUTH_REQUIRED",
      message: resolution.reason === "invalid" ? "Session is invalid" : "Authentication required",
    },
    requestId,
    401,
  );
}

async function logout(request: Request, env: IdentityBridgeEnv, requestId: string): Promise<Response> {
  await destroyIdentitySession(env.DB, request);
  return success(
    { loggedOut: true },
    requestId,
    { headers: { "set-cookie": clearSessionCookie() } },
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
