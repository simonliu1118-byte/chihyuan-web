export type WorkspaceRole = "USER" | "ADMIN" | "SUPER_ADMIN";

export interface IdentityPrincipal {
  workspaceId: string;
  employeeId: string;
  employeeNo: string;
  displayName: string;
  workspaceRole: WorkspaceRole;
  isIdentityAdmin: boolean;
  emailVerified: boolean;
  isWorkspaceSuperAdmin: boolean;
  /** Temporary provider compatibility field; never use for authorization. */
  groupKeys: string[];
  credentialVersion: number;
  employeeRevision: number;
}

export type IdentityResolution =
  | {
      status: "authenticated";
      principal: IdentityPrincipal;
      expiresAt: string;
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
 * CYCloud Identity owns credential, Workspace role, App-entry and session
 * authority. CY Web transports the opaque provider session in an HttpOnly cookie
 * and owns only CY Web-local business-module access.
 */
export interface IdentityAdapter {
  resolve(request: Request): Promise<IdentityResolution>;
}
