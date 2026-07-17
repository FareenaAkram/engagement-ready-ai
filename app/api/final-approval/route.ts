/**
 * POST /api/final-approval
 *
 * Called when the lead consultant clicks "Approve for Engagement" after all tasks are complete.
 *
 * Previously this route made a self-referential fetch to /api/ica-agent/generate-deliverables
 * which broke under ngrok/tunnel URLs because APP_BASE_URL pointed to the public ngrok address
 * and the server tried to call itself via the internet instead of loopback.
 *
 * Fixed: import and call the workflow-state + ICA service directly — no HTTP self-call.
 *
 * Flow:
 *   1. Validates all tasks are done
 *   2. Records final approval (ready-for-engagement)
 *   3. ICA Agent API generates 5 delivery artefacts via watsonx
 *   4. ICA emails each asset to the right person, posts Slack, creates Jira Epic
 *   5. Advances workflow to delivery-package-sent
 *
 * Body:  { approvedBy?: string }
 * Returns: { ok: boolean, workflowStage: string, assetsGenerated: boolean }
 */

import { NextRequest } from 'next/server';
import { POST as generateDeliverablesHandler } from '@/app/api/ica-agent/generate-deliverables/route';

export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  // Delegate directly to the generate-deliverables handler — no HTTP round-trip.
  // This avoids the ngrok/tunnel self-call problem where the server tried to
  // reach itself via the public APP_BASE_URL instead of loopback.
  return generateDeliverablesHandler(request as NextRequest);
}
