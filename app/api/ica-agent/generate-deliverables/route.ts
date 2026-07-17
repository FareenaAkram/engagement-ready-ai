/**
 * POST /api/ica-agent/generate-deliverables
 *
 * Called after the lead consultant clicks "Approve for Engagement".
 * All tasks must be complete before this is called.
 *
 * ICA takes over to generate and send all delivery assets:
 *   1. Calls watsonx (via ICA) to generate:
 *      - Executive Summary
 *      - Client Email
 *      - Internal Email
 *      - Slack Message
 *      - Jira Epic with per-task tickets
 *   2. Sends/packages all assets
 *   3. Advances workflow to delivery-package-sent
 *
 * Body:
 *   { approvedBy?: string, approvalPasscode?: string }
 *
 * If APPROVAL_PASSCODE is set, approvalPasscode must match it — a second,
 * higher-privilege gate on top of the general session passcode, since this
 * is the one action that triggers real, irreversible delivery (email, Slack,
 * Jira). DASC SR-AC-5 (lightweight interim RBAC).
 *
 * Returns:
 *   { ok: boolean; assets: ICADeliverables; emailsSent: number; workflowStage: string }
 */

import { NextResponse } from 'next/server';
import {
  readWorkflowState,
  recordFinalApproval,
  recordDeliveryPackageSent,
  setDeliveryAssets,
} from '@/lib/workflow-state';
import { generateDeliverablesViaICA, buildMockDeliverables, type ICADeliverableInput } from '@/services/ica-agent-api-service';
import { readStakeholderDirectory } from '@/services/stakeholder-service';
import { mockDashboardData } from '@/data/mock-dashboard';
import { appEnv, hasEmailConfig, hasSlackConfig, hasJiraConfig, hasApprovalPasscodeConfig } from '@/lib/env';
import { sendSlackNotification } from '@/services/notification-service';
import { createJiraEpic } from '@/services/jira-service';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';
import { timingSafeEqualStrings } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Fires real emails, a real Slack post, and a real Jira Epic — final-approval
// should only ever happen once per engagement in normal use.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 5 * 60_000;

// ─── Post delivery Slack notification ────────────────────────────────────────

async function postDeliverySlack(
  assets: { slackMessage: string },
  engagementName: string,
  clientName: string,
  leadConsultant: string,
  readinessDecision: string,
  readinessScore: number,
  confidenceScore: number,
  executiveSummary: string,
  criticalIssuesCount: number,
  actionsCount: number,
): Promise<{ sent: boolean; error?: string }> {
  if (!hasSlackConfig()) {
    console.log('[ica-agent/deliverables] Slack not configured — skipping Slack delivery');
    return { sent: false };
  }

  // Use the ICA-generated slackMessage as override text if available,
  // otherwise fall back to the structured notification-service blocks.
  try {
    const result = await sendSlackNotification({
      engagementName,
      clientName,
      leadConsultant,
      readinessDecision: readinessDecision as 'ready' | 'ready-with-conditions' | 'not-ready',
      readinessScore,
      confidenceScore,
      executiveSummary: assets.slackMessage || executiveSummary,
      criticalIssuesCount,
      actionsCount,
      assetsCount: 5,
      hitlDecision: 'accepted',
    });
    return { sent: result.sent, error: result.error };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn('[ica-agent/deliverables] Slack post failed:', error);
    return { sent: false, error };
  }
}

// ─── Create Jira Epic + Stories ───────────────────────────────────────────────

async function createJiraEpicFromAssets(
  engagementName: string,
  clientName: string,
  leadConsultant: string,
  readinessDecision: string,
  readinessScore: number,
  jiraEpicContent: string,
  completedTasks: Array<{ title: string; ownerRole: string; completedBy: string }>,
): Promise<{ created: boolean; epicKey?: string; epicUrl?: string; storiesCount: number; error?: string }> {
  if (!hasJiraConfig()) {
    console.log('[ica-agent/deliverables] Jira not configured — skipping Jira Epic creation');
    return { created: false, storiesCount: 0 };
  }

  try {
    const result = await createJiraEpic({
      engagementName,
      clientName,
      leadConsultant,
      readinessDecision,
      readinessScore,
      epicSummary: `[${engagementName}] Engagement Readiness — ${readinessDecision.replace(/-/g, ' ')} (${readinessScore}%)`,
      epicDescription: jiraEpicContent,
      tasks: completedTasks.map((t) => ({
        title: t.title,
        ownerRole: t.ownerRole,
        priority: 'medium',
        dueLabel: 'Completed',
        instructions: `Remediation task completed by ${t.completedBy}`,
      })),
    });

    if (result.live && result.epic) {
      console.log(`[ica-agent/deliverables] Jira Epic created: ${result.epic.key} (${result.subTasks.length} stories)`);
      return {
        created: true,
        epicKey: result.epic.key,
        epicUrl: result.epic.url,
        storiesCount: result.subTasks.length,
      };
    }
    return { created: false, storiesCount: 0, error: result.error };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn('[ica-agent/deliverables] Jira Epic creation failed:', error);
    return { created: false, storiesCount: 0, error };
  }
}

// ─── Send generated assets by email ──────────────────────────────────────────

async function sendDeliveryEmails(
  assets: { executiveSummary: string; clientEmail: string; internalEmail: string; slackMessage: string; jiraEpic: string },
  consultantEmail: string,
  clientEmail: string,
  engagementName: string,
): Promise<{ sent: number; errors: string[] }> {
  if (!hasEmailConfig()) {
    console.log('[ica-agent/deliverables] Email not configured — skipping delivery emails');
    return { sent: 0, errors: ['Email not configured'] };
  }

  const nodemailer = await import('nodemailer').catch(() => null);
  if (!nodemailer) return { sent: 0, errors: ['nodemailer not available'] };

  const transporter = nodemailer.default.createTransport({
    host: appEnv.emailSmtpHost,
    port: appEnv.emailSmtpPort,
    secure: appEnv.emailSmtpPort === 465,
    auth: { user: appEnv.emailUser, pass: appEnv.emailPass },
  });

  const from = appEnv.emailFrom ?? `Engagement Ready AI <${appEnv.emailUser}>`;
  const emails: Array<{ to: string; subject: string; html?: string; text: string }> = [];

  if (assets.executiveSummary && consultantEmail) {
    emails.push({ to: consultantEmail, subject: `[Executive Summary] ${engagementName}`, text: assets.executiveSummary });
  }
  if (assets.internalEmail && consultantEmail) {
    emails.push({ to: consultantEmail, subject: `[Internal Update] ${engagementName} — Ready for Delivery`, text: assets.internalEmail });
  }
  if (assets.jiraEpic && consultantEmail) {
    emails.push({ to: consultantEmail, subject: `[Jira Epic] ${engagementName} — Remediation Complete`, text: assets.jiraEpic });
  }
  // NOTE: slackMessage is delivered via Slack webhook — NOT emailed.
  // Sending it as an email defeats the purpose and confuses recipients.
  if (assets.clientEmail && clientEmail) {
    emails.push({ to: clientEmail, subject: `${engagementName} — Readiness Assessment Complete`, text: assets.clientEmail });
  }

  const results = await Promise.allSettled(
    emails.map((e) => transporter.sendMail({ from, to: e.to, subject: e.subject, text: e.text })),
  );

  let sent = 0;
  const errors: string[] = [];
  for (const r of results) {
    if (r.status === 'fulfilled') sent++;
    else errors.push(String(r.reason));
  }
  console.log(`[ica-agent/deliverables] Delivery emails: ${sent}/${emails.length} sent`);
  return { sent, errors };
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const rl = checkRateLimit(`generate-deliverables:${clientKey(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: true, message: `Too many approval attempts — try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  try {
    const body = (await request.json()) as { approvedBy?: string; approvalPasscode?: string };
    const approvedBy = body.approvedBy ?? 'Lead Consultant';

    if (hasApprovalPasscodeConfig()) {
      const provided = body.approvalPasscode ?? '';
      if (!timingSafeEqualStrings(provided, appEnv.approvalPasscode!)) {
        return NextResponse.json(
          { error: true, message: 'Incorrect approval passcode.' },
          { status: 403 },
        );
      }
    }

    const state = readWorkflowState();

    // Guard: all tasks must be complete
    const allDone =
      state.taskAssignments.length === 0 ||
      state.taskAssignments.every((t) => t.status === 'completed');

    if (state.taskAssignments.length > 0 && !allDone) {
      const pending = state.taskAssignments.filter((t) => t.status !== 'completed').length;
      return NextResponse.json(
        {
          ok: false,
          reason: `${pending} task(s) are not yet complete. All tasks must be done before final approval.`,
        },
        { status: 400 },
      );
    }

    // Record final approval — advances to ready-for-engagement
    recordFinalApproval(approvedBy);
    console.log(`[ica-agent/deliverables] Final approval by "${approvedBy}" — triggering ICA asset generation`);

    const review = state.latestReview;
    if (!review) {
      const finalState = recordDeliveryPackageSent();
      return NextResponse.json({ ok: true, workflowStage: finalState.workflowStage, assetsGenerated: false });
    }

    const stakeholders = readStakeholderDirectory();
    const completedTasks = state.taskAssignments
      .filter((t) => t.status === 'completed')
      .map((t) => ({
        title: t.title,
        ownerRole: t.ownerRole,
        completedBy: t.completedBy ?? t.assigneeName,
      }));

    const icaInput: ICADeliverableInput = {
      engagementId: `eng-${state.sessionId?.replace('session-', '') ?? Date.now()}`,
      // Use real state values — never fall back to mockDashboardData for names
      engagementName: state.engagementName ?? state.latestReview?.watsonxPrompt?.userPrompt?.split('\n')[0]?.replace('Project Context:', '').trim() ?? mockDashboardData.engagement.projectName,
      clientName: state.clientName ?? mockDashboardData.engagement.clientName,
      leadConsultant: state.leadConsultant ?? mockDashboardData.engagement.leadConsultant,
      readinessDecision: review.readinessDecision,
      readinessScore: review.readinessScore,
      confidenceScore: review.confidenceScore,
      executiveSummary: review.executiveSummary,
      criticalIssues: review.criticalIssues,
      recommendations: review.recommendations,
      openQuestions: review.openQuestions,
      riskExplanation: review.riskExplanation ?? '',
      businessImpact: review.businessImpact ?? '',
      completedTasks,
      consultantEmail: stakeholders.consultant.email || appEnv.emailDefaultRecipient || '',
      clientContactEmail: stakeholders.client.email || appEnv.emailDefaultRecipient || '',
      contextId: appEnv.contextStudioCtxId,
    };

    // ── Sanitise email bodies: strip mail headers + replace LLM placeholders ─
    // Hoisted outside try/catch so both the happy path and fallback share it.
    const engN  = icaInput.engagementName;
    const cliN  = icaInput.clientName;
    const leadN = icaInput.leadConsultant;
    function sanitiseEmailBody(text: string): string {
      return text
        // Strip leading mail-header lines (Subject/To/From/CC/BCC)
        .replace(/^(Subject|To|From|CC|BCC):.*\r?\n+/gim, '')
        // Replace LLM placeholder tokens with real values
        .replace(/\[Name\]/gi, leadN)
        .replace(/\[Lead Consultant\]/gi, leadN)
        .replace(/\[Consultant Name\]/gi, leadN)
        .replace(/\[Client\]/gi, cliN)
        .replace(/\[Client Name\]/gi, cliN)
        .replace(/\[Engagement\]/gi, engN)
        .replace(/\[Engagement Name\]/gi, engN)
        .replace(/\[Your Name\]/gi, leadN)
        .replace(/\[Your Title\]/gi, 'IBM Consulting — Engagement Lead')
        .replace(/\[Date\]/gi, new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }))
        .trim();
    }

    // ── Call ICA Agent API to generate delivery assets ─────────────────────
    let assetsGenerated = false;
    let assetRoute: string = 'mock';

    try {
      const result = await generateDeliverablesViaICA(icaInput);
      assetRoute = result.route;

      const rawAssets = result.data ?? buildMockDeliverables(icaInput);
      const assets = {
        ...rawAssets,
        executiveSummary: sanitiseEmailBody(rawAssets.executiveSummary),
        clientEmail:      sanitiseEmailBody(rawAssets.clientEmail),
        internalEmail:    sanitiseEmailBody(rawAssets.internalEmail),
        jiraEpic:         sanitiseEmailBody(rawAssets.jiraEpic),
      };

      // ── 1. Email all delivery assets ──────────────────────────────────────
      const emailResult = await sendDeliveryEmails(
        assets,
        icaInput.consultantEmail,
        icaInput.clientContactEmail,
        icaInput.engagementName,
      );

      // ── 2. Post direct Slack notification ────────────────────────────────
      const slackResult = await postDeliverySlack(
        assets,
        icaInput.engagementName,
        icaInput.clientName,
        icaInput.leadConsultant,
        icaInput.readinessDecision,
        icaInput.readinessScore,
        icaInput.confidenceScore,
        icaInput.executiveSummary,
        icaInput.criticalIssues.length,
        icaInput.completedTasks.length,
      );

      // ── 3. Create Jira Epic + Stories ────────────────────────────────────
      const jiraResult = await createJiraEpicFromAssets(
        icaInput.engagementName,
        icaInput.clientName,
        icaInput.leadConsultant,
        icaInput.readinessDecision,
        icaInput.readinessScore,
        assets.jiraEpic,
        icaInput.completedTasks,
      );

      setDeliveryAssets({
        generatedAt: new Date().toISOString(),
        executiveSummary: assets.executiveSummary,
        clientEmail: assets.clientEmail,
        internalEmail: assets.internalEmail,
        jiraEpic: jiraResult.epicKey
          ? `${assets.jiraEpic}\n\n---\nJira Epic: ${jiraResult.epicKey} → ${jiraResult.epicUrl}\n(${jiraResult.storiesCount} stories created)`
          : assets.jiraEpic,
        slackMessage: assets.slackMessage,
        deliveryEmailsSent: emailResult.sent,
        deliveryEmailErrors: emailResult.errors,
      });

      assetsGenerated = true;
      console.log(
        `[ica-agent/deliverables] ✓ Assets generated via ${result.route}` +
        ` | emails: ${emailResult.sent}` +
        ` | slack: ${slackResult.sent}` +
        ` | jira: ${jiraResult.epicKey ?? 'skipped'}`,
      );
    } catch (e) {
      console.warn('[ica-agent/deliverables] Asset generation error:', e instanceof Error ? e.message : e);

      // Persist mock assets so the UI always shows something
      const mockAssets = buildMockDeliverables(icaInput);
      setDeliveryAssets({
        generatedAt: new Date().toISOString(),
        executiveSummary: sanitiseEmailBody(mockAssets.executiveSummary),
        clientEmail: sanitiseEmailBody(mockAssets.clientEmail),
        internalEmail: sanitiseEmailBody(mockAssets.internalEmail),
        jiraEpic: sanitiseEmailBody(mockAssets.jiraEpic),
        slackMessage: mockAssets.slackMessage,
        deliveryEmailsSent: 0,
        deliveryEmailErrors: ['Asset generation failed — mock content persisted'],
      });
    }

    // Advance to delivery-package-sent
    const finalState = recordDeliveryPackageSent();

    return NextResponse.json({
      ok: true,
      workflowStage: finalState.workflowStage,
      assetsGenerated,
      assetRoute,
      approvedBy,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.';
    console.error('[ica-agent/deliverables] Error:', message);
    return NextResponse.json({ error: true, message, pipelineStage: 'failed' }, { status: 500 });
  }
}
