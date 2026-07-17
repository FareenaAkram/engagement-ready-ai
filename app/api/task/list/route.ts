/**
 * GET /api/task/list
 *
 * Returns all current task assignments with their status.
 * Called by ICA Agentic App to check which tasks are still pending.
 * Also displayed in your dashboard to show live task progress.
 *
 * Response:
 *   {
 *     tasks: TaskAssignment[]
 *     total: number
 *     pending: number
 *     acknowledged: number
 *     completed: number
 *     allDone: boolean
 *   }
 */

import { NextResponse } from 'next/server';
import { readWorkflowState } from '@/lib/workflow-state';

export const dynamic = 'force-dynamic';

export async function GET() {
  const state = readWorkflowState();
  const tasks = state.taskAssignments;

  const pending = tasks.filter((t) => t.status === 'pending').length;
  const acknowledged = tasks.filter((t) => t.status === 'acknowledged' || t.status === 'in-progress').length;
  const completed = tasks.filter((t) => t.status === 'completed').length;

  return NextResponse.json({
    tasks,
    total: tasks.length,
    pending,
    acknowledged,
    completed,
    allDone: tasks.length > 0 && completed === tasks.length,
    engagementStage: state.workflowStage,
  });
}
