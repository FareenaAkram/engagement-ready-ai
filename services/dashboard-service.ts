import fs from 'fs';
import path from 'path';
import {
  buildActionPlanFromPipeline,
  buildFallbackActionPlan,
  buildConsultingAssets,
  engagementReadinessAgents,
} from '@/services/agent-service';
import { dispatchOrchestrationPlan, type OrchestrateDispatchResult } from '@/services/orchestrate-service';
import { buildWatsonxPrompt, runWatsonxPipeline } from '@/services/watsonx-service';
import { mockDashboardData } from '@/data/mock-dashboard';
import { hasICAAgenticConfig, hasWatsonxConfig } from '@/lib/env';
import {
  WORKFLOW_STAGE_ORDER,
  normaliseReview,
  persistPipelineFailure,
  persistReviewResult,
  readWorkflowState,
  recordPipelineStage,
  startPipelineRun,
  type PersistedWorkflowState,
} from '@/lib/workflow-state';
import type {
  AIAnalysisResult,
  ApiResponse,
  LiveDashboardData,
  AssessmentReview,
  ReviewRequestInput,
  SettingsState,
  WorkflowEnvelope,
  WorkflowEvent,
} from '@/types/domain';

const defaultSettings: SettingsState = {
  engagementLabel: 'IBM Consulting',
  consultantName: 'Consultant',
  autoRefreshSeconds: 30,
  enableAnimations: true,
  theme: 'dark',
};

// ─── Dashboard ────────────────────────────────────────────────────────────────

export async function getDashboardData(): Promise<ApiResponse<LiveDashboardData>> {
  const state = readWorkflowState();
  const review = state.latestReview;

  // A session is current until the user explicitly resets or a new assessment is run
  const isCurrentSession = state.sessionId !== null;

  // When the workflow has been approved and delivery package sent, elevate the
  // displayed status to 'ready' so the dashboard badge reflects the outcome —
  // even if the underlying AI score was 'not-ready' (because tasks have since
  // been completed and the consultant gave final approval).
  const workflowElevatedStatus = ((): import('@/types/domain').ReadinessStatus => {
    if (!review) return mockDashboardData.engagement.status;
    const stage = state.workflowStage;
    if (stage === 'delivery-package-sent' || stage === 'ready-for-engagement') return 'ready';
    if (stage === 'ready-for-review' || stage === 'tasks-complete') return 'ready-with-conditions';
    return review.readinessDecision;
  })();

  const engagement = review && isCurrentSession
    ? {
        ...mockDashboardData.engagement,
        clientName: state.clientName ?? mockDashboardData.engagement.clientName,
        projectName: state.engagementName ?? mockDashboardData.engagement.projectName,
        leadConsultant: state.leadConsultant ?? mockDashboardData.engagement.leadConsultant,
        status: workflowElevatedStatus,
        readinessScore: review.readinessScore,
        assessmentCount: state.assessmentCount,
        lastAssessedAt: state.assessedAt,
      }
    : { ...mockDashboardData.engagement, assessmentCount: state.assessmentCount };

  const latestReview: AssessmentReview = review
    ? {
        id: `rev-live-${state.assessmentCount}`,
        engagementId: mockDashboardData.engagement.id,
        assessedAt: state.assessedAt ?? new Date().toISOString(),
        decision: review.readinessDecision,
        readinessScore: review.readinessScore,
        executiveSummary: review.executiveSummary,
        riskExplanation: review.riskExplanation,
        businessImpact: review.businessImpact,
        openActions: review.actionPlan.actions.filter((a) => a.status !== 'completed').length,
      }
    : mockDashboardData.latestReview;

  const workflow = buildLiveWorkflow(state);

  // Build live risks from AI critical issues when a review exists
  const risks = state.latestReview
    ? state.latestReview.criticalIssues.map((issue, i) => ({
        ...(mockDashboardData.risks[i] ?? mockDashboardData.risks[0]),
        id: `risk-live-${i}`,
        title: issue,
        status: 'open' as const,
      }))
    : mockDashboardData.risks;

  // Build live actions from AI action plan when a review exists
  const actions = state.latestReview
    ? state.latestReview.actionPlan.actions.map((a) => ({
        id: a.id,
        title: a.title,
        description: a.instructions,
        ownerRole: a.ownerRole,
        priority: a.priority,
        status: a.status as 'pending' | 'acknowledged' | 'in-progress' | 'completed',
        dueLabel: a.dueLabel,
      }))
    : mockDashboardData.actions;

  const assets = state.latestReview?.consultingAssets ?? mockDashboardData.assets;

  return {
    data: {
      ...mockDashboardData,
      engagement,
      latestReview,
      risks,
      actions,
      assets,
      workflow,
      workflowStage: state.workflowStage,
      assessedAt: state.assessedAt,
      assessmentCount: state.assessmentCount,
      totalTimeSavedHours: state.totalTimeSavedHours,
      hasLiveReview: state.latestReview !== null,
      history: state.history,
      pipelineStage: state.pipelineStage,
      pipelineStageHistory: state.pipelineStageHistory,
      approvalStageHistory: state.approvalStageHistory,
      pipelineError: state.pipelineError,
      isCurrentSession,
      taskAssignments: state.taskAssignments,
      lastDispatchResult: state.lastDispatchResult,
    },
    generatedAt: new Date().toISOString(),
  };
}

// ─── AI Analysis ─────────────────────────────────────────────────────────────

export async function getAIAnalysis(): Promise<ApiResponse<AIAnalysisResult | null> & { lastDispatchResult?: PersistedWorkflowState['lastDispatchResult'] }> {
  const state = readWorkflowState();

  if (!state.latestReview) {
    return { data: null, generatedAt: new Date().toISOString() };
  }

  return {
    data: state.latestReview,
    generatedAt: state.assessedAt ?? new Date().toISOString(),
    lastDispatchResult: state.lastDispatchResult,
  };
}

// ─── Assessment submission ────────────────────────────────────────────────────

export type SubmitReviewResult =
  | { data: AIAnalysisResult; generatedAt: string; workflow: WorkflowEnvelope }
  | { error: true; message: string; pipelineStage: 'failed' };

function toEnvelope(state: PersistedWorkflowState): WorkflowEnvelope {
  return {
    workflowStage: state.workflowStage,
    pipelineStage: state.pipelineStage,
    assessedAt: state.assessedAt,
    assessmentCount: state.assessmentCount,
    totalTimeSavedHours: state.totalTimeSavedHours,
    history: state.history,
    pipelineStageHistory: state.pipelineStageHistory,
    isCurrentSession: state.sessionId !== null,
  };
}

export async function submitReadinessReview(input: ReviewRequestInput): Promise<SubmitReviewResult> {
  startPipelineRun();
  recordPipelineStage('collecting-data', 'Collecting project context and discovery notes.');

  const prompt = buildWatsonxPrompt(input);

  try {
    const pipeline = await runWatsonxPipeline(input, (step) => {
      if (step === 1) {
        recordPipelineStage('running-watsonx-analysis', 'Discovery Consolidator Agent parsing project context.');
      } else if (step === 2) {
        recordPipelineStage('running-watsonx-analysis', 'Delivery Readiness Analyst Agent evaluating engagement readiness.');
      } else if (step === 3) {
        recordPipelineStage('building-recommendations', 'Readiness analysis complete — generating consulting assets.');
        recordPipelineStage('generating-action-plan', 'Consulting Asset Generator Agent building the action plan.');
      }
    });

    let result: AIAnalysisResult;

    if (pipeline.success && pipeline.readinessOutput && pipeline.orchestration) {
      // ── LIVE PATH: pipeline succeeded with real Granite output ─────────────
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
        criticalIssues: readinessOutput.criticalIssues ?? [],
        recommendations: readinessOutput.recommendations ?? [],
        missingInformation: pipeline.evidence?.openRisks ?? [],
        openQuestions: readinessOutput.openQuestions ?? [],
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
      // ── FALLBACK PATH: no credentials configured — deterministic fallback ──
      recordPipelineStage('running-watsonx-analysis', 'No live watsonx credentials configured — using deterministic fallback analysis.');
      recordPipelineStage('building-recommendations', 'Fallback recommendations ready.');
      recordPipelineStage('generating-action-plan', 'Building fallback action plan.');

      const contextLength = input.projectContext.length;
      const hasNotes = contextLength > 100;
      const syntheticScore = hasNotes ? 62 : 45;
      const decision = syntheticScore >= 75 ? 'ready' : syntheticScore >= 50 ? 'ready-with-conditions' : 'not-ready';

      const fallbackCriticalIssues = [
        'Authentication and identity requirements are not fully defined',
        'Data migration scope requires validation against legacy system',
        'Security and compliance stakeholder not yet engaged',
      ];

      const fallbackRecommendations = [
        'Schedule a focused architecture session to define authentication and IAM approach',
        'Conduct a data profiling workshop to map legacy system structure and estimate migration complexity',
        'Identify and engage the Security and Compliance lead for a dedicated requirements session',
        'Review and baseline all functional requirements before delivery kickoff',
      ];

      const fallbackAssets = buildConsultingAssets(
        'Engagement Ready AI recommends resolving critical requirements gaps before proceeding to delivery. Key authentication and data migration decisions are unresolved.',
        fallbackCriticalIssues,
        fallbackRecommendations,
        ['What is the preferred IAM/SSO solution?', 'What is the legacy system data schema?', 'What are the regulatory compliance requirements?'],
        ['Legacy system architecture documentation', 'Security compliance requirements', 'Stakeholder contact list'],
      );

      result = {
        executiveSummary:
          'Engagement Ready AI recommends resolving critical requirements gaps before proceeding to delivery. Key authentication and data migration decisions are unresolved.',
        readinessDecision: decision as 'ready' | 'ready-with-conditions' | 'not-ready',
        readinessScore: syntheticScore,
        confidenceScore: 87,
        riskExplanation:
          'The submitted project context indicates unresolved dependencies across authentication, data migration, and stakeholder coverage, increasing delivery risk if the engagement proceeds without resolving these gaps.',
        criticalIssues: fallbackCriticalIssues,
        recommendations: fallbackRecommendations,
        missingInformation: [
          'Legacy system architecture documentation',
          'Security compliance requirements',
          'Stakeholder contact list with decision-making authority',
        ],
        openQuestions: [
          'What is the preferred IAM/SSO solution?',
          'What is the legacy system data schema?',
          'What are the regulatory compliance requirements?',
        ],
        estimatedTimeSavedHours: hasNotes ? 12 : 8,
        businessImpact:
          'Resolving these gaps before delivery kickoff is projected to avoid 3–4 weeks of rework and reduce delivery risk significantly.',
        reasoningTrace: [
          { category: 'Business Objectives', status: 'present', evidence: 'Core banking modernisation goals were identified in the discovery context.' },
          { category: 'Functional Requirements', status: 'missing', evidence: 'Functional requirements were partially discussed but not baselined.' },
          { category: 'Non-Functional Requirements', status: 'missing', evidence: 'Performance, availability, and scalability targets are not documented.' },
          { category: 'Security & Compliance', status: 'blocking', evidence: 'Security and compliance team not represented — no security stakeholder in discovery.' },
          { category: 'Architecture', status: 'missing', evidence: 'Cloud provider and security architecture have not been decided.' },
          { category: 'Stakeholder Coverage', status: 'missing', evidence: 'Security Lead, Compliance Officer, and CFO sign-off are outstanding.' },
          { category: 'Integration Dependencies', status: 'missing', evidence: 'SAP ERP integration and third-party API specifications are not defined.' },
          { category: 'Data Migration', status: 'blocking', evidence: 'Legacy AS/400 schema documentation is incomplete — 2TB migration scope is unknown.' },
          { category: 'Risk & Assumptions', status: 'missing', evidence: 'Formal risk register and assumptions log have not been created.' },
          { category: 'Budget & Timeline', status: 'missing', evidence: 'CFO budget approval for cloud infrastructure is pending.' },
        ],
        missingStakeholders: [
          { role: 'Security Lead / CISO', reason: 'Security architecture and compliance requirements cannot proceed without a security decision-maker', impact: 'blocks-delivery' },
          { role: 'Compliance Officer', reason: 'GDPR and financial regulatory compliance must be confirmed by a designated compliance resource', impact: 'blocks-delivery' },
          { role: 'CFO / Budget Approver', reason: 'Cloud infrastructure budget approval is outstanding and blocks procurement decisions', impact: 'high' },
        ],
        missingWorkshops: [
          { title: 'Security & Compliance Workshop', reason: 'Define authentication approach, security architecture, and GDPR obligations', priority: 'critical' },
          { title: 'Data Migration Workshop', reason: 'Inventory legacy AS/400 schema, estimate data volume, and define migration strategy', priority: 'critical' },
          { title: 'Architecture Decision Workshop', reason: 'Confirm cloud provider, integration patterns, and technical approach', priority: 'high' },
        ],
        missingRequirements: [
          { category: 'Security Requirements', description: 'Authentication, authorisation, MFA vendor, and audit logging requirements are undefined', impact: 'blocks-delivery' },
          { category: 'Non-Functional Requirements', description: 'Performance benchmarks, availability SLAs, and disaster recovery targets not specified', impact: 'high' },
          { category: 'Integration Requirements', description: 'SAP ERP integration spec, third-party API contracts, and ISO 20022 compliance details missing', impact: 'high' },
        ],
        watsonxPrompt: prompt,
        agentTrace: engagementReadinessAgents,
        pipelineSteps: pipeline.steps,
        actionPlan: buildFallbackActionPlan(),
        consultingAssets: fallbackAssets,
        integrationStatus: {
          watsonx: hasWatsonxConfig() ? 'configured' : 'mock',
          orchestrate: hasICAAgenticConfig() ? 'live' : 'mock',
        },
      };
    }

    // Dispatch to Orchestrate
    recordPipelineStage('dispatching-workflow', 'Dispatching action plan to watsonx Orchestrate.');

    // Build compatible orchestration plan for dispatch
    const orchPlan = {
      workflowId: result.actionPlan.workflowId,
      summary: result.actionPlan.summary,
      tasks: result.actionPlan.actions.map((a) => ({
        id: a.id,
        title: a.title,
        ownerRole: a.ownerRole as 'maintenance',
        status: a.status as 'pending',
        dueLabel: a.dueLabel,
        instructions: a.instructions,
        priority: a.priority,
      })),
      nextApprover: result.actionPlan.nextReviewer,
    };

    const orchResult: OrchestrateDispatchResult = await dispatchOrchestrationPlan(orchPlan);

    result = {
      ...result,
      integrationStatus: {
        ...result.integrationStatus,
        orchestrate: orchResult.live && orchResult.accepted ? 'live' : orchResult.live ? 'configured' : 'mock',
      },
    };

    persistReviewResult(result, {
      engagementName: input.engagementName,
      clientName: input.clientName,
      leadConsultant: input.leadConsultant,
    });
    const finalState = recordPipelineStage(
      'completed',
      `Assessment complete — ${orchResult.taskCount} action(s) created${orchResult.accepted ? ' and accepted by Orchestrate' : ''}.`,
    );

    // NOTE: Slack and email notifications are intentionally NOT sent here.
    // Per the required flow, notifications fire AFTER the consultant makes
    // their HITL decision (Accept / Override) — not immediately after the
    // watsonx assessment completes. This prevents premature alerts being
    // sent before the human has reviewed the AI findings.
    // Notifications are dispatched in app/api/hitl-decision/route.ts.

    return {
      data: normaliseReview(result),
      generatedAt: new Date().toISOString(),
      workflow: toEnvelope(finalState),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown pipeline error.';
    persistPipelineFailure(message);
    return { error: true, message, pipelineStage: 'failed' };
  }
}

// ─── Settings ────────────────────────────────────────────────────────────────

const SETTINGS_FILE = path.join(process.cwd(), '.next', 'tmp', 'settings.json');

function readSettingsFile(): SettingsState {
  try {
    const raw = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return { ...defaultSettings, ...(JSON.parse(raw) as Partial<SettingsState>) };
  } catch {
    return { ...defaultSettings };
  }
}

export async function getSettings(): Promise<ApiResponse<SettingsState>> {
  return {
    data: readSettingsFile(),
    generatedAt: new Date().toISOString(),
  };
}

export async function saveSettings(input: Record<string, unknown>): Promise<ApiResponse<SettingsState>> {
  const current = readSettingsFile();
  const updated: SettingsState = {
    engagementLabel: typeof input.engagementLabel === 'string' ? input.engagementLabel : current.engagementLabel,
    consultantName: typeof input.consultantName === 'string' ? input.consultantName : current.consultantName,
    autoRefreshSeconds: typeof input.autoRefreshSeconds === 'number' ? input.autoRefreshSeconds : current.autoRefreshSeconds,
    enableAnimations: typeof input.enableAnimations === 'boolean' ? input.enableAnimations : current.enableAnimations,
    theme: 'dark',
  };
  try {
    const dir = path.dirname(SETTINGS_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_FILE, JSON.stringify(updated, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[dashboard-service] saveSettings write failed:', err);
  }
  return {
    data: updated,
    generatedAt: new Date().toISOString(),
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildLiveWorkflow(state: PersistedWorkflowState): WorkflowEvent[] {
  const currentIndex = WORKFLOW_STAGE_ORDER.indexOf(state.workflowStage);

  return mockDashboardData.workflow.map((event, index) => {
    const eventStage = WORKFLOW_STAGE_ORDER[index];
    const historyEntry = state.approvalStageHistory.find((h) => h.stage === eventStage);
    const eventState: WorkflowEvent['state'] =
      index < currentIndex ? 'complete' : index === currentIndex ? 'current' : 'upcoming';

    return {
      ...event,
      stage: eventStage,
      state: eventState,
      timestamp: historyEntry?.enteredAt ?? event.timestamp,
    };
  });
}
