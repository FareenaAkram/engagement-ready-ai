/**
 * POST /api/slack/actions
 *
 * Slack Interactivity Request URL — receives button clicks from the task
 * cards posted by sendTaskAssignmentSlackCard() in services/notification-service.ts.
 *
 * Configure in your Slack App: Interactivity & Shortcuts → Request URL →
 *   ${APP_BASE_URL}/api/slack/actions
 * (must be a public HTTPS URL — use a tunnel such as ngrok for local dev).
 *
 * Every request is verified against SLACK_SIGNING_SECRET before anything else
 * runs — this is the only thing standing between the public internet and
 * marking tasks complete, so signature verification is not optional.
 */

import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { appEnv, hasSlackBotConfig } from '@/lib/env';
import { completeTaskExternally } from '@/lib/workflow-state';

const MAX_TIMESTAMP_SKEW_SECONDS = 60 * 5;

interface SlackInteractionPayload {
  type: string;
  user?: { id: string; username?: string; name?: string };
  response_url?: string;
  actions?: Array<{ action_id: string; value?: string }>;
}

function isValidSlackSignature(rawBody: string, timestamp: string | null, signature: string | null): boolean {
  if (!timestamp || !signature || !appEnv.slackSigningSecret) return false;

  const age = Math.abs(Date.now() / 1000 - Number(timestamp));
  if (!Number.isFinite(age) || age > MAX_TIMESTAMP_SKEW_SECONDS) return false;

  const base = `v0:${timestamp}:${rawBody}`;
  const expected = `v0=${crypto.createHmac('sha256', appEnv.slackSigningSecret).update(base).digest('hex')}`;

  const expectedBuf = Buffer.from(expected);
  const actualBuf = Buffer.from(signature);
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

async function notifySlackMessageUpdate(responseUrl: string, text: string): Promise<void> {
  try {
    await fetch(responseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        replace_original: true,
        text,
        blocks: [{ type: 'section', text: { type: 'mrkdwn', text } }],
      }),
    });
  } catch {
    // Non-fatal — the task is already marked done server-side regardless.
  }
}

export async function POST(request: Request) {
  if (!hasSlackBotConfig()) {
    return NextResponse.json({ error: 'Slack bot not configured' }, { status: 404 });
  }

  const rawBody = await request.text();
  const signature = request.headers.get('x-slack-signature');
  const timestamp = request.headers.get('x-slack-request-timestamp');

  if (!isValidSlackSignature(rawBody, timestamp, signature)) {
    return NextResponse.json({ error: 'Invalid Slack signature' }, { status: 401 });
  }

  const payloadRaw = new URLSearchParams(rawBody).get('payload');
  if (!payloadRaw) {
    return NextResponse.json({ error: 'Missing payload' }, { status: 400 });
  }

  let payload: SlackInteractionPayload;
  try {
    payload = JSON.parse(payloadRaw) as SlackInteractionPayload;
  } catch {
    return NextResponse.json({ error: 'Malformed payload' }, { status: 400 });
  }

  const action = payload.actions?.[0];
  if (!action || action.action_id !== 'mark_task_done') {
    return NextResponse.json({ ok: true });
  }

  let taskId: string | undefined;
  try {
    const value = JSON.parse(action.value ?? '{}') as { taskId?: string };
    taskId = value.taskId;
  } catch {
    // fall through — taskId stays undefined
  }

  if (!taskId) {
    return NextResponse.json({ ok: true });
  }

  const who = payload.user?.username ? `Slack: @${payload.user.username}` : 'Slack';
  const result = completeTaskExternally(taskId, who);

  const responseUrl = payload.response_url;
  if (responseUrl) {
    const text = result.found
      ? `✅ Marked done by ${who}${result.allDone ? ' — all tasks now complete, ready for final approval.' : ''}`
      : `⚠️ Could not find that task — it may have already been reassigned or removed.`;
    void notifySlackMessageUpdate(responseUrl, text);
  }

  console.log(`[slack/actions] mark_task_done taskId=${taskId} found=${result.found} allDone=${result.allDone}`);

  // Ack fast — Slack requires a response within 3 seconds.
  return NextResponse.json({ ok: true });
}
