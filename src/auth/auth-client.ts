import { ApiClientError, apiRequest } from "../api/client";
import { isCyWebModuleCode } from "../../shared/modules";
import type { CurrentModuleAccess } from "../access/module-access-client";

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
  moduleAccess?: CurrentModuleAccess;
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

export async function loadCurrentSession(signal?: AbortSignal): Promise<AuthSession> {
  const session = await apiRequest<AuthSession>("/api/auth/me?include=module-access", { method: "GET", signal });
  const access = session?.moduleAccess;
  if (!session?.user || !["SUPER_ADMIN", "ADMIN", "USER"].includes(session.user.workspaceRole)
    || !session.user.employeeId || !session.user.workspaceId
    || !access || !Array.isArray(access.allowedModules) || !access.allowedModules.every(isCyWebModuleCode)
    || !Array.isArray(access.modules) || typeof access.implicitAll !== "boolean") {
    throw new ApiClientError({ status: 502, code: "INVALID_API_RESPONSE", message: "登入與權限資料回應異常，請稍後再試。" });
  }
  return session;
}

export async function loginWithPassword(employeeNo: string, password: string): Promise<AuthLoginResult> {
  const result = await apiRequest<LoginResponse>("/api/auth/login", {
    method: "POST",
    json: { employeeNo, password },
  });
  if ("user" in result) {
    return { status: "authenticated", session: result };
  }
  return { status: "first_login", firstLogin: result.firstLogin };
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
