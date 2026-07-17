import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { appEnv, hasAuthConfig } from '@/lib/env';
import { SESSION_COOKIE, expectedSessionToken, timingSafeEqualStrings } from '@/lib/auth';

// Routes that must stay reachable without the passcode cookie:
//   /login, /api/login   — the gate itself
//   /api/slack/actions   — Slack calls this directly; verified via its own
//                          HMAC request signature, not our session cookie
//   /api/ica-package/*   — IBM Consulting Advantage pulls this server-to-
//                          server; it has no way to hold our session cookie
const EXEMPT_PREFIXES = ['/login', '/api/login', '/api/slack/actions', '/api/ica-package'];

export async function middleware(req: NextRequest) {
  // No passcode configured — app runs open (local-dev default). Set
  // APP_PASSCODE in .env.local to require a passcode before anything else
  // is reachable.
  if (!hasAuthConfig()) return NextResponse.next();

  const { pathname } = req.nextUrl;
  if (EXEMPT_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const cookie = req.cookies.get(SESSION_COOKIE)?.value;
  const expected = await expectedSessionToken(appEnv.appPasscode!);

  if (cookie && timingSafeEqualStrings(cookie, expected)) {
    return NextResponse.next();
  }

  if (pathname.startsWith('/api/')) {
    return NextResponse.json(
      { error: true, message: 'Unauthorized — passcode required.' },
      { status: 401 },
    );
  }

  const loginUrl = new URL('/login', req.url);
  loginUrl.searchParams.set('next', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
