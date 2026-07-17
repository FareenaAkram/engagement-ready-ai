/**
 * POST /api/notify
 *
 * Single endpoint that fires all three delivery channels in parallel:
 *   1. IBM Consulting Advantage (ICA) — deliverable + notification + tasks
 *   2. Slack — direct webhook message
 *   3. Email — SMTP delivery
 *
 * Body: { package: ICAEngagementPackage, channels: ('ica' | 'slack' | 'email')[] }
 *
 * Each channel degrades gracefully — if not configured, it logs and returns
 * { sent: false, live: false } without blocking the others.
 */

import { NextResponse } from 'next/server';
import { deliverToICA, type ICAEngagementPackage } from '@/services/ica-service';
import { sendSlackNotification, sendEmailNotification, type NotificationResult } from '@/services/notification-service';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      package: ICAEngagementPackage;
      channels: Array<'ica' | 'slack' | 'email'>;
      recipientEmail?: string;
    };

    const { package: pkg, channels = ['ica', 'slack', 'email'], recipientEmail } = body;

    if (!pkg?.engagementId || !pkg?.engagementName) {
      return NextResponse.json({ error: 'package.engagementId and package.engagementName are required' }, { status: 400 });
    }

    // Build the shared notification payload for Slack + Email
    const notifPayload = {
      engagementName: pkg.engagementName,
      clientName: pkg.clientName,
      leadConsultant: pkg.leadConsultant,
      readinessDecision: pkg.readinessDecision,
      readinessScore: pkg.readinessScore,
      confidenceScore: pkg.confidenceScore,
      executiveSummary: pkg.executiveSummary,
      criticalIssuesCount: pkg.criticalIssues.length,
      actionsCount: 0,           // caller can pass this via pkg if needed
      assetsCount: pkg.assets.length,
      hitlDecision: pkg.hitlRecord?.consultantDecision,
      hitlJustification: pkg.hitlRecord?.justification,
      recipientEmail: recipientEmail ?? pkg.notifyEmails?.[0],
    };

    // Fire all requested channels in parallel
    const tasks: Promise<NotificationResult>[] = [];

    if (channels.includes('ica')) {
      tasks.push(
        deliverToICA(pkg).then((r) => ({
          channel: 'ica' as const,
          sent: r.accepted,
          live: r.live,
          error: r.error,
        })),
      );
    }

    if (channels.includes('slack')) {
      tasks.push(sendSlackNotification(notifPayload));
    }

    if (channels.includes('email')) {
      tasks.push(sendEmailNotification(notifPayload));
    }

    const settled = await Promise.allSettled(tasks);

    const results: NotificationResult[] = settled.map((r, i) => {
      if (r.status === 'fulfilled') return r.value;
      // Map index back to channel name
      const ch = (['ica', 'slack', 'email'] as const)[i] ?? 'slack';
      return { channel: ch, sent: false, live: false, error: String(r.reason) };
    });

    const anySent = results.some((r) => r.sent);

    console.log(`[notify] Results: ${results.map((r) => `${r.channel}:${r.sent ? 'sent' : r.live ? 'failed' : 'mock'}`).join(' | ')}`);

    return NextResponse.json({ ok: true, anySent, results });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[notify] Unhandled error:', message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
