export interface IdentityPrincipal {
  workspaceId: string;
  employeeId: string;
  employeeNo: string;
  displayName: string;
  isWorkspaceSuperAdmin: boolean;
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
 * CYCloud Identity owns credential and session authority. CY Web only transports
 * the opaque provider session through an HttpOnly cookie and consumes the
 * normalized principal returned by the provider.
 */
export interface IdentityAdapter {
  resolve(request: Request): Promise<IdentityResolution>;
}
