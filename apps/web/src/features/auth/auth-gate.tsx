'use client';

import { useState } from 'react';
import { authClient, getAuthToken, signOut } from '@/lib/auth/client';

// Enable the matching providers in your Neon Auth console. Add/remove freely.
const PROVIDERS = [
  { id: 'google', label: 'Continue with Google' },
  { id: 'github', label: 'Continue with GitHub' },
] as const;

const btn =
  'rounded-md border border-black/15 px-4 py-2 text-sm font-medium hover:bg-black/5 disabled:opacity-50 dark:border-white/20 dark:hover:bg-white/10';

/**
 * Gates its children behind a Neon Auth session. Shows sign-in when logged out,
 * and a user bar (sign out + copy API token for testing) when logged in.
 */
export function AuthGate({ children }: { children: React.ReactNode }) {
  const { data, isPending } = authClient.useSession();

  if (isPending) {
    return <p className="text-sm opacity-70">Loading…</p>;
  }

  if (!data) {
    return <SignIn />;
  }

  return (
    <div className="flex flex-col gap-6">
      <UserBar email={data.user.email} name={data.user.name} />
      {children}
    </div>
  );
}

function SignIn() {
  const [pending, setPending] = useState<string | null>(null);

  const signIn = async (provider: string) => {
    setPending(provider);
    await authClient.signIn.social({
      provider,
      callbackURL: window.location.href,
    });
  };

  return (
    <div className="flex flex-col items-start gap-3 rounded-xl border border-black/10 p-6 dark:border-white/15">
      <h2 className="text-lg font-semibold">Sign in</h2>
      <p className="text-sm opacity-70">Sign in to access the recruitment OS.</p>
      <div className="flex flex-wrap gap-3 pt-1">
        {PROVIDERS.map((p) => (
          <button
            key={p.id}
            className={btn}
            disabled={pending !== null}
            onClick={() => signIn(p.id)}
          >
            {pending === p.id ? 'Redirecting…' : p.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function UserBar({ email, name }: { email: string; name: string }) {
  const [copied, setCopied] = useState(false);

  const copyToken = async () => {
    const token = await getAuthToken();
    if (token) {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  return (
    <div className="flex items-center justify-between rounded-lg border border-black/10 px-4 py-2 text-sm dark:border-white/15">
      <span className="opacity-80">
        {name} · {email}
      </span>
      <div className="flex items-center gap-2">
        <button className={btn} onClick={copyToken}>
          {copied ? 'Copied!' : 'Copy API token'}
        </button>
        <button className={btn} onClick={() => signOut()}>
          Sign out
        </button>
      </div>
    </div>
  );
}
