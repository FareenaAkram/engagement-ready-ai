/**
 * ICA On-Demand Consulting Asset Generator
 *
 * This service generates individual consulting artefacts using the existing
 * watsonx.ai connection (IBM Granite). It is called AFTER the readiness
 * assessment has completed — it does NOT re-run the full pipeline.
 *
 * Architecture:
 *   Consultant clicks "Generate X" in the ICA panel
 *   → POST /api/ica-generate { assetType, analysisSnapshot }
 *   → callGranite() with a focused single prompt
 *   → Return formatted content
 *
 * Each generator is a focused, single-call watsonx.ai invocation.
 * No multi-agent orchestration — this is the ICA Consulting Productivity Layer.
 */

import type { ICAAssetType, ICAGenerateRequest, ICAGenerateResult } from '@/types/domain';
import { appEnv, hasWatsonxConfig } from '@/lib/env';

// ─── IAM Token (re-use from watsonx-service pattern) ─────────────────────────

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
    signal: AbortSignal.timeout(15_000),
  });

  if (!res.ok) throw new Error(`IAM token fetch failed: ${res.status}`);
  const json = (await res.json()) as { access_token: string; expires_in: number };
  _cachedToken = json.access_token;
  _tokenExpiresAt = Date.now() + json.expires_in * 1000;
  return _cachedToken;
}

async function callGraniteOnce(systemPrompt: string, userContent: string, maxTokens = 800): Promise<string> {
  const token = await getToken();
  const url = `${appEnv.watsonxUrl}/ml/v1/text/generation?version=2023-05-29`;

  const body = {
    model_id: appEnv.watsonxModelId,
    project_id: appEnv.watsonxProjectId,
    input: `${systemPrompt}\n\n[USER]\n${userContent}\n\n[ASSISTANT]\n`,
    parameters: {
      decoding_method: 'greedy',
      max_new_tokens: maxTokens,
      stop_sequences: ['[USER]', '[INST]'],
    },
  };

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`watsonx inference failed: ${response.status} — ${err}`);
  }

  const data = (await response.json()) as { results?: Array<{ generated_text?: string }> };
  return data.results?.[0]?.generated_text?.trim() ?? '';
}

// ─── Asset title map ──────────────────────────────────────────────────────────

const ASSET_TITLES: Record<ICAAssetType, string> = {
  'executive-summary': 'Executive Summary',
  'client-status-report': 'Client Status Report',
  'proposal-inputs': 'Proposal Inputs',
  'business-requirements': 'Business Requirements',
  'functional-requirements': 'Functional Requirements',
  'user-stories': 'User Stories',
  'epics': 'Epics',
  'acceptance-criteria': 'Acceptance Criteria',
  'raid-log': 'RAID Log',
  'assumptions': 'Assumptions & Constraints',
  'decision-log': 'Decision Log',
  'follow-up-email': 'Follow-up Email (Consultant)',
  'client-email': 'Client Communication Email',
  'internal-update': 'Internal Team Update',
  'steering-committee-summary': 'Steering Committee Summary',
  'next-workshop-agenda': 'Next Workshop Agenda',
  'workshop-minutes': 'Workshop Minutes Template',
  'action-tracker': 'Action Tracker',
};

// ─── Prompt builders — one per asset type ─────────────────────────────────────

function buildPrompt(req: ICAGenerateRequest): { system: string; user: string; maxTokens: number } {
  const { assetType, analysisSnapshot: s } = req;
  const decision = s.readinessDecision.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const issueList = s.criticalIssues.map((i, n) => `${n + 1}. ${i}`).join('\n') || 'None identified';
  const recList = s.recommendations.map((r, n) => `${n + 1}. ${r}`).join('\n') || 'None identified';
  const qList = s.openQuestions.map((q, n) => `${n + 1}. ${q}`).join('\n') || 'None identified';
  const missList = s.missingInformation.map((m, n) => `${n + 1}. ${m}`).join('\n') || 'None identified';

  const context = `ENGAGEMENT CONTEXT:
Readiness: ${decision} (${s.readinessScore}%)
Confidence: ${s.confidenceScore}%
Executive Summary: ${s.executiveSummary}
Risk Explanation: ${s.riskExplanation}
Business Impact: ${s.businessImpact}

Critical Issues:
${issueList}

Recommendations:
${recList}

Open Questions:
${qList}

Missing Information:
${missList}`;

  const systemBase = `You are an IBM Consulting Senior Consultant generating professional consulting artefacts.
Write clearly, concisely, and professionally. Use IBM Consulting standards.
Base everything on the engagement context provided — do not fabricate.`;

  switch (assetType) {
    case 'executive-summary':
      return {
        system: systemBase,
        user: `${context}\n\nWrite a 1-page C-suite executive summary covering:\n- Readiness verdict and score in plain language\n- Top 3 blockers concisely explained\n- Recommended immediate actions with responsible parties\n- Business risk and timeline impact\nFormat as professional markdown with headers.`,
        maxTokens: 600,
      };

    case 'client-status-report':
      return {
        system: systemBase,
        user: `${context}\n\nWrite a professional client-facing status report covering:\n- Project status overview\n- Key achievements this period\n- Current risks and issues\n- Actions required from client\n- Next milestones\nFormat as clean markdown suitable for client distribution.`,
        maxTokens: 700,
      };

    case 'proposal-inputs':
      return {
        system: systemBase,
        user: `${context}\n\nGenerate structured proposal inputs covering:\n- Proposed scope summary\n- Key deliverables\n- Assumptions\n- Exclusions\n- Suggested timeline phases\n- Estimated value at risk if readiness gaps are not resolved\nFormat as bulleted markdown.`,
        maxTokens: 700,
      };

    case 'business-requirements':
      return {
        system: systemBase,
        user: `${context}\n\nExtract and structure business requirements from the engagement context:\n- For each requirement: ID (BR-01, BR-02...), description, priority (Must Have / Should Have / Nice to Have), stakeholder, acceptance condition\nFormat as a markdown table.`,
        maxTokens: 800,
      };

    case 'functional-requirements':
      return {
        system: systemBase,
        user: `${context}\n\nExtract and structure functional requirements:\n- ID (FR-01, FR-02...), description, priority, category (e.g. Authentication, Integration, Reporting), status (Confirmed / Assumed / Missing)\nFormat as a markdown table.`,
        maxTokens: 800,
      };

    case 'user-stories':
      return {
        system: systemBase,
        user: `${context}\n\nGenerate 5-8 user stories in the format:\n"As a [role], I want to [action] so that [benefit]."\nFor each story add: Story ID, Priority, Acceptance Criteria (2-3 conditions), Notes.\nBase stories on the functional requirements and business objectives in the context.`,
        maxTokens: 900,
      };

    case 'epics':
      return {
        system: systemBase,
        user: `${context}\n\nGenerate 4-6 delivery epics. For each epic:\n- Epic ID (EP-01...), Title, Description, Goal, Contained User Stories (reference), Priority, Estimated Effort (S/M/L/XL)\nFormat as markdown sections.`,
        maxTokens: 700,
      };

    case 'acceptance-criteria':
      return {
        system: systemBase,
        user: `${context}\n\nGenerate acceptance criteria for the top 5 critical requirements or issues identified.\nFor each: ID, Title, Given/When/Then format, Pass condition, Fail condition.\nFormat as markdown.`,
        maxTokens: 800,
      };

    case 'raid-log':
      return {
        system: systemBase,
        user: `${context}\n\nGenerate a RAID Log (Risks, Assumptions, Issues, Dependencies).\nFor each entry: ID, Category (Risk/Assumption/Issue/Dependency), Description, Owner, Impact (High/Medium/Low), Mitigation/Action, Status (Open/In Progress/Closed).\nFormat as a markdown table with sections per category.`,
        maxTokens: 900,
      };

    case 'assumptions':
      return {
        system: systemBase,
        user: `${context}\n\nDocument engagement assumptions and constraints:\n- Assumptions: things believed to be true that have not been confirmed\n- Constraints: limitations on the engagement\n- Dependencies: external factors required for delivery\nFor each: ID, Description, Owner, Impact if wrong, Validation approach.\nFormat as markdown.`,
        maxTokens: 700,
      };

    case 'decision-log':
      return {
        system: systemBase,
        user: `${context}\n\nGenerate a decision log from the engagement context. For each key decision identified or needed:\n- Decision ID (D-01...), Topic, Decision Made / Required, Decision Maker, Date / Target Date, Rationale, Impact if delayed.\nFormat as a markdown table.`,
        maxTokens: 700,
      };

    case 'follow-up-email':
      return {
        system: systemBase,
        user: `${context}\n\nDraft a professional follow-up email from the IBM Consulting lead to the internal team after the engagement assessment.\nSubject line, body covering: assessment outcome, key actions assigned to each team member, deadlines, next meeting request.\nProfessional tone. Format as an email (Subject / Body).`,
        maxTokens: 600,
      };

    case 'client-email':
      return {
        system: systemBase,
        user: `${context}\n\nDraft a professional client-facing email from the IBM Consulting lead.\nSubject line, body covering: summary of assessment findings in client-friendly language, 3 key actions required from the client, proposed next steps, availability for a follow-up call.\nConfident but collaborative tone. Format as an email (Subject / Body).`,
        maxTokens: 600,
      };

    case 'internal-update':
      return {
        system: systemBase,
        user: `${context}\n\nWrite an internal IBM Consulting team update (for Slack or Teams) covering:\n- Engagement status in one sentence\n- Readiness score and recommendation\n- 3 most critical actions this week\n- Any blockers that need escalation\n- Next milestone\nFormat as a short, scannable update. Use bullet points.`,
        maxTokens: 400,
      };

    case 'steering-committee-summary':
      return {
        system: systemBase,
        user: `${context}\n\nWrite a steering committee summary (2 pages max) covering:\n- Executive headline: readiness status\n- Scorecard: Readiness %, Confidence, Open Risks, Open Actions\n- Top 3 blockers requiring committee awareness\n- Recommended decisions needed from committee\n- Timeline and next milestone\nFormat as professional markdown.`,
        maxTokens: 700,
      };

    case 'next-workshop-agenda':
      return {
        system: systemBase,
        user: `${context}\n\nGenerate a timed workshop agenda for the next discovery or architecture workshop.\nBase it on the open questions, critical issues, and missing stakeholders.\nFormat:\n- Workshop Title and Objective\n- Date/Time placeholder\n- Attendees (roles)\n- Agenda items with: Time (e.g. 09:00-09:15), Topic, Owner, Decision Required (Y/N)\n- Close: Actions and next steps\nMake it realistic and complete.`,
        maxTokens: 800,
      };

    case 'workshop-minutes':
      return {
        system: systemBase,
        user: `${context}\n\nGenerate a workshop minutes template for the upcoming workshop.\nInclude: Meeting header (Date, Attendees, Facilitator, Scribe, Location), Agenda Items discussed (summarised), Decisions Made, Actions (Owner, Due Date, Status), Next Meeting date placeholder.\nThis is a template — mark placeholder fields with [PLACEHOLDER].\nFormat as markdown.`,
        maxTokens: 700,
      };

    case 'action-tracker':
      return {
        system: systemBase,
        user: `${context}\n\nGenerate a complete action tracker from all critical issues, recommendations, and open questions.\nFor each action: ID (ACT-01...), Title (verb phrase), Owner Role (Consultant/Architect/Partner/Client), Priority (Critical/High/Medium), Due Date (e.g. "Before delivery kickoff"), Status (Open), Description (2 sentences).\nFormat as a markdown table.`,
        maxTokens: 900,
      };

    default:
      return {
        system: systemBase,
        user: `${context}\n\nGenerate a professional consulting artefact for: ${assetType}.\nFormat as clean markdown.`,
        maxTokens: 700,
      };
  }
}

// ─── Fallback content ─────────────────────────────────────────────────────────

function buildFallbackContent(assetType: ICAAssetType, analysisSnapshot: ICAGenerateRequest['analysisSnapshot']): string {
  const decision = analysisSnapshot.readinessDecision.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  const title = ASSET_TITLES[assetType];

  return `# ${title}

**Generated by:** Engagement Ready AI (ICA Abstraction Layer — Demo Mode)
**Readiness:** ${decision} · ${analysisSnapshot.readinessScore}%
**Confidence:** ${analysisSnapshot.confidenceScore}%

---

${analysisSnapshot.executiveSummary}

## Key Findings

${analysisSnapshot.criticalIssues.map((i, n) => `${n + 1}. ${i}`).join('\n')}

## Recommended Actions

${analysisSnapshot.recommendations.map((r, n) => `${n + 1}. ${r}`).join('\n')}

---

*This is a demo artefact generated from the readiness assessment. Configure WATSONX_API_KEY for AI-generated content.*`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Generate a single ICA consulting artefact on demand.
 * Uses IBM Granite if configured; falls back to structured template otherwise.
 */
export async function generateICAAsset(req: ICAGenerateRequest): Promise<ICAGenerateResult> {
  const { assetType } = req;
  const title = ASSET_TITLES[assetType];

  if (!hasWatsonxConfig()) {
    return {
      assetType,
      title,
      content: buildFallbackContent(assetType, req.analysisSnapshot),
      generatedAt: new Date().toISOString(),
      model: 'demo-mode',
    };
  }

  try {
    const { system, user, maxTokens } = buildPrompt(req);
    const content = await callGraniteOnce(system, user, maxTokens);

    return {
      assetType,
      title,
      content: content || buildFallbackContent(assetType, req.analysisSnapshot),
      generatedAt: new Date().toISOString(),
      model: appEnv.watsonxModelId,
    };
  } catch (err) {
    console.error(`[ica-generate] Failed to generate ${assetType}:`, err);
    return {
      assetType,
      title,
      content: buildFallbackContent(assetType, req.analysisSnapshot),
      generatedAt: new Date().toISOString(),
      model: 'fallback',
    };
  }
}
