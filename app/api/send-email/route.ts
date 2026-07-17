/**
 * POST /api/send-email
 *
 * Thin wrapper kept for backward compatibility.
 * Delegates to notification-service.sendEmailNotification.
 *
 * Prefer POST /api/notify which fires ICA + Slack + Email in parallel.
 */

import { NextResponse } from 'next/server';
import { sendEmailNotification } from '@/services/notification-service';
import type { NotificationPayload } from '@/services/notification-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const { payload } = (await request.json()) as { payload: NotificationPayload };
    const result = await sendEmailNotification(payload);
    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ sent: false, live: false, error: message }, { status: 500 });
  }
}
