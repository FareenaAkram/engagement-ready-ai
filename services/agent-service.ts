/**
 * Agent service — generates action plans from REAL pipeline output.
 * All actions come from watsonx Granite output, not hardcoded.
 */

import type { AgentDefinition, ConsultingAction, ConsultingAsset, EngagementActionPlan } from '@/types/domain';
import type { OrchestrationOutput, RiskAnalysis } from '@/types/watsonx';

export const engagementReadinessAgents: AgentDefinition[] = [
  {
    id: 'agent-discovery-consolidator',
    name: 'Discovery Consolidator Agent',
    role: 'consulting analyst',
    objective: 'Parse raw discovery notes, workshop outputs, and meeting summaries to extract structured requirements, stakeholder context, and open questions.',
    inputs: ['Workshop notes', 'Meeting summaries', 'Discovery notes', 'Requirements', 'Architecture notes', 'Emails'],
    outputs: ['Business objectives', 'Functional requirements', 'Non-functional requirements', 'Missing information', 'Conflicting signals'],
  },
  {
    id: 'agent-readiness-analyst',
    name: 'Delivery Readiness Analyst Agent',
    role: 'watsonx.ai reasoning agent',
    objective: 'Evaluate structured discovery evidence and determine whether an engagement is ready to proceed to delivery, with confidence score and risk breakdown.',
    inputs: ['Structured discovery evidence', 'Business objectives', 'Requirements gaps', 'Stakeholder coverage', 'Technical risks'],
    outputs: ['Readiness decision', 'Readiness score', 'Confidence score', 'Critical issues', 'Recommendations', 'Open questions'],
  },
  {
    id: 'agent-asset-generator',
    name: 'Consulting Asset Generator Agent',
    role: 'IBM Consulting Advantage specialist',
    objective: 'Generate IBM Consulting Advantage assets — executive summaries, requirements, user stories, risks, and next workshop agenda — from the readiness analysis.',
    inputs: ['Readiness decision', 'Critical issues', 'Recommendations', 'Business objectives', 'Requirements'],
    outputs: ['Executive summary', 'Business requirements', 'Functional requirements', 'User stories', 'Risk register', 'Action items', 'Next workshop agenda'],
  },
];

/**
 * Build an engagement action plan from REAL watsonx Granite output.
 */
export function buildActionPlanFromPipeline(orchOutput: OrchestrationOutput): EngagementActionPlan {
  const actions = orchOutput.tasks.map((t) => ({
    id: t.id,
    title: t.title,
    ownerRole: t.ownerRole as ConsultingAction['ownerRole'],
    status: 'pending' as const,
    dueLabel: t.dueLabel,
    instructions: t.instructions,
    priority: t.priority,
  }));

  return {
    workflowId: orchOutput.workflowId,
    summary: orchOutput.summary,
    actions,
    nextReviewer: orchOutput.nextApprover,
  };
}

/**
 * Fallback action plan — used when the pipeline fails or credentials are missing.
 */
export function buildFallbackActionPlan(risk?: RiskAnalysis): EngagementActionPlan {
  if (risk && risk.recommendations.length > 0) {
    const actions = risk.recommendations.slice(0, 3).map((rec, i) => ({
      id: `action-0${i + 1}`,
      title: rec.slice(0, 80),
      ownerRole: (['consultant', 'architect', 'partner'] as const)[i] ?? 'consultant',
      status: 'pending' as const,
      dueLabel: 'Before delivery kickoff',
      instructions: rec,
      priority: (i === 0 ? 'critical' : 'high') as 'critical' | 'high',
    }));

    return {
      workflowId: `plan-fallback-${Date.now()}`,
      summary: `Action plan derived from readiness analysis: ${risk.recommendations.length} follow-up items identified.`,
      actions,
      nextReviewer: 'Lead Consultant',
    };
  }

  return {
    workflowId: 'plan-static-fallback',
    summary: 'Static fallback plan — no AI output available. Manual review required.',
    actions: [
      {
        id: 'action-01',
        title: 'Review and complete requirements documentation',
        ownerRole: 'consultant',
        status: 'pending',
        dueLabel: 'Before next workshop',
        instructions: 'Review all discovery notes and ensure requirements are fully captured.',
        priority: 'high',
      },
      {
        id: 'action-02',
        title: 'Validate technical architecture approach',
        ownerRole: 'architect',
        status: 'pending',
        dueLabel: 'Within 5 business days',
        instructions: 'Confirm technical architecture aligns with client requirements and IBM standards.',
        priority: 'high',
      },
    ],
    nextReviewer: 'Lead Consultant',
  };
}

/**
 * Generate consulting assets from the readiness analysis.
 * Returns draft assets that the consultant can review and edit.
 */
export function buildConsultingAssets(
  executiveSummary: string,
  criticalIssues: string[],
  recommendations: string[],
  openQuestions: string[],
  missingInfo: string[],
): ConsultingAsset[] {
  return [
    {
      id: 'asset-exec-summary',
      type: 'executive-summary',
      title: 'Executive Summary',
      content: executiveSummary,
      status: 'draft',
    },
    {
      id: 'asset-risks',
      type: 'risks',
      title: 'Risk Register',
      content: criticalIssues.map((issue, i) => `RISK-${String(i + 1).padStart(2, '0')}: ${issue}`).join('\n'),
      status: 'draft',
    },
    {
      id: 'asset-recommendations',
      type: 'proposal-inputs',
      title: 'Recommendations & Next Steps',
      content: recommendations.map((rec, i) => `${i + 1}. ${rec}`).join('\n'),
      status: 'draft',
    },
    {
      id: 'asset-open-questions',
      type: 'open-questions',
      title: 'Open Questions',
      content: openQuestions.map((q, i) => `Q${i + 1}: ${q}`).join('\n'),
      status: 'draft',
    },
    {
      id: 'asset-missing-info',
      type: 'assumptions',
      title: 'Missing Information & Assumptions',
      content: missingInfo.map((m, i) => `${i + 1}. ${m}`).join('\n'),
      status: 'draft',
    },
    {
      id: 'asset-next-agenda',
      type: 'next-agenda',
      title: 'Next Workshop Agenda',
      content: [
        '1. Review and validate AI-identified risks with client stakeholders',
        '2. Resolve open authentication and integration questions',
        '3. Confirm data migration scope and legacy system inventory',
        '4. Baseline functional requirements',
        '5. Identify missing stakeholders and schedule follow-ups',
      ].join('\n'),
      status: 'draft',
    },
  ];
}
