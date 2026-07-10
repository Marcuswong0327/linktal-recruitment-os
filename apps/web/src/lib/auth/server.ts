import { createNeonAuth } from '@neondatabase/auth/next/server';

// Lazily instantiate Neon Auth so the required env vars (baseUrl / cookie
// secret) are only read when a request is actually handled — never at module
// import time. This keeps `next build` from evaluating (and throwing on) the
// config while collecting page data for the /api/auth/[...path] route.
let _auth: ReturnType<typeof createNeonAuth> | undefined;

export function getAuth() {
  return (_auth ??= createNeonAuth({
    baseUrl: process.env.NEON_AUTH_BASE_URL!,
    cookies: {
      secret: process.env.NEON_AUTH_COOKIE_SECRET!,
      // OAuth returns via a top-level cross-site navigation; the default
      // 'strict' would drop the session-challenge cookie on the way back
      // (SESSION_CHALLENGE_COOKIE_NOT_FOUND). 'lax' sends it on that redirect.
      sameSite: 'lax',
    },
  }));
}
