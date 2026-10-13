import { requireIdentity } from "../auth/guard";
import { hasFirstLoginCookie } from "../identity/cycloud-identity-adapter";
import { identityClient, type IdentityRuntimeEnv } from "./auth-routes";
import { readJsonObject, RequestInputError } from "./request";
import { failure, success } from "./response";

/**
 * Private named CYInvoice capability. The implementing Worker must expose an
 * RPC entrypoint, not an unauthenticated public fetch route. It must independently
 * re-authenticate this Employee under the CYInvoice Application and enforce
 * its own fixed identity/business Workspace and CYID_ONLY storage profile.
 *
 * CY Web's core Session token is never forwarded across this boundary.
 */
export interface CyInvoiceRecoveryIssuer {
  issueRecoveryInvitation(input: {
    operationId: string;
    employeeNo: string;
    password: string;
    expectedEmployeeId: string;
    expectedIdentityWorkspaceId: string;
    expectedCredentialVersion: number;
    expectedEmployeeRevision: number;
  }): Promise<{
    status: "sent" | "pending" | "failed";
    invitationId?: string;
    expiresAt?: string;
  }>;
}

export interface CyInvoiceRecoveryEnv extends IdentityRuntimeEnv {
  CYINVOICE_RECOVERY?: CyInvoiceRecoveryIssuer;
}

const recoveryPath = "/api/identity/admin/cyinvoice/device-recovery/invitations";
const operationIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * HttpOnly + SameSite=Strict cookies are not the only CSRF gate: this
 * credential-bearing mutation also requires a same-origin browser request.
 * Never trust x-forwarded-host / user-provided Workspace or actor fields.
 */
function isSameOriginMutation(request: Request): boolean {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return false;
  const site = request.headers.get("sec-fetch-site");
  return site === null || site === "same-origin";
}

export async function handleCyInvoiceRecoveryRoute(
  request: Request,
  env: CyInvoiceRecoveryEnv,
  requestId: string,
): Promise<Response | null> {
  if (new URL(request.url).pathname !== recoveryPath) return null;
  if (request.method !== "POST")
    return failure({ code: "METHOD_NOT_ALLOWED", message: "Only POST is supported" }, requestId, 405);

  // Fail closed: this route never issues invitations by itself, and an
  // unconfigured deployment has no issuer side effect.
  if (!env.CYINVOICE_RECOVERY || typeof env.CYINVOICE_RECOVERY.issueRecoveryInvitation !== "function")
    return failure({ code: "RECOVERY_NOT_CONFIGURED", message: "CYInvoice recovery is not configured" }, requestId, 503);

  if (!isSameOriginMutation(request))
    return failure({ code: "ORIGIN_NOT_ALLOWED", message: "Request origin is not allowed" }, requestId, 403);

  if (hasFirstLoginCookie(request))
    return failure({ code: "AUTH_REQUIRED", message: "Complete first-login Email verification" }, requestId, 401);

  const provider = identityClient(env);
  if (!provider)
    return failure({ code: "IDENTITY_UNAVAILABLE", message: "Identity service is not configured" }, requestId, 503);

  const gate = await requireIdentity(provider, request);
  if (!gate.ok)
    return failure({ code: gate.code, message: "Current Identity session is required" }, requestId, gate.status);

  const principal = gate.principal;
  if (principal.workspaceRole !== "SUPER_ADMIN" || !principal.isWorkspaceSuperAdmin || !principal.emailVerified)
    return failure({ code: "SUPER_ADMIN_REQUIRED", message: "Verified super administrator is required" }, requestId, 403);

  let body: Record<string, unknown>;
  try {
    body = await readJsonObject(request, 512);
  } catch (error) {
    if (error instanceof RequestInputError)
      return failure({ code: error.code, message: error.message }, requestId, error.status);
    return failure({ code: "INVALID_REQUEST", message: "Invalid request" }, requestId, 400);
  }

  if (Object.keys(body).some(key => key !== "password" && key !== "operationId"))
    return failure({ code: "INVALID_REQUEST", message: "Unexpected recovery fields" }, requestId, 400);

  const password = body.password;
  const operationId = body.operationId;
  if (typeof password !== "string" || Array.from(password).length < 8 || Array.from(password).length > 16
      || typeof operationId !== "string" || !operationIdPattern.test(operationId))
    return failure({ code: "INVALID_REQUEST", message: "Invalid recovery confirmation" }, requestId, 400);

  try {
    const result = await env.CYINVOICE_RECOVERY.issueRecoveryInvitation({
      operationId,
      employeeNo: principal.employeeNo,
      password,
      expectedEmployeeId: principal.employeeId,
      expectedIdentityWorkspaceId: principal.workspaceId,
      expectedCredentialVersion: principal.credentialVersion,
      expectedEmployeeRevision: principal.employeeRevision,
    });

    // No invitation code or sensitive provider response can be reflected to the browser.
    if (result.status === "sent" && typeof result.invitationId === "string"
        && /^inv_[0-9a-f-]{36}$/.test(result.invitationId)
        && typeof result.expiresAt === "string"
        && Number.isFinite(Date.parse(result.expiresAt))) {
      return success({ status: "sent", invitationId: result.invitationId, expiresAt: result.expiresAt }, requestId);
    }
    if (result.status === "pending")
      return success({ status: "pending", operationId }, requestId, { status: 202 });

    return failure({ code: "RECOVERY_ISSUE_FAILED", message: "Recovery invitation was not issued" }, requestId, 409);
  } catch {
    // A lost RPC response may mean that an invitation was already committed.
    // Never retry or create another operationId automatically.
    return failure({ code: "RECOVERY_RESULT_UNKNOWN", message: "Check the original operation status before retrying" }, requestId, 503);
  }
}
