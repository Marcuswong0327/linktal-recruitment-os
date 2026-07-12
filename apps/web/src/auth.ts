import NextAuth, { CredentialsSignin } from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
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

async function postAuth<T>(path: string, body: unknown): Promise<ApiResult<T>> {
  const res = await fetch(`${API_INTERNAL_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) return { ok: false, code: await readApiError(res) };
  return { ok: true, data: (await res.json()) as T };
}

function exchangeIdTokenForApiSession(idToken: string) {
  return postAuth<ApiSession>('/auth/login', { idToken });
}

function refreshApiAccessToken(refreshToken: string) {
  return postAuth<ApiRefresh>('/auth/refresh', { refreshToken });
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  // Auth.js only auto-trusts the request Host on Vercel (via the VERCEL env
  // var); on Railway (or any other host behind a proxy) it otherwise rejects
  // the real domain and falls back to the container's internal address,
  // throwing UntrustedHost. Railway's proxy sets X-Forwarded-Host correctly,
  // so trusting it here is safe.
  trustHost: true,
  providers: [
    MicrosoftEntraID({
      clientId: process.env.AUTH_MICROSOFT_ENTRA_ID_ID,
      clientSecret: process.env.AUTH_MICROSOFT_ENTRA_ID_SECRET,
      // Restricts sign-in to the org's tenant (vs. the "common" default,
      // which would accept any Microsoft account).
      issuer: process.env.AUTH_MICROSOFT_ENTRA_ID_ISSUER,
    }),
    Credentials({
      id: 'credentials',
      name: 'Email and password',
      // No `credentials` schema — we render our own form and call signIn()
      // directly, so NextAuth's auto-generated form (which would use this)
      // never renders.
      credentials: {},
      async authorize(raw) {
        const { email, password, fullName, mode } = raw as {
          email?: string;
          password?: string;
          fullName?: string;
          mode?: 'register' | 'login';
        };
        if (!email || !password) {
          const err = new CredentialsSignin();
          err.code = 'INVALID_CREDENTIALS';
          throw err;
        }

        // Verified independently against the Consultant table by the API
        // (see RbacService.registerWithPassword/verifyPassword) — this
        // provider never trusts a password itself, only what the API returns.
        const result =
          mode === 'register'
            ? await postAuth<ApiSession>('/auth/register', { email, password, fullName: fullName ?? '' })
            : await postAuth<ApiSession>('/auth/login-password', { email, password });

        if (!result.ok) {
          // Carries the API's specific error code (e.g. 'EMAIL_TAKEN',
          // 'ACCOUNT_INACTIVE') through to signIn()'s return value on the
          // client, instead of collapsing every failure into one generic
          // message.
          const err = new CredentialsSignin();
          err.code = result.code;
          throw err;
        }

        return {
          id: result.data.user.consultantId,
          email: result.data.user.email,
          name: result.data.user.fullName,
          accessToken: result.data.accessToken,
          accessTokenExpiresAt: result.data.accessTokenExpiresAt,
          refreshToken: result.data.refreshToken,
          consultantId: result.data.user.consultantId,
          roleName: result.data.user.roleName,
          permissions: result.data.user.permissions,
        };
      },
    }),
  ],
  session: { strategy: 'jwt' },
  callbacks: {
    async jwt({ token, account, user }) {
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

      // Initial sign-in via the Credentials provider — authorize() already
      // did the register/login-password exchange and attached the API
      // tokens to the returned `user` object.
      if (user && 'accessToken' in user) {
        return {
          ...token,
          accessToken: user.accessToken,
          accessTokenExpiresAt: user.accessTokenExpiresAt,
          refreshToken: user.refreshToken,
          user: {
            consultantId: user.consultantId ?? '',
            email: user.email ?? null,
            fullName: user.name ?? '',
            roleName: user.roleName ?? null,
            permissions: user.permissions ?? [],
          },
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
