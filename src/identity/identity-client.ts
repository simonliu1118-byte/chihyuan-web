import { apiRequest } from "../api/client";

export type WorkspaceRole = "SUPER_ADMIN" | "ADMIN" | "USER";

export interface IdentityEmployeeRow {
  employee_id: string;
  employee_no: string;
  name: string;
  email_normalized: string;
  email_verified_at: string | null;
  enabled: number;
  role_key: "USER" | "ADMIN";
  workspace_role: WorkspaceRole;
  identity_admin: number;
  activated_at: string | null;
  credential_present: number;
  revision: number;
}

export interface IdentityApplicationRow {
  application_id: string;
  display_name: string;
  application_status: string;
  enabled: number;
  core_access_locked: number;
  compatibility_role_mode?: "USER_ADMIN" | null;
}

export interface IdentityDirectAccessRow {
  employee_id: string;
  application_id: string;
  enabled: number;
}

export interface IdentityAdminSnapshot {
  workspaceId: string;
  actor: {
    employeeId: string;
    workspaceRole: WorkspaceRole;
    isIdentityAdmin: boolean;
  };
  employees: IdentityEmployeeRow[];
  applications: IdentityApplicationRow[];
  directAccess: IdentityDirectAccessRow[];
}

export interface HighestAuthorityView {
  authority: {
    workspaceId: string;
    superAdminEmployeeId: string;
    recoveryEmail: string | null;
    recoveryEmailVerified: boolean;
    workspaceRevision: number;
  };
}

export interface SecurityPolicy {
  otpResendCooldownSeconds: number;
  otpMaxAttempts: number;
  otpMaxSentPerEmailPurposeHour: number;
  emailDailyLimit: number;
  revision: number;
}

export interface SecurityPolicyView {
  policy: SecurityPolicy;
  systemEmailDailyCeiling: number;
}

export interface OtpIssueView {
  challengeId: string;
  expiresAt: string;
  resendAfter: string;
}

export interface DeliveryView extends Partial<OtpIssueView> {
  sent: boolean;
  errorCode?: string;
}

export function loadIdentityAdminSnapshot(): Promise<IdentityAdminSnapshot> {
  return apiRequest<IdentityAdminSnapshot>("/api/identity/admin/snapshot", { method: "GET" });
}

export function loadHighestAuthority(): Promise<HighestAuthorityView> {
  return apiRequest<HighestAuthorityView>("/api/identity/admin/authority", { method: "GET" });
}

export function startHighestAuthorityTransfer(targetEmployeeId: string, currentPassword: string): Promise<{ transfer: OtpIssueView & { targetEmployeeId: string } }> {
  return apiRequest<{ transfer: OtpIssueView & { targetEmployeeId: string } }>("/api/identity/admin/authority-transfer/start", {
    method: "POST",
    json: { targetEmployeeId, currentPassword },
  });
}

export function confirmHighestAuthorityTransfer(targetEmployeeId: string, challengeId: string, code: string) {
  return apiRequest<{ transferred: boolean; previousAuthoritySessionsRevoked: boolean }>("/api/identity/admin/authority-transfer/confirm", {
    method: "POST",
    json: { targetEmployeeId, challengeId, code },
  });
}

export function createIdentityEmployee(input: {
  employeeNo: string;
  displayName: string;
  email: string;
  roleKey: "USER" | "ADMIN";
}) {
  return apiRequest<{ employee: unknown; emailVerificationDelivery: DeliveryView; activationDelivery?: DeliveryView }>("/api/identity/admin/employees", {
    method: "POST",
    json: input,
  });
}

export function updateIdentityEmployee(employeeId: string, input: {
  employeeNo?: string;
  displayName?: string;
  email?: string;
  enabled?: boolean;
  roleKey?: "USER" | "ADMIN";
  revision: number;
}) {
  return apiRequest<{ employee: unknown; emailVerificationDelivery?: DeliveryView; activationDelivery?: DeliveryView }>(`/api/identity/admin/employees/${encodeURIComponent(employeeId)}`, {
    method: "PATCH",
    json: input,
  });
}

export function deletePendingIdentityEmployee(employeeId: string) {
  return apiRequest<{ deleted: boolean; employeeId: string; employeeNo: string }>(
    `/api/identity/admin/employees/${encodeURIComponent(employeeId)}`,
    { method: "DELETE" },
  );
}

export function resendEmployeeEmailVerification(employeeId: string) {
  return apiRequest<{ emailVerificationDelivery: DeliveryView; activationDelivery?: DeliveryView }>(
    `/api/identity/admin/employees/${encodeURIComponent(employeeId)}/activation/resend`,
    { method: "POST", json: {} },
  );
}

export function setEmployeeIdentityAdmin(employeeId: string, enabled: boolean) {
  return apiRequest<{ employee: unknown; sessionsRevoked: boolean }>(
    `/api/identity/admin/employees/${encodeURIComponent(employeeId)}/identity-admin`,
    { method: "PUT", json: { enabled } },
  );
}

export function setEmployeeApplicationAccess(employeeId: string, applicationId: string, enabled: boolean) {
  return apiRequest<{ access: unknown; affectedApplicationSessionsRevoked?: boolean }>(
    `/api/identity/admin/employees/${encodeURIComponent(employeeId)}/applications/${encodeURIComponent(applicationId)}`,
    { method: "PUT", json: { enabled } },
  );
}

export function forceEmployeeEmailRecovery(employeeId: string, email: string) {
  return apiRequest<{
    recovered: boolean;
    employee: unknown;
    verificationDelivery: DeliveryView;
    sessionsRevoked: boolean;
  }>(`/api/identity/admin/employees/${encodeURIComponent(employeeId)}/email-recovery`, {
    method: "POST",
    json: { email },
  });
}

export function resendActivatedEmailVerification(employeeId: string) {
  return apiRequest<{ verificationDelivery: DeliveryView }>(
    `/api/identity/admin/employees/${encodeURIComponent(employeeId)}/email-verification/resend`,
    { method: "POST", json: {} },
  );
}

export function loadSecurityPolicy(): Promise<SecurityPolicyView> {
  return apiRequest<SecurityPolicyView>("/api/identity/admin/security-policy", { method: "GET" });
}

export function updateSecurityPolicy(input: Omit<SecurityPolicy, "revision">): Promise<{ policy: SecurityPolicy }> {
  return apiRequest<{ policy: SecurityPolicy }>("/api/identity/admin/security-policy", { method: "PUT", json: input });
}

export function changeOwnPassword(currentPassword: string, newPassword: string) {
  return apiRequest<{ changed: boolean; sessionsRevoked: boolean }>("/api/identity/password/change", {
    method: "POST",
    json: { currentPassword, newPassword },
  });
}

export function startOwnEmailChange(currentPassword: string, email: string): Promise<{ verification: OtpIssueView }> {
  return apiRequest<{ verification: OtpIssueView }>("/api/identity/email-change/start", {
    method: "POST",
    json: { currentPassword, email },
  });
}

export function startCurrentEmailVerification(): Promise<{ verification: OtpIssueView; reused: boolean }> {
  return apiRequest<{ verification: OtpIssueView; reused: boolean }>("/api/identity/email-verification/start-current", {
    method: "POST",
    json: {},
  });
}

export function confirmOwnEmailChange(challengeId: string, code: string) {
  return apiRequest<{ verified: boolean; email: string; sessionRevoked: boolean }>("/api/identity/email-change/confirm", {
    method: "POST",
    json: { challengeId, code },
  });
}

export function startPasswordRecovery(employeeNo: string): Promise<{ recovery: OtpIssueView; message: string }> {
  return apiRequest<{ recovery: OtpIssueView; message: string }>("/api/identity/password-recovery/start", {
    method: "POST",
    json: { employeeNo },
  });
}

export function confirmPasswordRecovery(employeeNo: string, challengeId: string, code: string, newPassword: string) {
  return apiRequest<{ reset: boolean; sessionsRevoked: boolean }>("/api/identity/password-recovery/confirm", {
    method: "POST",
    json: { employeeNo, challengeId, code, newPassword },
  });
}

