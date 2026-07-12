import type { Session } from 'next-auth';

/** Same 'resource:action' shape the API's @RequirePermission checks against. */
export function hasPermission(
  session: Session | null | undefined,
  resource: string,
  action: string,
): boolean {
  return (session?.user?.permissions ?? []).includes(`${resource}:${action}`);
}
