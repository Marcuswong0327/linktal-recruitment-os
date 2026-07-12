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

async function exchangeIdTokenForApiSession(idToken: string): Promise<ApiSession | null> {
  const res = await fetch(`${API_INTERNAL_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idToken }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<ApiSession>;
}

async function refreshApiAccessToken(refreshToken: string): Promise<ApiRefresh | null> {
  const res = await fetch(`${API_INTERNAL_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken }),
  });
  if (!res.ok) return null;
  return res.json() as Promise<ApiRefresh>;
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
        const session = await exchangeIdTokenForApiSession(account.id_token);
        if (!session) return { ...token, accessToken: undefined };
        return {
          ...token,
          accessToken: session.accessToken,
          accessTokenExpiresAt: session.accessTokenExpiresAt,
          refreshToken: session.refreshToken,
          user: session.user,
        };
      }

      // Still valid — nothing to do.
      if (token.accessTokenExpiresAt && Date.now() < token.accessTokenExpiresAt - 60_000) {
        return token;
      }

      // Near/past expiry — refresh. Also refreshes token.user (role,
      // permissions), so a role change or deactivation is reflected in the
      // session without needing a full re-login.
      if (!token.refreshToken) return { ...token, accessToken: undefined };
      const refreshed = await refreshApiAccessToken(token.refreshToken);
      if (!refreshed) return { ...token, accessToken: undefined };
      return {
        ...token,
        accessToken: refreshed.accessToken,
        accessTokenExpiresAt: refreshed.accessTokenExpiresAt,
        user: refreshed.user,
      };
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.accessTokenExpiresAt = token.accessTokenExpiresAt;
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
