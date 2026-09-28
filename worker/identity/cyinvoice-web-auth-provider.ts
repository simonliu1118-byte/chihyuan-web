import type { SharedIdentityRole } from "./contract";
import type {
  IdentityLoginCredentials,
  IdentityLoginProvider,
  IdentityLoginResult,
} from "./login-provider";

interface ProviderEmployee {
  employeeId?: unknown;
  employeeNo?: unknown;
  name?: unknown;
  role?: unknown;
  credentialVersion?: unknown;
  revision?: unknown;
}

interface ProviderPayload {
  ok?: unknown;
  employee?: ProviderEmployee;
  error?: { code?: unknown };
}

function isRole(value: unknown): value is SharedIdentityRole {
  return value === "EMPLOYEE" || value === "ADMIN" || value === "SUPER_ADMIN";
}

function positiveOrZero(value: unknown): number {
  const number = Number(value ?? 0);
  return Number.isSafeInteger(number) && number >= 0 ? number : 0;
}

function boundedRetryAfter(response: Response): number {
  const value = Number(response.headers.get("retry-after") ?? 60);
  if (!Number.isFinite(value)) return 60;
  return Math.max(1, Math.min(Math.trunc(value), 3600));
}

/**
 * Temporary compatibility provider only.
 *
 * It intentionally knows the current CYInvoice Cloud Web Auth transport while
 * the rest of CY Web only sees IdentityLoginProvider. No CYInvoice D1/table,
 * credential verifier, OTP secret or recovery implementation is imported here.
 */
export class CYInvoiceWebAuthProvider implements IdentityLoginProvider {
  constructor(
    private readonly binding: Fetcher,
    private readonly application: string,
  ) {}

  async authenticate(
    request: Request,
    credentials: IdentityLoginCredentials,
  ): Promise<IdentityLoginResult> {
    const headers = new Headers({ "content-type": "application/json" });
    const clientIp = request.headers.get("cf-connecting-ip")?.trim();
    if (clientIp) headers.set("cf-connecting-ip", clientIp);
    const requestId = request.headers.get("x-request-id")?.trim();
    if (requestId) headers.set("x-request-id", requestId);

    let response: Response;
    try {
      response = await this.binding.fetch(
        new Request("https://identity.internal/v1/web-auth/login", {
          method: "POST",
          headers,
          body: JSON.stringify({
            application: this.application,
            employeeNo: credentials.employeeNo,
            password: credentials.password,
          }),
        }),
      );
    } catch {
      return { status: "unavailable" };
    }

    const payload = (await response.json().catch(() => null)) as ProviderPayload | null;
    const providerCode = String(payload?.error?.code ?? "");

    if (!response.ok || payload?.ok === false) {
      if (response.status === 429) {
        return { status: "rate_limited", retryAfterSeconds: boundedRetryAfter(response) };
      }
      if (response.status === 403 || providerCode === "APPLICATION_ACCESS_DENIED") {
        return { status: "denied" };
      }
      if (response.status === 401 || providerCode === "WEB_AUTHENTICATION_FAILED") {
        return { status: "invalid" };
      }
      if (response.status === 503 || providerCode === "WEB_AUTH_NOT_READY") {
        return { status: "unavailable" };
      }
      return { status: "unavailable" };
    }

    const employee = payload?.employee;
    const employeeId = typeof employee?.employeeId === "string" ? employee.employeeId.trim() : "";
    const employeeNo = typeof employee?.employeeNo === "string" ? employee.employeeNo.trim() : "";
    const displayName = typeof employee?.name === "string" ? employee.name.trim() : "";
    const role = employee?.role;

    if (!employeeId || !/^\d{4}$/.test(employeeNo) || !displayName || !isRole(role)) {
      return { status: "invalid_response" };
    }

    return {
      status: "authenticated",
      principal: {
        employeeId,
        employeeNo,
        displayName,
        role,
        workspaceId: null,
      },
      metadata: {
        credentialVersion: positiveOrZero(employee?.credentialVersion),
        employeeRevision: positiveOrZero(employee?.revision),
      },
    };
  }
}
