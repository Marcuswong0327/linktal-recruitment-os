import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { SignInButton } from '@/features/auth/sign-in-button';
import { SignInError } from '@/features/auth/sign-in-error';
import { EmailPasswordForm } from '@/features/auth/email-password-form';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  // Match (app)/layout.tsx's gate exactly, or a deactivated user (Azure
  // session present, but no API accessToken) hits a redirect loop: this page
  // would send them to '/dashboard', which immediately bounces them back here.
  if (session?.accessToken) redirect('/dashboard');

  const { error } = await searchParams;

  return (
    <main className="flex min-h-screen items-center justify-center bg-muted/50 px-6">
      <div className="flex w-full max-w-sm flex-col items-center gap-8">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground">
            L
          </span>
          <div className="flex flex-col gap-1">
            <h1 className="text-xl font-semibold tracking-tight">Linktal Recruitment OS</h1>
            <p className="text-sm text-muted-foreground">Sign in with your work account to continue.</p>
          </div>
        </div>

        {error && <SignInError error={error} />}

        <Card className="w-full">
          <CardContent className="flex flex-col gap-4">
            <SignInButton />
            <div className="flex items-center gap-3">
              <Separator className="flex-1" />
              <span className="text-xs text-muted-foreground">or</span>
              <Separator className="flex-1" />
            </div>
            <EmailPasswordForm />
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Microsoft sign-in is restricted to your organization&rsquo;s account.
        </p>
      </div>
    </main>
  );
}
