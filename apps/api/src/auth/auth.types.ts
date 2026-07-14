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

/**
 * Payload of our own access token. Extends TokenClaims with the role +
 * permission set resolved at mint time (login/refresh), so AuthGuard can
 * authorize every other request from the token alone — no DB call.
 * Trade-off: a role change or deactivation only takes effect once the
 * current access token expires (<=15 min) or the user refreshes, not
 * mid-token. See RbacService.resolveById's doc for the refresh-time re-check.
 */
export interface AccessTokenClaims extends TokenClaims {
  roleName: string | null;
  permissions: string[];
}

/** The authenticated principal attached to each request after the guards run. */
export interface AuthUser {
  consultantId: string;
  azureId: string;
  email: string | null;
  fullName: string;
  roleName: string | null;
  /** When false the account is deactivated and login is rejected. */
  isActive: boolean;
  /** Flat set of `resource:action` strings for O(1) permission checks. */
  permissions: Set<string>;
}
