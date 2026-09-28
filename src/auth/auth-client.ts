import { apiRequest } from "../api/client";

export type AuthRole = "EMPLOYEE" | "ADMIN" | "SUPER_ADMIN";

export interface AuthUser {
  employeeId: string;
  employeeNo: string | null;
  displayName: string;
  role: AuthRole;
  workspaceId: string | null;
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
