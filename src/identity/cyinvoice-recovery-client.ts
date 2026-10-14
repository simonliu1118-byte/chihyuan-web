import { apiRequest } from "../api/client";

const root = "/api/identity/admin/cyinvoice/device-recovery/invitations";
export const recoveryOperationIdPattern =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type RecoveryOperationState =
  | { status: "sent"; invitationId: string; expiresAt: string }
  | { status: "pending"; operationId: string }
  | { status: "revoked"; operationId: string }
  | { status: "unavailable"; operationId: string };

export type RecoveryOperationAction = "issue" | "status" | "revoke";

/**
 * The browser sends only an opaque operationId and the current CYID password;
 * the Worker decides the fixed CYInvoice App/Workspace and verifies its own
 * SUPER_ADMIN authority via the named private CYInvoice RPC Service Binding.
 */
export function executeCyInvoiceRecoveryAction(
  action: RecoveryOperationAction, operationId: string, password: string,
): Promise<RecoveryOperationState> {
  if (!recoveryOperationIdPattern.test(operationId)
      || Array.from(password).length < 8 || Array.from(password).length > 16)
    return Promise.reject(new Error("操作 ID 或當次驗證密碼格式不正確。"));
  const path = action === "issue" ? root : root + (action === "status" ? "/status" : "/revoke");
  return apiRequest<RecoveryOperationState>(path, {
    method: "POST",
    json: { operationId, password },
  });
}
