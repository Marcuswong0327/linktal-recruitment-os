import { redirect } from 'next/navigation';
import { TriangleAlert } from 'lucide-react';
import { auth } from '@/auth';
import { SignInButton } from '@/features/auth/sign-in-button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent } from '@/components/ui/card';

/**
 * Maps the API's error `code` (surfaced via session.error, then carried here
 * as a query param by SessionErrorHandler's forced sign-out — see that file
 * for why it's a query param and not session state) to a user-facing reason.
 */
const ERROR_MESSAGES: Record<string, string> = {
  ACCOUNT_INACTIVE: 'Your account has been deactivated. Contact your administrator for access.',
};
const DEFAULT_ERROR_MESSAGE = 'Something went wrong signing you in. Please contact the admin for further information';

export default async function SignInPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const session = await auth();
  // Match (app)/layout.tsx's gate exactly, or a deactivated user (Azure
  // session present, but no API accessToken) hits a redirect loop: this page
  // would send them to '/', which immediately bounces them back here.
  if (session?.accessToken) redirect('/');

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

        {error && (
          <Alert variant="destructive" className="w-full">
            <TriangleAlert />
            <AlertTitle>Sign-in failed</AlertTitle>
            <AlertDescription>{ERROR_MESSAGES[error] ?? DEFAULT_ERROR_MESSAGE}</AlertDescription>
          </Alert>
        )}

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
