import NextAuth from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';

// Server-to-server URL for the login/refresh handshake below — deliberately
// not NEXT_PUBLIC_-prefixed so it never ends up in the client bundle, even
// though it's the same origin as NEXT_PUBLIC_API_URL in this repo's setup.
const API_INTERNAL_URL = process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

interface ApiSessionUser {
  consultantId: string;
  email: string | null;
  fullName: string;
  roleName: string | null;
  permissions: string[];
}

interface ApiSession {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  user: ApiSessionUser;
}

interface ApiRefresh {
  accessToken: string;
  accessTokenExpiresAt: number;
  user: ApiSessionUser;
}

/**
 * Either the parsed response, or the API's error `code` (e.g.
 * 'ACCOUNT_INACTIVE') — falls back to a generic code when the response
 * isn't JSON (network error, API down, etc.) so callers always get *some*
 * reason to surface, not just a silent failure.
 */
type ApiResult<T> = { ok: true; data: T } | { ok: false; code: string };

async function readApiError(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { code?: string } | null;
  return body?.code ?? 'API_ERROR';
}

async function exchangeIdTokenForApiSession(idToken: string): Promise<ApiResult<ApiSession>> {
  const res = await fetch(`${API_INTERNAL_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return { ok: false, code: await readApiError(res) };
  return { ok: true, data: (await res.json()) as ApiSession };
}

async function refreshApiAccessToken(refreshToken: string): Promise<ApiResult<ApiRefresh>> {
  const res = await fetch(`${API_INTERNAL_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return { ok: false, code: await readApiError(res) };
  return { ok: true, data: (await res.json()) as ApiRefresh };
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // Restricts sign-in to the org's tenant (vs. the "common" default,
      // which would accept any Microsoft account).
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account }) {
      // Initial sign-in: account.id_token is Azure's own signed id_token.
      // Exchange it for the API's own access/refresh tokens — the API
      // independently re-verifies this id_token against Microsoft's JWKS
      // before trusting anything in it (see apps/api's AzureTokenVerifierService).
      if (account?.id_token) {
        const result = await exchangeIdTokenForApiSession(account.id_token);
        if (!result.ok) return { ...token, accessToken: undefined, error: result.code };
        return {
          ...token,
          accessToken: result.data.accessToken,
          accessTokenExpiresAt: result.data.accessTokenExpiresAt,
          refreshToken: result.data.refreshToken,
          user: result.data.user,
          error: undefined,
        };
      }

      // Still valid — nothing to do.
      if (token.accessTokenExpiresAt && Date.now() < token.accessTokenExpiresAt - 60_000) {
        return token;
      }

      // Near/past expiry — refresh. Also refreshes token.user (role,
      // permissions), so a role change or deactivation is reflected in the
      // session without needing a full re-login.
      if (!token.refreshToken) return { ...token, accessToken: undefined, error: 'API_ERROR' };
      const refreshed = await refreshApiAccessToken(token.refreshToken);
      if (!refreshed.ok) return { ...token, accessToken: undefined, error: refreshed.code };
      return {
        ...token,
        accessToken: refreshed.data.accessToken,
        accessTokenExpiresAt: refreshed.data.accessTokenExpiresAt,
        user: refreshed.data.user,
        error: undefined,
      };
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.accessTokenExpiresAt = token.accessTokenExpiresAt;
      session.error = token.error;
      if (token.user) {
        session.user = {
          ...session.user,
          name: token.user.fullName,
          email: token.user.email ?? session.user.email,
          consultantId: token.user.consultantId,
          roleName: token.user.roleName,
          permissions: token.user.permissions,
        };
      }
      // Deliberately omit refreshToken — never sent to the client.
      return session;
    },
  },
});
