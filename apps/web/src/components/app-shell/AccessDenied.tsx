import { Lock } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';

/**
 * Inline "you can't view this" state for a page whose viewer lacks the
 * resource's `read` permission. Rendered in place of the page's real content
 * (not a redirect) — same "show a clear reason" principle as the sign-in
 * error banner, rather than silently bouncing the user somewhere else.
 */
export function AccessDenied({ resource }: { resource?: string }) {
  return (
    <Alert variant="destructive">
      <Lock />
      <AlertTitle>You don&rsquo;t have access</AlertTitle>
      <AlertDescription>
        You don&rsquo;t have permission to view {resource ?? 'this page'}. Contact your administrator if
        you think this is a mistake.
      </AlertDescription>
    </Alert>
  );
}
