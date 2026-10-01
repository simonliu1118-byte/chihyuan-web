export type WorkspaceRole = "SUPER_ADMIN" | "ADMIN" | "USER";

export interface IdentityPrincipal {
  workspaceId: string;
  employeeId: string;
  employeeNo: string;
  displayName: string;
  workspaceRole: WorkspaceRole;
  isIdentityAdmin: boolean;
  emailVerified: boolean;
  isWorkspaceSuperAdmin: boolean;
  /** Legacy descriptive compatibility only; never use for authorization. */
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
 * CYCloud Identity owns credential, Workspace role, Identity Admin capability,
 * Application Access and session authority. CY Web transports the opaque provider
 * session through an HttpOnly cookie and owns only CY Web-local module access.
 */
export interface IdentityAdapter {
  resolve(request: Request): Promise<IdentityResolution>;
}
