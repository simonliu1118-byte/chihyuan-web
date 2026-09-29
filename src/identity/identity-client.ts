import { apiRequest } from "../api/client";
import type { CyWebModuleCode } from "../../shared/module-access";

export type WorkspaceRole = "USER" | "ADMIN" | "SUPER_ADMIN";
export type StoredEmployeeRole = "USER" | "ADMIN";

export interface IdentityEmployeeRow {
  employee_id: string;
  employee_no: string;
  name: string;
  email_normalized: string;
  email_verified_at: string | null;
  enabled: number;
  role_key: StoredEmployeeRole;
  identity_admin: number;
  activated_at: string | null;
  revision: number;
  credential_present: number;
  is_super_admin: number;
  workspace_role: WorkspaceRole;
}

export interface IdentityApplicationRow {
  application_id: string;
  display_name: string;
  application_status: string;
  enabled: number;
  compatibility_role_mode?: "USER_ADMIN" | null;
  core_access_locked: number;
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

export interface ModuleAccessGrant {
  identity_employee_id: string;
  module_code: CyWebModuleCode;
  enabled: number;
}

export interface ModuleAccessView {
  modules: ReadonlyArray<{ code: CyWebModuleCode; label: string }>;
  grants: ModuleAccessGrant[];
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

export function createIdentityEmployee(input: {
  employeeNo: string;
  displayName: string;
  email: string;
  roleKey: StoredEmployeeRole;
}) {
  return apiRequest<{ employee: IdentityEmployeeRow; activationDelivery: DeliveryView }>(
    "/api/identity/admin/employees",
    { method: "POST", json: input },
  );
}

export function updateIdentityEmployee(employeeId: string, input: {
  employeeNo?: string;
  displayName?: string;
  email?: string;
  enabled?: boolean;
  roleKey?: StoredEmployeeRole;
  revision: number;
}) {
  return apiRequest<{ employee: unknown; activationDelivery?: DeliveryView }>(
    `/api/identity/admin/employees/${encodeURIComponent(employeeId)}`,
    { method: "PATCH", json: input },
  );
}

export function deletePendingIdentityEmployee(employeeId: string) {
  return apiRequest<{ deleted: boolean; employeeId: string; employeeNo: string }>(
    `/api/identity/admin/employees/${encodeURIComponent(employeeId)}`,
    { method: "DELETE" },
  );
}

export function resendIdentityEmployeeActivation(employeeId: string) {
  return apiRequest<{ activationDelivery: DeliveryView }>(
    `/api/identity/admin/employees/${encodeURIComponent(employeeId)}/activation/resend`,
    { method: "POST", json: {} },
  );
}

export function setIdentityAdminCapability(employeeId: string, enabled: boolean) {
  return apiRequest<{ employee: unknown; sessionsRevoked: boolean }>(
    `/api/identity/admin/employees/${encodeURIComponent(employeeId)}/identity-admin`,
    { method: "PUT", json: { enabled } },
  );
}

export function forceIdentityEmployeeEmailRecovery(employeeId: string, email: string) {
  return apiRequest<{ recovered: boolean; verificationDelivery: DeliveryView; sessionsRevoked: boolean }>(
    `/api/identity/admin/employees/${encodeURIComponent(employeeId)}/email-recovery`,
    { method: "POST", json: { email } },
  );
}

export function resendIdentityEmployeeEmailVerification(employeeId: string) {
  return apiRequest<{ verificationDelivery: DeliveryView }>(
    `/api/identity/admin/employees/${encodeURIComponent(employeeId)}/email-verification/resend`,
    { method: "POST", json: {} },
  );
}

export function setEmployeeApplicationAccess(employeeId: string, applicationId: string, enabled: boolean) {
  return apiRequest<{ access: unknown }>(
    `/api/identity/admin/employees/${encodeURIComponent(employeeId)}/applications/${encodeURIComponent(applicationId)}`,
    { method: "PUT", json: { enabled } },
  );
}

export function loadModuleAccess(): Promise<ModuleAccessView> {
  return apiRequest<ModuleAccessView>("/api/identity/admin/module-access", { method: "GET" });
}

export function setModuleAccess(employeeId: string, moduleCode: CyWebModuleCode, enabled: boolean) {
  return apiRequest<{ access: unknown }>(
    `/api/identity/admin/module-access/${encodeURIComponent(employeeId)}/${encodeURIComponent(moduleCode)}`,
    { method: "PUT", json: { enabled } },
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
