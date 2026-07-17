/**
 * Task Email Service
 *
 * Sends one email per task assignee after the consultant makes their HITL decision.
 * Each email lists all tasks assigned to that person with full instructions,
 * priority, due date, and a direct link to mark them done.
 *
 * Uses the same nodemailer setup as notification-service.ts.
 * Falls back gracefully when EMAIL_* vars are not set.
 */

import { appEnv, hasEmailConfig } from '@/lib/env';
import type { TaskAssignment } from '@/types/domain';

export interface TaskEmailInput {
  to: string;
  assigneeName: string;
  tasks: TaskAssignment[];
  engagementName: string;
  clientName: string;
  readinessDecision: 'ready' | 'ready-with-conditions' | 'not-ready';
  readinessScore: number;
  appBaseUrl: string;
}

export interface TaskEmailResult {
  to: string;
  sent: boolean;
  error?: string;
}

function priorityColour(p: string) {
  if (p === 'critical') return '#dc2626';
  if (p === 'high') return '#d97706';
  if (p === 'medium') return '#2563eb';
  return '#57606a';
}

function priorityBg(p: string) {
  if (p === 'critical') return '#fef2f2';
  if (p === 'high') return '#fffbeb';
  if (p === 'medium') return '#eff6ff';
  return '#f7f8fa';
}

function decisionLabel(d: string) {
  if (d === 'ready') return 'Ready for Delivery';
  if (d === 'ready-with-conditions') return 'Ready with Conditions';
  return 'Not Ready — Remediation Required';
}

function decisionColour(d: string) {
  if (d === 'ready') return '#16a34a';
  if (d === 'ready-with-conditions') return '#d97706';
  return '#dc2626';
}

function buildTaskHtml(
  tasks: TaskAssignment[],
  engagementName: string,
  clientName: string,
  assigneeName: string,
  readinessDecision: string,
  readinessScore: number,
  appBaseUrl: string,
): string {
  const taskCards = tasks
    .map(
      (t) => `
<table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px;background:#fff;overflow:hidden;">
  <tr>
    <td style="padding:16px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding:0;">
            <p style="margin:0 0 4px;font-size:15px;font-weight:700;color:#1f2328;line-height:1.4">${t.title}</p>
          </td>
          <td style="padding:0;text-align:right;vertical-align:top;white-space:nowrap;padding-left:12px;">
            <span style="display:inline-block;font-size:11px;font-weight:700;color:${priorityColour(t.priority)};background:${priorityBg(t.priority)};padding:3px 10px;border-radius:20px;text-transform:uppercase;letter-spacing:.06em;border:1px solid ${priorityColour(t.priority)}40">${t.priority}</span>
          </td>
        </tr>
      </table>
      <p style="margin:10px 0 0;font-size:13px;color:#57606a;line-height:1.6">${t.instructions}</p>
      <table cellpadding="0" cellspacing="0" style="margin-top:12px;">
        <tr>
          <td style="padding-right:8px;padding-bottom:4px;">
            <span style="font-size:11px;background:#f7f8fa;border:1px solid #e5e7eb;border-radius:4px;padding:3px 9px;color:#1f2328;white-space:nowrap">
              <span style="color:#8c959f">Role:</span> ${t.ownerRole}
            </span>
          </td>
          <td style="padding-right:8px;padding-bottom:4px;">
            <span style="font-size:11px;background:#f7f8fa;border:1px solid #e5e7eb;border-radius:4px;padding:3px 9px;color:#1f2328;white-space:nowrap">
              <span style="color:#8c959f">Due:</span> ${t.dueLabel}
            </span>
          </td>
          <td style="padding-bottom:4px;">
            <span style="font-size:11px;background:#fef9c3;border:1px solid #fde047;border-radius:4px;padding:3px 9px;color:#713f12;white-space:nowrap;font-weight:600">
              Pending
            </span>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`,
    )
    .join('');

  const markDoneUrl = `${appBaseUrl}/maintenance-tasks`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Action Required — ${engagementName}</title>
</head>
<body style="margin:0;padding:32px 16px;font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif;font-size:14px;line-height:1.6;color:#1f2328;background:#f0f2f5;">

<table width="100%" cellpadding="0" cellspacing="0">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

  <!-- Header -->
  <tr>
    <td style="background:linear-gradient(135deg,#0f1a2e 0%,#1a2236 100%);border-radius:12px 12px 0 0;padding:28px 32px 24px;">
      <p style="margin:0 0 4px;font-size:10px;font-weight:700;letter-spacing:.18em;text-transform:uppercase;color:#93c5fd">IBM Consulting · Engagement Ready AI</p>
      <h1 style="margin:0 0 6px;font-size:22px;font-weight:700;color:#ffffff;line-height:1.3">
        ${tasks.length} action${tasks.length === 1 ? '' : 's'} assigned to you
      </h1>
      <p style="margin:0;font-size:13px;color:#93c5fd">${engagementName} · ${clientName}</p>
    </td>
  </tr>

  <!-- Readiness badge -->
  <tr>
    <td style="background:#1e2d4a;padding:12px 32px;">
      <table cellpadding="0" cellspacing="0">
        <tr>
          <td style="padding-right:16px;">
            <span style="font-size:11px;font-weight:600;color:#93c5fd;text-transform:uppercase;letter-spacing:.08em">Readiness Status</span><br>
            <span style="font-size:15px;font-weight:700;color:${decisionColour(readinessDecision)}">${decisionLabel(readinessDecision)}</span>
          </td>
          <td>
            <span style="font-size:11px;font-weight:600;color:#93c5fd;text-transform:uppercase;letter-spacing:.08em">Score</span><br>
            <span style="font-size:28px;font-weight:800;color:${decisionColour(readinessDecision)};line-height:1">${readinessScore}%</span>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- Body -->
  <tr>
    <td style="background:#ffffff;border:1px solid #e5e7eb;border-top:none;padding:28px 32px;">

      <p style="margin:0 0 20px;font-size:14px;color:#1f2328;">
        Hi <strong>${assigneeName}</strong>,
      </p>
      <p style="margin:0 0 20px;font-size:14px;color:#57606a;line-height:1.6;">
        The AI readiness assessment for <strong style="color:#1f2328">${engagementName}</strong> has been completed and reviewed. The lead consultant has accepted the action plan and assigned you the following ${tasks.length === 1 ? 'task' : `${tasks.length} tasks`} to complete before the engagement can proceed to delivery.
      </p>

      <!-- Divider -->
      <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 20px;"/>

      <p style="margin:0 0 12px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#8c959f">Your assigned actions</p>

      ${taskCards}

      <!-- CTA -->
      <table width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 8px;">
        <tr>
          <td align="center">
            <a href="${markDoneUrl}" style="display:inline-block;background:#0f62fe;color:#ffffff;font-size:14px;font-weight:600;padding:14px 36px;border-radius:8px;text-decoration:none;letter-spacing:.02em;">
              View &amp; Mark Tasks Complete →
            </a>
          </td>
        </tr>
      </table>

      <p style="margin:16px 0 0;font-size:12px;color:#8c959f;text-align:center;line-height:1.6;">
        When you mark your tasks done you can add a completion note — these notes are<br>
        used by watsonx to <strong>re-evaluate readiness</strong> with your updated evidence.
      </p>

    </td>
  </tr>

  <!-- Footer -->
  <tr>
    <td style="background:#f7f8fa;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 12px 12px;padding:16px 32px;">
      <table width="100%" cellpadding="0" cellspacing="0">
        <tr>
          <td>
            <p style="margin:0;font-size:11px;color:#8c959f;">
              Sent by <strong>Engagement Ready AI</strong> · IBM Consulting · IBM watsonx Challenge
            </p>
          </td>
          <td align="right">
            <p style="margin:0;font-size:11px;color:#8c959f;">
              Questions? Reply to this email.
            </p>
          </td>
        </tr>
      </table>
    </td>
  </tr>

</table>
</td></tr>
</table>

</body>
</html>`;
}

function buildTaskText(
  tasks: TaskAssignment[],
  engagementName: string,
  clientName: string,
  assigneeName: string,
  readinessDecision: string,
  readinessScore: number,
  appBaseUrl: string,
): string {
  const taskLines = tasks
    .map(
      (t, i) =>
        `Action ${i + 1}: ${t.title}\n` +
        `Role: ${t.ownerRole} | Priority: ${t.priority} | Due: ${t.dueLabel}\n` +
        `Instructions: ${t.instructions}\n` +
        `Status: Pending`,
    )
    .join('\n\n');

  return [
    `ACTION REQUIRED — ${engagementName}`,
    `IBM Consulting · Engagement Ready AI`,
    ``,
    `Hi ${assigneeName},`,
    ``,
    `The AI readiness assessment for ${engagementName} (${clientName}) is complete.`,
    `Readiness: ${decisionLabel(readinessDecision)} — ${readinessScore}%`,
    ``,
    `You have ${tasks.length} action${tasks.length === 1 ? '' : 's'} assigned:`,
    ``,
    taskLines,
    ``,
    `To view and mark tasks complete (with completion notes):`,
    `${appBaseUrl}/maintenance-tasks`,
    ``,
    `Completion notes you add will be used by watsonx to re-evaluate readiness with your updated evidence.`,
    ``,
    `─────────────────────────────────────`,
    `Sent by Engagement Ready AI · IBM watsonx Challenge`,
  ].join('\n');
}

export async function sendTaskEmail(input: TaskEmailInput): Promise<TaskEmailResult> {
  // Recipient and task titles are client/business content — log only counts,
  // not the content itself.
  console.log(`[task-email] → ${input.tasks.length} task(s) for 1 recipient`);

  if (!hasEmailConfig()) {
    console.log('[task-email] Email not configured — add EMAIL_SMTP_HOST + EMAIL_USER + EMAIL_PASS to .env.local');
    return { to: input.to, sent: false, error: 'Email not configured' };
  }

  const nodemailer = await import('nodemailer').catch(() => null);
  if (!nodemailer) {
    return { to: input.to, sent: false, error: 'nodemailer not installed — run: npm install nodemailer @types/nodemailer' };
  }

  const subject = `[Action Required] ${input.tasks.length} task${input.tasks.length === 1 ? '' : 's'} assigned — ${input.engagementName}`;

  try {
    const transporter = nodemailer.default.createTransport({
      host: appEnv.emailSmtpHost,
      port: appEnv.emailSmtpPort,
      secure: appEnv.emailSmtpPort === 465,
      auth: { user: appEnv.emailUser, pass: appEnv.emailPass },
    });

    await transporter.sendMail({
      from: appEnv.emailFrom ?? `Engagement Ready AI <${appEnv.emailUser}>`,
      to: input.to,
      subject,
      html: buildTaskHtml(
        input.tasks,
        input.engagementName,
        input.clientName,
        input.assigneeName,
        input.readinessDecision,
        input.readinessScore,
        input.appBaseUrl,
      ),
      text: buildTaskText(
        input.tasks,
        input.engagementName,
        input.clientName,
        input.assigneeName,
        input.readinessDecision,
        input.readinessScore,
        input.appBaseUrl,
      ),
    });

    console.log(`[task-email] Sent to ${input.to}`);
    return { to: input.to, sent: true };
  } catch (err) {
    const error = err instanceof Error ? err.message : 'SMTP error';
    console.error(`[task-email] Failed to send to ${input.to}:`, error);
    return { to: input.to, sent: false, error };
  }
}
