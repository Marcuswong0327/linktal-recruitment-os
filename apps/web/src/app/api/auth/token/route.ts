import { auth } from '@/auth';

// Same-origin route the client fetches for its bearer token (see
// getAuthToken() in lib/auth/client.ts) — keeps the access token out of the
// broader session payload and off any client-readable cookie.
export const dynamic = 'force-dynamic';

export async function GET() {
  const session = await auth();
  return Response.json({ token: session?.accessToken ?? null });
}
