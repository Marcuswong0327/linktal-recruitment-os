import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { SignInButton } from '@/features/auth/sign-in-button';
import { Card, CardContent } from '@/components/ui/card';

export default async function SignInPage() {
  const session = await auth();
  if (session) redirect('/');

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

        <Card className="w-full">
          <CardContent>
            <SignInButton />
          </CardContent>
        </Card>

        <p className="text-center text-xs text-muted-foreground">
          Access is restricted to your organization&rsquo;s Microsoft account.
        </p>
      </div>
    </main>
  );
}
