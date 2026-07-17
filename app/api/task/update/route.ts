/**
 * POST /api/task/update
 *
 * Called when an assignee marks their task complete (via the app UI or ICA callback).
 *
 * When all tasks are done (allDone=true) this route:
 *   1. Advances the workflow stage to 'ready-for-review'
 *   2. Returns allDone=true so the UI can prompt for final approval
 *
 * Asset generation (Phase 2) is triggered ONLY by POST /api/final-approval
 * after the lead consultant explicitly approves.
 *
 * Body:
 *   { taskId, status, completedBy?, completionNote?, engagementId? }
 *
 * Returns:
 *   { ok: true, taskId, status, allDone: boolean, pendingCount: number }
 */

import { NextResponse } from 'next/server';
import {
  updateTaskAssignment,
  maybeAdvanceToTasksInProgress,
  recordAllTasksComplete,
} from '@/lib/workflow-state';

export const dynamic = 'force-dynamic';

interface TaskUpdateBody {
  taskId: string;
  status: 'acknowledged' | 'in-progress' | 'completed';
  completedBy?: string;
  completionNote?: string;
  engagementId?: string;
}

// ─── Route handler ────────────────────────────────────────────────────────────

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as TaskUpdateBody;
    const { taskId, status, completedBy, completionNote } = body;

    if (!taskId || !status) {
      return NextResponse.json(
        { error: true, message: 'taskId and status are required' },
        { status: 400 },
      );
    }

    const now = new Date().toISOString();

    const update: Parameters<typeof updateTaskAssignment>[1] = {
      status,
      completedBy: completedBy ?? null,
      completionNote: completionNote ?? null,
    };

    if (status === 'acknowledged') {
      update.acknowledgedAt = now;
    }
    if (status === 'completed') {
      update.acknowledgedAt ??= now;
      update.completedAt = now;
    }

    // Advance stage: action-plan-accepted → tasks-in-progress on first update
    maybeAdvanceToTasksInProgress();

    const newState = updateTaskAssignment(taskId, update);

    const allDone =
      newState.taskAssignments.length > 0 &&
      newState.taskAssignments.every((t) => t.status === 'completed');

    const pendingCount = newState.taskAssignments.filter(
      (t) => t.status === 'pending' || t.status === 'in-progress',
    ).length;

    console.log(
      `[task/update] taskId=${taskId} → ${status}` +
        (completedBy ? ` by ${completedBy}` : '') +
        ` | pending remaining: ${pendingCount}`,
    );

    // ── When all tasks done: advance to ready-for-review ───────────────────
    // Asset generation (Phase 2) is NOT triggered here.
    // It is triggered explicitly by POST /api/final-approval after consultant approval.
    if (allDone) {
      console.log('[task/update] ALL TASKS COMPLETE — advancing to ready-for-review');
      recordAllTasksComplete();
    }

    return NextResponse.json({
      ok: true,
      taskId,
      status,
      allDone,
      pendingCount,
      assignments: newState.taskAssignments,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: true, message }, { status: 500 });
  }
}
