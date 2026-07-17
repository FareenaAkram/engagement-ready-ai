/**
 * POST /api/ask
 *
 * Interactive AI follow-up Q&A on the current engagement assessment.
 *
 * The consultant asks a question in plain English — e.g. "Why is Security
 * Architecture still blocking?" or "What would it take to get to 80%?"
 *
 * This is a single focused Granite call (not the 3-agent pipeline).
 * The current assessment findings are injected as context so Granite can
 * explain its own reasoning interactively.
 *
 * Body:  { question: string }
 * Returns: { answer: string, question: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { readWorkflowState } from '@/lib/workflow-state';
import { hasWatsonxConfig, appEnv } from '@/lib/env';

export const dynamic = 'force-dynamic';

// ─── Re-use the same IAM token cache pattern ─────────────────────────────────

let _cachedToken: string | null = null;
let _tokenExpiresAt = 0;

async function getToken(): Promise<string> {
  if (_cachedToken && Date.now() < _tokenExpiresAt - 30_000) return _cachedToken;
  const res = await fetch('https://iam.cloud.ibm.com/identity/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ibm:params:oauth:grant-type:apikey',
      apikey: appEnv.watsonxApiKey ?? '',
    }),
  });
  if (!res.ok) throw new Error(`IAM token fetch failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  _cachedToken = json.access_token;
  _tokenExpiresAt = Date.now() + json.expires_in * 1000;
  return _cachedToken;
}

async function callGraniteOnce(system: string, user: string): Promise<string> {
  const token = await getToken();
  const res = await fetch(`${appEnv.watsonxUrl}/ml/v1/text/generation?version=2023-05-29`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model_id: appEnv.watsonxModelId,
      project_id: appEnv.watsonxProjectId,
      input: `${system}\n\n[USER]\n${user}\n\n[ASSISTANT]\n`,
      parameters: {
        decoding_method: 'greedy',
        max_new_tokens: 400,
        stop_sequences: ['[USER]', '[INST]', '\n\n---'],
      },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Granite ask failed: ${res.status}`);
  const json = (await res.json()) as { results?: Array<{ generated_text?: string }> };
  return json.results?.[0]?.generated_text?.trim() ?? '';
}

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { question?: string };
    const question = body.question?.trim();

    if (!question) {
      return NextResponse.json({ error: true, message: 'question is required' }, { status: 400 });
    }

    if (!hasWatsonxConfig()) {
      return NextResponse.json({
        answer: 'watsonx is not configured. Add WATSONX_API_KEY and WATSONX_PROJECT_ID to .env.local to enable AI follow-up answers.',
        question,
        mock: true,
      });
    }

    const state = readWorkflowState();
    const review = state.latestReview;

    if (!review) {
      return NextResponse.json({
        answer: 'No assessment has been run yet. Submit a readiness assessment first, then ask follow-up questions.',
        question,
        mock: true,
      });
    }

    // Build a compact context snapshot from the current assessment findings
    const context = [
      `ENGAGEMENT READINESS ASSESSMENT FINDINGS`,
      `Readiness Decision: ${review.readinessDecision} (${review.readinessScore}%, confidence ${review.confidenceScore}%)`,
      `Executive Summary: ${review.executiveSummary}`,
      `Risk Explanation: ${review.riskExplanation}`,
      review.criticalIssues.length > 0
        ? `Critical Issues:\n${review.criticalIssues.map((i, n) => `  ${n + 1}. ${i}`).join('\n')}`
        : 'Critical Issues: None',
      review.reasoningTrace.length > 0
        ? `Reasoning Trace:\n${review.reasoningTrace.map((t) => `  ${t.status === 'present' ? '✓' : t.status === 'blocking' ? '✗' : '⚠'} ${t.category}: ${t.evidence}`).join('\n')}`
        : '',
      review.missingStakeholders.length > 0
        ? `Missing Stakeholders:\n${review.missingStakeholders.map((s) => `  - ${s.role}: ${s.reason} (impact: ${s.impact})`).join('\n')}`
        : '',
      review.missingRequirements.length > 0
        ? `Missing Requirements:\n${review.missingRequirements.map((r) => `  - ${r.category}: ${r.description} (impact: ${r.impact})`).join('\n')}`
        : '',
      review.openQuestions.length > 0
        ? `Open Questions:\n${review.openQuestions.map((q, n) => `  ${n + 1}. ${q}`).join('\n')}`
        : '',
    ].filter(Boolean).join('\n\n');

    const systemPrompt = `You are an IBM Consulting Delivery Readiness Advisor. The consultant has just reviewed an AI-generated engagement readiness assessment and wants to ask a follow-up question.

Your role:
- Answer the consultant's question concisely and specifically, using ONLY the assessment data provided
- Do NOT invent information not present in the assessment
- If the assessment does not contain enough information to answer, say so clearly
- Be direct and actionable — this is a consulting context, not a chatbot
- Keep your answer under 200 words

CURRENT ASSESSMENT DATA:
${context}`;

    const answer = await callGraniteOnce(systemPrompt, question);

    console.log(`[api/ask] Q: "${question.slice(0, 80)}" | A: ${answer.length} chars`);

    return NextResponse.json({ answer, question });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    console.error('[api/ask] Error:', message);
    return NextResponse.json({ error: true, message }, { status: 500 });
  }
}
