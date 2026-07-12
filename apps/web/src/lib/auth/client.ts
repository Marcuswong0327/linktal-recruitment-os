'use client';

import { signOut as nextAuthSignOut } from 'next-auth/react';

// In-memory (per-tab) token cache so we don't round-trip to the /api/auth/token
// proxy before every API call. Memory-only on purpose: persisting the token
// (localStorage etc.) would widen XSS exposure, while a module variable adds
// nothing an attacker couldn't already get via the cookie-backed endpoint.
let cachedToken: string | null = null;
let cachedTokenExpiresAt = 0; // epoch ms; 0 = unknown, never reuse
let inFlight: Promise<string | null> | null = null;

/** Refresh this long before `exp` so we never send a token about to lapse. */
const EXPIRY_MARGIN_MS = 60_000;

/** Reads `exp` from the JWT payload without verifying (the API verifies). */
function tokenExpiryMs(token: string): number {
  try {
    const payload = JSON.parse(
      atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')),
    ) as { exp?: number };
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

export function clearAuthTokenCache() {
  cachedToken = null;
  cachedTokenExpiresAt = 0;
  inFlight = null;
}

/** Signs out and drops the cached token so this tab stops calling the API. */
export async function signOut() {
  clearAuthTokenCache();
  return nextAuthSignOut({ callbackUrl: '/sign-in' });
}

/**
 * Returns the current API access token (minted by apps/api, carried inside
 * the NextAuth session) for calling the backend as a Bearer token, or null
 * when signed out. Hits the same-origin /api/auth/token route (cookie-
 * authenticated) rather than reading the client session object directly, so
 * it works regardless of client hydration state. The API verifies the token
 * itself (see apps/api's TokenService).
 *
 * Cached in memory until shortly before expiry; concurrent callers share one
 * fetch. Failures aren't cached, so a signed-out tab retries on the next call.
 */
export async function getAuthToken(): Promise<string | null> {
  if (cachedToken && Date.now() < cachedTokenExpiresAt - EXPIRY_MARGIN_MS) {
    return cachedToken;
  }

  inFlight ??= (async () => {
    try {
      const res = await fetch('/api/auth/token', { credentials: 'include' });
      if (!res.ok) return null;
      const data = (await res.json()) as { token?: string };
      const token = data.token ?? null;
      cachedToken = token;
      cachedTokenExpiresAt = token ? tokenExpiryMs(token) : 0;
      return token;
    } catch {
      return null;
    } finally {
      inFlight = null;
    }
  })();

  return inFlight;
}
