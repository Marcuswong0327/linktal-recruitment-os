'use client';

import { createAuthClient } from '@neondatabase/auth/next';

export const authClient = createAuthClient();

/**
 * Returns the current Neon Auth JWT for calling the backend API as a Bearer
 * token, or null when signed out. Hits the Neon Auth proxy's token endpoint
 * directly (same-origin, cookie-authenticated) rather than authClient.token(),
 * so it works regardless of client hydration state. The API verifies the JWT
 * against Neon's JWKS.
 */
export async function getAuthToken(): Promise<string | null> {
  try {
    const res = await fetch('/api/auth/token', { credentials: 'include' });
    if (!res.ok) return null;
    const data = (await res.json()) as { token?: string };
    return data.token ?? null;
  } catch {
    return null;
  }
}
