import type { IdentityPrincipal } from "./contract";

export interface IdentityLoginCredentials {
  employeeNo: string;
  password: string;
}

export interface IdentityLoginMetadata {
  credentialVersion: number;
  employeeRevision: number;
}

export type IdentityLoginResult =
  | {
      status: "authenticated";
      principal: IdentityPrincipal;
      metadata: IdentityLoginMetadata;
    }
  | { status: "invalid" }
  | { status: "denied" }
  | { status: "rate_limited"; retryAfterSeconds: number }
  | { status: "unavailable" }
  | { status: "invalid_response" };

/**
 * One-shot credential verification boundary.
 *
 * The current temporary provider is CYInvoice Cloud Web Auth. Business modules
 * never depend on that provider directly; a later Shared Identity service only
 * needs to replace this provider plus, if desired, the session transport.
 */
export interface IdentityLoginProvider {
  authenticate(request: Request, credentials: IdentityLoginCredentials): Promise<IdentityLoginResult>;
}
