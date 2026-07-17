/**
 * ICA Orchestration Service
 *
 * ─── Two endpoints, two purposes ─────────────────────────────────────────────
 *
 *  A2A endpoint  (agent chat)
 *    POST https://servicesessentials.ibm.com/agenticapps/a2a/{appId}/agents/{agentId}
 *    Auth: Bearer ICA_A2A_KEY
 *    Used for: PHASE 1 — generating per-person notification email text
 *    Returns: text conversation — we parse the JSON notification array from it
 *
 *  Langflow endpoint  (workflow execution)
 *    POST https://langflow.servicesessentials.ibm.com/api/v1/run/<FLOW_ID>
 *    Auth: Bearer ICA_LANGFLOW_API_KEY
 *    Used for: PHASE 2 — actually EXECUTING the generate-ica-assets workflow
 *    Returns: structured JSON with the 5 delivery artefacts
 *
 * ─── How to get your Langflow Flow IDs ───────────────────────────────────────
 *  ICA Agent Studio → Your App → Workflows tab → Create/open a workflow
 *  In Langflow: Share → API access → copy the URL → extract the FLOW_ID
 *  Generate an API key from the same Share → API access page
 *  Add to .env.local:
 *    ICA_LANGFLOW_FLOW_ID_NOTIFY = flow id for notify workflow
 *    ICA_LANGFLOW_FLOW_ID_ASSETS = flow id for asset generation workflow
 *    ICA_LANGFLOW_API_KEY        = api key from Share → API access
 */

import { appEnv, hasICAAgenticConfig, hasLangflowConfig } from '@/lib/env';

const A2A_URL = 'https://servicesessentials.ibm.com/agenticapps/a2a/92690bf8-bb58-4b1e-9241-f8af02aa89ce/agents/cb3308a4-ddc7-422b-802b-26c04d6b6636';
const LANGFLOW_BASE = 'https://langflow.servicesessentials.ibm.com';

// ─── Plan shape ───────────────────────────────────────────────────────────────

export interface OrchestrateDispatchPlan {
  workflowId: string;
  summary: string;
  nextApprover: string;
  tasks: Array<{
    id: string;
    title: string;
    ownerRole: string;
    instructions: string;
    dueLabel: string;
    priority: string;
    status: string;
    assigneeName?: string;
    assigneeEmail?: string;
    assigneeSlack?: string;
    acknowledgeUrl?: string;
    statusUrl?: string;
    packageUrl?: string;
    engagementId?: string;
    engagementName?: string;
    clientName?: string;
    readinessDecision?: string;
    readinessScore?: number;
  }>;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ICANotification {
  taskId: string;
  assigneeName: string;
  assigneeEmail: string;
  ownerRole: string;
  priority: string;
  dueLabel: string;
  subject: string;
  body: string;
  acknowledgeUrl: string;
  acknowledgePayload: {
    taskId: string;
    status: string;
    completedBy: string;
    completionNote: string;
  };
}

export interface OrchestrateDispatchResult {
  live: boolean;
  accepted: boolean;
  taskCount: number;
  route?: 'langflow' | 'a2a' | 'mock';
  responseBody?: unknown;
  icaNotifications?: ICANotification[];
  error?: string;
}

export interface ICADeliveryAssetInput {
  engagementName: string;
  clientName: string;
  leadConsultant: string;
  readinessDecision: string;
  readinessScore: number;
  confidenceScore: number;
  executiveSummary: string;
  criticalIssues: string[];
  recommendations: string[];
  openQuestions: string[];
  riskExplanation: string;
  businessImpact: string;
  consultantEmail: string;
  clientContactEmail: string;
}

export interface ICADeliveryAssets {
  executiveSummary: string;
  clientEmail: string;
  internalEmail: string;
  jiraEpic: string;
  slackMessage: string;
}

export interface DeliveryAssetsResult {
  accepted: boolean;
  route: 'langflow' | 'a2a' | 'mock';
  assets?: ICADeliveryAssets;
  error?: string;
}

// ─── Langflow workflow call ───────────────────────────────────────────────────
// POST https://langflow.servicesessentials.ibm.com/api/v1/run/<FLOW_ID>
// This actually EXECUTES the workflow and returns real output.

async function callLangflowWorkflow(
  flowId: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  const key = appEnv.icaLangflowApiKey!;
  const url = `${LANGFLOW_BASE}/api/v1/run/${flowId}`;

  console.log(`[langflow] → POST ${url}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // ICA-hosted Langflow requires x-api-key (not Authorization: Bearer).
        // HTTP 403 "An API key must be passed as query or header" = wrong header name.
        'x-api-key': key,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(90_000),
    });

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 400)}` };
    }

    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep as string */ }
    console.log(`[langflow] ✓ workflow responded`);
    return { ok: true, output: parsed };

  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Extract text from Langflow response ─────────────────────────────────────
// Langflow wraps the agent output in a nested structure. We try multiple paths
// and fall back to JSON.stringify of the whole body so we never lose content.

function extractLangflowText(body: unknown): string {
  if (typeof body === 'string') return body;
  try {
    const b = body as Record<string, unknown>;

    // Path 1: outputs[0].outputs[0].results.text.text  (most common)
    // Path 2: outputs[0].outputs[0].results.message.text
    // Path 3: outputs[0].outputs[0].artifacts.message
    // Path 4: outputs[0].outputs[0].messages[last].message
    type Inner = {
      results?: { text?: { text?: string }; message?: { text?: string } };
      artifacts?: { message?: string };
      messages?: Array<{ message?: string; text?: string }>;
    };
    const inner = ((b?.outputs as Array<{ outputs?: Inner[] }>)?.[0]?.outputs)?.[0] as Inner | undefined;

    const v1 = inner?.results?.text?.text;
    const v2 = inner?.results?.message?.text;
    const v3 = inner?.artifacts?.message;
    const v4 = inner?.messages?.at(-1)?.message ?? inner?.messages?.at(-1)?.text;

    const candidate = v1 ?? v2 ?? v3 ?? v4;
    if (candidate) return candidate;

    // Path 5: some Langflow versions put it at root outputs[0].text
    const root0 = (b?.outputs as Array<{ text?: string }>)?.[0];
    if (root0?.text) return root0.text;

  } catch { /* ignore */ }

  // Last resort: stringify the whole body — JSON parser will find content inside
  try { return JSON.stringify(body); } catch { return ''; }
}

// ─── PHASE 1: Notify assignees ────────────────────────────────────────────────

function buildNotifyPayload(plan: OrchestrateDispatchPlan): Record<string, unknown> {
  const first = plan.tasks[0];
  // Langflow A2A nodes require `input_value` as a plain string — not { input: JSON }.
  // Sending { input: stringifiedJSON } causes JSON-RPC code=-32602 (-32602 Invalid params).
  const taskSummary = plan.tasks.map((t, i) =>
    `[${i + 1}] ${(t.ownerRole ?? 'consultant').toUpperCase()} — ${t.title} (${t.priority ?? 'high'}) → ${t.assigneeName ?? 'TBD'}`
  ).join('\n');
  const msgText =
    `DISPATCH_TRIGGER notify-and-collect-acknowledgements | ` +
    `Engagement: ${first?.engagementName ?? plan.workflowId} | Client: ${first?.clientName ?? ''} | ` +
    `Readiness: ${first?.readinessDecision ?? 'not-ready'} (${first?.readinessScore ?? 0}%) | ` +
    `${plan.tasks.length} tasks:\n${taskSummary}`;
  return {
    input_value: msgText,
    session_id: plan.workflowId,
    output_type: 'chat',
    input_type: 'chat',
    tweaks: {
      context: {
        trigger_action: 'notify-and-collect-acknowledgements',
        action_plan:        plan.tasks,
        engagement_name:    first?.engagementName    ?? plan.workflowId,
        client_name:        first?.clientName        ?? '',
        lead_consultant:    plan.nextApprover,
        readiness_decision: first?.readinessDecision ?? 'not-ready',
        readiness_score:    first?.readinessScore    ?? 0,
        acknowledge_url:    first?.acknowledgeUrl    ?? '',
        status_url:         first?.statusUrl         ?? '',
        package_url:        first?.packageUrl        ?? '',
      },
    },
  };
}

// Engagement/client names, assignee names, and task titles are client
// business content — this logs shape and counts only, not the content
// itself, so a shared log sink never picks up client-identifying detail.
function logActionPlan(plan: OrchestrateDispatchPlan): void {
  const first = plan.tasks[0];
  const roleCounts = plan.tasks.reduce<Record<string, number>>((acc, t) => {
    acc[t.ownerRole] = (acc[t.ownerRole] ?? 0) + 1;
    return acc;
  }, {});
  console.log(
    `[orchestrate] Dispatching workflow ${plan.workflowId} — ` +
    `readiness=${first?.readinessDecision ?? 'n/a'} (${first?.readinessScore ?? '?'}/100) — ` +
    `tasks=${plan.tasks.length} (${Object.entries(roleCounts).map(([r, n]) => `${r}:${n}`).join(', ')})`,
  );
}

function parseNotifications(rawText: string): ICANotification[] | undefined {
  // Try to find a JSON object anywhere in the text that has a "notifications" key
  const attempts = [
    // Exact match: outermost {...} containing "notifications"
    rawText.match(/\{[\s\S]*?"notifications"[\s\S]*\}/),
    // Fallback: any [...] array (in case agent returned the array directly)
    rawText.match(/\[[\s\S]*?"taskId"[\s\S]*?\]/),
  ];

  for (const match of attempts) {
    if (!match) continue;
    try {
      const raw = match[0];
      // Try as { notifications: [...] }
      const parsed = JSON.parse(raw) as { notifications?: unknown };
      if (Array.isArray(parsed.notifications) && parsed.notifications.length > 0) {
        return parsed.notifications as ICANotification[];
      }
      // Try as direct array
      if (Array.isArray(parsed)) {
        const arr = parsed as ICANotification[];
        if (arr.length > 0 && arr[0].taskId) return arr;
      }
    } catch { /* try next */ }
  }
  return undefined;
}

/**
 * PHASE 1 — Called after HITL decision.
 * Calls the Langflow notify workflow → ICA generates per-person notification emails.
 * Falls back to A2A chat if Langflow not yet configured.
 */
export async function dispatchOrchestrationPlan(
  plan: OrchestrateDispatchPlan,
): Promise<OrchestrateDispatchResult> {
  logActionPlan(plan);

  // ── Path A: Langflow workflow (preferred — actually executes) ──────────────
  if (hasLangflowConfig() && appEnv.icaLangflowFlowIdNotify) {
    const result = await callLangflowWorkflow(
      appEnv.icaLangflowFlowIdNotify,
      buildNotifyPayload(plan),
    );

    if (result.ok) {
      const rawText = extractLangflowText(result.output);
      console.log('[orchestrate/notify] Raw agent text (first 600):', rawText.slice(0, 600));
      const notifications = parseNotifications(rawText);
      console.log(`[orchestrate/notify] Langflow ✓ | notifications=${notifications?.length ?? 0}`);
      return {
        live: true, accepted: true,
        taskCount: plan.tasks.length,
        route: 'langflow',
        responseBody: result.output,
        ...(notifications ? { icaNotifications: notifications } : {}),
      };
    }

    console.warn(`[orchestrate/notify] Langflow failed: ${result.error} — falling back to A2A`);
  }

  // ── Path B: A2A chat fallback (works but returns text, not reliable JSON) ──
  if (!hasICAAgenticConfig()) {
    console.log('[orchestrate/notify] ICA not configured — mock mode');
    return { live: false, accepted: false, taskCount: plan.tasks.length, route: 'mock',
      error: 'ICA_LANGFLOW_FLOW_ID_NOTIFY + ICA_LANGFLOW_API_KEY not set. See setup guide.' };
  }

  const triggerMsg =
    `DISPATCH_TRIGGER: This is a post-HITL action plan dispatch. ` +
    `Execute trigger_action=notify-and-collect-acknowledgements immediately. ` +
    `Return notifications JSON array. Payload: ${JSON.stringify(buildNotifyPayload(plan).input)}`;

  try {
    const res = await fetch(A2A_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${appEnv.icaA2aKey!}`,
      },
      body: JSON.stringify({ message: triggerMsg }),
      signal: AbortSignal.timeout(45_000),
    });

    const text = await res.text().catch(() => '');
    if (!res.ok) {
      return { live: true, accepted: false, taskCount: plan.tasks.length, route: 'a2a',
        error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }

    let notifications: ICANotification[] | undefined;
    try {
      const body = JSON.parse(text) as { messages?: Array<{ role: string; content: string }> };
      const msg = body?.messages?.find((m) => m.role === 'assistant');
      if (msg?.content) notifications = parseNotifications(msg.content);
    } catch { /* ignore */ }

    console.log(`[orchestrate/notify] A2A fallback ✓ | notifications=${notifications?.length ?? 0}`);
    return {
      live: true, accepted: true, taskCount: plan.tasks.length, route: 'a2a',
      ...(notifications ? { icaNotifications: notifications } : {}),
    };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    return { live: true, accepted: false, taskCount: plan.tasks.length, route: 'a2a', error };
  }
}

export function getOrchestrateStatus(): 'live' | 'configured' | 'mock' {
  if (hasLangflowConfig()) return 'live';
  if (hasICAAgenticConfig()) return 'configured';
  return 'mock';
}

// ─── PHASE 2: Generate delivery assets ───────────────────────────────────────

function buildAssetsPayload(input: ICADeliveryAssetInput): Record<string, unknown> {
  return {
    input: JSON.stringify({
      trigger_action:    'generate-ica-assets',
      engagement_name:   input.engagementName,
      client_name:       input.clientName,
      lead_consultant:   input.leadConsultant,
      readiness_decision: input.readinessDecision,
      readiness_score:   input.readinessScore,
      confidence_score:  input.confidenceScore,
      executive_summary: input.executiveSummary,
      critical_issues:   input.criticalIssues,
      recommendations:   input.recommendations,
      open_questions:    input.openQuestions,
      risk_explanation:  input.riskExplanation,
      business_impact:   input.businessImpact,
    }),
  };
}

function parseDeliveryAssets(rawText: string): ICADeliveryAssets | undefined {
  // Try multiple patterns — agent may wrap JSON in markdown or prose
  const patterns: RegExp[] = [
    /\{[\s\S]*?"executiveSummary"[\s\S]*?\}/,
    /\{[\s\S]*?"clientEmail"[\s\S]*?\}/,
    /\{[\s\S]*?"internalEmail"[\s\S]*?\}/,
    /\{[\s\S]*?"slackMessage"[\s\S]*?\}/,
    /```json\s*([\s\S]*?)```/,
    /```\s*([\s\S]*?)```/,
  ];

  for (const pattern of patterns) {
    const match = rawText.match(pattern);
    if (!match) continue;
    const candidate = (match[1] ?? match[0]).trim();
    try {
      const parsed = JSON.parse(candidate) as Partial<ICADeliveryAssets>;
      const keys: (keyof ICADeliveryAssets)[] = ['executiveSummary','clientEmail','internalEmail','jiraEpic','slackMessage'];
      const found = keys.filter(k => typeof parsed[k] === 'string' && parsed[k]);
      if (found.length >= 2) return parsed as ICADeliveryAssets;
    } catch { /* try next */ }
  }
  return undefined;
}

/**
 * PHASE 2 — Called by POST /api/task/update when allDone=true.
 * Calls the Langflow generate-ica-assets workflow → ICA generates 5 delivery artefacts.
 * Returns the assets so the caller can email them to the right people.
 */
export async function dispatchDeliveryAssets(
  input: ICADeliveryAssetInput,
): Promise<DeliveryAssetsResult> {
  console.log(`[orchestrate/assets] Generating delivery assets for: ${input.engagementName}`);

  // ── Path A: Langflow workflow (preferred) ──────────────────────────────────
  if (hasLangflowConfig() && appEnv.icaLangflowFlowIdAssets) {
    const result = await callLangflowWorkflow(
      appEnv.icaLangflowFlowIdAssets,
      buildAssetsPayload(input),
    );

    if (result.ok) {
      const rawText = extractLangflowText(result.output);
      console.log('[orchestrate/assets] Raw agent text (first 800):', rawText.slice(0, 800));
      const assets = parseDeliveryAssets(rawText);
      console.log(`[orchestrate/assets] Langflow ✓ | assets=${assets ? 'parsed — keys: ' + Object.keys(assets).join(',') : 'NOT parsed'}`);
      return { accepted: true, route: 'langflow', assets };
    }

    console.warn(`[orchestrate/assets] Langflow failed: ${result.error}`);
    return { accepted: false, route: 'langflow', error: result.error };
  }

  // ── Path B: A2A fallback (limited — agent echoes payload instead of generating) ──
  if (hasICAAgenticConfig()) {
    console.log('[orchestrate/assets] Langflow not configured — trying A2A fallback');
    const triggerMsg =
      `DISPATCH_TRIGGER: All tasks complete. trigger_action=generate-ica-assets. ` +
      `Write all 5 artefacts now. Return ONLY compact JSON with keys: ` +
      `executiveSummary, clientEmail, internalEmail, jiraEpic, slackMessage. ` +
      `Each value must be the full text — do not echo the payload, do not say "started". ` +
      `Payload: ${JSON.stringify(buildAssetsPayload(input).input)}`;

    try {
      const res = await fetch(A2A_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${appEnv.icaA2aKey!}`,
        },
        body: JSON.stringify({ message: triggerMsg }),
        signal: AbortSignal.timeout(90_000),
      });

      const text = await res.text().catch(() => '');
      if (!res.ok) {
        return { accepted: false, route: 'a2a', error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
      }

      let assets: ICADeliveryAssets | undefined;
      try {
        const body = JSON.parse(text) as { messages?: Array<{ role: string; content: string }> };
        const msg = body?.messages?.find((m) => m.role === 'assistant');
        if (msg?.content) {
          assets = parseDeliveryAssets(msg.content);
          if (!assets) {
            console.warn('[orchestrate/assets] A2A response did not contain asset JSON:',
              msg.content.slice(0, 400));
          }
        }
      } catch { /* ignore */ }

      return { accepted: true, route: 'a2a', assets };
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err);
      return { accepted: false, route: 'a2a', error };
    }
  }

  return {
    accepted: false,
    route: 'mock',
    error: 'ICA not configured. Set ICA_LANGFLOW_FLOW_ID_ASSETS + ICA_LANGFLOW_API_KEY in .env.local',
  };
}
