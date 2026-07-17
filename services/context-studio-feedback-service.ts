/**
 * Context Studio Feedback Service — Improvement 7
 *
 * After the consultant makes a HITL decision, this service writes a compact
 * assessment summary and posts it to Context Studio as institutional memory.
 *
 * Effect: future assessments can query "similar past engagements" via
 * fetchContextSnapshot() in watsonx-service.ts and get grounded recommendations
 * based on what IBM Consulting has actually experienced.
 *
 * Falls back silently when CONTEXT_STUDIO_API_KEY is not configured.
 */

import fs from 'fs';
import path from 'path';
import { appEnv, hasContextStudioConfig } from '@/lib/env';
import type { HITLRecord } from '@/types/domain';
import type { ICAEngagementPackage } from '@/services/ica-service';

// ─── Build the markdown summary ───────────────────────────────────────────────

function buildAssessmentSummary(pkg: ICAEngagementPackage, hitl: HITLRecord): string {
  const decision = pkg.readinessDecision.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const hitlLabel = hitl.consultantDecision === 'accepted'
    ? `Accepted AI recommendation (${decision})`
    : `Overridden to ${hitl.consultantChoice.replace(/-/g, ' ')} — "${hitl.justification ?? 'no justification'}"`;

  return [
    `# Engagement Assessment — ${pkg.engagementName}`,
    ``,
    `**Client:** ${pkg.clientName}`,
    `**Lead Consultant:** ${pkg.leadConsultant}`,
    `**Assessed At:** ${pkg.assessedAt}`,
    `**AI Readiness Decision:** ${decision} (score ${pkg.readinessScore}%, confidence ${pkg.confidenceScore}%)`,
    `**Consultant HITL Decision:** ${hitlLabel}`,
    ``,
    `## Critical Issues`,
    pkg.criticalIssues.map((i, n) => `${n + 1}. ${i}`).join('\n') || 'None',
    ``,
    `## Top Recommendations`,
    pkg.recommendations.slice(0, 5).map((r, n) => `${n + 1}. ${r}`).join('\n') || 'None',
    ``,
    `## Open Questions`,
    pkg.openQuestions.slice(0, 5).map((q, n) => `${n + 1}. ${q}`).join('\n') || 'None',
    ``,
    `---`,
    `Source: engagement-ready-ai | Schema: engagement-ready-ai/ica-delivery/v1`,
  ].join('\n');
}

// ─── Write to local file ──────────────────────────────────────────────────────

function writeLocalSummary(engagementId: string, markdown: string): void {
  try {
    const dir = path.join(process.cwd(), '.next', 'tmp', 'assessments');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${engagementId}.md`), markdown, 'utf-8');
    console.log(`[context-studio-feedback] Summary written to .next/tmp/assessments/${engagementId}.md`);
  } catch {
    // Non-fatal
  }
}

// ─── Post event to Context Studio ─────────────────────────────────────────────

async function postToContextStudio(engagementId: string, markdown: string): Promise<void> {
  if (!hasContextStudioConfig()) return;

  // MCP gateway requires both Authorization: Bearer (mcp.json) and x-api-key (context id JWT).
  // It also rejects the request with HTTP 406 unless Accept: application/json is present.
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'x-api-key': appEnv.contextStudioApiKey ?? '',
  };
  if (appEnv.contextStudioBearer) {
    headers['Authorization'] = `Bearer ${appEnv.contextStudioBearer}`;
  }

  // First, ingest the markdown summary as a vector document so future assessments can query it
  const res = await fetch(appEnv.contextStudioUrl, {
    method: 'POST',
    headers,
    signal: AbortSignal.timeout(8_000),
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/call',
      params: {
        name: 'context-broker-post-events',
        arguments: {
          context_id: appEnv.contextStudioCtxId,
          event_type: 'engagementAssessmentCompleted',
          event_id: `evt_${engagementId}_${Date.now()}`,
          payload: {
            source_id: engagementId,
            source_type: 'sharepoint',
            content: markdown,
            paths: [{
              parent_folder: `assessments`,
              sub_folder: [{ action: 'add', folder_name: engagementId, file_names: [`summary.md`] }],
            }],
          },
        },
      },
    }),
  });

  if (res.ok) {
    console.log(`[context-studio-feedback] Assessment ingested for: ${engagementId}`);
  } else {
    const body = await res.text().catch(() => '');
    console.warn(`[context-studio-feedback] Ingest returned HTTP ${res.status}: ${body.slice(0, 150)}`);
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function postAssessmentToContextStudio(
  pkg: ICAEngagementPackage,
  hitl: HITLRecord,
): Promise<void> {
  const markdown = buildAssessmentSummary(pkg, hitl);
  writeLocalSummary(pkg.engagementId, markdown);
  await postToContextStudio(pkg.engagementId, markdown);
}
