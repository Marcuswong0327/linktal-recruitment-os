import type { DefaultSession } from 'next-auth';

interface ApiSessionUser {
  consultantId: string;
  email: string | null;
  fullName: string;
  roleName: string | null;
  /** Flat 'resource:action' strings — same shape the API's @RequirePermission checks against. */
  permissions: string[];
  /** Industry ids this consultant is scoped to — only enforced when roleName === 'consultant'. */
  industryIds: string[];
  /** Specialization ids this consultant is scoped to — narrows the industry arm; empty means the whole industry. Only enforced for roleName === 'consultant'. */
  specializationIds: string[];
  /** Location ids this consultant is scoped to — each covers that node and every descendant. Only enforced for roleName === 'consultant'. */
  locationIds: string[];
}

declare module 'next-auth' {
  interface Session {
    /** The API's own short-lived access token — never the refresh token. */
    accessToken?: string;
    /** Epoch ms. */
    accessTokenExpiresAt?: number;
    /** API error code from the last login/refresh attempt (e.g. 'ACCOUNT_INACTIVE'). */
    error?: string;
    user: DefaultSession['user'] & {
      consultantId?: string;
      roleName?: string | null;
      permissions?: string[];
      industryIds?: string[];
      specializationIds?: string[];
      locationIds?: string[];
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
    error?: string;
  }
}

// Same story as JWT above: the Credentials provider's `authorize()` return
// type and the `jwt` callback's `user` param both come from @auth/core/types
// directly, not from next-auth's re-export.
declare module '@auth/core/types' {
  interface User {
    accessToken?: string;
    accessTokenExpiresAt?: number;
    refreshToken?: string;
    consultantId?: string;
    roleName?: string | null;
    permissions?: string[];
    industryIds?: string[];
    specializationIds?: string[];
    locationIds?: string[];
  }
}
