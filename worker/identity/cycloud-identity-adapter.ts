import type { IdentityAdapter, IdentityPrincipal, IdentityResolution, WorkspaceRole } from "./contract";

export const CYWEB_IDENTITY_COOKIE = "cyweb_identity_session";

interface ProviderPrincipal {
  workspaceId?: unknown;
  employeeId?: unknown;
  employeeNo?: unknown;
  displayName?: unknown;
  workspaceRole?: unknown;
  isIdentityAdmin?: unknown;
  emailVerified?: unknown;
  isWorkspaceSuperAdmin?: unknown;
  groupKeys?: unknown;
  applicationRoleKey?: unknown;
  credentialVersion?: unknown;
  employeeRevision?: unknown;
}

interface ProviderSession {
  token?: unknown;
  expiresAt?: unknown;
}

interface ProviderPayload {
  principal?: ProviderPrincipal;
  session?: ProviderSession;
  loggedOut?: unknown;
  error?: { code?: unknown };
}

export type IdentityLoginResult =
  | {
      status: "authenticated";
      principal: IdentityPrincipal;
      token: string;
      expiresAt: string;
    }
  | { status: "invalid" }
  | { status: "denied" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "unavailable" }
  | { status: "invalid_response" };

export type IdentityLogoutResult = { status: "logged_out" } | { status: "unavailable" };

function boundedRetryAfter(response: Response): number {
  const value = Number(response.headers.get("retry-after") ?? 60);
  if (!Number.isFinite(value)) return 60;
  return Math.max(1, Math.min(Math.trunc(value), 3600));
}

function isSessionToken(value: unknown): value is string {
  return typeof value === "string" && /^cyid_[0-9a-f]{64}$/.test(value);
}

function cookieValue(request: Request, name: string): string | null {
  const raw = request.headers.get("cookie") ?? "";
  for (const part of raw.split(";")) {
    const index = part.indexOf("=");
    if (index < 0) continue;
    if (part.slice(0, index).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(index + 1).trim());
    } catch {
      return null;
    }
  }
  return null;
}

function normalizeGroupKeys(value: unknown): string[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 100) return null;
  const result: string[] = [];
  const seen = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") return null;
    const normalized = item.trim();
    if (!normalized || normalized.length > 128) return null;
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
}

function normalizeWorkspaceRole(value: unknown): WorkspaceRole | null {
  return value === "USER" || value === "ADMIN" || value === "SUPER_ADMIN" ? value : null;
}

function nonNegativeInteger(value: unknown): number | null {
  const number = Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function normalizePrincipal(value: ProviderPrincipal | undefined): IdentityPrincipal | null {
  const workspaceId = typeof value?.workspaceId === "string" ? value.workspaceId.trim() : "";
  const employeeId = typeof value?.employeeId === "string" ? value.employeeId.trim() : "";
  const employeeNo = typeof value?.employeeNo === "string" ? value.employeeNo.trim() : "";
  const displayName = typeof value?.displayName === "string" ? value.displayName.trim() : "";
  const workspaceRole = normalizeWorkspaceRole(value?.workspaceRole ?? value?.applicationRoleKey);
  const groupKeys = normalizeGroupKeys(value?.groupKeys);
  const credentialVersion = nonNegativeInteger(value?.credentialVersion);
  const employeeRevision = nonNegativeInteger(value?.employeeRevision);
  const superAdmin = typeof value?.isWorkspaceSuperAdmin === "boolean"
    ? value.isWorkspaceSuperAdmin
    : workspaceRole === "SUPER_ADMIN";
  const identityAdmin = typeof value?.isIdentityAdmin === "boolean" ? value.isIdentityAdmin : false;
  const emailVerified = typeof value?.emailVerified === "boolean" ? value.emailVerified : true;

  if (
    workspaceId.length < 5
    || workspaceId.length > 80
    || !employeeId
    || employeeId.length > 128
    || !/^\d{4}$/.test(employeeNo)
    || !displayName
    || displayName.length > 200
    || !workspaceRole
    || !groupKeys
    || credentialVersion === null
    || employeeRevision === null
    || superAdmin !== (workspaceRole === "SUPER_ADMIN")
    || (identityAdmin && workspaceRole !== "ADMIN")
  ) {
    return null;
  }

  return {
    workspaceId,
    employeeId,
    employeeNo,
    displayName,
    workspaceRole,
    isIdentityAdmin: identityAdmin,
    emailVerified,
    isWorkspaceSuperAdmin: superAdmin,
    groupKeys,
    credentialVersion,
    employeeRevision,
  };
}

function forwardedHeaders(request: Request): Headers {
  const headers = new Headers({ "content-type": "application/json" });
  const clientIp = request.headers.get("cf-connecting-ip")?.trim();
  if (clientIp) headers.set("cf-connecting-ip", clientIp);
  const requestId = request.headers.get("x-request-id")?.trim();
  if (requestId) headers.set("x-request-id", requestId);
  return headers;
}

export function identitySessionCookie(token: string, expiresAt: string, now = new Date()): string {
  if (!isSessionToken(token)) throw new Error("IDENTITY_SESSION_TOKEN_INVALID");
  const expiry = new Date(expiresAt);
  const maxAge = Math.max(1, Math.min(Math.floor((expiry.getTime() - now.getTime()) / 1000), 24 * 60 * 60));
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= now.getTime()) {
    throw new Error("IDENTITY_SESSION_EXPIRY_INVALID");
  }
  return `${CYWEB_IDENTITY_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

export function clearIdentitySessionCookie(): string {
  return `${CYWEB_IDENTITY_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0`;
}

export class CYCloudIdentityClient implements IdentityAdapter {
  constructor(
    private readonly binding: Fetcher,
    private readonly applicationId: string,
    private readonly workspaceId: string,
  ) {}

  private async providerFetch(request: Request): Promise<Response | null> {
    try {
      return await this.binding.fetch(request);
    } catch {
      return null;
    }
  }

  async login(request: Request, employeeNo: string, password: string): Promise<IdentityLoginResult> {
    const response = await this.providerFetch(new Request("https://identity.internal/v1/identity/login", {
      method: "POST",
      headers: forwardedHeaders(request),
      body: JSON.stringify({
        workspaceId: this.workspaceId,
        applicationId: this.applicationId,
        employeeNo,
        password,
      }),
    }));
    if (!response) return { status: "unavailable" };

    const payload = await response.json().catch(() => null) as ProviderPayload | null;
    const providerCode = String(payload?.error?.code ?? "");
    if (!response.ok) {
      if (response.status === 429) {
        return { status: "rate_limited", retryAfterSeconds: boundedRetryAfter(response) };
      }
      if (response.status === 401 || providerCode === "AUTHENTICATION_FAILED") {
        return { status: "invalid" };
      }
      if (response.status === 403 || providerCode === "APPLICATION_ACCESS_DENIED") {
        return { status: "denied" };
      }
      if (response.status >= 500) return { status: "unavailable" };
      return { status: "invalid_response" };
    }

    const principal = normalizePrincipal(payload?.principal);
    const token = payload?.session?.token;
    const expiresAt = typeof payload?.session?.expiresAt === "string" ? payload.session.expiresAt : "";
    if (!principal || !isSessionToken(token) || !expiresAt || !Number.isFinite(new Date(expiresAt).getTime())) {
      return { status: "invalid_response" };
    }
    if (principal.workspaceId !== this.workspaceId) return { status: "invalid_response" };

    return { status: "authenticated", principal, token, expiresAt };
  }

  async resolve(request: Request): Promise<IdentityResolution> {
    const token = cookieValue(request, CYWEB_IDENTITY_COOKIE);
    if (!token) return { status: "unauthenticated", reason: "missing" };
    if (!isSessionToken(token)) return { status: "unauthenticated", reason: "invalid" };

    const headers = forwardedHeaders(request);
    headers.delete("content-type");
    headers.set("authorization", `Bearer ${token}`);
    headers.set("x-identity-application", this.applicationId);

    const response = await this.providerFetch(new Request("https://identity.internal/v1/identity/session/resolve", {
      method: "POST",
      headers,
    }));
    if (!response) return { status: "unavailable" };

    const payload = await response.json().catch(() => null) as ProviderPayload | null;
    if (!response.ok) {
      if (response.status === 401) return { status: "unauthenticated", reason: "invalid" };
      if (response.status >= 500) return { status: "unavailable" };
      return { status: "unauthenticated", reason: "invalid" };
    }

    const principal = normalizePrincipal(payload?.principal);
    const expiresAt = typeof payload?.session?.expiresAt === "string" ? payload.session.expiresAt : "";
    if (!principal || !expiresAt || !Number.isFinite(new Date(expiresAt).getTime())) {
      return { status: "unavailable" };
    }
    if (principal.workspaceId !== this.workspaceId) {
      return { status: "unauthenticated", reason: "invalid" };
    }
    return { status: "authenticated", principal, expiresAt };
  }

  async logout(request: Request): Promise<IdentityLogoutResult> {
    const token = cookieValue(request, CYWEB_IDENTITY_COOKIE);
    if (!token || !isSessionToken(token)) return { status: "logged_out" };

    const headers = forwardedHeaders(request);
    headers.delete("content-type");
    headers.set("authorization", `Bearer ${token}`);
    headers.set("x-identity-application", this.applicationId);

    const response = await this.providerFetch(new Request("https://identity.internal/v1/identity/logout", {
      method: "POST",
      headers,
    }));
    if (!response || response.status >= 500) return { status: "unavailable" };
    return { status: "logged_out" };
  }

  async revokeToken(request: Request, token: string): Promise<void> {
    if (!isSessionToken(token)) return;
    const headers = forwardedHeaders(request);
    headers.delete("content-type");
    headers.set("authorization", `Bearer ${token}`);
    headers.set("x-identity-application", this.applicationId);
    await this.providerFetch(new Request("https://identity.internal/v1/identity/logout", {
      method: "POST",
      headers,
    }));
  }
}
