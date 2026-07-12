/** Identity extracted from a verified Azure AD id_token. */
export interface TokenClaims {
  /** Azure AD object id (`oid` claim, falling back to `sub`). */
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
