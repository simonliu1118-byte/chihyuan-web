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

export interface AuthSession {
  user: AuthUser;
  expiresAt?: string;
}

export interface FirstLoginRequirement {
  employeeNo?: string;
  displayName?: string;
  expiresAt?: string;
}

type LoginResponse =
  | AuthSession
  | {
      passwordChangeRequired: true;
      firstLogin: {
        employeeNo: string;
        displayName: string;
        expiresAt: string;
      };
    };

export type AuthLoginResult =
  | { status: "authenticated"; session: AuthSession }
  | { status: "first_login"; firstLogin: FirstLoginRequirement };

export function loadCurrentSession(): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/auth/me", { method: "GET" });
}

export async function loginWithPassword(employeeNo: string, password: string): Promise<AuthLoginResult> {
  const result = await apiRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    json: { employeeNo, password },
  });
  if ("passwordChangeRequired" in result && result.passwordChangeRequired === true) {
    return { status: "first_login", firstLogin: result.firstLogin };
  }
  return { status: "authenticated", session: result };
}

export function completeFirstLogin(password: string) {
  return apiRequest<{ emailVerified: true; passwordChanged: true; reloginRequired: true }>(
    "/api/auth/first-login/complete",
    { method: "POST", json: { password } },
  );
}

export async function logoutCurrentSession(): Promise<void> {
  await apiRequest<{ loggedOut: boolean }>("/api/auth/logout", { method: "POST" });
}
