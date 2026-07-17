/**
 * ICA Agent API Service
 *
 * Implements the IBM Consulting Advantage Agent API from the Agentic App Studio Lab.
 *
 * ─── Equivalent curl command (from Agentic App Studio Lab) ───────────────────
 *
 *   curl -X POST \
 *     "https://servicesessentials.ibm.com/agenticapps/a2a/{appId}/agents/{agentId}" \
 *     -H "Authorization: Bearer {ICA_A2A_KEY}" \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *           "message": "<natural language trigger>",
 *           "context": { ... }
 *         }'
 *
 * ─── ICA App identifiers ──────────────────────────────────────────────────────
 *   appId:   92690bf8-bb58-4b1e-9241-f8af02aa89ce
 *   agentId: cb3308a4-ddc7-422b-802b-26c04d6b6636
 *
 * ─── Responsibilities (as per the required flow) ─────────────────────────────
 *
 *   Phase 1 — Called after consultant clicks "Accept AI Plan":
 *     ICA assigns tasks to:  Architect → Consultant → QA → Operations
 *     ICA sends task-assignment emails to each role
 *     Action Center shows all tasks as Pending
 *
 *   Phase 2 — Called after ALL tasks are complete + lead consultant approves:
 *     ICA calls watsonx to generate:
 *       - Executive Summary
 *       - Client Email
 *       - Internal Email
 *       - Slack Message
 *       - Jira Epic (with tickets per remediation action)
 *     ICA packages and sends them
 *
 * ─── Context Studio integration ──────────────────────────────────────────────
 *   Context Studio provides the engagement knowledge base.
 *   ICA reads from Context Studio before generating any asset.
 *   The context_id (ctx_69dbd815ec49) is passed with every ICA call.
 */

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import { appEnv, hasICAAgentApiConfig, hasLangflowConfig, hasLangflowMcpConfig } from '@/lib/env';

// ─── ICA Agent API endpoint ───────────────────────────────────────────────────

const ICA_A2A_BASE = 'https://servicesessentials.ibm.com/agenticapps/a2a';
const ICA_APP_ID   = '92690bf8-bb58-4b1e-9241-f8af02aa89ce';
const ICA_AGENT_ID = 'cb3308a4-ddc7-422b-802b-26c04d6b6636';

// ─── Payload types ────────────────────────────────────────────────────────────

export interface ICATaskAssignmentInput {
  engagementId: string;
  engagementName: string;
  clientName: string;
  leadConsultant: string;
  readinessDecision: string;
  readinessScore: number;
  actionPlan: Array<{
    taskId: string;
    title: string;
    ownerRole: string;       // architect | consultant | qa | operations
    priority: string;
    dueLabel: string;
    instructions: string;
    assigneeName: string;
    assigneeEmail: string;
    assigneeSlack?: string;
    acknowledgeUrl: string;
  }>;
  contextId: string;        // ctx_69dbd815ec49 — passed to Context Studio
  appBaseUrl: string;
}

export interface ICADeliverableInput {
  engagementId: string;
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
  completedTasks: Array<{ title: string; ownerRole: string; completedBy: string }>;
  consultantEmail: string;
  clientContactEmail: string;
  contextId: string;
}

export interface ICADeliverables {
  executiveSummary: string;
  clientEmail: string;
  internalEmail: string;
  slackMessage: string;
  jiraEpic: string;
}

export interface ICAAgentCallResult<T = unknown> {
  accepted: boolean;
  route: 'agent-api' | 'langflow' | 'mock';
  data?: T;
  rawResponse?: unknown;
  error?: string;
}

// ─── Core ICA Agent API call ──────────────────────────────────────────────────
// Implements the curl command from Agentic App Studio Lab.

async function callICAAgentAPI(
  message: string,
  context: Record<string, unknown>,
  timeoutMs = 60_000,
): Promise<{ ok: boolean; messages?: Array<{ role: string; content: string }>; error?: string }> {
  const bearerKey = appEnv.icaA2aKey;
  if (!bearerKey) {
    return { ok: false, error: 'ICA_A2A_KEY not set — add it to .env.local' };
  }

  const appId   = appEnv.icaAgenticAppId ?? ICA_APP_ID;
  const agentId = appEnv.icaAgentId      ?? ICA_AGENT_ID;
  const url     = `${ICA_A2A_BASE}/${appId}/agents/${agentId}`;

  console.log(`[ica-agent-api] → POST ${url}`);
  console.log(`[ica-agent-api] trigger: ${message.slice(0, 120)}…`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bearerKey}`,
      },
      body: JSON.stringify({ message, context }),
      signal: AbortSignal.timeout(timeoutMs),
    });

    const text = await res.text().catch(() => '');

    if (!res.ok) {
      console.warn(`[ica-agent-api] HTTP ${res.status}: ${text.slice(0, 300)}`);
      return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 300)}` };
    }

    let parsed: { messages?: Array<{ role: string; content: string }> };
    try {
      parsed = JSON.parse(text) as typeof parsed;
    } catch {
      // Some agent responses return plain text
      return { ok: true, messages: [{ role: 'assistant', content: text }] };
    }

    console.log(`[ica-agent-api] ✓ response (${res.status})`);
    return { ok: true, messages: parsed.messages };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    console.warn('[ica-agent-api] call failed:', error);
    return { ok: false, error };
  }
}

// ─── Langflow MCP tool call (preferred — real MCP, per IBM's guidance) ────────
// The Langflow project is exposed as a real MCP server (Workflow -> Share ->
// MCP Server -> Generate API key), with each flow as a named tool. Confirmed
// live: notify_assignees and generate_ica_assets both work over MCP with a
// plain x-api-key header — unlike the ICA Agentic App / direct MCP gateway,
// which reject static keys with a "requires login session" wall.

async function callLangflowMcpTool(
  toolName: 'notify_assignees' | 'generate_ica_assets',
  message: string,
  sessionId: string,
): Promise<{ ok: boolean; text?: string; error?: string }> {
  if (!hasLangflowMcpConfig()) {
    return { ok: false, error: 'ICA_LANGFLOW_MCP_URL / ICA_LANGFLOW_MCP_API_KEY not set' };
  }

  const transport = new StreamableHTTPClientTransport(new URL(appEnv.icaLangflowMcpUrl!), {
    requestInit: { headers: { 'x-api-key': appEnv.icaLangflowMcpApiKey! } },
  });
  const client = new Client({ name: 'engagement-ready-ai', version: '1.0' }, { capabilities: {} });

  try {
    await client.connect(transport);
    const result = await client.callTool({
      name: toolName,
      arguments: { input_value: message, session_id: sessionId },
    });

    if (result.isError) {
      return { ok: false, error: 'MCP tool returned an error result' };
    }

    const content = result.content as Array<{ type?: string; text?: string }> | undefined;
    const text = content?.find((c) => c.type === 'text' && c.text)?.text;
    return text ? { ok: true, text } : { ok: false, error: 'MCP tool returned no text content' };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  } finally {
    await transport.close().catch(() => {});
  }
}

// ─── Langflow workflow call (REST — fallback transport, same flows) ──────────

async function callLangflowWorkflow(
  flowId: string,
  input: Record<string, unknown>,
): Promise<{ ok: boolean; output?: unknown; error?: string }> {
  const key  = appEnv.icaLangflowApiKey!;
  const base = appEnv.icaLangflowUrl ?? 'https://langflow.servicesessentials.ibm.com';
  const url  = `${base}/api/v1/run/${flowId}`;

  console.log(`[ica-langflow] → POST ${url}`);

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        // ICA-hosted Langflow requires x-api-key header (not Bearer).
        // Error "An API key must be passed as query or header" means
        // Authorization: Bearer is rejected — x-api-key is the correct header.
        'x-api-key': key,
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(90_000),
    });

    const text = await res.text().catch(() => '');
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}: ${text.slice(0, 400)}` };

    let parsed: unknown = text;
    try { parsed = JSON.parse(text); } catch { /* keep as string */ }
    return { ok: true, output: parsed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ─── Extract assistant message from ICA response ──────────────────────────────

function extractAssistantText(messages: Array<{ role: string; content: string }> | undefined): string {
  if (!messages?.length) return '';
  return messages.find((m) => m.role === 'assistant')?.content ?? messages.at(-1)?.content ?? '';
}

// ─── Extract JSON from text response ─────────────────────────────────────────

function tryParseJson<T>(text: string): T | null {
  // Try markdown code blocks first
  const codeBlock = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()) as T; } catch { /* continue */ }
  }
  // Try bare JSON object
  const objMatch = text.match(/\{[\s\S]*\}/);
  if (objMatch) {
    try { return JSON.parse(objMatch[0]) as T; } catch { /* continue */ }
  }
  return null;
}

// ─── PHASE 1: Assign tasks to team members via ICA Agent API ─────────────────
//
// This is called immediately after the consultant clicks "Accept AI Plan".
// ICA receives the full action plan and assigns each task to the right person.
// ICA also sends task-assignment emails and Slack notifications.
// Returns per-task ICA notification payloads so the app can display them.

export interface ICATaskNotification {
  taskId: string;
  assigneeName: string;
  assigneeEmail: string;
  ownerRole: string;
  priority: string;
  dueLabel: string;
  subject: string;
  body: string;
  acknowledgeUrl: string;
  jiraTicketKey?: string;   // ICA may create a Jira ticket per task
  slackChannel?: string;
}

export interface ICATaskAssignmentResult {
  accepted: boolean;
  route: 'agent-api' | 'langflow' | 'mock';
  notifications: ICATaskNotification[];
  jiraTicketsCreated: number;
  slackMessageSent: boolean;
  emailsSent: number;
  error?: string;
}

export async function assignTasksViaICA(
  input: ICATaskAssignmentInput,
): Promise<ICATaskAssignmentResult> {
  const taskSummary = input.actionPlan
    .map((t, i) => `[${i + 1}] ${t.ownerRole.toUpperCase()} — ${t.title} (${t.priority}, due: ${t.dueLabel}) → ${t.assigneeName} <${t.assigneeEmail}>`)
    .join('\n');

  const contextPayload = {
    trigger_action: 'assign-tasks-and-notify',
    context_id: input.contextId,
    engagement_id: input.engagementId,
    engagement_name: input.engagementName,
    client_name: input.clientName,
    lead_consultant: input.leadConsultant,
    readiness_decision: input.readinessDecision,
    readiness_score: input.readinessScore,
    action_plan: input.actionPlan,
    acknowledge_url: `${input.appBaseUrl}/api/task/update`,
    task_list_url: `${input.appBaseUrl}/api/task/list`,
  };

  const message =
    `ASSIGN_TASKS: Post-assessment action plan accepted by consultant. ` +
    `Engagement: ${input.engagementName} | Client: ${input.clientName} | ` +
    `Readiness: ${input.readinessDecision} (${input.readinessScore}%). ` +
    `For the following ${input.actionPlan.length} tasks, generate the task-assignment notification content ` +
    `each assignee should receive (email subject and body). ` +
    `Return a JSON object with key "notifications" containing an array of task notification records ` +
    `(taskId, assigneeName, assigneeEmail, ownerRole, priority, dueLabel, subject, body, acknowledgeUrl, jiraTicketKey). ` +
    `Tasks:\n${taskSummary}`;

  // ── Path A: Langflow — MCP (preferred protocol, confirmed live) ────────────
  if (hasLangflowMcpConfig()) {
    const mcpResult = await callLangflowMcpTool('notify_assignees', message, input.engagementId);

    if (mcpResult.ok && mcpResult.text) {
      const notifications = tryParseJson<{ notifications: ICATaskNotification[] }>(mcpResult.text);
      const parsed = notifications?.notifications ?? [];
      console.log(`[ica-langflow-mcp/assign] ✓ — notifications=${parsed.length}`);
      return {
        accepted: true,
        route: 'langflow',
        notifications: parsed,
        jiraTicketsCreated: parsed.filter((n) => n.jiraTicketKey).length,
        slackMessageSent: true,
        emailsSent: parsed.length,
      };
    }
    console.warn(`[ica-langflow-mcp/assign] failed: ${mcpResult.error} — falling back to Langflow REST`);
  }

  // ── Path A2: Langflow — REST (fallback transport, same flow) ──────────────
  // Langflow A2A nodes require the message in `input_value` as a plain string.
  // Sending { input: stringifiedJSON } causes: JSON-RPC code=-32602
  // "Message parameter must contain non-empty text in one of: string message,
  //  message.text, message.content, or message.parts[].text"
  if (hasLangflowConfig() && appEnv.icaLangflowFlowIdNotify) {
    const langflowInput = {
      input_value: message,
      session_id: input.engagementId,
      output_type: 'chat',
      input_type: 'chat',
      tweaks: { context: contextPayload },
    };
    const result = await callLangflowWorkflow(appEnv.icaLangflowFlowIdNotify, langflowInput);

    if (result.ok) {
      const rawText = extractLangflowOutputText(result.output);
      console.log('[ica-agent-api/assign] Langflow ✓ — parsing notifications');
      const notifications = tryParseJson<{ notifications: ICATaskNotification[] }>(rawText);
      const parsed = notifications?.notifications ?? [];
      return {
        accepted: true,
        route: 'langflow',
        notifications: parsed,
        jiraTicketsCreated: parsed.filter((n) => n.jiraTicketKey).length,
        slackMessageSent: true,
        emailsSent: parsed.length,
      };
    }
    console.warn(`[ica-agent-api/assign] Langflow failed: ${result.error} — falling back to Agent API`);
  }

  // ── Path B: ICA Agent API (direct curl-style call) ────────────────────────
  if (hasICAAgentApiConfig()) {
    const result = await callICAAgentAPI(message, contextPayload, 60_000);

    if (result.ok) {
      const text = extractAssistantText(result.messages);
      const notifications = tryParseJson<{ notifications: ICATaskNotification[] }>(text);
      const parsed = notifications?.notifications ?? [];
      console.log(`[ica-agent-api/assign] Agent API ✓ — notifications=${parsed.length}`);
      return {
        accepted: true,
        route: 'agent-api',
        notifications: parsed,
        jiraTicketsCreated: parsed.filter((n) => n.jiraTicketKey).length,
        slackMessageSent: parsed.length > 0,
        emailsSent: parsed.length,
      };
    }

    return {
      accepted: false,
      route: 'agent-api',
      notifications: [],
      jiraTicketsCreated: 0,
      slackMessageSent: false,
      emailsSent: 0,
      error: result.error,
    };
  }

  // ── Path C: Mock (ICA not configured) ────────────────────────────────────
  console.log('[ica-agent-api/assign] ICA not configured — returning mock notifications');
  return buildMockTaskNotifications(input);
}

// ─── PHASE 2: Generate delivery assets via ICA Agent API ─────────────────────
//
// Called after ALL tasks are complete AND lead consultant approves.
// ICA calls watsonx to generate 5 delivery artefacts, then sends them.

export async function generateDeliverablesViaICA(
  input: ICADeliverableInput,
): Promise<ICAAgentCallResult<ICADeliverables>> {
  const completedList = input.completedTasks
    .map((t, i) => `[${i + 1}] ${t.ownerRole}: ${t.title} (completed by ${t.completedBy})`)
    .join('\n');

  const contextPayload = {
    trigger_action: 'generate-ica-assets',
    context_id: input.contextId,
    engagement_name: input.engagementName,
    client_name: input.clientName,
    lead_consultant: input.leadConsultant,
    readiness_decision: input.readinessDecision,
    readiness_score: input.readinessScore,
    confidence_score: input.confidenceScore,
    executive_summary: input.executiveSummary,
    critical_issues: input.criticalIssues,
    recommendations: input.recommendations,
    open_questions: input.openQuestions,
    risk_explanation: input.riskExplanation,
    business_impact: input.businessImpact,
    completed_tasks: input.completedTasks,
    consultant_email: input.consultantEmail,
    client_email: input.clientContactEmail,
  };

  const message =
    `GENERATE_ASSETS: All remediation tasks are complete. Final approval granted. ` +
    `Engagement: ${input.engagementName} | Client: ${input.clientName} | ` +
    `Readiness: ${input.readinessDecision} (${input.readinessScore}%). ` +
    `${input.completedTasks.length} tasks completed:\n${completedList}\n\n` +
    `Using the engagement details and completed tasks above, generate the following 5 delivery artefacts:\n` +
    `1. Executive Summary (C-suite, 1 page)\n` +
    `2. Client-facing email (from IBM Consulting lead)\n` +
    `3. Internal team email (to IBM team)\n` +
    `4. Slack message (team channel update)\n` +
    `5. Jira Epic with acceptance criteria and linked tasks\n\n` +
    `Return ONLY compact JSON with keys: executiveSummary, clientEmail, internalEmail, slackMessage, jiraEpic. ` +
    `Each value must be the complete text content — do not echo the payload.`;

  // ── Path A: Langflow — MCP (preferred protocol, confirmed live) ────────────
  if (hasLangflowMcpConfig()) {
    const mcpResult = await callLangflowMcpTool('generate_ica_assets', message, input.engagementId);

    if (mcpResult.ok && mcpResult.text) {
      const assets = tryParseJson<ICADeliverables>(mcpResult.text);
      console.log(`[ica-langflow-mcp/generate] ✓ | assets=${assets ? Object.keys(assets).join(',') : 'NOT parsed'}`);
      return { accepted: !!assets, route: 'langflow', data: assets ?? undefined };
    }
    console.warn(`[ica-langflow-mcp/generate] failed: ${mcpResult.error} — falling back to Langflow REST`);
  }

  // ── Path A2: Langflow — REST (fallback transport, same flow) ──────────────
  if (hasLangflowConfig() && appEnv.icaLangflowFlowIdAssets) {
    const result = await callLangflowWorkflow(
      appEnv.icaLangflowFlowIdAssets,
      {
        input_value: message,
        session_id: input.engagementId,
        output_type: 'chat',
        input_type: 'chat',
        tweaks: { context: contextPayload },
      },
    );

    if (result.ok) {
      const rawText = extractLangflowOutputText(result.output);
      const assets = tryParseJson<ICADeliverables>(rawText);
      console.log(`[ica-agent-api/generate] Langflow ✓ | assets=${assets ? Object.keys(assets).join(',') : 'NOT parsed'}`);
      return { accepted: !!assets, route: 'langflow', data: assets ?? undefined };
    }
    console.warn(`[ica-agent-api/generate] Langflow failed: ${result.error}`);
  }

  // ── Path B: ICA Agent API ─────────────────────────────────────────────────
  if (hasICAAgentApiConfig()) {
    const result = await callICAAgentAPI(message, contextPayload, 90_000);

    if (result.ok) {
      const text = extractAssistantText(result.messages);
      const assets = tryParseJson<ICADeliverables>(text);
      console.log(`[ica-agent-api/generate] Agent API ✓ | assets=${assets ? Object.keys(assets).join(',') : 'NOT parsed'}`);
      return { accepted: true, route: 'agent-api', data: assets ?? undefined, rawResponse: result.messages };
    }

    return { accepted: false, route: 'agent-api', error: result.error };
  }

  return {
    accepted: false,
    route: 'mock',
    error: 'ICA Agent API not configured. Set ICA_A2A_KEY in .env.local.',
  };
}

// ─── Extract text from Langflow response ─────────────────────────────────────

function extractLangflowOutputText(body: unknown): string {
  if (typeof body === 'string') return body;
  try {
    type Inner = {
      results?: { text?: { text?: string }; message?: { text?: string } };
      artifacts?: { message?: string };
      messages?: Array<{ message?: string; text?: string }>;
    };
    const b = body as Record<string, unknown>;
    const inner = ((b?.outputs as Array<{ outputs?: Inner[] }>)?.[0]?.outputs)?.[0] as Inner | undefined;
    const candidate =
      inner?.results?.text?.text ??
      inner?.results?.message?.text ??
      inner?.artifacts?.message ??
      inner?.messages?.at(-1)?.message;
    if (candidate) return candidate;
    const root0 = (b?.outputs as Array<{ text?: string }>)?.[0];
    if (root0?.text) return root0.text;
  } catch { /* ignore */ }
  try { return JSON.stringify(body); } catch { return ''; }
}

// ─── Mock builder (ICA not configured) ───────────────────────────────────────

function buildMockTaskNotifications(input: ICATaskAssignmentInput): ICATaskAssignmentResult {
  const notifications: ICATaskNotification[] = input.actionPlan.map((task, i) => ({
    taskId: task.taskId,
    assigneeName: task.assigneeName,
    assigneeEmail: task.assigneeEmail,
    ownerRole: task.ownerRole,
    priority: task.priority,
    dueLabel: task.dueLabel,
    subject: `[Action Required] ${task.title} — ${input.engagementName}`,
    body: [
      `Hi ${task.assigneeName},`,
      ``,
      `You have been assigned a remediation action for engagement: ${input.engagementName} (${input.clientName}).`,
      ``,
      `Action: ${task.title}`,
      `Priority: ${task.priority}`,
      `Due: ${task.dueLabel}`,
      `Role: ${task.ownerRole}`,
      ``,
      `Instructions:`,
      task.instructions,
      ``,
      `To mark this task complete, visit:`,
      task.acknowledgeUrl,
      ``,
      `This action was generated by Engagement Ready AI following consultant review.`,
      `Readiness: ${input.readinessDecision} (${input.readinessScore}%)`,
    ].join('\n'),
    acknowledgeUrl: task.acknowledgeUrl,
    jiraTicketKey: `ERA-${100 + i}`,
  }));

  return {
    accepted: false,   // mock — not actually sent
    route: 'mock',
    notifications,
    jiraTicketsCreated: 0,
    slackMessageSent: false,
    emailsSent: 0,
    error: 'ICA_A2A_KEY not configured — notifications are mock only. Add ICA_A2A_KEY to .env.local.',
  };
}

// ─── Build mock delivery assets for demo mode ─────────────────────────────────

export function buildMockDeliverables(input: ICADeliverableInput): ICADeliverables {
  const decision = input.readinessDecision.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  return {
    executiveSummary: [
      `# Executive Summary — ${input.engagementName}`,
      ``,
      `**Readiness Verdict:** ${decision} · ${input.readinessScore}%`,
      `**Confidence:** ${input.confidenceScore}%`,
      ``,
      `## Assessment Summary`,
      input.executiveSummary,
      ``,
      `## Key Findings`,
      input.criticalIssues.slice(0, 3).map((i, n) => `${n + 1}. ${i}`).join('\n'),
      ``,
      `## Completed Remediation (${input.completedTasks.length} actions)`,
      input.completedTasks.map((t) => `- ${t.title} [${t.ownerRole}]`).join('\n'),
      ``,
      `*Generated by IBM Consulting Advantage · Engagement Ready AI*`,
    ].join('\n'),

    clientEmail: [
      `Dear ${input.clientName} Team,`,
      ``,
      `We are pleased to confirm that the engagement readiness assessment for ${input.engagementName} has been completed.`,
      ``,
      `Status: ${decision} (${input.readinessScore}%)`,
      ``,
      input.businessImpact,
      ``,
      `Next Steps:`,
      input.recommendations.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join('\n'),
      ``,
      `Please do not hesitate to reach out with any questions.`,
      ``,
      `Best regards,`,
      `${input.leadConsultant}`,
      `IBM Consulting — Engagement Lead`,
    ].join('\n'),

    internalEmail: [
      `Team,`,
      ``,
      `All ${input.completedTasks.length} remediation actions have been completed and the lead consultant has approved.`,
      ``,
      `Final Status: ${decision} · ${input.readinessScore}%`,
      ``,
      `Completed Actions:`,
      input.completedTasks.map((t) => `  ✓ ${t.title} (${t.ownerRole})`).join('\n'),
      ``,
      `The engagement is now approved for delivery. Proceed with kick-off preparation.`,
      ``,
      `— ${input.leadConsultant}, IBM Consulting`,
    ].join('\n'),

    slackMessage: [
      `*Engagement Ready AI — ${input.engagementName}*`,
      ``,
      `✅ All ${input.completedTasks.length} remediation tasks complete`,
      `📊 Readiness: ${decision} · ${input.readinessScore}%`,
      `👤 Approved by: ${input.leadConsultant}`,
      ``,
      `The engagement is now *ready for delivery*. Kick-off can proceed.`,
    ].join('\n'),

    jiraEpic: [
      `# Jira Epic: ${input.engagementName} — Readiness Remediation`,
      ``,
      `**Epic Key:** ERA-EPIC-001`,
      `**Status:** Done`,
      `**Assignee:** ${input.leadConsultant}`,
      ``,
      `## Summary`,
      `All pre-delivery readiness gaps have been addressed. Engagement is approved for delivery.`,
      ``,
      `## Linked Issues`,
      input.completedTasks.map((t, i) => `- ERA-${100 + i}: ${t.title} [${t.ownerRole}] — Done`).join('\n'),
      ``,
      `## Acceptance Criteria`,
      `- All ${input.completedTasks.length} remediation actions marked complete`,
      `- Lead consultant has provided final approval`,
      `- Readiness score: ${input.readinessScore}%`,
    ].join('\n'),
  };
}
