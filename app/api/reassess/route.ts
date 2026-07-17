/**
 * POST /api/reassess
 *
 * Re-runs the watsonx readiness assessment AFTER tasks are complete,
 * incorporating completion notes from the team as new evidence.
 *
 * KEY BEHAVIOURS (fixed):
 *   - Uses persistReassessResult() NOT persistReviewResult():
 *       → workflowStage is PRESERVED (not reset to assessment-complete)
 *       → taskAssignments are PRESERVED (completed tasks stay completed)
 *       → HITL gate does NOT re-open → no new task emails sent
 *       → approvalStageHistory is appended, not wiped
 *   - originalContext is extracted cleanly from the FIRST assessment only
 *       → strips out previously-added "=== ORIGINAL DISCOVERY CONTEXT ===" wrappers
 *       → prevents context snowballing on repeated re-assessments
 *   - Completed tasks are explicitly told to watsonx as RESOLVED
 *       → they do not appear as new findings
 *   - Stage advances to ready-for-review ONLY when:
 *       → all tasks completed AND new score >= 60
 *
 * Body:
 *   { additionalContext?: string, evidenceType?: EvidenceType }
 *
 * Returns: same shape as POST /api/readiness-review
 */

import { NextResponse } from 'next/server';
import {
  readWorkflowState,
  persistReassessResult,
  recordPipelineStage,
  startPipelineRun,
} from '@/lib/workflow-state';
import { runWatsonxPipeline, buildWatsonxPrompt } from '@/services/watsonx-service';
import { buildActionPlanFromPipeline, buildConsultingAssets, engagementReadinessAgents } from '@/services/agent-service';
import { dispatchOrchestrationPlan } from '@/services/orchestrate-service';
import { hasICAAgenticConfig, hasWatsonxConfig } from '@/lib/env';
import { checkRateLimit, clientKey } from '@/lib/rate-limit';
import type { AIAnalysisResult, EvidenceType, ReviewRequestInput } from '@/types/domain';

export const dynamic = 'force-dynamic';

// Same metered-pipeline concern as /api/readiness-review.
const RATE_LIMIT = 10;
const RATE_WINDOW_MS = 5 * 60_000;

interface ReassessBody {
  additionalContext?: string;
  evidenceType?: EvidenceType;
}

// ─── Strip wrapper labels added by previous reassess runs ────────────────────
// Prevents the context growing like:
//   === ORIGINAL DISCOVERY CONTEXT ===
//   Project Context:
//   === ORIGINAL DISCOVERY CONTEXT ===
//   Project Context:
//   ... (actual notes buried 3 levels deep)

function extractCleanOriginalContext(raw: string): string {
  // If the stored context contains our wrapper markers, peel them off
  // and return only the raw discovery text underneath the FIRST marker.
  const markerPatterns = [
    /^=== ORIGINAL DISCOVERY CONTEXT ===\s*/im,
    /^Project Context:\s*/im,
    /^=== REMEDIATION COMPLETION EVIDENCE.*?===\s*/ims,
    /^=== PREVIOUSLY IDENTIFIED BLOCKERS.*?===\s*/ims,
    /^=== ADDITIONAL CONTEXT FROM CONSULTANT ===\s*/ims,
  ];

  // Find the earliest occurrence of any wrapper marker
  let cleanest = raw;
  const firstMarkerIdx = raw.search(/=== ORIGINAL DISCOVERY CONTEXT ===/i);
  if (firstMarkerIdx !== -1) {
    // Take only what's BETWEEN the first marker and the next section marker
    const afterFirstMarker = raw.slice(firstMarkerIdx).replace(/^=== ORIGINAL DISCOVERY CONTEXT ===\s*/i, '');
    // Cut off at the next section separator
    const nextSection = afterFirstMarker.search(/\n---\n|^===\s/im);
    cleanest = nextSection !== -1
      ? afterFirstMarker.slice(0, nextSection).trim()
      : afterFirstMarker.trim();
  }

  // Final safety: strip any remaining wrapper lines at the top
  for (const pattern of markerPatterns) {
    cleanest = cleanest.replace(pattern, '').trim();
  }

  return cleanest;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const rl = checkRateLimit(`reassess:${clientKey(request)}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: true, message: `Too many re-assessments — try again in ${rl.retryAfterSeconds}s.`, pipelineStage: 'failed' },
      { status: 429, headers: { 'Retry-After': String(rl.retryAfterSeconds) } },
    );
  }

  try {
    const body = (await request.json()) as ReassessBody;
    const state = readWorkflowState();
    const prev = state.latestReview;

    if (!prev) {
      return NextResponse.json(
        { error: true, message: 'No previous assessment found. Run an initial assessment first.', pipelineStage: 'failed' },
        { status: 400 },
      );
    }

    // ── Extract the clean original discovery context (no nested wrappers) ──
    const rawStored = prev.watsonxPrompt?.userPrompt ?? prev.executiveSummary ?? '';
    const cleanOriginal = extractCleanOriginalContext(rawStored);

    // ── Gather completed tasks with their notes ────────────────────────────
    const completedTasks = state.taskAssignments.filter(
      (t) => t.status === 'completed',
    );
    const tasksWithNotes = completedTasks.filter((t) => t.completionNote);

    // ── Build enriched context ─────────────────────────────────────────────
    // Section order matters for Granite: discovery first, then evidence of
    // resolution, then what was outstanding, then new consultant notes.
    const sections: string[] = [];

    sections.push(`=== ORIGINAL DISCOVERY CONTEXT ===\n${cleanOriginal}`);

    if (completedTasks.length > 0) {
      const taskLines = completedTasks.map((t) => {
        const note = t.completionNote
          ? `Completion evidence: ${t.completionNote}`
          : `(no completion note — assume resolved)`;
        return `✓ RESOLVED: ${t.title} [${t.ownerRole}] — ${note}`;
      }).join('\n');

      sections.push(
        `=== REMEDIATION ACTIONS COMPLETED (${completedTasks.length} of ${state.taskAssignments.length}) ===\n` +
        `The following actions have been completed since the initial assessment. ` +
        `Do NOT list these as new issues or new recommendations:\n\n${taskLines}`,
      );
    }

    // Tell Granite explicitly which blockers were previously outstanding
    // so it knows what gaps should now be closed
    if (prev.criticalIssues.length > 0) {
      const resolvedTitles = new Set(completedTasks.map((t) => t.title.toLowerCase()));
      const stillOpen = prev.criticalIssues.filter(
        (issue) => !Array.from(resolvedTitles).some((t) => issue.toLowerCase().includes(t.slice(0, 20))),
      );
      const nowResolved = prev.criticalIssues.filter(
        (issue) => Array.from(resolvedTitles).some((t) => issue.toLowerCase().includes(t.slice(0, 20))),
      );

      if (nowResolved.length > 0) {
        sections.push(
          `=== PREVIOUSLY BLOCKING ISSUES — NOW RESOLVED ===\n` +
          nowResolved.map((i, n) => `${n + 1}. ${i}`).join('\n'),
        );
      }
      if (stillOpen.length > 0) {
        sections.push(
          `=== ISSUES STILL OPEN (not yet resolved) ===\n` +
          stillOpen.map((i, n) => `${n + 1}. ${i}`).join('\n'),
        );
      }
    }

    if (body.additionalContext?.trim()) {
      sections.push(`=== ADDITIONAL CONTEXT FROM CONSULTANT ===\n${body.additionalContext.trim()}`);
    }

    const enrichedContext = sections.join('\n\n---\n\n');

    const consultantComment =
      `RE-ASSESSMENT after ${completedTasks.length} remediation action(s) completed. ` +
      `Previous score: ${prev.readinessScore}%. ` +
      (tasksWithNotes.length > 0
        ? `Resolved blockers: ${tasksWithNotes.map((t) => t.title).join(', ')}. `
        : '') +
      `Score against the UPDATED evidence. Do NOT re-raise issues already listed as RESOLVED above.`;

    const reviewInput: ReviewRequestInput = {
      projectContext: enrichedContext,
      evidenceType: body.evidenceType ?? 'meeting-minutes',
      consultantComment,
    };

    console.log(
      `[reassess] Re-running with enriched context.` +
      ` Previous score: ${prev.readinessScore}% | Completed tasks: ${completedTasks.length}` +
      ` | With notes: ${tasksWithNotes.length}`,
    );

    // ── Run the watsonx pipeline with enriched context ─────────────────────
    startPipelineRun();
    recordPipelineStage('running-watsonx-analysis', 'Re-assessment — running watsonx pipeline with completion evidence.');

    const prompt = buildWatsonxPrompt(reviewInput);

    if (!hasWatsonxConfig()) {
      return NextResponse.json(
        { error: true, message: 'watsonx not configured.', pipelineStage: 'failed' },
        { status: 500 },
      );
    }

    const pipeline = await runWatsonxPipeline(reviewInput);

    let result: AIAnalysisResult;

    if (pipeline.success && pipeline.readinessOutput && pipeline.orchestration) {
      const { readinessOutput, orchestration, steps } = pipeline;
      const assets = buildConsultingAssets(
        readinessOutput.executiveSummary,
        readinessOutput.criticalIssues,
        readinessOutput.recommendations,
        readinessOutput.openQuestions,
        pipeline.evidence?.openRisks ?? [],
      );

      result = {
        executiveSummary: readinessOutput.executiveSummary,
        readinessDecision: readinessOutput.readinessDecision,
        readinessScore: readinessOutput.readinessScore,
        confidenceScore: readinessOutput.confidenceScore,
        riskExplanation: readinessOutput.riskExplanation,
        criticalIssues: readinessOutput.criticalIssues,
        recommendations: readinessOutput.recommendations,
        missingInformation: pipeline.evidence?.openRisks ?? [],
        openQuestions: readinessOutput.openQuestions,
        estimatedTimeSavedHours: readinessOutput.estimatedTimeSavedHours,
        businessImpact: readinessOutput.businessImpact,
        reasoningTrace: readinessOutput.reasoningTrace ?? [],
        missingStakeholders: readinessOutput.missingStakeholders ?? [],
        missingWorkshops: readinessOutput.missingWorkshops ?? [],
        missingRequirements: readinessOutput.missingRequirements ?? [],
        watsonxPrompt: prompt,
        agentTrace: engagementReadinessAgents,
        pipelineSteps: steps,
        actionPlan: buildActionPlanFromPipeline(orchestration),
        consultingAssets: assets,
        integrationStatus: {
          watsonx: 'live',
          orchestrate: hasICAAgenticConfig() ? 'live' : 'mock',
        },
      };
    } else {
      // Pipeline failed — keep previous review, just log
      console.warn('[reassess] Pipeline returned no output — keeping previous review.');
      recordPipelineStage('failed', 'Re-assessment pipeline returned no output.');
      return NextResponse.json(
        { error: true, message: 'Re-assessment pipeline returned no output. Previous findings retained.', pipelineStage: 'failed' },
        { status: 500 },
      );
    }

    // Dispatch to orchestrate (for action plan sync)
    const orchPlan = {
      workflowId: result.actionPlan.workflowId,
      summary: result.actionPlan.summary,
      tasks: result.actionPlan.actions.map((a) => ({
        id: a.id, title: a.title,
        ownerRole: a.ownerRole as 'maintenance',
        status: a.status as 'pending',
        dueLabel: a.dueLabel, instructions: a.instructions, priority: a.priority,
      })),
      nextApprover: result.actionPlan.nextReviewer,
    };
    await dispatchOrchestrationPlan(orchPlan).catch(() => { /* non-fatal */ });

    // ── CRITICAL: use persistReassessResult, NOT persistReviewResult ────────
    // This preserves taskAssignments, workflowStage, sessionId, approvalHistory
    const finalState = persistReassessResult(result);

    recordPipelineStage(
      'completed',
      `Re-assessment complete. New score: ${result.readinessScore}% (was ${prev.readinessScore}%). Stage: ${finalState.workflowStage}.`,
    );

    console.log(
      `[reassess] ✓ Complete. Score: ${prev.readinessScore}% → ${result.readinessScore}%` +
      ` | Stage: ${finalState.workflowStage}` +
      ` | Tasks preserved: ${finalState.taskAssignments.length}`,
    );

    return NextResponse.json({
      data: result,
      generatedAt: new Date().toISOString(),
      previousScore: prev.readinessScore,
      newScore: result.readinessScore,
      workflowStage: finalState.workflowStage,
      tasksPreserved: finalState.taskAssignments.length,
    });

  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error.';
    console.error('[reassess] Error:', message);
    return NextResponse.json({ error: true, message, pipelineStage: 'failed' }, { status: 500 });
  }
}
