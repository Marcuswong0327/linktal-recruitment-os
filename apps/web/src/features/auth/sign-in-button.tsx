'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { Button } from '@/components/ui/button';

/** Official 4-square Microsoft mark, per Microsoft's "Sign in with Microsoft" branding guidelines. */
function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 21 21" aria-hidden="true">
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

export function SignInButton() {
  const [pending, setPending] = useState(false);

  const onClick = async () => {
    setPending(true);
    await signIn('microsoft-entra-id', { callbackUrl: '/dashboard' });
  };

  return (
    <Button variant="outline" size="lg" className="w-full" disabled={pending} onClick={onClick}>
      <MicrosoftLogo />
      {pending ? 'Redirecting…' : 'Continue with Microsoft'}
    </Button>
  );
}
