import { NextResponse } from 'next/server';
import { auth } from '@/auth';

// Next 16 renamed `middleware.ts` to `proxy.ts`. This single file does two
// jobs, both keyed off the httpOnly NextAuth session cookie:
//
//   1. Backend-for-frontend proxy — same-origin /api/backend/* requests are
//      rewritten to NestJS with the API access token injected as a Bearer
//      header. The browser only ever sends its cookie, so the token never
//      reaches client JS and there's no /api/auth/token round-trip.
//   2. Page gating — unauthenticated requests to app routes are bounced to
//      /sign-in before any protected layout renders.
//
// Running through the NextAuth `auth` wrapper also means the jwt callback runs
// here, so a near-expiry access token is refreshed and the rotated session
// cookie is persisted (middleware is the one place NextAuth reliably does so).
//
// CSRF note: /api/backend mutations are now cookie-authenticated. The NextAuth
// session cookie is SameSite=Lax, so cross-site POSTs don't carry it — CSRF
// stays mitigated without a separate token.

// Server-to-server URL for NestJS (see auth.ts) — not NEXT_PUBLIC_, this runs
// on the server only.
const API_INTERNAL_URL =
  process.env.API_INTERNAL_URL ?? process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001/api';

// Same-origin prefix the web client calls (see customFetch's BASE_URL); we
// strip it and forward the remainder to NestJS.
const BACKEND_PREFIX = '/api/backend';

function unauthorizedJson(path: string): NextResponse {
  // Mirror the API's ErrorResponse shape so customFetch's ApiError parsing
  // behaves the same as a real backend 401.
  return NextResponse.json(
    {
      statusCode: 401,
      code: 'UNAUTHORIZED',
      message: 'Not authenticated',
      details: null,
      path,
      timestamp: new Date().toISOString(),
    },
    { status: 401 },
  );
}

export default auth((req) => {
  const { pathname, search } = req.nextUrl;
  const token = req.auth?.accessToken;

  // 1. BFF proxy.
  if (pathname.startsWith(BACKEND_PREFIX)) {
    if (!token) return unauthorizedJson(pathname);

    const rest = pathname.slice(BACKEND_PREFIX.length); // e.g. '/candidates'
    const headers = new Headers(req.headers);
    headers.set('authorization', `Bearer ${token}`);
    // Don't leak the browser's session cookie to the API; it authenticates on
    // the Bearer token alone.
    headers.delete('cookie');

    return NextResponse.rewrite(new URL(`${API_INTERNAL_URL}${rest}${search}`), {
      request: { headers },
    });
  }

  // 2. Page gating. Azure OAuth succeeding only proves identity, not that our
  // API accepted them (a deactivated consultant has a session but no
  // accessToken), so gate on the token — matching (app)/layout.tsx.
  if (!token) {
    return NextResponse.redirect(new URL('/sign-in', req.nextUrl.origin));
  }

  return NextResponse.next();
});

export const config = {
  matcher: [
    // BFF proxy path.
    '/api/backend/:path*',
    // App pages: everything except sign-in, NextAuth's own routes, the
    // public healthcheck, Next internals, and files with an extension
    // (static assets).
    '/((?!sign-in|api/auth|api/health|_next/static|_next/image|favicon.ico|.*\\.).*)',
  ],
};
