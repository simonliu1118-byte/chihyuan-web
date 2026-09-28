export type SharedIdentityRole = "EMPLOYEE" | "ADMIN" | "SUPER_ADMIN";

export interface IdentityPrincipal {
  employeeId: string;
  employeeNo: string | null;
  displayName: string;
  role: SharedIdentityRole;
  workspaceId: string | null;
}

export type IdentityResolution =
  | {
      status: "authenticated";
      principal: IdentityPrincipal;
    }
  | {
      status: "unauthenticated";
      reason: "missing" | "invalid";
    }
  | {
      status: "unavailable";
    };

/**
 * Provider-neutral request identity boundary.
 *
 * A concrete provider adapter may use cookies, bearer tokens, service bindings or
 * another approved session mechanism, but those provider details must not leak
 * into CY Web business modules.
 */
export interface IdentityAdapter {
  resolve(request: Request): Promise<IdentityResolution>;
}

export function isSharedAdmin(role: SharedIdentityRole): boolean {
  return role === "ADMIN" || role === "SUPER_ADMIN";
}
