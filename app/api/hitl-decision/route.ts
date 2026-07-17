import { NextResponse } from 'next/server';
import {
  recordHITLDecision,
  setTaskAssignments,
  setDispatchResult,
  type DispatchResult,
} from '@/lib/workflow-state';
import { deliverToICA, type ICAEngagementPackage } from '@/services/ica-service';
import { postAssessmentToContextStudio } from '@/services/context-studio-feedback-service';
import { readStakeholderDirectory } from '@/services/stakeholder-service';
import { sendTaskEmail } from '@/services/task-email-service';
import { assignTasksViaICA } from '@/services/ica-agent-api-service';
import { sendSlackNotification, sendTaskAssignmentSlackCard } from '@/services/notification-service';
import { mockDashboardData } from '@/data/mock-dashboard';
import { appEnv, hasSlackConfig, hasSlackBotConfig } from '@/lib/env';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';
import type { ActionOwnerRole, HITLRecord, TaskAssignment } from '@/types/domain';

export const dynamic = 'force-dynamic';

// This route fires real emails, real Slack messages, and (via ICA) real task
// assignment — not something that should legitimately happen often per caller.
const RATE_LIMIT = 5;
const RATE_WINDOW_MS = 5 * 60_000;

// ─── Normalise ownerRole ──────────────────────────────────────────────────────

function normaliseOwnerRole(raw: string): ActionOwnerRole {
  const v = raw.toLowerCase().trim();
  if (v.includes('partner') || v.includes('executive') || v.includes('sponsor')) return 'partner';
  if (v.includes('architect') || v.includes('technical') || v.includes('solution')) return 'architect';
  if (v.includes('client') || v.includes('customer') || v.includes('stakeholder')) return 'client';
  return 'consultant';
}

export async function POST(request: Request) {
  const rl = checkRateLimit(`hitl-decision:${clientKey(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: true, message: `Too many decisions submitted — try again in ${rl.retryAfterSeconds}s.` },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  try {
    const body = (await request.json()) as HITLRecord;
    const state = recordHITLDecision(body);
    const review = state.latestReview;

    if (!review) {
      return NextResponse.json({ ok: true, state });
    }

    // ── Build the engagement ID (stable for this session) ──────────────────
    const engagementId = `eng-${state.sessionId?.replace('session-', '') ?? Date.now()}`;

    // ── Build the full ICA package ─────────────────────────────────────────
    const pkg: ICAEngagementPackage = {
      engagementId,
      engagementName: state.engagementName ?? mockDashboardData.engagement.projectName,
      clientName: state.clientName ?? mockDashboardData.engagement.clientName,
      leadConsultant: state.leadConsultant ?? mockDashboardData.engagement.leadConsultant,
      readinessDecision: body.consultantChoice,
      readinessScore: body.aiScore,
      confidenceScore: review.confidenceScore,
      executiveSummary: review.executiveSummary,
      criticalIssues: review.criticalIssues,
      recommendations: review.recommendations,
      openQuestions: review.openQuestions,
      assets: review.consultingAssets,
      hitlRecord: {
        aiRecommendation: body.aiRecommendation,
        aiScore: body.aiScore,
        consultantDecision: body.consultantDecision,
        consultantChoice: body.consultantChoice,
        justification: body.justification,
        decidedAt: body.decidedAt,
      },
      assessedAt: state.assessedAt ?? new Date().toISOString(),
    };

    // ── Seed per-task assignment records in workflow state ─────────────────
    const baseUrl = appEnv.appBaseUrl.replace(/\/$/, '');
    const now = new Date().toISOString();
    const stakeholders = readStakeholderDirectory();

    const assignments: TaskAssignment[] = review.actionPlan.actions.map((a) => {
      const role = normaliseOwnerRole(a.ownerRole);
      const contact = stakeholders[role] ?? stakeholders.consultant;
      return {
        taskId: a.id,
        title: a.title,
        ownerRole: role,
        priority: a.priority,
        dueLabel: a.dueLabel,
        instructions: a.instructions,
        engagementId,
        assigneeName: contact.name,
        assigneeEmail: contact.email,
        assigneeSlack: contact.slackHandle,
        status: 'pending' as const,
        assignedAt: now,
        acknowledgedAt: null,
        completedAt: null,
        completedBy: null,
        completionNote: null,
      };
    });
    setTaskAssignments(assignments);

    // ── Start building dispatch result ─────────────────────────────────────
    const dispatchResult: DispatchResult = {
      dispatchedAt: now,
      packageWritten: false,
      langflow: 'skipped',
      icaMcp: 'skipped',
      emailsSent: 0,
      emailsAttempted: 0,
      emailErrors: [],
      slackCardsSent: 0,
      slackCardsAttempted: 0,
      slackCardErrors: [],
      contextStudio: 'skipped',
    };

    // ── 1. Write ICA package to disk (always) ──────────────────────────────
    try {
      const icaResult = await deliverToICA(pkg);
      dispatchResult.packageWritten = !!icaResult.exportPath && icaResult.exportPath !== 'write-failed';
      dispatchResult.packagePath = icaResult.exportPath;
      dispatchResult.icaMcp = icaResult.accepted ? 'accepted' : 'failed';
      if (!icaResult.accepted && icaResult.error) {
        dispatchResult.icaMcpError = icaResult.error;
      }
      console.log(`[hitl-decision] ICA package: ${dispatchResult.packageWritten ? 'written' : 'FAILED'}`);
    } catch (e) {
      dispatchResult.icaMcp = 'failed';
      dispatchResult.icaMcpError = e instanceof Error ? e.message : 'ICA delivery error';
      console.warn('[hitl-decision] ICA delivery error:', dispatchResult.icaMcpError);
    }

    // ── 2. ICA Agent API — assign tasks, (claims to) send emails + create Jira ──
    //
    // ICA reads the action plan and assigns each task to the right team member
    // (Architect → Consultant → QA → Operations). Its "notifications" response
    // is a self-reported LLM claim, not a delivery receipt — it is never
    // trusted to decide whether real emails get sent (see step 2b, which
    // always runs independently).
    try {
      const icaAssignResult = await assignTasksViaICA({
        engagementId,
        engagementName: pkg.engagementName,
        clientName: pkg.clientName,
        leadConsultant: pkg.leadConsultant,
        readinessDecision: pkg.readinessDecision,
        readinessScore: pkg.readinessScore,
        actionPlan: assignments.map((a) => ({
          taskId: a.taskId,
          title: a.title,
          ownerRole: a.ownerRole,
          priority: a.priority,
          dueLabel: a.dueLabel,
          instructions: a.instructions,
          assigneeName: a.assigneeName,
          assigneeEmail: a.assigneeEmail,
          assigneeSlack: a.assigneeSlack,
          acknowledgeUrl: `${baseUrl}/api/task/update`,
        })),
        contextId: appEnv.contextStudioCtxId,
        appBaseUrl: baseUrl,
      });

      dispatchResult.langflow = icaAssignResult.accepted ? 'accepted' : (icaAssignResult.route === 'mock' ? 'skipped' : 'failed');

      console.log(
        `[hitl-decision] ICA Agent API assign: route=${icaAssignResult.route}` +
        ` | ICA self-reported notifications=${icaAssignResult.emailsSent} (not verified — see step 2b for real send)` +
        ` | ICA self-reported jira=${icaAssignResult.jiraTicketsCreated}` +
        ` | ICA self-reported slack=${icaAssignResult.slackMessageSent}`,
      );
    } catch (e) {
      dispatchResult.langflow = 'failed';
      dispatchResult.langflowError = e instanceof Error ? e.message : 'ICA Agent API error';
      console.warn('[hitl-decision] ICA Agent API error:', dispatchResult.langflowError);
    }

    // ── 2b. Task-assignment emails — always sent by us, verified via SMTP ────
    //
    // Independent of step 2 above and of whatever ICA claims: this is the only
    // channel we can actually confirm was delivered (real nodemailer sendMail),
    // so it always runs, regardless of what assignTasksViaICA reported.
    try {
      const tasksByEmail = new Map<string, TaskAssignment[]>();
      for (const a of assignments) {
        const email = a.assigneeEmail?.trim();
        if (!email) continue; // skip tasks with no email address
        const existing = tasksByEmail.get(email) ?? [];
        existing.push(a);
        tasksByEmail.set(email, existing);
      }

      if (tasksByEmail.size === 0) {
        console.warn('[hitl-decision] No valid assignee emails — task email skipped. Set STAKEHOLDER_*_EMAIL in .env.local.');
        dispatchResult.emailErrors.push('No assignee emails configured — add STAKEHOLDER_CONSULTANT_EMAIL etc. to .env.local');
      } else {
        const emailResults = await Promise.allSettled(
          Array.from(tasksByEmail.entries()).map(([email, tasks]) =>
            sendTaskEmail({
              to: email,
              assigneeName: tasks[0].assigneeName,
              tasks,
              engagementName: pkg.engagementName,
              clientName: pkg.clientName,
              readinessDecision: pkg.readinessDecision,
              readinessScore: pkg.readinessScore,
              appBaseUrl: baseUrl,
            }),
          ),
        );

        dispatchResult.emailsAttempted = emailResults.length;
        for (const r of emailResults) {
          if (r.status === 'fulfilled' && r.value.sent) dispatchResult.emailsSent++;
          else dispatchResult.emailErrors.push(r.status === 'rejected' ? String(r.reason) : (r.value.error ?? 'Send failed'));
        }
        console.log(`[hitl-decision] Task emails (verified send): ${dispatchResult.emailsSent}/${dispatchResult.emailsAttempted} sent`);
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Task email dispatch error';
      dispatchResult.emailErrors.push(message);
      console.warn('[hitl-decision] Task email dispatch error:', message);
    }

    // ── 3a. Slack interactive task cards — one per assignee ────────────────
    // Independent of the email channel above: posts a DM with a "Mark Done"
    // button so assignees can acknowledge tasks without leaving Slack.
    if (hasSlackBotConfig()) {
      const cardResults = await Promise.allSettled(
        assignments.map((a) =>
          sendTaskAssignmentSlackCard({
            taskId: a.taskId,
            engagementId,
            title: a.title,
            instructions: a.instructions,
            priority: a.priority,
            dueLabel: a.dueLabel,
            ownerRole: a.ownerRole,
            assigneeEmail: a.assigneeEmail,
            assigneeName: a.assigneeName,
            engagementName: pkg.engagementName,
            clientName: pkg.clientName,
          }),
        ),
      );

      dispatchResult.slackCardsAttempted = cardResults.length;
      for (const r of cardResults) {
        if (r.status === 'fulfilled' && r.value.sent) {
          dispatchResult.slackCardsSent = (dispatchResult.slackCardsSent ?? 0) + 1;
        } else {
          const err = r.status === 'rejected' ? String(r.reason) : r.value.error ?? 'Send failed';
          dispatchResult.slackCardErrors = [...(dispatchResult.slackCardErrors ?? []), err];
        }
      }
      console.log(`[hitl-decision] Slack task cards: ${dispatchResult.slackCardsSent}/${dispatchResult.slackCardsAttempted} sent`);
    }

    // ── 3b. Slack notification — fires HERE after HITL decision ───────────
    // Uses actual review data, not mock. Fires for both Accept and Override.
    if (hasSlackConfig()) {
      sendSlackNotification({
        engagementName: pkg.engagementName,
        clientName: pkg.clientName,
        leadConsultant: pkg.leadConsultant,
        readinessDecision: pkg.readinessDecision,
        readinessScore: pkg.readinessScore,
        confidenceScore: review.confidenceScore,
        executiveSummary: review.executiveSummary,
        criticalIssuesCount: review.criticalIssues.length,
        actionsCount: assignments.length,
        assetsCount: review.consultingAssets.length,
        hitlDecision: body.consultantDecision,
        hitlJustification: body.justification,
      }).then((r) => console.log(`[hitl-decision] Slack: ${r.sent ? '✓ sent' : `skipped — ${r.error ?? 'not configured'}`}`))
        .catch((e) => console.warn('[hitl-decision] Slack error:', e));
    }

    // ── 4. Context Studio feedback (fire-and-forget) ───────────────────────
    postAssessmentToContextStudio(pkg, body)
      .then(() => {
        setDispatchResult({ ...dispatchResult, contextStudio: 'posted' });
        console.log('[hitl-decision] Context Studio: posted');
      })
      .catch((e) => {
        const err = e instanceof Error ? e.message : 'Context Studio error';
        setDispatchResult({ ...dispatchResult, contextStudio: 'failed', contextStudioError: err });
        console.warn('[hitl-decision] Context Studio failed:', err);
      });

    // ── 5. Persist dispatch result ─────────────────────────────────────────
    setDispatchResult(dispatchResult);

    return NextResponse.json({
      ok: true,
      state,
      engagementId,
      tasksSeeded: assignments.length,
      packageUrl: `${baseUrl}/api/ica-package/${engagementId}`,
      taskListUrl: `${baseUrl}/api/task/list`,
      dispatch: dispatchResult,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.';
    return NextResponse.json({ error: true, message, pipelineStage: 'failed' }, { status: 500 });
  }
}
