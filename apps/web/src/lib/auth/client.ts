'use client';

import { signOut as nextAuthSignOut } from 'next-auth/react';

/**
 * Signs the current user out and returns them to /sign-in.
 *
 * The API access token lives only in the httpOnly session cookie and is
 * attached server-side by the BFF proxy (see src/proxy.ts), so there's no
 * client-side token cache to clear here — dropping the session cookie is
 * enough to stop this browser calling the API.
 */
export async function signOut() {
  return nextAuthSignOut({ callbackUrl: '/sign-in' });
}
