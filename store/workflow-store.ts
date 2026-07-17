/**
 * Client-side shared workflow store.
 * Single source of truth for the latest AI engagement analysis result.
 * Updated immediately on review success; all pages subscribe to it.
 */

import { create } from 'zustand';
import type { AIAnalysisResult, HITLRecord, PipelineStage, WorkflowEnvelope, WorkflowStage } from '@/types/domain';
import type { ReviewHistoryEntry } from '@/lib/workflow-state';

interface WorkflowState {
  latestReview: AIAnalysisResult | null;
  workflowStage: WorkflowStage;
  pipelineStage: PipelineStage;
  assessedAt: string | null;
  assessmentCount: number;
  totalTimeSavedHours: number;
  hasLiveReview: boolean;
  isCurrentSession: boolean;
  history: ReviewHistoryEntry[];

  /** Called when the assessment API returns successfully with the server's envelope */
  setReviewResult: (analysis: AIAnalysisResult, envelope: WorkflowEnvelope) => void;

  /** Record a HITL decision (accept or override) on the latest review */
  recordHITLDecision: (record: HITLRecord) => void;

  /** Advance to the next stage */
  advanceStage: (stage: WorkflowStage) => void;

  /** Reset everything so a fresh assessment can start */
  reset: () => void;

  /** Called when the dashboard API hydrates state from the server file */
  hydrateFromServer: (partial: {
    latestReview: AIAnalysisResult | null;
    workflowStage: WorkflowStage;
    pipelineStage: PipelineStage;
    assessedAt: string | null;
    assessmentCount: number;
    totalTimeSavedHours: number;
    hasLiveReview: boolean;
    isCurrentSession: boolean;
    history: ReviewHistoryEntry[];
  }) => void;
}

export const useWorkflowStore = create<WorkflowState>((set) => ({
  latestReview: null,
  workflowStage: 'draft',
  pipelineStage: 'pending',
  assessedAt: null,
  assessmentCount: 0,
  totalTimeSavedHours: 0,
  hasLiveReview: false,
  isCurrentSession: true,
  history: [],

  setReviewResult: (analysis, envelope) =>
    set({
      latestReview: analysis,
      workflowStage: envelope.workflowStage,
      pipelineStage: envelope.pipelineStage,
      assessedAt: envelope.assessedAt,
      assessmentCount: envelope.assessmentCount,
      totalTimeSavedHours: envelope.totalTimeSavedHours,
      hasLiveReview: true,
      isCurrentSession: envelope.isCurrentSession,
      history: envelope.history,
    }),

  recordHITLDecision: (record) =>
    set((prev) => ({
      latestReview: prev.latestReview
        ? { ...prev.latestReview, hitlRecord: record }
        : prev.latestReview,
    })),

  advanceStage: (stage) => set({ workflowStage: stage }),

  reset: () =>
    set((prev) => ({
      latestReview: null,
      workflowStage: 'draft',
      pipelineStage: 'pending',
      assessedAt: null,
      hasLiveReview: false,
      isCurrentSession: true,
      assessmentCount: prev.assessmentCount,
      totalTimeSavedHours: prev.totalTimeSavedHours,
      history: prev.history,
    })),

  hydrateFromServer: (partial) => set(partial),
}));
