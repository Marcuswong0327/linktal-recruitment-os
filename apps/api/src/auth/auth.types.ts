/**
 * Identity claims. Two different meanings depending on where this shows up:
 * - Output of AzureTokenVerifierService.verify(): `sub` is the Azure AD
 *   object id (`oid` claim) — used only to JIT-provision/link a Consultant
 *   during POST /auth/login.
 * - Payload of our own access token (TokenService sign/verifyAccessToken):
 *   `sub` is always the Consultant's own id, regardless of how they signed
 *   in — AuthGuard resolves every request by this id (RbacService.resolveById).
 */
export interface TokenClaims {
  sub: string;
  email?: string;
  name?: string;
}

/** The authenticated principal attached to each request after the guards run. */
export interface AuthUser {
  consultantId: string;
  azureId: string;
  email: string | null;
  fullName: string;
  roleName: string | null;
  /** Flat set of `resource:action` strings for O(1) permission checks. */
  permissions: Set<string>;
}
