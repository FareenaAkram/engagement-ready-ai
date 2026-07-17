import { NextResponse } from 'next/server';
import { appEnv, hasAuthConfig } from '@/lib/env';
import { SESSION_COOKIE, expectedSessionToken, timingSafeEqualStrings } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  if (!hasAuthConfig()) {
    return NextResponse.json({ error: true, message: 'No passcode is configured for this deployment.' }, { status: 400 });
  }

  const body = (await request.json().catch(() => ({}))) as { passcode?: string };
  const passcode = body.passcode ?? '';

  if (!timingSafeEqualStrings(passcode, appEnv.appPasscode!)) {
    return NextResponse.json({ error: true, message: 'Incorrect passcode.' }, { status: 401 });
  }

  const token = await expectedSessionToken(appEnv.appPasscode!);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}
