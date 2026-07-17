/**
 * Notification service — direct Slack + Email delivery.
 *
 * These are lightweight fallback channels for when ICA is not configured,
 * or when you also want direct alerts in addition to ICA delivery.
 *
 * ─── Configure in .env.local ─────────────────────────────────────────────────
 * Slack (webhook — one-way summary posts):
 *   SLACK_WEBHOOK_URL=https://hooks.slack.com/services/T.../B.../...
 *
 * Slack (bot — interactive per-task "Mark Done" cards, see sendTaskAssignmentSlackCard):
 *   SLACK_BOT_TOKEN=xoxb-...
 *   SLACK_SIGNING_SECRET=...
 *
 * Email (SMTP — Gmail App Password, SendGrid SMTP, AWS SES, etc.):
 *   EMAIL_SMTP_HOST=smtp.gmail.com
 *   EMAIL_SMTP_PORT=587
 *   EMAIL_USER=you@example.com
 *   EMAIL_PASS=your-app-password
 *   EMAIL_FROM=Engagement Ready AI <you@example.com>
 *   EMAIL_DEFAULT_RECIPIENT=team@example.com
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { appEnv, hasSlackConfig, hasSlackBotConfig } from '@/lib/env';

// ─── Shared payload ───────────────────────────────────────────────────────────

export interface NotificationPayload {
  engagementName: string;
  clientName: string;
  leadConsultant: string;
  readinessDecision: 'ready' | 'ready-with-conditions' | 'not-ready';
  readinessScore: number;
  confidenceScore: number;
  executiveSummary: string;
  criticalIssuesCount: number;
  actionsCount: number;
  assetsCount: number;
  hitlDecision?: 'accepted' | 'overridden';
  hitlJustification?: string | null;
  recipientEmail?: string;
}

export interface NotificationResult {
  channel: 'ica' | 'slack' | 'email';
  sent: boolean;
  live: boolean;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function readinessLabel(d: string) {
  if (d === 'ready') return 'Ready for Delivery';
  if (d === 'ready-with-conditions') return 'Ready with Conditions';
  return 'Not Ready';
}

function decisionIcon(d: string) {
  if (d === 'ready') return '✅';
  if (d === 'ready-with-conditions') return '⚠️';
  return '❌';
}

// ─── Slack ────────────────────────────────────────────────────────────────────

export async function sendSlackNotification(payload: NotificationPayload): Promise<NotificationResult> {
  const webhookUrl = appEnv.slackWebhookUrl;

  const hitlBlock = payload.hitlDecision
    ? [{
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Consultant decision:* ${payload.hitlDecision === 'accepted' ? '✓ Accepted AI recommendation' : `↩ Overridden`}${payload.hitlJustification ? `\n_"${payload.hitlJustification}"_` : ''}`,
        },
      }]
    : [];

  const message = {
    text: `Engagement Ready AI — ${payload.engagementName} assessment complete`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${decisionIcon(payload.readinessDecision)} Engagement Ready AI — Assessment Complete`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Engagement*\n${payload.engagementName}` },
          { type: 'mrkdwn', text: `*Client*\n${payload.clientName}` },
          { type: 'mrkdwn', text: `*Lead Consultant*\n${payload.leadConsultant}` },
          {
            type: 'mrkdwn',
            text: `*Readiness*\n${decisionIcon(payload.readinessDecision)} ${readinessLabel(payload.readinessDecision)} · *${payload.readinessScore}%*`,
          },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Executive Summary*\n${payload.executiveSummary}`,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*AI Confidence*\n${payload.confidenceScore}%` },
          { type: 'mrkdwn', text: `*Critical Issues*\n${payload.criticalIssuesCount}` },
          { type: 'mrkdwn', text: `*Actions Created*\n${payload.actionsCount}` },
          { type: 'mrkdwn', text: `*Assets Generated*\n${payload.assetsCount}` },
        ],
      },
      ...hitlBlock,
      { type: 'divider' },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: 'Sent by *Engagement Ready AI* · IBM watsonx · _AI recommendation — human approved_',
          },
        ],
      },
    ],
  };

  console.log(`[slack] ${payload.engagementName} | ${payload.readinessDecision} | ${payload.readinessScore}%`);

  if (!hasSlackConfig() || !webhookUrl) {
    console.log('[slack] SLACK_WEBHOOK_URL not set — add it to .env.local to enable live Slack delivery.');
    return { channel: 'slack', sent: false, live: false };
  }

  try {
    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      console.warn(`[slack] Webhook returned ${res.status}: ${body.slice(0, 200)}`);
      return { channel: 'slack', sent: false, live: true, error: `HTTP ${res.status}` };
    }

    console.log('[slack] Message delivered.');
    return { channel: 'slack', sent: true, live: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Network error';
    console.warn('[slack] Failed:', error);
    return { channel: 'slack', sent: false, live: true, error };
  }
}

// ─── Slack — interactive per-task "Mark Done" card ───────────────────────────
//
// Unlike sendSlackNotification() (a one-way webhook summary), this posts a
// direct message to the individual assignee with a "Mark Done" button. The
// button click hits POST /api/slack/actions, which calls the same
// completeTaskExternally() state transition the app UI uses — so acknowledging
// a task from Slack is equivalent to marking it done in the app.
//
// Requires SLACK_BOT_TOKEN (scopes: chat:write, im:write, users:read.email).

export interface SlackTaskCardInput {
  taskId: string;
  engagementId: string;
  title: string;
  instructions: string;
  priority: string;
  dueLabel: string;
  ownerRole: string;
  assigneeEmail: string;
  assigneeName: string;
  engagementName: string;
  clientName: string;
}

export interface SlackTaskCardResult {
  taskId: string;
  sent: boolean;
  live: boolean;
  error?: string;
}

async function slackApi<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://slack.com/api/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Authorization': `Bearer ${appEnv.slackBotToken}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10_000),
  });
  return res.json() as Promise<T>;
}

export async function sendTaskAssignmentSlackCard(
  task: SlackTaskCardInput,
): Promise<SlackTaskCardResult> {
  if (!hasSlackBotConfig()) {
    return { taskId: task.taskId, sent: false, live: false };
  }
  if (!task.assigneeEmail) {
    return { taskId: task.taskId, sent: false, live: false, error: 'No assignee email to look up Slack user' };
  }

  try {
    // 1. Resolve the assignee's Slack user ID from their email.
    // users.lookupByEmail only accepts query params, not a JSON body.
    const lookupUrl = `https://slack.com/api/users.lookupByEmail?email=${encodeURIComponent(task.assigneeEmail)}`;
    const lookupRes = await fetch(lookupUrl, {
      headers: { 'Authorization': `Bearer ${appEnv.slackBotToken}` },
      signal: AbortSignal.timeout(10_000),
    });
    const resolved = (await lookupRes.json()) as { ok: boolean; user?: { id: string }; error?: string };

    if (!resolved.ok || !resolved.user) {
      return {
        taskId: task.taskId,
        sent: false,
        live: true,
        error: `Slack user not found for ${task.assigneeEmail}: ${resolved.error ?? 'unknown'}`,
      };
    }

    // 2. Open a DM channel with that user
    const im = await slackApi<{ ok: boolean; channel?: { id: string }; error?: string }>(
      'conversations.open',
      { users: resolved.user.id },
    );
    if (!im.ok || !im.channel) {
      return { taskId: task.taskId, sent: false, live: true, error: `conversations.open failed: ${im.error ?? 'unknown'}` };
    }

    // 3. Post the task card with a "Mark Done" button
    const post = await slackApi<{ ok: boolean; error?: string }>('chat.postMessage', {
      channel: im.channel.id,
      text: `Task assigned: ${task.title}`,
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*New task — ${task.engagementName}*\n*${task.title}*\n${task.instructions}`,
          },
        },
        {
          type: 'section',
          fields: [
            { type: 'mrkdwn', text: `*Client*\n${task.clientName}` },
            { type: 'mrkdwn', text: `*Priority*\n${task.priority}` },
            { type: 'mrkdwn', text: `*Due*\n${task.dueLabel}` },
            { type: 'mrkdwn', text: `*Role*\n${task.ownerRole}` },
          ],
        },
        {
          type: 'actions',
          elements: [
            {
              type: 'button',
              text: { type: 'plain_text', text: '✅ Mark Done' },
              style: 'primary',
              action_id: 'mark_task_done',
              value: JSON.stringify({ taskId: task.taskId, engagementId: task.engagementId }),
            },
          ],
        },
      ],
    });

    if (!post.ok) {
      return { taskId: task.taskId, sent: false, live: true, error: `chat.postMessage failed: ${post.error ?? 'unknown'}` };
    }

    return { taskId: task.taskId, sent: true, live: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'Network error';
    return { taskId: task.taskId, sent: false, live: true, error };
  }
}

// ─── Email ────────────────────────────────────────────────────────────────────

export async function sendEmailNotification(
  payload: NotificationPayload,
): Promise<NotificationResult> {
  const smtpHost = appEnv.emailSmtpHost;
  const to = payload.recipientEmail ?? appEnv.emailDefaultRecipient;

  if (!smtpHost || !to) {
    console.log('[email] Not configured. Add EMAIL_SMTP_HOST + EMAIL_USER + EMAIL_PASS + EMAIL_DEFAULT_RECIPIENT to .env.local.');
    return { channel: 'email', sent: false, live: false };
  }

  // Dynamic import — only loads if nodemailer is installed.
  const nodemailer = await import('nodemailer').catch(() => null);
  if (!nodemailer) {
    console.log('[email] nodemailer not installed. Run: npm install nodemailer && npm install --save-dev @types/nodemailer');
    return { channel: 'email', sent: false, live: false, error: 'nodemailer not installed' };
  }

  const hitlLine = payload.hitlDecision
    ? `<p><strong>Consultant decision:</strong> ${payload.hitlDecision === 'accepted' ? '✓ Accepted' : '↩ Overridden'}${payload.hitlJustification ? ` — <em>"${payload.hitlJustification}"</em>` : ''}</p>`
    : '';

  const scoreColour =
    payload.readinessDecision === 'ready' ? '#16a34a'
    : payload.readinessDecision === 'ready-with-conditions' ? '#d97706'
    : '#dc2626';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/></head>
<body style="margin:0;padding:32px 16px;font-family:-apple-system,Segoe UI,sans-serif;font-size:14px;line-height:1.6;color:#1f2328;background:#f7f8fa;">
<div style="max-width:600px;margin:0 auto;background:#fff;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;">
  <div style="background:#1a2236;padding:24px 28px;">
    <p style="margin:0;font-size:10px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:#8ab4ff">IBM watsonx · Engagement Ready AI</p>
    <h1 style="margin:8px 0 4px;font-size:18px;font-weight:700;color:#fff">${payload.engagementName}</h1>
    <p style="margin:0;font-size:13px;color:#8ab4ff">Assessment Complete</p>
  </div>
  <div style="padding:24px 28px;">
    <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
      <tr>
        <td style="padding:6px 0;width:50%;vertical-align:top;">
          <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#57606a">Client</span><br>
          <span style="font-size:14px;color:#1f2328">${payload.clientName}</span>
        </td>
        <td style="padding:6px 0;vertical-align:top;">
          <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#57606a">Lead Consultant</span><br>
          <span style="font-size:14px;color:#1f2328">${payload.leadConsultant}</span>
        </td>
      </tr>
      <tr>
        <td style="padding:6px 0;vertical-align:top;">
          <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#57606a">Readiness Decision</span><br>
          <span style="font-size:16px;font-weight:700;color:${scoreColour}">${readinessLabel(payload.readinessDecision)}</span>
        </td>
        <td style="padding:6px 0;vertical-align:top;">
          <span style="font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#57606a">Readiness Score</span><br>
          <span style="font-size:24px;font-weight:800;color:${scoreColour}">${payload.readinessScore}%</span>
        </td>
      </tr>
    </table>
    <div style="background:#f7f8fa;border:1px solid #e5e7eb;border-radius:6px;padding:14px 16px;margin-bottom:16px;">
      <p style="margin:0 0 6px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.06em;color:#57606a">Executive Summary</p>
      <p style="margin:0;font-size:14px;color:#1f2328">${payload.executiveSummary}</p>
    </div>
    <table style="width:100%;border-collapse:collapse;border-top:1px solid #e5e7eb;padding-top:12px;">
      <tr>
        <td style="padding:10px 0;width:33%;text-align:center;">
          <span style="display:block;font-size:22px;font-weight:800;color:#dc2626">${payload.criticalIssuesCount}</span>
          <span style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#57606a">Critical Issues</span>
        </td>
        <td style="padding:10px 0;width:33%;text-align:center;">
          <span style="display:block;font-size:22px;font-weight:800;color:#1f2328">${payload.actionsCount}</span>
          <span style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#57606a">Actions Created</span>
        </td>
        <td style="padding:10px 0;text-align:center;">
          <span style="display:block;font-size:22px;font-weight:800;color:#1f2328">${payload.assetsCount}</span>
          <span style="font-size:10px;text-transform:uppercase;letter-spacing:.06em;color:#57606a">Assets Generated</span>
        </td>
      </tr>
    </table>
    ${hitlLine}
  </div>
  <div style="padding:12px 28px;border-top:1px solid #e5e7eb;background:#f7f8fa;">
    <p style="margin:0;font-size:11px;color:#8c959f">Sent by Engagement Ready AI · IBM watsonx Challenge · Human-approved AI recommendation</p>
  </div>
</div>
</body></html>`;

  try {
    const transporter = nodemailer.default.createTransport({
      host: smtpHost,
      port: appEnv.emailSmtpPort,
      secure: appEnv.emailSmtpPort === 465,
      auth: { user: appEnv.emailUser, pass: appEnv.emailPass },
    });

    await transporter.sendMail({
      from: appEnv.emailFrom ?? `Engagement Ready AI <${appEnv.emailUser}>`,
      to,
      subject: `Engagement Ready AI — ${payload.engagementName} (${readinessLabel(payload.readinessDecision)} · ${payload.readinessScore}%)`,
      html,
      text: [
        `Engagement Ready AI — Assessment Complete`,
        `Engagement: ${payload.engagementName}`,
        `Client: ${payload.clientName}`,
        `Lead: ${payload.leadConsultant}`,
        `Readiness: ${readinessLabel(payload.readinessDecision)} · ${payload.readinessScore}%`,
        ``,
        payload.executiveSummary,
        ``,
        `Critical issues: ${payload.criticalIssuesCount} · Actions: ${payload.actionsCount} · Assets: ${payload.assetsCount}`,
        payload.hitlDecision ? `Consultant decision: ${payload.hitlDecision}` : '',
      ].filter(Boolean).join('\n'),
    });

    console.log(`[email] Sent to ${to}`);
    return { channel: 'email', sent: true, live: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'SMTP error';
    console.error('[email] Failed:', error);
    return { channel: 'email', sent: false, live: true, error };
  }
}
