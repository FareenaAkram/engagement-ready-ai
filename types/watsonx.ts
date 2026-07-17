/**
 * Types specific to the watsonx 3-agent pipeline.
 * Kept separate from domain.ts to avoid polluting the main domain model.
 */

export interface AgentStepResult<TOutput> {
  agentId: string;
  agentName: string;
  role: string;
  startedAt: string;
  completedAt: string;
  durationMs: number;
  tokenCount: number;
  rawOutput: string;
  output: TOutput;
  status: 'success' | 'fallback';
}

export interface EvidencePackage {
  lineContext: string;
  activeBlockers: string[];
  resolvedItems: string[];
  openRisks: string[];
  conflictingSignals: string[];
}

export interface ReasoningTraceItem {
  category: string;
  status: 'present' | 'missing' | 'blocking';
  evidence: string;
}

export interface MissingStakeholder {
  role: string;
  reason: string;
  impact: 'blocks-delivery' | 'high' | 'medium';
}

export interface MissingWorkshop {
  title: string;
  reason: string;
  priority: 'critical' | 'high' | 'medium';
}

export interface MissingRequirement {
  category: string;
  description: string;
  impact: 'blocks-delivery' | 'high' | 'medium';
}

export interface RiskAnalysis {
  executiveSummary: string;
  readinessDecision: 'ready' | 'ready-with-conditions' | 'not-ready';
  confidenceScore: number;
  riskExplanation: string;
  criticalIssues: string[];
  recommendations: string[];
  openQuestions: string[];
  estimatedTimeSavedHours: number;
  businessImpact: string;
}

export interface OrchestrationOutput {
  workflowId: string;
  summary: string;
  nextApprover: string;
  tasks: Array<{
    id: string;
    title: string;
    ownerRole: 'consultant' | 'architect' | 'partner' | 'client' | 'maintenance' | 'qa' | 'supervisor';
    instructions: string;
    dueLabel: string;
    priority: 'critical' | 'high' | 'medium';
  }>;
}

export interface PipelineResult {
  success: boolean;
  fallback: boolean;
  steps: AgentStepResult<unknown>[];
  evidence?: EvidencePackage;
  risk?: RiskAnalysis;
  orchestration?: OrchestrationOutput;
  /** Raw readiness analysis output for direct use by the service layer */
  readinessOutput?: {
    executiveSummary: string;
    readinessDecision: 'ready' | 'ready-with-conditions' | 'not-ready';
    readinessScore: number;
    confidenceScore: number;
    riskExplanation: string;
    criticalIssues: string[];
    recommendations: string[];
    openQuestions: string[];
    estimatedTimeSavedHours: number;
    businessImpact: string;
    reasoningTrace: ReasoningTraceItem[];
    missingStakeholders: MissingStakeholder[];
    missingWorkshops: MissingWorkshop[];
    missingRequirements: MissingRequirement[];
  };
}
