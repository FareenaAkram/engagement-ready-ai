import { NextResponse } from 'next/server';
import { readWorkflowState } from '@/lib/workflow-state';

export const dynamic = 'force-dynamic';

/**
 * Returns the raw persisted workflow state.
 * Used by pages that need to hydrate the Zustand client store on mount.
 */
export async function GET() {
  const state = readWorkflowState();
  return NextResponse.json(state);
}
