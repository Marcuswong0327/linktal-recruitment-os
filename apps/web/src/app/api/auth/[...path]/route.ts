import { getAuth } from '@/lib/auth/server';

// Runtime-only proxy to Neon Auth. Marked dynamic so Next never tries to
// statically optimize it, and the handler is built per-request so the auth
// config is resolved at runtime (see getAuth) rather than at build time.
export const dynamic = 'force-dynamic';

type RouteContext = { params: Promise<{ path: string[] }> };

export function GET(request: Request, ctx: RouteContext) {
  return getAuth().handler().GET(request, ctx);
}

export function POST(request: Request, ctx: RouteContext) {
  return getAuth().handler().POST(request, ctx);
}
