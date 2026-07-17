// ─── Engagement-domain primitives ────────────────────────────────────────────

export type ReadinessStatus = 'ready' | 'ready-with-conditions' | 'not-ready';
export type Severity = 'critical' | 'high' | 'medium' | 'low';
export type ActionStatus = 'pending' | 'acknowledged' | 'in-progress' | 'completed';
export type ActionOwnerRole = 'consultant' | 'architect' | 'partner' | 'client';

/**
 * A per-task assignment record — one per action in the action plan.
 * Written when the HITL fires; updated when the assignee acknowledges via ICA.
 */
export interface TaskAssignment {
  taskId: string;
  title: string;
  ownerRole: ActionOwnerRole;
  priority: Severity;
  dueLabel: string;
  instructions: string;
  engagementId: string;
  /** Real person assigned — populated from StakeholderDirectory at HITL time */
  assigneeName: string;
  assigneeEmail: string;
  assigneeSlack?: string;
  status: ActionStatus;
  assignedAt: string;
  acknowledgedAt: string | null;
  completedAt: string | null;
  completedBy: string | null;
  completionNote: string | null;
}

/**
 * Evidence document types the consultant can label when pasting context.
 * Passed to the Discovery Consolidator so it knows what type of document it is parsing.
 */
export type EvidenceType =
  | 'workshop-notes'
  | 'meeting-minutes'
  | 'meeting-transcript'
  | 'architecture-notes'
  | 'solution-design'
  | 'brd'
  | 'fsd'
  | 'business-requirements'
  | 'functional-requirements'
  | 'proposal'
  | 'scope-document'
  | 'raid-log'
  | 'email'
  | 'process-flow'
  | 'decision-log'
  | 'video-transcript';

/**
 * One item in the explainable AI reasoning trace.
 * Powers the ✓ / ⚠ / ✗ evidence-backed explanation UI.
 */
export interface ReasoningTraceItem {
  category: string;
  status: 'present' | 'missing' | 'blocking';
  evidence: string;
}

/**
 * A missing stakeholder identified by the readiness analyst.
 */
export interface MissingStakeholder {
  role: string;
  reason: string;
  impact: 'blocks-delivery' | 'high' | 'medium';
}

/**
 * A missing workshop identified by the readiness analyst.
 */
export interface MissingWorkshop {
  title: string;
  reason: string;
  priority: 'critical' | 'high' | 'medium';
}

/**
 * A missing requirement category identified by the readiness analyst.
 */
export interface MissingRequirement {
  category: string;
  description: string;
  impact: 'blocks-delivery' | 'high' | 'medium';
}

/**
 * ICA on-demand asset generation request.
 */
export type ICAAssetType =
  | 'executive-summary'
  | 'client-status-report'
  | 'proposal-inputs'
  | 'business-requirements'
  | 'functional-requirements'
  | 'user-stories'
  | 'epics'
  | 'acceptance-criteria'
  | 'raid-log'
  | 'assumptions'
  | 'decision-log'
  | 'follow-up-email'
  | 'client-email'
  | 'internal-update'
  | 'steering-committee-summary'
  | 'next-workshop-agenda'
  | 'workshop-minutes'
  | 'action-tracker';

export interface ICAGenerateRequest {
  assetType: ICAAssetType;
  analysisSnapshot: {
    executiveSummary: string;
    readinessDecision: ReadinessStatus;
    readinessScore: number;
    confidenceScore: number;
    criticalIssues: string[];
    recommendations: string[];
    openQuestions: string[];
    missingInformation: string[];
    businessImpact: string;
    riskExplanation: string;
    missingStakeholders?: MissingStakeholder[];
    missingWorkshops?: MissingWorkshop[];
    missingRequirements?: MissingRequirement[];
  };
}

export interface ICAGenerateResult {
  assetType: ICAAssetType;
  title: string;
  content: string;
  generatedAt: string;
  model: string;
}

/**
 * A simulator condition representing a gap that, when resolved, improves readiness.
 */
export interface SimulatorCondition {
  id: string;
  label: string;
  scoreImpact: number;
  category: 'stakeholder' | 'workshop' | 'requirement' | 'risk' | 'documentation';
  resolved: boolean;
}

export type WorkflowStage =
  | 'draft'
  | 'assessment-complete'
  | 'ai-review-complete'
  | 'action-plan-accepted'
  | 'tasks-in-progress'
  | 'tasks-complete'
  | 'ready-for-review'
  | 'ready-for-engagement'
  | 'delivery-package-sent';

/** Real-time execution lifecycle of a single watsonx.ai engagement analysis run. */
export type PipelineStage =
  | 'pending'
  | 'collecting-data'
  | 'running-watsonx-analysis'
  | 'building-recommendations'
  | 'generating-action-plan'
  | 'dispatching-workflow'
  | 'completed'
  | 'failed';

/** One real, timestamped transition — used for both pipeline execution and approval-chain audit trails. */
export interface StageHistoryEntry {
  stage: string;
  label: string;
  enteredAt: string;
}

// ─── Engagement entities ──────────────────────────────────────────────────────

export interface Engagement {
  id: string;
  clientName: string;
  projectName: string;
  leadConsultant: string;
  status: ReadinessStatus;
  readinessScore: number;
  estimatedTimeSavedHours: number;
  assessmentCount: number;
  lastAssessedAt: string | null;
}

export interface EngagementRisk {
  id: string;
  title: string;
  summary: string;
  severity: Severity;
  ownerRole: ActionOwnerRole;
  category: 'technical' | 'business' | 'scope' | 'stakeholder';
  status: 'open' | 'monitoring' | 'resolved';
  impact: string;
  recommendedAction: string;
}

export interface ConsultingAction {
  id: string;
  title: string;
  description: string;
  ownerRole: ActionOwnerRole;
  priority: Severity;
  status: ActionStatus;
  dueLabel: string;
}

export interface ConsultingAsset {
  id: string;
  type:
    | 'executive-summary'
    | 'business-requirements'
    | 'functional-requirements'
    | 'non-functional-requirements'
    | 'user-stories'
    | 'risks'
    | 'assumptions'
    | 'open-questions'
    | 'proposal-inputs'
    | 'next-agenda';
  title: string;
  content: string;
  status: 'draft' | 'reviewed' | 'approved';
}

export interface AssessmentReview {
  id: string;
  engagementId: string;
  assessedAt: string;
  decision: ReadinessStatus;
  readinessScore: number;
  executiveSummary: string;
  riskExplanation: string;
  businessImpact: string;
  openActions: number;
}

export interface WorkflowEvent {
  id: string;
  stage: WorkflowStage;
  title: string;
  description: string;
  timestamp: string;
  state: 'complete' | 'current' | 'upcoming';
}

export interface AnalyticsSnapshot {
  assessmentsCompleted: number;
  averageReadinessScore: number;
  timeSavedHours: number;
  readinessTrend: Array<{ label: string; value: number }>;
  riskTrend: Array<{ label: string; value: number }>;
}

// ─── HITL — Human-in-the-loop decision ───────────────────────────────────────

export type ConsultantDecision = 'accepted' | 'overridden';

export interface HITLRecord {
  aiRecommendation: ReadinessStatus;
  aiScore: number;
  consultantDecision: ConsultantDecision;
  consultantChoice: ReadinessStatus;
  justification: string | null;
  decidedAt: string;
}

// ─── Dashboard shape ──────────────────────────────────────────────────────────

export interface DashboardData {
  engagement: Engagement;
  risks: EngagementRisk[];
  actions: ConsultingAction[];
  assets: ConsultingAsset[];
  latestReview: AssessmentReview;
  workflow: WorkflowEvent[];
  analytics: AnalyticsSnapshot;
  projectNotes: ProjectNote[];
}

export interface ProjectNote {
  id: string;
  author: string;
  timestamp: string;
  noteText: string;
}

// ─── API contracts ────────────────────────────────────────────────────────────

export interface ApiResponse<T> {
  data: T;
  generatedAt: string;
}

export interface ReviewRequestInput {
  /** Combined discovery/workshop/meeting notes pasted by consultant */
  projectContext: string;
  /** Optional consultant comment before running analysis */
  consultantComment?: string;
  /** Optional evidence type label for context-aware parsing */
  evidenceType?: EvidenceType;
  /** Real engagement identity — used everywhere instead of mock placeholder data (Slack, email, ICA dispatch) */
  engagementName?: string;
  clientName?: string;
  leadConsultant?: string;
}

export interface AgentDefinition {
  id: string;
  name: string;
  role: string;
  objective: string;
  inputs: string[];
  outputs: string[];
}

export interface WatsonxPromptArtifact {
  systemPrompt: string;
  userPrompt: string;
  model: string;
  reasoningStyle: string;
}

export interface ConsultingActionTask {
  id: string;
  title: string;
  ownerRole: ActionOwnerRole;
  status: 'pending' | 'in-progress' | 'completed';
  dueLabel: string;
  instructions: string;
  priority: Severity;
}

export interface EngagementActionPlan {
  workflowId: string;
  summary: string;
  nextReviewer: string;
  actions: ConsultingActionTask[];
}

export interface AIAnalysisResult {
  executiveSummary: string;
  /** Overall delivery readiness verdict */
  readinessDecision: ReadinessStatus;
  readinessScore: number;
  confidenceScore: number;
  riskExplanation: string;
  criticalIssues: string[];
  recommendations: string[];
  missingInformation: string[];
  openQuestions: string[];
  estimatedTimeSavedHours: number;
  businessImpact: string;
  /**
   * Structured explainable AI reasoning trace.
   * Each item shows whether a delivery readiness dimension is present, missing, or blocking.
   * Powers the ✓ / ⚠ / ✗ evidence panel on the AI Findings page.
   */
  reasoningTrace: ReasoningTraceItem[];
  /** Stakeholders identified as missing from the discovery — with delivery impact */
  missingStakeholders: MissingStakeholder[];
  /** Workshops the readiness analyst recommends conducting */
  missingWorkshops: MissingWorkshop[];
  /** Requirement categories that are absent or insufficiently defined */
  missingRequirements: MissingRequirement[];
  watsonxPrompt: WatsonxPromptArtifact;
  agentTrace: AgentDefinition[];
  /** Real per-agent execution results from the watsonx pipeline */
  pipelineSteps: import('@/types/watsonx').AgentStepResult<unknown>[];
  actionPlan: EngagementActionPlan;
  /** Generated consulting assets */
  consultingAssets: ConsultingAsset[];
  integrationStatus: {
    watsonx: 'mock' | 'configured' | 'live';
    orchestrate: 'mock' | 'configured' | 'live';
  };
  /** HITL record — populated only after the consultant makes a decision */
  hitlRecord?: HITLRecord;
}

export interface SettingsState {
  engagementLabel: string;
  consultantName: string;
  autoRefreshSeconds: number;
  enableAnimations: boolean;
  theme: 'dark';
}

/**
 * A real named person assigned to a role.
 * Stored in .next/tmp/stakeholders.json and editable from the app UI.
 * Used to stamp every TaskAssignment with a real name + email so ICA knows who to notify.
 */
export interface StakeholderContact {
  role: ActionOwnerRole;
  name: string;
  email: string;
  /** Optional: Slack user ID e.g. @james.wilson for direct Slack DMs */
  slackHandle?: string;
}

export interface StakeholderDirectory {
  consultant: StakeholderContact;
  architect: StakeholderContact;
  partner: StakeholderContact;
  client: StakeholderContact;
  updatedAt: string;
}

/** Shape returned by all GET API routes that are workflow-aware */
export interface LiveDashboardData extends DashboardData {
  workflowStage: WorkflowStage;
  assessedAt: string | null;
  assessmentCount: number;
  totalTimeSavedHours: number;
  hasLiveReview: boolean;
  history: import('@/lib/workflow-state').ReviewHistoryEntry[];
  pipelineStage: PipelineStage;
  pipelineStageHistory: StageHistoryEntry[];
  approvalStageHistory: StageHistoryEntry[];
  pipelineError: string | null;
  isCurrentSession: boolean;
  /** Live task assignments — populated after HITL dispatch */
  taskAssignments: TaskAssignment[];
  /** Result of the last HITL dispatch, including ICA delivery assets once generated */
  lastDispatchResult: import('@/lib/workflow-state').DispatchResult | null;
}

export interface WorkflowEnvelope {
  workflowStage: WorkflowStage;
  pipelineStage: PipelineStage;
  assessedAt: string | null;
  assessmentCount: number;
  totalTimeSavedHours: number;
  history: import('@/lib/workflow-state').ReviewHistoryEntry[];
  pipelineStageHistory: StageHistoryEntry[];
  isCurrentSession: boolean;
}
