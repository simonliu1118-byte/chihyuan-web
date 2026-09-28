import { apiRequest } from "../api/client";

export interface IdentityEmployeeRow {
  employee_id: string;
  employee_no: string;
  name: string;
  email_normalized: string;
  email_verified_at: string | null;
  enabled: number;
  revision: number;
}

export interface IdentityGroupRow {
  group_id: string;
  group_key: string;
  display_name: string;
  description: string | null;
  status: "active" | "disabled";
  revision: number;
}

export interface IdentityMembershipRow {
  employee_id: string;
  group_id: string;
}

export interface IdentityApplicationRow {
  application_id: string;
  display_name: string;
  application_status: string;
  enabled: number;
  compatibility_role_mode: "USER_ADMIN" | null;
}

export interface IdentityDirectAccessRow {
  employee_id: string;
  application_id: string;
  enabled: number;
}

export interface IdentityGroupAccessRow {
  group_id: string;
  application_id: string;
  enabled: number;
  application_role_key: "USER" | "ADMIN" | null;
}

export interface IdentityAdminSnapshot {
  workspaceId: string;
  employees: IdentityEmployeeRow[];
  groups: IdentityGroupRow[];
  memberships: IdentityMembershipRow[];
  applications: IdentityApplicationRow[];
  directAccess: IdentityDirectAccessRow[];
  groupAccess: IdentityGroupAccessRow[];
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
  return apiRequest<{
    transferred: boolean;
    workspaceId: string;
    previousEmployeeId: string;
    superAdminEmployeeId: string;
    recoveryEmail: string;
    previousAuthoritySessionsRevoked: boolean;
  }>("/api/identity/admin/authority-transfer/confirm", {
    method: "POST",
    json: { targetEmployeeId, challengeId, code },
  });
}

export function createIdentityEmployee(input: { employeeNo: string; displayName: string; email: string }) {
  return apiRequest<{ employee: unknown }>("/api/identity/admin/employees", { method: "POST", json: input });
}

export function updateIdentityEmployee(employeeId: string, input: {
  employeeNo: string;
  displayName: string;
  enabled: boolean;
  revision: number;
}) {
  return apiRequest<{ employee: unknown }>(`/api/identity/admin/employees/${encodeURIComponent(employeeId)}`, {
    method: "PATCH",
    json: input,
  });
}

export function createIdentityGroup(input: { groupKey: string; displayName: string; description?: string | null }) {
  return apiRequest<{ group: unknown }>("/api/identity/admin/groups", { method: "POST", json: input });
}

export function updateIdentityGroup(groupId: string, input: {
  groupKey: string;
  displayName: string;
  description: string | null;
  status: "active" | "disabled";
  revision: number;
}) {
  return apiRequest<{ group: unknown }>(`/api/identity/admin/groups/${encodeURIComponent(groupId)}`, {
    method: "PATCH",
    json: input,
  });
}

export function setIdentityGroupMember(groupId: string, employeeId: string, enabled: boolean) {
  return apiRequest<{ membership: unknown }>(
    `/api/identity/admin/groups/${encodeURIComponent(groupId)}/members/${encodeURIComponent(employeeId)}`,
    { method: enabled ? "PUT" : "DELETE" },
  );
}

export function setGroupApplicationAccess(
  groupId: string,
  applicationId: string,
  enabled: boolean,
  applicationRoleKey: "USER" | "ADMIN" | null,
) {
  return apiRequest<{ access: unknown }>(
    `/api/identity/admin/groups/${encodeURIComponent(groupId)}/applications/${encodeURIComponent(applicationId)}`,
    { method: "PUT", json: { enabled, applicationRoleKey } },
  );
}

export function setEmployeeApplicationAccess(employeeId: string, applicationId: string, enabled: boolean) {
  return apiRequest<{ access: unknown }>(
    `/api/identity/admin/employees/${encodeURIComponent(employeeId)}/applications/${encodeURIComponent(applicationId)}`,
    { method: "PUT", json: { enabled } },
  );
}

export function setApplicationCompatibilityRoleMode(applicationId: string, mode: "USER_ADMIN" | null) {
  return apiRequest<{ application: unknown }>(
    `/api/identity/admin/applications/${encodeURIComponent(applicationId)}/compatibility-role-mode`,
    { method: "PUT", json: { mode } },
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

export function startEmployeeActivation(employeeNo: string): Promise<{ activation: OtpIssueView; message: string }> {
  return apiRequest<{ activation: OtpIssueView; message: string }>("/api/identity/activation/start", {
    method: "POST",
    json: { employeeNo },
  });
}

export function confirmEmployeeActivation(employeeNo: string, challengeId: string, code: string, password: string) {
  return apiRequest<{ activated: boolean; employee: unknown }>("/api/identity/activation/confirm", {
    method: "POST",
    json: { employeeNo, challengeId, code, password },
  });
}
