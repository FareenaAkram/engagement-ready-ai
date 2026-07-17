import { NextResponse } from 'next/server';
import { resetWorkflowState } from '@/lib/workflow-state';

export const dynamic = 'force-dynamic';

/**
 * POST /api/reset-workflow
 * Clears the persisted review so a fresh readiness review can be run.
 * Preserves cumulative analytics counts.
 *
 * Destructive — requires an explicit { confirm: true } body so it can never
 * fire from a bare/accidental POST (a stray prefetch, a misconfigured
 * script, etc.), on top of the passcode gate in middleware.ts.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { confirm?: boolean };
  if (body.confirm !== true) {
    return NextResponse.json(
      { error: true, message: 'Resetting the workflow requires { "confirm": true } in the request body.' },
      { status: 400 },
    );
  }
  const next = resetWorkflowState();
  return NextResponse.json({ ok: true, workflowStage: next.workflowStage });
}
