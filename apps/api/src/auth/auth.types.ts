/** Identity extracted from a verified Neon Auth JWT. */
export interface TokenClaims {
  /** Neon Auth user id (JWT `sub`). */
  sub: string;
  email?: string;
  name?: string;
}

/** The authenticated principal attached to each request after the guards run. */
export interface AuthUser {
  consultantId: string;
  neonUserId: string;
  email: string | null;
  fullName: string;
  roleName: string | null;
  /** Flat set of `resource:action` strings for O(1) permission checks. */
  permissions: Set<string>;
}
