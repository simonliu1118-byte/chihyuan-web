import { apiRequest } from "../api/client";

export type WorkspaceRole = "SUPER_ADMIN" | "ADMIN" | "USER";

export interface AuthUser {
  employeeId: string;
  employeeNo: string;
  displayName: string;
  workspaceId: string;
  workspaceRole: WorkspaceRole;
  isIdentityAdmin: boolean;
  emailVerified: boolean;
  isWorkspaceSuperAdmin: boolean;
}

export interface AuthSession { user: AuthUser; expiresAt?: string; }
export interface FirstLoginRequired {
  passwordChangeRequired: true;
  firstLogin: { token: string; employeeNo: string; displayName: string; expiresAt: string };
}
export type LoginResult = AuthSession | FirstLoginRequired;

export function loadCurrentSession(): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/auth/me", { method: "GET" });
}
export function loginWithPassword(employeeNo: string, password: string): Promise<LoginResult> {
  return apiRequest<LoginResult>("/api/auth/login", { method: "POST", json: { employeeNo, password } });
}
export function completeFirstLogin(token: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/auth/first-login/complete", { method: "POST", json: { token, password } });
}
export function isFirstLoginRequired(value: LoginResult): value is FirstLoginRequired {
  return "passwordChangeRequired" in value && value.passwordChangeRequired === true;
}
export async function logoutCurrentSession(): Promise<void> {
  await apiRequest<{ loggedOut: boolean }>("/api/auth/logout", { method: "POST" });
}
