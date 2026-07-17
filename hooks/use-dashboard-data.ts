'use client';

import { useQuery } from '@tanstack/react-query';
import type { AIAnalysisResult, ApiResponse, LiveDashboardData } from '@/types/domain';
import type { DispatchResult } from '@/lib/workflow-state';

async function fetchLiveDashboard(): Promise<ApiResponse<LiveDashboardData>> {
  const response = await fetch('/api/dashboard', { cache: 'no-store' });

  if (!response.ok) {
    throw new Error('Failed to load dashboard data.');
  }

  return response.json();
}

/** Single shared query for the workflow-aware dashboard payload — every page reads this same cache entry. */
export function useLiveDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: fetchLiveDashboard,
  });
}

async function fetchLiveAIAnalysis(): Promise<ApiResponse<AIAnalysisResult | null> & { lastDispatchResult?: DispatchResult | null }> {
  const response = await fetch('/api/ai-analysis', { cache: 'no-store' });

  if (!response.ok) {
    throw new Error('Failed to load AI analysis.');
  }

  return response.json();
}

/** The full AIAnalysisResult (action plan, pipeline steps, etc.) — null until an assessment has run. */
export function useLiveAIAnalysis() {
  return useQuery({
    queryKey: ['ai-analysis'],
    queryFn: fetchLiveAIAnalysis,
  });
}
