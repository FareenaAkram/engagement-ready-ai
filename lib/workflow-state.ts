/**
 * Server-side persistent workflow state.
 * Uses a JSON file as a lightweight database — no external DB required.
 */

import fs from 'fs';
import path from 'path';
import { hasStateEncryptionConfig, encryptState, decryptState, isEncryptedEnvelope } from '@/lib/state-crypto';
import { alertOps } from '@/lib/ops-alert';
import type { AIAnalysisResult, PipelineStage, StageHistoryEntry, TaskAssignment, WorkflowStage } from '@/types/domain';

export interface ReviewHistoryEntry {
  id: string;
  assessedAt: string;
  decision: AIAnalysisResult['readinessDecision'];
  readinessScore: number;
  confidenceScore: number;
  executiveSummary: string;
  estimatedTimeSavedHours: number;
  integrationStatus: AIAnalysisResult['integrationStatus'];
  hitlDecision?: 'accepted' | 'overridden';
}

export interface DispatchResult {
  /** When the HITL was recorded */
  dispatchedAt: string;
  /** ICA package written to disk */
  packageWritten: boolean;
  packagePath?: string;
  /**
   * ICA Virtual Server MCP SDK call outcome.
   * (Field kept as 'langflow' for backward compat with existing UI references.)
   */
  langflow: 'accepted' | 'failed' | 'skipped';
  langflowError?: string;
  /** Tools found on the Virtual Server when the call succeeded */
  toolsFound?: string[];
  toolCalled?: string;
  /** ICA MCP push outcome (legacy direct JSON-RPC push — now superseded by MCP SDK) */
  icaMcp: 'accepted' | 'failed' | 'skipped';
  icaMcpError?: string;
  /** Email notifications sent (one per task assignee) */
  emailsSent: number;
  emailsAttempted: number;
  emailErrors: string[];
  /** Slack interactive "Mark Done" task cards sent (one per task assignee) */
  slackCardsSent?: number;
  slackCardsAttempted?: number;
  slackCardErrors?: string[];
  /** Context Studio feedback outcome */
  contextStudio: 'posted' | 'failed' | 'skipped';
  contextStudioError?: string;
  /**
   * Phase 2: ICA-generated delivery assets — populated when all tasks are complete.
   * These are authored by ICA (not watsonx) and sent to the right people.
   */
  deliveryAssets?: {
    generatedAt: string;
    executiveSummary?: string;
    clientEmail?: string;
    internalEmail?: string;
    jiraEpic?: string;
    slackMessage?: string;
    deliveryEmailsSent?: number;
    deliveryEmailErrors?: string[];
  };
}

export interface PersistedWorkflowState {
  latestReview: AIAnalysisResult | null;
  workflowStage: WorkflowStage;
  assessedAt: string | null;
  assessmentCount: number;
  /** Running total of hours saved across all assessments */
  totalTimeSavedHours: number;
  /** Last 10 assessments for history display */
  history: ReviewHistoryEntry[];
  /** Real-time execution lifecycle of the AI pipeline for the current/most recent run */
  pipelineStage: PipelineStage;
  /** Real, timestamped trace of the current run's pipeline execution */
  pipelineStageHistory: StageHistoryEntry[];
  /** Real, timestamped trace of human approval-chain actions */
  approvalStageHistory: StageHistoryEntry[];
  /** Set when the pipeline fails unexpectedly */
  pipelineError: string | null;
  /** Session identifier for tracking current assessment session */
  sessionId: string | null;
  /**
   * Real engagement identity, entered by the consultant when they submit the
   * assessment. Null until an assessment with these fields has been submitted —
   * callers should fall back to mockDashboardData.engagement when null so the
   * demo still has sensible placeholder values.
   */
  engagementName: string | null;
  clientName: string | null;
  leadConsultant: string | null;
  /**
   * Per-task assignment records — populated when the action plan is dispatched.
   * Updated in-place as assignees acknowledge / complete their tasks via ICA callback.
   */
  taskAssignments: import('@/types/domain').TaskAssignment[];
  /** Result of the last HITL dispatch — shows in UI so consultant can see what happened */
  lastDispatchResult: DispatchResult | null;
  /**
   * On-demand ICA Accelerator assets generated from the QA Review panel.
   * Keyed by assetType — newer generation replaces the prior one.
   * Survives page refresh.
   */
  onDemandAssets: Record<string, import('@/types/domain').ICAGenerateResult>;
}

const STATE_DIR = path.join(process.cwd(), '.next', 'tmp');
const STATE_FILE = path.join(STATE_DIR, 'workflow-state.json');

const DEFAULT_STATE: PersistedWorkflowState = {
  latestReview: null,
  workflowStage: 'draft',
  assessedAt: null,
  assessmentCount: 0,
  totalTimeSavedHours: 0,
  history: [],
  pipelineStage: 'pending',
  pipelineStageHistory: [],
  approvalStageHistory: [],
  pipelineError: null,
  sessionId: null,
  engagementName: null,
  clientName: null,
  leadConsultant: null,
  taskAssignments: [],
  lastDispatchResult: null,
  onDemandAssets: {},
};

/** Single source of truth for the approval-chain order. */
export const WORKFLOW_STAGE_ORDER: WorkflowStage[] = [
  'draft',
  'assessment-complete',
  'ai-review-complete',
  'action-plan-accepted',
  'tasks-in-progress',
  'tasks-complete',
  'ready-for-review',
  'ready-for-engagement',
  'delivery-package-sent',
];

const STAGE_LABELS: Record<WorkflowStage, string> = {
  'draft':                  'Assessment draft',
  'assessment-complete':    'AI assessment complete',
  'ai-review-complete':     'AI findings reviewed',
  'action-plan-accepted':   'Action plan accepted — tasks assigned',
  'tasks-in-progress':      'Tasks in progress',
  'tasks-complete':         'All tasks complete',
  'ready-for-review':       'Awaiting lead consultant final approval',
  'ready-for-engagement':   'Approved — generating delivery package',
  'delivery-package-sent':  'Delivery package sent',
};

function ensureDir() {
  if (!fs.existsSync(STATE_DIR)) {
    fs.mkdirSync(STATE_DIR, { recursive: true });
  }
}

export function readWorkflowState(): PersistedWorkflowState {
  try {
    ensureDir();
    if (!fs.existsSync(STATE_FILE)) return { ...DEFAULT_STATE };
    const raw = fs.readFileSync(STATE_FILE, 'utf-8');

    let jsonText: string;
    const outer: unknown = JSON.parse(raw);
    if (isEncryptedEnvelope(outer)) {
      if (!hasStateEncryptionConfig()) {
        alertOps('workflow-state.json is encrypted but STATE_ENCRYPTION_KEY is not set — cannot read it. Falling back to defaults.');
        return { ...DEFAULT_STATE };
      }
      try {
        jsonText = decryptState(outer);
      } catch (decryptErr) {
        // GCM auth-tag mismatch — the file was corrupted, tampered with, or
        // encrypted under a different key. This is exactly the silent-reset
        // failure mode DASC flagged (SR-AU-2); alert loudly instead.
        alertOps(`workflow-state.json failed integrity verification (possible tampering or corruption): ${decryptErr instanceof Error ? decryptErr.message : String(decryptErr)}. Resetting to defaults.`);
        return { ...DEFAULT_STATE };
      }
    } else {
      jsonText = raw;
    }

    const parsed = JSON.parse(jsonText) as Partial<PersistedWorkflowState>;
    const merged: PersistedWorkflowState = { ...DEFAULT_STATE, ...parsed };
    // Defensive normalisation — guard against stale persisted data
    if (merged.latestReview) {
      merged.latestReview = normaliseReview(merged.latestReview);
    }
    if (merged.engagementName === undefined) merged.engagementName = null;
    if (merged.clientName === undefined) merged.clientName = null;
    if (merged.leadConsultant === undefined) merged.leadConsultant = null;
    if (!Array.isArray(merged.taskAssignments)) merged.taskAssignments = [];
    if (merged.lastDispatchResult === undefined) merged.lastDispatchResult = null;
    if (!merged.onDemandAssets || typeof merged.onDemandAssets !== 'object') merged.onDemandAssets = {};
    return merged;
  } catch (err) {
    alertOps(`readWorkflowState failed — resetting to defaults: ${err instanceof Error ? err.message : String(err)}`);
    return { ...DEFAULT_STATE };
  }
}

/**
 * Maps any ownerRole string (including Granite free-text) to a valid ActionOwnerRole.
 * Granite sometimes returns "Lead Consultant", "Solution Architect" etc.
 */
function normaliseActionOwnerRole(raw: string): import('@/types/domain').ActionOwnerRole {
  if (!raw) return 'consultant';
  const v = raw.toLowerCase().trim();
  if (v.includes('partner') || v.includes('executive') || v.includes('sponsor')) return 'partner';
  if (v.includes('architect') || v.includes('technical') || v.includes('solution')) return 'architect';
  if (v.includes('client') || v.includes('customer') || v.includes('stakeholder')) return 'client';
  return 'consultant';
}

/**
 * Ensures every array field on a persisted AIAnalysisResult is defined.
 * Guards against old state files that were written before a field was added.
 */
export function normaliseReview(r: AIAnalysisResult): AIAnalysisResult {
  return {
    ...r,
    criticalIssues:       Array.isArray(r.criticalIssues)       ? r.criticalIssues       : [],
    recommendations:      Array.isArray(r.recommendations)      ? r.recommendations      : [],
    missingInformation:   Array.isArray(r.missingInformation)   ? r.missingInformation   : [],
    openQuestions:        Array.isArray(r.openQuestions)        ? r.openQuestions        : [],
    pipelineSteps:        Array.isArray(r.pipelineSteps)        ? r.pipelineSteps        : [],
    agentTrace:           Array.isArray(r.agentTrace)           ? r.agentTrace           : [],
    consultingAssets:     Array.isArray(r.consultingAssets)     ? r.consultingAssets     : [],
    // New explainability fields — default to empty arrays for backward compat with
    // persisted state written before these fields were introduced.
    reasoningTrace:       Array.isArray(r.reasoningTrace)       ? r.reasoningTrace       : [],
    missingStakeholders:  Array.isArray(r.missingStakeholders)  ? r.missingStakeholders  : [],
    missingWorkshops:     Array.isArray(r.missingWorkshops)     ? r.missingWorkshops     : [],
    missingRequirements:  Array.isArray(r.missingRequirements)  ? r.missingRequirements  : [],
    actionPlan: r.actionPlan
      ? {
          ...r.actionPlan,
          actions: Array.isArray(r.actionPlan.actions)
            ? r.actionPlan.actions.map((a) => ({
                ...a,
                ownerRole: normaliseActionOwnerRole(a.ownerRole as string),
              }))
            : [],
        }
      : { workflowId: 'unknown', summary: '', nextReviewer: '', actions: [] },
  };
}

export function writeWorkflowState(state: PersistedWorkflowState): void {
  try {
    ensureDir();
    const json = JSON.stringify(state, null, 2);
    const toWrite = hasStateEncryptionConfig()
      ? JSON.stringify(encryptState(json))
      : json;
    fs.writeFileSync(STATE_FILE, toWrite, 'utf-8');
  } catch (err) {
    alertOps(`writeWorkflowState failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Appends a real-timestamped pipeline execution stage.
 */
export function recordPipelineStage(stage: PipelineStage, label: string): PersistedWorkflowState {
  const prev = readWorkflowState();
  const entry: StageHistoryEntry = { stage, label, enteredAt: new Date().toISOString() };
  const next: PersistedWorkflowState = {
    ...prev,
    pipelineStage: stage,
    pipelineStageHistory: [...prev.pipelineStageHistory, entry],
    pipelineError: stage === 'failed' ? label : null,
  };
  writeWorkflowState(next);
  return next;
}

/** Starts a fresh pipeline run — clears the previous run's stage trace. */
export function startPipelineRun(): PersistedWorkflowState {
  const prev = readWorkflowState();
  const next: PersistedWorkflowState = {
    ...prev,
    pipelineStage: 'pending',
    pipelineStageHistory: [],
    pipelineError: null,
  };
  writeWorkflowState(next);
  return next;
}

/**
 * Called after a successful engagement assessment.
 * Stage advances to 'assessment-complete' — consultant must review AI findings before HITL.
 */
export function persistReviewResult(
  analysis: AIAnalysisResult,
  engagementMeta?: { engagementName?: string; clientName?: string; leadConsultant?: string },
): PersistedWorkflowState {
  const prev = readWorkflowState();
  const now = new Date().toISOString();

  const entry: ReviewHistoryEntry = {
    id: `rev-${Date.now()}`,
    assessedAt: now,
    decision: analysis.readinessDecision,
    readinessScore: analysis.readinessScore,
    confidenceScore: analysis.confidenceScore,
    executiveSummary: analysis.executiveSummary,
    estimatedTimeSavedHours: analysis.estimatedTimeSavedHours,
    integrationStatus: analysis.integrationStatus,
  };

  // Detect whether this is a fresh engagement (new client/name) or a re-submission of
  // the same engagement. Fresh engagements reset the per-engagement counter to 1.
  const isNewEngagement =
    !prev.sessionId ||
    (engagementMeta?.clientName?.trim() && engagementMeta.clientName.trim() !== prev.clientName) ||
    (engagementMeta?.engagementName?.trim() && engagementMeta.engagementName.trim() !== prev.engagementName);

  const newAssessmentCount = isNewEngagement ? 1 : prev.assessmentCount + 1;
  // Only add the new hours — don't compound across all time (misleads the user)
  const newTimeSaved = (analysis.estimatedTimeSavedHours ?? 0);

  const next: PersistedWorkflowState = {
    ...prev,
    latestReview: analysis,
    workflowStage: 'assessment-complete',
    assessedAt: now,
    assessmentCount: newAssessmentCount,
    totalTimeSavedHours: newTimeSaved,
    history: [entry, ...(isNewEngagement ? [] : prev.history)].slice(0, 10),
    approvalStageHistory: [
      { stage: 'draft',               label: STAGE_LABELS['draft'],               enteredAt: now },
      { stage: 'assessment-complete', label: STAGE_LABELS['assessment-complete'], enteredAt: now },
    ],
    taskAssignments: isNewEngagement ? [] : prev.taskAssignments,
    lastDispatchResult: isNewEngagement ? null : prev.lastDispatchResult,
    onDemandAssets: isNewEngagement ? {} : prev.onDemandAssets,
    sessionId: `session-${Date.now()}`,
    engagementName: engagementMeta?.engagementName?.trim() || prev.engagementName,
    clientName: engagementMeta?.clientName?.trim() || prev.clientName,
    leadConsultant: engagementMeta?.leadConsultant?.trim() || prev.leadConsultant,
  };

  writeWorkflowState(next);
  return next;
}

/**
 * Persists the result of a RE-ASSESSMENT (after tasks are complete).
 *
 * Unlike persistReviewResult(), this function:
 *   - Preserves the existing workflowStage (does NOT reset to assessment-complete)
 *   - Preserves taskAssignments (does NOT clear completed tasks)
 *   - Preserves the existing sessionId (keeps task ownership intact)
 *   - Preserves approvalStageHistory (keeps the full audit chain)
 *   - ONLY updates: latestReview, assessedAt, assessmentCount, totalTimeSavedHours, history
 *   - Optionally advances stage to ready-for-review when score >= 60
 *
 * This means after re-assess:
 *   - AI Findings tab shows updated score/findings
 *   - Action Center still shows the SAME completed tasks (not reset)
 *   - The HITL gate does NOT re-open
 *   - No new task emails are sent
 */
export function persistReassessResult(analysis: AIAnalysisResult): PersistedWorkflowState {
  const prev = readWorkflowState();
  const now = new Date().toISOString();

  const entry: ReviewHistoryEntry = {
    id: `rev-reassess-${Date.now()}`,
    assessedAt: now,
    decision: analysis.readinessDecision,
    readinessScore: analysis.readinessScore,
    confidenceScore: analysis.confidenceScore,
    executiveSummary: analysis.executiveSummary,
    estimatedTimeSavedHours: analysis.estimatedTimeSavedHours,
    integrationStatus: analysis.integrationStatus,
  };

  // Determine stage: if all tasks done AND score improved, advance to ready-for-review.
  // Otherwise stay at the current stage (tasks-in-progress or action-plan-accepted).
  const allTasksDone =
    prev.taskAssignments.length > 0 &&
    prev.taskAssignments.every((t) => t.status === 'completed');

  const scoreImproved = analysis.readinessScore >= 60;

  const nextStage: WorkflowStage =
    allTasksDone && scoreImproved && prev.workflowStage !== 'ready-for-review' &&
    prev.workflowStage !== 'ready-for-engagement' && prev.workflowStage !== 'delivery-package-sent'
      ? 'ready-for-review'
      : prev.workflowStage;

  const extraHistory: import('@/types/domain').StageHistoryEntry[] =
    nextStage === 'ready-for-review' && prev.workflowStage !== 'ready-for-review'
      ? [
          { stage: 'tasks-complete',   label: STAGE_LABELS['tasks-complete'],   enteredAt: now },
          { stage: 'ready-for-review', label: `Re-assessment score ${analysis.readinessScore}% — awaiting lead consultant approval`, enteredAt: now },
        ]
      : [
          { stage: prev.workflowStage, label: `Re-assessed: score updated to ${analysis.readinessScore}%`, enteredAt: now },
        ];

  const next: PersistedWorkflowState = {
    ...prev,                          // ← preserve tasks, sessionId, approvalStageHistory
    latestReview: analysis,           // ← only the review changes
    workflowStage: nextStage,         // ← only advances if score improved + tasks done
    assessedAt: now,
    assessmentCount: prev.assessmentCount + 1,
    totalTimeSavedHours: prev.totalTimeSavedHours + (analysis.estimatedTimeSavedHours ?? 0),
    history: [entry, ...prev.history].slice(0, 10),
    approvalStageHistory: [
      ...prev.approvalStageHistory,   // ← KEEP existing chain, just append
      ...extraHistory,
    ],
    // taskAssignments preserved via ...prev — NOT reset
    // sessionId preserved via ...prev — NOT reset
  };

  writeWorkflowState(next);
  return next;
}

/** Persists an unexpected pipeline failure. */
export function persistPipelineFailure(message: string): PersistedWorkflowState {
  return recordPipelineStage('failed', message);
}

export type AdvanceResult =
  | { ok: true; state: PersistedWorkflowState }
  | { ok: false; reason: string };

/**
 * Advances the workflow to the next stage.
 * Used by button actions: consultant review, engagement ready.
 */
export function advanceWorkflowStage(to: WorkflowStage): AdvanceResult {
  const prev = readWorkflowState();
  const currentIdx = WORKFLOW_STAGE_ORDER.indexOf(prev.workflowStage);
  const targetIdx = WORKFLOW_STAGE_ORDER.indexOf(to);

  if (targetIdx <= currentIdx) {
    return { ok: false, reason: 'That stage has already been reached.' };
  }

  const next: PersistedWorkflowState = {
    ...prev,
    workflowStage: to,
    approvalStageHistory: [
      ...prev.approvalStageHistory,
      { stage: to, label: STAGE_LABELS[to], enteredAt: new Date().toISOString() },
    ],
  };
  writeWorkflowState(next);
  return { ok: true, state: next };
}

/**
 * Records a HITL decision on the latest review.
 * Stage advances to 'action-plan-accepted' — tasks are now assigned.
 * Does NOT jump to engagement-ready. Final approval is a separate step.
 */
export function recordHITLDecision(hitlRecord: AIAnalysisResult['hitlRecord']): PersistedWorkflowState {
  const prev = readWorkflowState();
  if (!prev.latestReview || !hitlRecord) return prev;

  const updatedReview = { ...prev.latestReview, hitlRecord };

  const updatedHistory = prev.history.map((h, i) =>
    i === 0 ? { ...h, hitlDecision: hitlRecord.consultantDecision } : h,
  );

  const next: PersistedWorkflowState = {
    ...prev,
    latestReview: updatedReview,
    workflowStage: 'action-plan-accepted',
    history: updatedHistory,
    approvalStageHistory: [
      ...prev.approvalStageHistory,
      { stage: 'ai-review-complete',  label: STAGE_LABELS['ai-review-complete'],  enteredAt: hitlRecord.decidedAt },
      { stage: 'action-plan-accepted', label: `Action plan ${hitlRecord.consultantDecision} — tasks assigned`, enteredAt: hitlRecord.decidedAt },
    ],
  };
  writeWorkflowState(next);
  return next;
}

/**
 * Called by POST /api/task/update when every task is marked complete.
 * Stage advances: tasks-complete → ready-for-review.
 * Notifies consultant that final approval is required.
 */
export function recordAllTasksComplete(): PersistedWorkflowState {
  const prev = readWorkflowState();
  const now = new Date().toISOString();

  const next: PersistedWorkflowState = {
    ...prev,
    workflowStage: 'ready-for-review',
    approvalStageHistory: [
      ...prev.approvalStageHistory,
      { stage: 'tasks-complete',   label: STAGE_LABELS['tasks-complete'],   enteredAt: now },
      { stage: 'ready-for-review', label: STAGE_LABELS['ready-for-review'], enteredAt: now },
    ],
  };
  writeWorkflowState(next);
  return next;
}

/**
 * Called by POST /api/final-approval when the lead consultant clicks Approve.
 * Stage advances to 'ready-for-engagement' — triggers Phase 2 ICA asset generation.
 * Once assets are sent, caller should call recordDeliveryPackageSent().
 */
export function recordFinalApproval(approvedBy: string): PersistedWorkflowState {
  const prev = readWorkflowState();
  const now = new Date().toISOString();

  const next: PersistedWorkflowState = {
    ...prev,
    workflowStage: 'ready-for-engagement',
    approvalStageHistory: [
      ...prev.approvalStageHistory,
      { stage: 'ready-for-engagement', label: `Final approval by ${approvedBy}`, enteredAt: now },
    ],
  };
  writeWorkflowState(next);
  return next;
}

/**
 * Called after ICA delivery assets are generated and sent.
 * Final stage — delivery-package-sent.
 */
export function recordDeliveryPackageSent(): PersistedWorkflowState {
  const prev = readWorkflowState();
  const now = new Date().toISOString();

  const next: PersistedWorkflowState = {
    ...prev,
    workflowStage: 'delivery-package-sent',
    approvalStageHistory: [
      ...prev.approvalStageHistory,
      { stage: 'delivery-package-sent', label: STAGE_LABELS['delivery-package-sent'], enteredAt: now },
    ],
  };
  writeWorkflowState(next);
  return next;
}

/**
 * Resets ALL workflow state so a completely fresh assessment can be run.
 * Preserves assessment count and time saved for analytics continuity.
 */
export function resetWorkflowState(): PersistedWorkflowState {
  const prev = readWorkflowState();
  const next: PersistedWorkflowState = {
    ...DEFAULT_STATE,
    assessmentCount: prev.assessmentCount,
    totalTimeSavedHours: prev.totalTimeSavedHours,
    history: prev.history,
  };
  writeWorkflowState(next);
  return next;
}

/**
 * Advances tasks stage to 'tasks-in-progress' on first task update (if still action-plan-accepted).
 */
export function maybeAdvanceToTasksInProgress(): PersistedWorkflowState {
  const prev = readWorkflowState();
  if (prev.workflowStage !== 'action-plan-accepted') return prev;
  const now = new Date().toISOString();
  const next: PersistedWorkflowState = {
    ...prev,
    workflowStage: 'tasks-in-progress',
    approvalStageHistory: [
      ...prev.approvalStageHistory,
      { stage: 'tasks-in-progress', label: STAGE_LABELS['tasks-in-progress'], enteredAt: now },
    ],
  };
  writeWorkflowState(next);
  return next;
}

/**
 * Replaces all task assignments for the current engagement.
 * Called once when the action plan is dispatched (after HITL).
 */
export function setTaskAssignments(assignments: TaskAssignment[]): PersistedWorkflowState {
  const prev = readWorkflowState();
  const next: PersistedWorkflowState = { ...prev, taskAssignments: assignments };
  writeWorkflowState(next);
  return next;
}

/**
 * Updates a single task assignment in-place.
 * Called by POST /api/task/update when an assignee acknowledges or completes.
 */
export function updateTaskAssignment(
  taskId: string,
  update: Partial<Pick<TaskAssignment, 'status' | 'acknowledgedAt' | 'completedAt' | 'completedBy' | 'completionNote'>>,
): PersistedWorkflowState {
  const prev = readWorkflowState();
  const taskAssignments = prev.taskAssignments.map((t) =>
    t.taskId === taskId ? { ...t, ...update } : t,
  );
  const next: PersistedWorkflowState = { ...prev, taskAssignments };
  writeWorkflowState(next);
  return next;
}

/**
 * Marks a task completed from an external acknowledgement channel (e.g. a Slack
 * "Mark Done" button click). Mirrors the completed-status path in
 * POST /api/task/update — same stage-advance + all-done semantics — so a task
 * can be closed out from Slack exactly as if the assignee had used the app UI.
 */
export function completeTaskExternally(
  taskId: string,
  completedBy: string,
): { found: boolean; allDone: boolean; pendingCount: number; state: PersistedWorkflowState } {
  const before = readWorkflowState();
  const found = before.taskAssignments.some((t) => t.taskId === taskId);
  if (!found) {
    return { found: false, allDone: false, pendingCount: 0, state: before };
  }

  const now = new Date().toISOString();
  maybeAdvanceToTasksInProgress();
  const state = updateTaskAssignment(taskId, {
    status: 'completed',
    completedBy,
    acknowledgedAt: now,
    completedAt: now,
  });

  const allDone =
    state.taskAssignments.length > 0 &&
    state.taskAssignments.every((t) => t.status === 'completed');
  const pendingCount = state.taskAssignments.filter(
    (t) => t.status === 'pending' || t.status === 'in-progress',
  ).length;

  if (allDone) recordAllTasksComplete();

  return { found: true, allDone, pendingCount, state };
}

/**
 * Stores the result of a HITL dispatch so the UI can show what actually happened.
 */
export function setDispatchResult(result: DispatchResult): PersistedWorkflowState {
  const prev = readWorkflowState();
  const next: PersistedWorkflowState = { ...prev, lastDispatchResult: result };
  writeWorkflowState(next);
  return next;
}

/**
 * Merges delivery assets into the lastDispatchResult.
 * Called by POST /api/task/update when all tasks are complete and ICA returns assets.
 */
export function setDeliveryAssets(
  assets: NonNullable<DispatchResult['deliveryAssets']>,
): PersistedWorkflowState {
  const prev = readWorkflowState();
  const existing = prev.lastDispatchResult ?? {
    dispatchedAt: new Date().toISOString(),
    packageWritten: false,
    langflow: 'skipped' as const,
    icaMcp: 'skipped' as const,
    emailsSent: 0,
    emailsAttempted: 0,
    emailErrors: [],
    contextStudio: 'skipped' as const,
  };
  const next: PersistedWorkflowState = {
    ...prev,
    lastDispatchResult: { ...existing, deliveryAssets: assets },
  };
  writeWorkflowState(next);
  return next;
}

/**
 * Persists a single on-demand ICA asset to workflow state.
 * Replaces any prior asset of the same assetType.
 */
export function persistOnDemandAsset(
  asset: import('@/types/domain').ICAGenerateResult,
): PersistedWorkflowState {
  const prev = readWorkflowState();
  const next: PersistedWorkflowState = {
    ...prev,
    onDemandAssets: { ...prev.onDemandAssets, [asset.assetType]: asset },
  };
  writeWorkflowState(next);
  return next;
}
