import type { DefaultSession } from 'next-auth';

interface ApiSessionUser {
  consultantId: string;
  email: string | null;
  fullName: string;
  roleName: string | null;
  /** Flat 'resource:action' strings — same shape the API's @RequirePermission checks against. */
  permissions: string[];
}

declare module 'next-auth' {
  interface Session {
    /** The API's own short-lived access token — never the refresh token. */
    accessToken?: string;
    /** Epoch ms. */
    accessTokenExpiresAt?: number;
    user: DefaultSession['user'] & {
      consultantId?: string;
      roleName?: string | null;
      permissions?: string[];
    };
  }
}

// next-auth/jwt just re-exports @auth/core/jwt's JWT interface, but
// @auth/core's own callback signatures import JWT directly from
// @auth/core/jwt — so that's the module we actually need to augment for the
// merge to apply to the `jwt`/`session` callback parameter types.
declare module '@auth/core/jwt' {
  interface JWT {
    accessToken?: string;
    accessTokenExpiresAt?: number;
    refreshToken?: string;
    user?: ApiSessionUser;
  }
}
