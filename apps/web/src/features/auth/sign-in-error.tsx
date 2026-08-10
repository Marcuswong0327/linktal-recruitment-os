'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { TriangleAlert } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AUTH_ERROR_MESSAGES, DEFAULT_AUTH_ERROR_MESSAGE } from './auth-error-messages';

/**
 * Renders the sign-in failure banner, then strips `?error=` from the URL —
 * same one-shot-query-param pattern as Companies' `?new=1` (see
 * CompaniesTable). Left in the URL, a plain hard refresh keeps re-showing
 * this alert indefinitely, long after the underlying condition (e.g. a
 * transient API error) is gone — `router.replace` swaps the address bar
 * without losing the alert this render already committed to showing.
 */
export function SignInError({ error }: { error: string }) {
  const router = useRouter();

  useEffect(() => {
    router.replace('/sign-in');
  }, [router]);

  return (
    <Alert variant="destructive" className="w-full">
      <TriangleAlert />
      <AlertTitle>Sign-in failed</AlertTitle>
      <AlertDescription>{AUTH_ERROR_MESSAGES[error] ?? DEFAULT_AUTH_ERROR_MESSAGE}</AlertDescription>
    </Alert>
  );
}
