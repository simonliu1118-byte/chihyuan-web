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

export function loadCurrentSession(): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/auth/me", { method: "GET" });
}

export function loginWithPassword(employeeNo: string, password: string): Promise<AuthSession> {
  return apiRequest<AuthSession>("/api/auth/login", {
    method: "POST",
    json: { employeeNo, password },
  });
}

export async function logoutCurrentSession(): Promise<void> {
  await apiRequest<{ loggedOut: boolean }>("/api/auth/logout", { method: "POST" });
}
