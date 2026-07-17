'use client';

import { useState } from 'react';
import {
  Bell,
  CheckCircle2,
  CheckSquare,
  ClipboardCopy,
  Download,
  FileText,
  Info,
  LoaderCircle,
  Mail,
  MessageSquare,
  Package,
  Send,
  Sparkles,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NoAssessmentYet } from '@/components/ui/empty-state';
import { useToastStore } from '@/components/ui/toast';
import { useWorkflowStore } from '@/store/workflow-store';
import type { ConsultingAsset, ICAAssetType, ICAGenerateRequest, ICAGenerateResult } from '@/types/domain';

// ─── ICA asset catalogue ──────────────────────────────────────────────────────

interface ICAAssetSpec {
  id: ICAAssetType;
  title: string;
  description: string;
  category: 'client' | 'internal' | 'delivery' | 'email';
}

const ICA_ASSETS: ICAAssetSpec[] = [
  {
    id: 'executive-summary',
    title: 'Executive Summary',
    description: 'C-suite 1-pager covering readiness verdict, top blockers, and recommended actions.',
    category: 'client',
  },
  {
    id: 'client-status-report',
    title: 'Client Status Report',
    description: 'Professional client-facing status report with achievements, risks, and next milestones.',
    category: 'client',
  },
  {
    id: 'proposal-inputs',
    title: 'Proposal Inputs',
    description: 'Scope summary, deliverables, assumptions, exclusions, and timeline for proposals.',
    category: 'delivery',
  },
  {
    id: 'business-requirements',
    title: 'Business Requirements',
    description: 'Structured BR table with ID, description, priority, and acceptance conditions.',
    category: 'delivery',
  },
  {
    id: 'functional-requirements',
    title: 'Functional Requirements',
    description: 'FR table with ID, category, status, and priority for each functional need.',
    category: 'delivery',
  },
  {
    id: 'user-stories',
    title: 'User Stories',
    description: 'As a [role], I want to [action] so that [benefit] — with acceptance criteria.',
    category: 'delivery',
  },
  {
    id: 'epics',
    title: 'Epics',
    description: 'Delivery epics grouped by theme with estimated effort and contained user stories.',
    category: 'delivery',
  },
  {
    id: 'acceptance-criteria',
    title: 'Acceptance Criteria',
    description: 'Given/When/Then acceptance criteria for the top requirements and critical issues.',
    category: 'delivery',
  },
  {
    id: 'raid-log',
    title: 'RAID Log',
    description: 'Risks, Assumptions, Issues, Dependencies — with owner, impact, and mitigation.',
    category: 'delivery',
  },
  {
    id: 'assumptions',
    title: 'Assumptions & Constraints',
    description: 'Documented assumptions, constraints, and dependencies with validation approach.',
    category: 'delivery',
  },
  {
    id: 'decision-log',
    title: 'Decision Log',
    description: 'Key decisions made or required, with decision maker, rationale, and impact.',
    category: 'delivery',
  },
  {
    id: 'next-workshop-agenda',
    title: 'Next Workshop Agenda',
    description: 'Timed workshop agenda from open questions and blockers, with owners and decisions.',
    category: 'delivery',
  },
  {
    id: 'workshop-minutes',
    title: 'Workshop Minutes Template',
    description: 'Meeting header, agenda items, decisions, actions, and next meeting template.',
    category: 'delivery',
  },
  {
    id: 'action-tracker',
    title: 'Action Tracker',
    description: 'Complete action tracker from critical issues, recommendations, and open questions.',
    category: 'delivery',
  },
  {
    id: 'follow-up-email',
    title: 'Consultant Follow-up Email',
    description: 'Internal team follow-up email with outcome summary, actions, and deadlines.',
    category: 'email',
  },
  {
    id: 'client-email',
    title: 'Client Communication Email',
    description: 'Professional client-facing email with findings, required actions, and next steps.',
    category: 'email',
  },
  {
    id: 'internal-update',
    title: 'Internal Team Update',
    description: 'Scannable Slack/Teams update with status, critical actions, and blockers.',
    category: 'internal',
  },
  {
    id: 'steering-committee-summary',
    title: 'Steering Committee Summary',
    description: '2-page steering committee summary with scorecard, blockers, and decisions needed.',
    category: 'client',
  },
];

// ─── Delivery channel config ──────────────────────────────────────────────────

const CHANNELS = [
  {
    id: 'ica' as const,
    label: 'IBM Consulting Advantage',
    sublabel: 'JSON export → IBM Bob → ICA',
    description:
      "Exports a structured JSON package of all assets and the HITL decision. IBM Bob (connected to ICA via MCP) picks this up and pushes it into ICA's Context Studio.",
    icon: <Send className="h-4 w-4" />,
    envHint: 'ICA_MCP_KEY + ICA_MCP_URL',
  },
  {
    id: 'slack' as const,
    label: 'Slack',
    sublabel: 'Direct webhook',
    description: 'Posts a rich assessment summary card directly to your Slack channel.',
    icon: <MessageSquare className="h-4 w-4" />,
    envHint: 'SLACK_WEBHOOK_URL',
  },
  {
    id: 'email' as const,
    label: 'Email',
    sublabel: 'SMTP',
    description: 'Sends a formatted HTML email with the full assessment summary and scores.',
    icon: <Mail className="h-4 w-4" />,
    envHint: 'EMAIL_SMTP_HOST + EMAIL_USER + EMAIL_PASS',
  },
] as const;

type ChannelId = 'ica' | 'slack' | 'email';

interface NotifyResult {
  channel: ChannelId;
  sent: boolean;
  live: boolean;
  error?: string;
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function QAReviewView() {
  const hasLiveReview = useWorkflowStore((s) => s.hasLiveReview);
  const liveReview = useWorkflowStore((s) => s.latestReview);

  if (!hasLiveReview || !liveReview) {
    return (
      <NoAssessmentYet
        icon={CheckSquare}
        title="No assessment yet"
        description="Run an AI assessment to unlock the ICA Accelerator — generate executive summaries, user stories, RAID logs, emails, workshop agendas, and 14 more consulting artefacts with one click."
      />
    );
  }

  const assets = liveReview.consultingAssets;

  return (
    <div className="page-stack">
      {/* Hero */}
      <section className="glass-panel rounded-[30px] p-6 md:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="section-caption">ICA Accelerator</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              Accelerate with IBM Consulting Advantage
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              Generate 18 professional consulting artefacts from your readiness assessment with one click.
              ICA is the productivity layer — it uses watsonx.ai Granite to create client-ready deliverables
              without re-running the full readiness pipeline.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:w-[300px]">
            <Stat label="Readiness" value={`${liveReview.readinessScore}%`} />
            <Stat label="Confidence" value={`${liveReview.confidenceScore}%`} />
            <Stat label="Draft assets" value={String(assets.length)} />
            <Stat label="ICA artefacts" value="18" />
          </div>
        </div>
      </section>

      {/* ICA Asset Generator */}
      <ICAAcceleratorPanel review={liveReview} />

      {/* Draft assets (from pipeline) */}
      {assets.length > 0 && (
        <section>
          <div className="mb-4">
            <p className="section-caption">Pipeline assets</p>
            <h2 className="section-title mt-1">Draft artefacts from AI assessment</h2>
            <p className="text-sm text-muted-foreground mt-1">
              These were auto-generated during the assessment. Edit them or use the ICA Accelerator above for
              richer AI-generated versions.
            </p>
          </div>
          <div className="grid gap-5 xl:grid-cols-2">
            {assets.map((asset) => (
              <AssetEditor key={asset.id} asset={asset} />
            ))}
          </div>
        </section>
      )}

      {/* Delivery panel */}
      <DeliverPanel review={liveReview} />
    </div>
  );
}

// ─── ICA Accelerator Panel ────────────────────────────────────────────────────

type ReviewShape = NonNullable<ReturnType<typeof useWorkflowStore.getState>['latestReview']>;

function ICAAcceleratorPanel({ review }: { review: ReviewShape }) {
  const [generatedAssets, setGeneratedAssets] = useState<Map<ICAAssetType, ICAGenerateResult>>(new Map());
  const [loadingAssets, setLoadingAssets] = useState<Set<ICAAssetType>>(new Set());
  const pushToast = useToastStore((s) => s.push);

  async function generate(assetType: ICAAssetType) {
    if (loadingAssets.has(assetType)) return;

    setLoadingAssets((prev) => new Set(prev).add(assetType));

    const req: ICAGenerateRequest = {
      assetType,
      analysisSnapshot: {
        executiveSummary: review.executiveSummary,
        readinessDecision: review.readinessDecision,
        readinessScore: review.readinessScore,
        confidenceScore: review.confidenceScore,
        criticalIssues: review.criticalIssues,
        recommendations: review.recommendations,
        openQuestions: review.openQuestions,
        missingInformation: review.missingInformation,
        businessImpact: review.businessImpact,
        riskExplanation: review.riskExplanation,
        missingStakeholders: review.missingStakeholders,
        missingWorkshops: review.missingWorkshops,
        missingRequirements: review.missingRequirements,
      },
    };

    try {
      const res = await fetch('/api/ica-generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(req),
      });

      const data = (await res.json()) as { data?: ICAGenerateResult; error?: boolean; message?: string };

      if (data.error || !data.data) {
        pushToast({
          title: 'Generation failed',
          description: data.message ?? 'Could not generate the artefact.',
          tone: 'error',
        });
      } else {
        setGeneratedAssets((prev) => new Map(prev).set(assetType, data.data!));
        pushToast({
          title: `✓ ${data.data.title} generated`,
          description: `Model: ${data.data.model}`,
          tone: 'success',
        });
      }
    } catch {
      pushToast({ title: 'Network error', description: 'Could not reach the server.', tone: 'error' });
    } finally {
      setLoadingAssets((prev) => {
        const next = new Set(prev);
        next.delete(assetType);
        return next;
      });
    }
  }

  const categories: Array<{ label: string; key: ICAAssetSpec['category'] }> = [
    { label: 'Client-Facing', key: 'client' },
    { label: 'Delivery Artefacts', key: 'delivery' },
    { label: 'Email Drafts', key: 'email' },
    { label: 'Internal', key: 'internal' },
  ];

  return (
    <section className="glass-panel rounded-[30px] p-6">
      <div className="flex items-start gap-3">
        <Sparkles className="mt-1 h-5 w-5 shrink-0 text-accent-strong" />
        <div>
          <p className="section-caption">Generate with ICA</p>
          <h2 className="section-title mt-1">One-click consulting artefact generation</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Each button triggers a focused IBM Granite call using your engagement assessment as context.
            This does <strong className="text-foreground">not</strong> re-run the readiness pipeline.
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-6">
        {categories.map(({ label, key }) => {
          const assets = ICA_ASSETS.filter((a) => a.category === key);
          return (
            <div key={key}>
              <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {label}
              </p>
              <div className="grid gap-3 sm:grid-cols-2">
                {assets.map((asset) => {
                  const generated = generatedAssets.get(asset.id);
                  const loading = loadingAssets.has(asset.id);

                  return (
                    <ICAAssetCard
                      key={asset.id}
                      spec={asset}
                      generated={generated}
                      loading={loading}
                      onGenerate={() => void generate(asset.id)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      {/* ICA delivery chain explainer */}
      <div className="mt-6 rounded-2xl border border-accent/20 bg-accent/5 p-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-strong">Architecture</p>
        <div className="mt-3 grid gap-2 sm:grid-cols-3 text-xs text-muted-foreground">
          <div className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-strong" />
            <span>
              <strong className="text-foreground">Context Studio</strong> — Engagement knowledge &
              governance rules (retrieved once per assessment)
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-strong" />
            <span>
              <strong className="text-foreground">watsonx.ai</strong> — Focused single-prompt Granite call
              for each artefact (no repeated full pipeline)
            </span>
          </div>
          <div className="flex items-start gap-2">
            <span className="mt-0.5 h-1.5 w-1.5 shrink-0 rounded-full bg-accent-strong" />
            <span>
              <strong className="text-foreground">ICA</strong> — Delivery destination via IBM Bob → MCP
              → ICA Context Studio
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── ICA Asset Card ───────────────────────────────────────────────────────────

function ICAAssetCard({
  spec,
  generated,
  loading,
  onGenerate,
}: {
  spec: ICAAssetSpec;
  generated?: ICAGenerateResult;
  loading: boolean;
  onGenerate: () => void;
}) {
  const [showContent, setShowContent] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copyContent() {
    if (!generated) return;
    await navigator.clipboard.writeText(generated.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div
      className={`rounded-2xl border p-4 transition ${
        generated
          ? 'border-green-500/25 bg-green-500/[0.03]'
          : 'border-border/60 bg-white/[0.02]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{spec.title}</p>
          <p className="mt-1 text-xs text-muted-foreground">{spec.description}</p>
        </div>
        {generated && (
          <span className="shrink-0 rounded-full bg-green-500/15 px-2 py-0.5 text-[10px] font-medium text-green-400">
            ✓ Ready
          </span>
        )}
      </div>

      <div className="mt-3 flex items-center gap-2">
        {!generated ? (
          <button
            type="button"
            onClick={onGenerate}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-accent/50 hover:text-foreground disabled:opacity-50"
          >
            {loading ? (
              <LoaderCircle className="h-3 w-3 animate-spin" />
            ) : (
              <Sparkles className="h-3 w-3 text-accent-strong" />
            )}
            {loading ? 'Generating…' : 'Generate'}
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={() => setShowContent((v) => !v)}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border hover:text-foreground"
            >
              <FileText className="h-3 w-3" />
              {showContent ? 'Hide' : 'View'}
            </button>
            <button
              type="button"
              onClick={() => void copyContent()}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border hover:text-foreground"
            >
              <Download className="h-3 w-3" />
              {copied ? 'Copied!' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={onGenerate}
              disabled={loading}
              className="flex items-center gap-1.5 rounded-lg border border-border/60 bg-white/5 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-border hover:text-foreground disabled:opacity-50"
            >
              {loading ? <LoaderCircle className="h-3 w-3 animate-spin" /> : <Sparkles className="h-3 w-3" />}
              Regenerate
            </button>
          </>
        )}
      </div>

      {showContent && generated && (
        <div className="mt-3 max-h-64 overflow-y-auto rounded-xl border border-border/50 bg-black/10 p-3">
          <pre className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{generated.content}</pre>
        </div>
      )}
    </div>
  );
}

// ─── Asset editor (pipeline drafts) ──────────────────────────────────────────

function AssetEditor({ asset }: { asset: ConsultingAsset }) {
  const [content, setContent] = useState(asset.content);
  const [editing, setEditing] = useState(false);

  const typeLabel = asset.type.replace(/-/g, ' ');

  return (
    <section className="glass-panel rounded-[28px] p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">{typeLabel}</p>
          <h2 className="section-title mt-1.5">{asset.title}</h2>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span
            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
              asset.status === 'approved'
                ? 'bg-green-500/15 text-green-400'
                : asset.status === 'reviewed'
                  ? 'bg-yellow-500/15 text-yellow-400'
                  : 'bg-white/10 text-muted-foreground'
            }`}
          >
            {asset.status}
          </span>
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className="rounded-lg border border-border/60 bg-white/5 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-border hover:text-foreground"
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
      </div>

      <div className="mt-4">
        {editing ? (
          <textarea
            className="min-h-[200px] w-full resize-none rounded-xl border border-border/70 bg-black/10 p-3 text-sm leading-6 text-foreground outline-none focus:border-accent"
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
        ) : (
          <div className="rounded-xl border border-border/50 bg-white/[0.02] p-4">
            <pre className="whitespace-pre-wrap text-sm leading-6 text-muted-foreground">{content}</pre>
          </div>
        )}
      </div>

      <div className="mt-3 flex justify-end">
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(content)}
          className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-white/5 px-2.5 py-1.5 text-xs text-muted-foreground transition hover:border-border hover:text-foreground"
        >
          <Download className="h-3 w-3" />
          Copy
        </button>
      </div>
    </section>
  );
}

// ─── Deliver Panel ────────────────────────────────────────────────────────────

function buildExportPackage(review: ReviewShape) {
  return {
    schema: 'engagement-ready-ai/ica-delivery/v1',
    exportedAt: new Date().toISOString(),
    engagement: {
      id: `eng-${Date.now()}`,
      assessedAt: new Date().toISOString(),
    },
    readiness: {
      decision: review.readinessDecision,
      score: review.readinessScore,
      confidence: review.confidenceScore,
    },
    analysis: {
      executiveSummary: review.executiveSummary,
      riskExplanation: review.riskExplanation,
      businessImpact: review.businessImpact,
      criticalIssues: review.criticalIssues,
      recommendations: review.recommendations,
      openQuestions: review.openQuestions,
      missingInformation: review.missingInformation,
      reasoningTrace: review.reasoningTrace,
      missingStakeholders: review.missingStakeholders,
      missingWorkshops: review.missingWorkshops,
      missingRequirements: review.missingRequirements,
    },
    humanInTheLoop: review.hitlRecord ?? null,
    consultingAssets: review.consultingAssets.map((a) => ({
      id: a.id,
      type: a.type,
      title: a.title,
      content: a.content,
      status: a.status,
    })),
    source: 'engagement-ready-ai',
    sourceVersion: '1.0',
  };
}

function DeliverPanel({ review }: { review: ReviewShape }) {
  const [selected, setSelected] = useState<Set<ChannelId>>(new Set(['slack', 'email']));
  const [recipientEmail, setRecipientEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [results, setResults] = useState<NotifyResult[] | null>(null);
  const [showBobPayload, setShowBobPayload] = useState(false);
  const [payloadCopied, setPayloadCopied] = useState(false);
  const pushToast = useToastStore((s) => s.push);

  const exportPkg = buildExportPackage(review);
  const exportJson = JSON.stringify(exportPkg, null, 2);

  // ── Bob handoff prompt — consultant pastes this into IBM Bob ─────────────────
  const bobPrompt = `Load this engagement assessment into IBM Consulting Advantage and create the consulting deliverables.

\`\`\`json
${exportJson}
\`\`\`

Please:
1. Store this assessment in ICA Context Studio under the engagement
2. Create follow-up tasks for each critical issue
3. Notify relevant stakeholders
4. Link the consulting assets to the ICA project`;

  function toggleChannel(id: ChannelId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function downloadPackage() {
    const blob = new Blob([exportJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `engagement-assessment-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    pushToast({
      title: '✓ Package downloaded',
      description: 'Load this JSON file into IBM Bob to push assets into ICA.',
      tone: 'success',
    });
  }

  async function copyBobPrompt() {
    await navigator.clipboard.writeText(bobPrompt);
    setPayloadCopied(true);
    setTimeout(() => setPayloadCopied(false), 2500);
    pushToast({ title: '✓ Copied', description: 'Paste into IBM Bob to deliver to ICA.', tone: 'success' });
  }

  async function handleDeliver() {
    if (selected.size === 0) {
      pushToast({ title: 'No channels selected', description: 'Select at least one delivery channel.', tone: 'error' });
      return;
    }
    setSending(true);
    setResults(null);

    const pkg = {
      engagementId: exportPkg.engagement.id,
      engagementName: 'Core Banking Modernization',
      clientName: 'Meridian Financial Group',
      leadConsultant: 'Sarah Chen',
      readinessDecision: review.readinessDecision,
      readinessScore: review.readinessScore,
      confidenceScore: review.confidenceScore,
      executiveSummary: review.executiveSummary,
      criticalIssues: review.criticalIssues,
      recommendations: review.recommendations,
      openQuestions: review.openQuestions,
      assets: review.consultingAssets,
      hitlRecord: review.hitlRecord
        ? {
            aiRecommendation: review.hitlRecord.aiRecommendation,
            aiScore: review.hitlRecord.aiScore,
            consultantDecision: review.hitlRecord.consultantDecision,
            consultantChoice: review.hitlRecord.consultantChoice,
            justification: review.hitlRecord.justification,
            decidedAt: review.hitlRecord.decidedAt,
          }
        : undefined,
      assessedAt: exportPkg.exportedAt,
      notifyEmails: recipientEmail.trim() ? [recipientEmail.trim()] : [],
    };

    try {
      const res = await fetch('/api/notify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ package: pkg, channels: Array.from(selected), recipientEmail: recipientEmail.trim() || undefined }),
      });
      const data = (await res.json()) as { ok: boolean; results?: NotifyResult[]; error?: string };

      if (!data.ok) {
        pushToast({ title: 'Delivery failed', description: data.error ?? 'Unexpected error.', tone: 'error' });
        setSending(false);
        return;
      }

      setResults(data.results ?? []);
      const sentChannels = (data.results ?? []).filter((r) => r.sent).map((r) => r.channel);
      const mockChannels = (data.results ?? []).filter((r) => !r.live).map((r) => r.channel);

      if (sentChannels.length > 0) {
        pushToast({ title: '✓ Assets delivered', description: `Sent via: ${sentChannels.join(', ')}`, tone: 'success' });
      } else if (mockChannels.length > 0) {
        pushToast({
          title: 'Running in demo mode',
          description: `${mockChannels.join(', ')} not configured — use IBM Bob export instead.`,
          tone: 'error',
        });
      }
    } catch {
      pushToast({ title: 'Network error', description: 'Could not reach the server.', tone: 'error' });
    } finally {
      setSending(false);
    }
  }

  return (
    <section className="glass-panel rounded-[30px] p-6">
      <div className="flex items-start gap-3">
        <Bell className="mt-1 h-5 w-5 shrink-0 text-accent-strong" />
        <div>
          <p className="section-caption">Deliver assessment</p>
          <h2 className="section-title mt-1">Export to ICA via IBM Bob</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The primary delivery path is <strong className="text-foreground">Export → IBM Bob → ICA</strong>.
            Download the structured assessment package and paste it into IBM Bob — Bob delivers it to ICA via MCP.
            Slack and Email are direct secondary channels.
          </p>
        </div>
      </div>

      {/* ── Bob / ICA export path ─────────────────────────────────────────── */}
      <div className="mt-6 rounded-2xl border border-accent/25 bg-accent/5 p-5">
        <div className="flex items-start gap-3">
          <Package className="mt-0.5 h-5 w-5 shrink-0 text-accent-strong" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-foreground">IBM Consulting Advantage — Primary delivery</p>
            <p className="mt-1 text-xs text-muted-foreground leading-5">
              The ICA MCP Gateway requires IBM Bob session tokens — not available for direct server-to-server calls.
              Export the assessment package, then paste it into IBM Bob. Bob will call your Agentic App and
              push all assets into ICA Context Studio.
            </p>

            {/* delivery chain */}
            <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px]">
              {['This app', '→', 'JSON package', '→', 'IBM Bob', '→', 'ICA Agentic App', '→', 'ICA Context Studio'].map((s, i) =>
                s === '→' ? (
                  <span key={i} className="text-muted-foreground/50">→</span>
                ) : (
                  <span key={i} className="rounded bg-white/8 border border-border/40 px-2 py-0.5 font-medium text-foreground">
                    {s}
                  </span>
                )
              )}
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadPackage}
                className="flex items-center gap-2 rounded-lg border border-accent/40 bg-accent/10 px-4 py-2 text-xs font-semibold text-accent-strong transition hover:bg-accent/20"
              >
                <Download className="h-3.5 w-3.5" />
                Download Assessment Package (.json)
              </button>
              <button
                type="button"
                onClick={() => setShowBobPayload((v) => !v)}
                className="flex items-center gap-2 rounded-lg border border-border/50 bg-white/5 px-4 py-2 text-xs text-muted-foreground transition hover:border-border hover:text-foreground"
              >
                <Info className="h-3.5 w-3.5" />
                {showBobPayload ? 'Hide Bob prompt' : 'Show Bob prompt'}
              </button>
            </div>

            {showBobPayload && (
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-medium text-foreground">Paste this into IBM Bob:</p>
                  <button
                    type="button"
                    onClick={() => void copyBobPrompt()}
                    className="flex items-center gap-1.5 rounded-lg border border-border/50 bg-white/5 px-2.5 py-1 text-xs text-muted-foreground transition hover:border-border hover:text-foreground"
                  >
                    <ClipboardCopy className="h-3 w-3" />
                    {payloadCopied ? 'Copied!' : 'Copy prompt'}
                  </button>
                </div>
                <pre className="max-h-48 overflow-y-auto rounded-xl border border-border/50 bg-black/20 p-3 text-[10px] leading-4 text-muted-foreground whitespace-pre-wrap">
                  {`Load this engagement assessment into IBM Consulting Advantage and create the consulting deliverables.\n\n[assessment JSON included — click "Copy prompt" to get the full payload]`}
                </pre>
                <p className="mt-2 text-[10px] text-muted-foreground/70">
                  IBM Bob is connected to your ICA Agentic App (<code className="rounded bg-white/8 px-1">engagement-readiness-evaluator</code>) via MCP.
                  Bob will call the app, process the payload with GPT-5.2, and store all assets in ICA Context Studio.
                </p>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Secondary channels (Slack / Email) ──────────────────────────────── */}
      <div className="mt-6">
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          Secondary channels
        </p>
        <div className="space-y-3">
          {CHANNELS.filter((ch) => ch.id !== 'ica').map((ch) => {
            const active = selected.has(ch.id);
            return (
              <button
                key={ch.id}
                type="button"
                onClick={() => toggleChannel(ch.id)}
                className={`flex w-full items-start gap-4 rounded-2xl border p-4 text-left transition ${
                  active ? 'border-accent/40 bg-accent/5' : 'border-border/50 bg-white/[0.02] opacity-60'
                }`}
              >
                <div
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
                    active ? 'border-accent bg-accent' : 'border-border/60 bg-transparent'
                  }`}
                >
                  {active && <CheckCircle2 className="h-3 w-3 text-white" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-accent-strong">{ch.icon}</span>
                    <span className="text-sm font-semibold text-foreground">{ch.label}</span>
                    <span className="rounded-full bg-white/8 px-2 py-0.5 text-[10px] text-muted-foreground">{ch.sublabel}</span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{ch.description}</p>
                  <p className="mt-1 text-[10px] text-muted-foreground/60">
                    Configure: <code className="rounded bg-white/8 px-1">{ch.envHint}</code>
                  </p>
                </div>
                {results && <ChannelResult result={results.find((r) => r.channel === ch.id)} />}
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-5">
        <label className="block">
          <span className="text-sm font-medium text-foreground">
            Recipient email <span className="text-muted-foreground font-normal">(optional override)</span>
          </span>
          <input
            type="email"
            className="mt-2 h-11 w-full rounded-xl border border-border/70 bg-black/10 px-4 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/60 focus:border-accent"
            placeholder="consultant@example.com"
            value={recipientEmail}
            onChange={(e) => setRecipientEmail(e.target.value)}
            disabled={sending}
          />
        </label>
      </div>

      <div className="mt-6 flex items-center gap-4">
        <Button
          onClick={() => void handleDeliver()}
          disabled={sending || selected.size === 0}
          className="min-w-[180px]"
        >
          {sending ? (
            <><LoaderCircle className="mr-2 h-4 w-4 animate-spin" />Delivering…</>
          ) : (
            <><Send className="mr-2 h-4 w-4" />Send notifications ({selected.size})</>
          )}
        </Button>
        {results && (
          <p className="text-xs text-muted-foreground">
            {results.filter((r) => r.sent).length} of {results.length} channel(s) sent
          </p>
        )}
      </div>
    </section>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ChannelResult({ result }: { result: NotifyResult | undefined }) {
  if (!result) return null;

  if (result.sent) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-green-500/15 px-2.5 py-1 text-xs font-medium text-green-400">
        <CheckCircle2 className="h-3 w-3" /> Sent
      </span>
    );
  }

  if (!result.live) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/8 px-2.5 py-1 text-xs text-muted-foreground">
        Demo mode
      </span>
    );
  }

  return (
    <span className="flex shrink-0 items-center gap-1 rounded-full bg-red-500/15 px-2.5 py-1 text-xs text-danger">
      <XCircle className="h-3 w-3" /> Failed
    </span>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-subtle rounded-2xl p-3">
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}
