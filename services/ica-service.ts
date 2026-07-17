/**
 * IBM Consulting Advantage (ICA) delivery service.
 *
 * Delivery path:
 *   1. Writes the package JSON to .next/tmp/ica-packages/{id}.json
 *      → ICA Agentic App pulls this via GET /api/ica-package/[engagementId]
 *   2. Attempts a REST push (message + context) to the ICA Agentic App A2A endpoint
 *      (servicesessentials.ibm.com/agenticapps/a2a/{appId}/agents/{agentId})
 *      using ICA_A2A_KEY when set. Falls back gracefully when not configured.
 *
 * ICA Agentic App identifiers (hardcoded as defaults in appEnv):
 *   appId:      92690bf8-bb58-4b1e-9241-f8af02aa89ce
 *   agentId:    cb3308a4-ddc7-422b-802b-26c04d6b6636
 *   gatewayId:  119469ecd338485da6333819e0030eaf
 */

import fs from 'fs';
import path from 'path';
import { appEnv, hasICAAgenticConfig } from '@/lib/env';
import type { ConsultingAsset } from '@/types/domain';

// ─── Payload types ────────────────────────────────────────────────────────────

export interface ICAEngagementPackage {
  engagementId: string;
  engagementName: string;
  clientName: string;
  leadConsultant: string;
  readinessDecision: 'ready' | 'ready-with-conditions' | 'not-ready';
  readinessScore: number;
  confidenceScore: number;
  executiveSummary: string;
  criticalIssues: string[];
  recommendations: string[];
  openQuestions: string[];
  assets: ConsultingAsset[];
  hitlRecord?: {
    aiRecommendation: string;
    aiScore: number;
    consultantDecision: 'accepted' | 'overridden';
    consultantChoice: string;
    justification: string | null;
    decidedAt: string;
  };
  assessedAt: string;
  notifyEmails?: string[];
}

export interface ICADeliveryResult {
  live: boolean;
  accepted: boolean;
  deliverableId?: string;
  notificationsSent?: number;
  tasksCreated?: number;
  exportPath?: string;
  error?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function readinessLabel(d: string) {
  if (d === 'ready') return 'Ready for Delivery';
  if (d === 'ready-with-conditions') return 'Ready with Conditions';
  return 'Not Ready';
}

function buildExportPackage(pkg: ICAEngagementPackage) {
  return {
    schema: 'engagement-ready-ai/ica-delivery/v1',
    exportedAt: new Date().toISOString(),
    engagement: {
      id: pkg.engagementId,
      name: pkg.engagementName,
      client: pkg.clientName,
      leadConsultant: pkg.leadConsultant,
      assessedAt: pkg.assessedAt,
    },
    readiness: {
      decision: pkg.readinessDecision,
      label: readinessLabel(pkg.readinessDecision),
      score: pkg.readinessScore,
      confidence: pkg.confidenceScore,
    },
    analysis: {
      executiveSummary: pkg.executiveSummary,
      criticalIssues: pkg.criticalIssues,
      recommendations: pkg.recommendations,
      openQuestions: pkg.openQuestions,
    },
    humanInTheLoop: pkg.hitlRecord
      ? {
          aiRecommendation: pkg.hitlRecord.aiRecommendation,
          aiScore: pkg.hitlRecord.aiScore,
          consultantDecision: pkg.hitlRecord.consultantDecision,
          consultantChoice: pkg.hitlRecord.consultantChoice,
          justification: pkg.hitlRecord.justification,
          decidedAt: pkg.hitlRecord.decidedAt,
        }
      : null,
    consultingAssets: pkg.assets.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      content: a.content,
      status: a.status,
    })),
    notifyEmails: pkg.notifyEmails ?? [],
    source: 'engagement-ready-ai',
    sourceVersion: '1.0',
  };
}

// ─── Write package to local filesystem ───────────────────────────────────────

function writePackageFile(exportPkg: ReturnType<typeof buildExportPackage>): string {
  try {
    const dir = path.join(process.cwd(), '.next', 'tmp', 'ica-packages');
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${exportPkg.engagement.id}.json`);
    fs.writeFileSync(filePath, JSON.stringify(exportPkg, null, 2), 'utf-8');
    return filePath;
  } catch {
    return 'write-failed';
  }
}

// ─── Call ICA Agentic App MCP server ─────────────────────────────────────────

async function pushToICAAgenticApp(
  exportPkg: ReturnType<typeof buildExportPackage>,
): Promise<{ accepted: boolean; error?: string }> {
  if (!hasICAAgenticConfig()) {
    return { accepted: false, error: 'ICA_A2A_KEY not set — package written locally for ICA pull' };
  }

  // The ICA Agentic App endpoint is a plain REST chat endpoint (message + context),
  // not an MCP JSON-RPC server — it authenticates with ICA_A2A_KEY, the same
  // bearer used by assignTasksViaICA()/generateDeliverablesViaICA() in
  // ica-agent-api-service.ts. The app also exposes GET /api/ica-package/[id]
  // for ICA to pull proactively; this push just notifies the agent immediately
  // when a package is ready.
  const url = appEnv.icaAgenticAppUrl.replace(/\/$/, '');

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${appEnv.icaA2aKey}`,
      },
      body: JSON.stringify({
        message: `Engagement package ready for ${exportPkg.engagement.id} (${exportPkg.engagement.name}). Pull the full package from GET /api/ica-package/${exportPkg.engagement.id} or use the attached context.`,
        context: {
          ...exportPkg,
          _meta: {
            appId:     appEnv.icaAgenticAppId,
            agentId:   appEnv.icaAgentId,
            gatewayId: appEnv.icaMcpGatewayId,
            contextId: appEnv.contextStudioCtxId,
          },
        },
      }),
      signal: AbortSignal.timeout(20_000),
    });

    if (!res.ok) {
      const body = await res.text().catch(() => '');
      return { accepted: false, error: `HTTP ${res.status}: ${body.slice(0, 200)}` };
    }

    return { accepted: true };
  } catch (err) {
    return { accepted: false, error: err instanceof Error ? err.message : 'Network error' };
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function deliverToICA(pkg: ICAEngagementPackage): Promise<ICADeliveryResult> {
  const exportPkg = buildExportPackage(pkg);

  // 1. Always write the package to disk first — ICA Agentic App can pull via
  //    GET /api/ica-package/[engagementId] regardless of push outcome
  const exportPath = writePackageFile(exportPkg);
  console.log(`[ica] Package written: ${exportPath}`);
  console.log(`[ica] Delivering: ${pkg.engagementName} | ${readinessLabel(pkg.readinessDecision)} (${pkg.readinessScore}%) | ${pkg.assets.length} assets | HITL: ${pkg.hitlRecord?.consultantDecision ?? 'pending'}`);
  console.log(`[ica] App: ${appEnv.icaAgenticAppId} | Agent: ${appEnv.icaAgentId} | Context: ${appEnv.contextStudioCtxId}`);

  // 2. Push notification to ICA Agentic App MCP server (fire once bearer is set)
  const pushResult = await pushToICAAgenticApp(exportPkg);
  if (pushResult.accepted) {
    console.log(`[ica] Agentic App push accepted: ${exportPkg.engagement.id}`);
  } else {
    console.log(`[ica] Push skipped/failed (${pushResult.error ?? 'unknown'}) — ICA will pull from /api/ica-package/${exportPkg.engagement.id}`);
  }

  return {
    live: hasICAAgenticConfig(),
    accepted: pushResult.accepted,
    deliverableId: exportPkg.engagement.id,
    notificationsSent: pkg.notifyEmails?.length ?? 0,
    tasksCreated: pkg.assets.length,
    exportPath,
    error: pushResult.accepted ? undefined : pushResult.error,
  };
}

export function getICAStatus(): 'live' | 'export' {
  return hasICAAgenticConfig() ? 'live' : 'export';
}
