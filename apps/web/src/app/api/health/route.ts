import { NextResponse } from 'next/server';

// Public healthcheck target for Railway (see railway.web.json). Deliberately
// excluded from proxy.ts's auth gating — the prober has no session cookie,
// so a gated path (including `/`) would 307 to /sign-in and read as
// "service unavailable".
export function GET() {
  return NextResponse.json({ status: 'ok', service: 'linktal-web' });
}
