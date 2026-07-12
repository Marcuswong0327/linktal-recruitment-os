'use client';

import { useEffect } from 'react';
import { signOut, useSession } from 'next-auth/react';

/**
 * Watches for an API-rejected session (e.g. a deactivated account — Azure
 * OAuth itself succeeds regardless of our own `isActive` check, so a
 * rejected /auth/login or /auth/refresh shows up here as `session.error`,
 * not as "no session"). Mounted app-wide so it catches both a rejected
 * initial sign-in and a mid-session deactivation (session.error can appear
 * any time the client refetches the session, e.g. on window focus).
 *
 * Force-signs-out (clearing the broken session) and carries the reason via
 * a query param rather than session state, since session state disappears
 * the moment sign-out completes.
 */
export function SessionErrorHandler() {
  const { data: session } = useSession();

  useEffect(() => {
    if (!session?.error) return;
    void signOut({ redirectTo: `/sign-in?error=${session.error}`, redirect: true });
  }, [session?.error]);

  return null;
}
