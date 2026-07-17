'use client';

import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  Bot,
  BrainCircuit,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  Layers3,
  ListChecks,
  LoaderCircle,
  Mail,
  MessageSquare,
  Printer,
  Send,
  Sparkles,
  Timer,
  TriangleAlert,
  UserCheck,
  UserX,
  Wrench,
  XCircle,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { NoAssessmentYet } from '@/components/ui/empty-state';
import { useToastStore } from '@/components/ui/toast';
import { useLiveAIAnalysis } from '@/hooks/use-dashboard-data';
import { readinessLabel, statusTone } from '@/lib/utils';
import { useWorkflowStore } from '@/store/workflow-store';
import type { AgentStepResult } from '@/types/watsonx';
import type { DispatchResult } from '@/lib/workflow-state';
import type {
  AIAnalysisResult,
  ConsultingAsset,
  HITLRecord,
  MissingRequirement,
  MissingStakeholder,
  MissingWorkshop,
  ReasoningTraceItem,
  ReadinessStatus,
  SimulatorCondition,
} from '@/types/domain';

export function AIAnalysisView() {
  const { data, isLoading, isError } = useLiveAIAnalysis();
  const lastDispatchResult = data?.lastDispatchResult ?? null;

  if (isLoading) return <AnalysisSkeleton />;

  if (isError || !data) {
    return (
      <section className="glass-panel rounded-[30px] p-6">
        <p className="text-sm font-medium text-danger">Unable to load AI analysis.</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Refresh the page to retrieve the latest watsonx.ai output.
        </p>
      </section>
    );
  }

  if (!data.data) {
    return (
      <NoAssessmentYet
        icon={Bot}
        title="No AI analysis yet"
        description="Submit a project assessment to see the watsonx.ai reasoning trace — executive summary, readiness decision, explainable reasoning, and consulting assets will appear here."
      />
    );
  }

  const analysis = data.data;

  return (
    <div className="page-stack" id="ai-findings-report">
      {/* Hero */}
      <section className="glass-panel rounded-[30px] p-6 md:p-7">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-2xl">
            <p className="section-caption">Delivery Readiness Assessment</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              AI findings & readiness verdict
            </h1>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              {analysis.pipelineSteps.length > 0
                ? 'Real IBM Granite inference — evidence-backed reasoning with structured explainability.'
                : 'watsonx.ai evaluated your engagement evidence using the Delivery Readiness Advisor. Review findings and make your consultant decision.'}
            </p>
            <button
              onClick={() => window.print()}
              data-no-print
              className="mt-4 inline-flex items-center gap-2 rounded-xl border border-border/60 bg-white/[0.04] px-4 py-2 text-sm text-muted-foreground transition hover:border-accent-strong/50 hover:text-foreground print:hidden"
            >
              <Printer className="h-4 w-4" />
              Export PDF
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 xl:w-[380px]">
            <AnalysisMeta
              label="Recommendation"
              value={readinessLabel(analysis.readinessDecision)}
              tone={analysis.readinessDecision}
            />
            <AnalysisMeta
              label="Readiness score"
              value={`${analysis.readinessScore}%`}
              tone={analysis.readinessDecision}
            />
            <AnalysisMeta label="AI confidence" value={`${analysis.confidenceScore}%`} />
            <AnalysisMeta label="Time saved" value={`${analysis.estimatedTimeSavedHours}h`} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          {/* Executive summary */}
          <Panel>
            <p className="section-caption">Executive summary</p>
            <h2 className="section-title mt-2">AI recommendation</h2>
            <div className="mt-5 rounded-2xl border border-border/70 bg-white/5 p-4">
              <div className="flex items-center gap-3">
                <Bot className="h-5 w-5 text-accent-strong" />
                <p className={`text-base font-semibold ${statusTone(analysis.readinessDecision)}`}>
                  {readinessLabel(analysis.readinessDecision)}
                </p>
                <span className="ml-auto text-xs text-muted-foreground">
                  {analysis.confidenceScore}% confidence
                </span>
              </div>
              <p className="mt-3 text-sm leading-6 text-muted-foreground">{analysis.executiveSummary}</p>
              <p className="mt-3 text-sm leading-6 text-foreground">{analysis.riskExplanation}</p>
            </div>
          </Panel>

          {/* Explainable AI reasoning trace */}
          {analysis.reasoningTrace && analysis.reasoningTrace.length > 0 && (
            <ExplainabilityPanel trace={analysis.reasoningTrace} />
          )}

          {/* Missing stakeholders */}
          {analysis.missingStakeholders && analysis.missingStakeholders.length > 0 && (
            <MissingStakeholdersPanel stakeholders={analysis.missingStakeholders} />
          )}

          {/* Missing workshops */}
          {analysis.missingWorkshops && analysis.missingWorkshops.length > 0 && (
            <MissingWorkshopsPanel workshops={analysis.missingWorkshops} />
          )}

          {/* Missing requirements */}
          {analysis.missingRequirements && analysis.missingRequirements.length > 0 && (
            <MissingRequirementsPanel requirements={analysis.missingRequirements} />
          )}

          {/* HITL Decision Panel */}
          <HITLDecisionPanel analysis={analysis} lastDispatchResult={lastDispatchResult} />

          {/* Critical issues */}
          {analysis.criticalIssues.length > 0 && (
            <Panel>
              <p className="section-caption">Critical issues</p>
              <h2 className="section-title mt-2">Findings that block delivery readiness</h2>
              <div className="mt-5 space-y-3">
                {analysis.criticalIssues.map((issue) => (
                  <div key={issue} className="surface-card p-4">
                    <div className="flex items-center gap-3">
                      <TriangleAlert className="h-4 w-4 shrink-0 text-danger" />
                      <p className="text-sm font-medium text-foreground">{issue}</p>
                    </div>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Open questions */}
          {analysis.openQuestions.length > 0 && (
            <Panel>
              <p className="section-caption">Open questions</p>
              <h2 className="section-title mt-2">Unanswered questions requiring resolution</h2>
              <div className="mt-5 space-y-2">
                {analysis.openQuestions.map((q, i) => (
                  <div
                    key={i}
                    className="flex items-start gap-3 rounded-xl border border-border/60 bg-white/5 p-3"
                  >
                    <span className="mt-0.5 text-xs font-semibold text-accent-strong">Q{i + 1}</span>
                    <p className="text-sm text-foreground">{q}</p>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Ask AI Panel */}
          <AskAIPanel openQuestions={analysis.openQuestions} />

          {/* Recommendations */}
          <Panel>
            <p className="section-caption">Recommendations</p>
            <h2 className="section-title mt-2">Actions needed before or during delivery</h2>
            <div className="mt-5 space-y-3">
              {analysis.recommendations.map((rec, i) => (
                <div key={i} className="surface-card p-4">
                  <div className="flex items-start gap-3">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-accent-strong" />
                    <p className="text-sm text-foreground">{rec}</p>
                  </div>
                </div>
              ))}
            </div>
          </Panel>

          {/* Readiness Simulator */}
          <ReadinessSimulator analysis={analysis} />

          {/* Pipeline trace (live only) */}
          {analysis.pipelineSteps.length > 0 && (
            <Panel>
              <p className="section-caption">Live pipeline trace</p>
              <h2 className="section-title mt-2">Real watsonx.ai agent execution</h2>
              <div className="mt-5 space-y-4">
                {analysis.pipelineSteps.map((step, i) => (
                  <AgentExecutionCard key={step.agentId} step={step} index={i} />
                ))}
              </div>
            </Panel>
          )}
        </div>

        <div className="space-y-6">
          {/* Ask AI — interactive follow-up on this assessment */}
          <AskAIPanel openQuestions={analysis.openQuestions} />

          {/* Consulting assets */}
          {analysis.consultingAssets.length > 0 && (
            <Panel>
              <p className="section-caption">Draft consulting assets</p>
              <h2 className="section-title mt-2">AI-generated artefacts</h2>
              <p className="mt-2 text-xs text-muted-foreground">
                Full ICA generation available on the{' '}
                <a href="/qa-review" className="text-accent-strong underline-offset-2 hover:underline">
                  ICA Accelerator
                </a>{' '}
                page.
              </p>
              <div className="mt-5 space-y-3">
                {analysis.consultingAssets.map((asset) => (
                  <AssetCard key={asset.id} asset={asset} />
                ))}
              </div>
            </Panel>
          )}

          {/* Missing information */}
          {analysis.missingInformation.length > 0 && (
            <Panel>
              <p className="section-caption">Missing information</p>
              <h2 className="section-title mt-2">Gaps in discovery coverage</h2>
              <div className="mt-5 space-y-2">
                {analysis.missingInformation.map((item, i) => (
                  <div key={i} className="flex items-start gap-2.5 text-sm">
                    <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
                    <span className="text-muted-foreground">{item}</span>
                  </div>
                ))}
              </div>
            </Panel>
          )}

          {/* Agent chain */}
          <Panel>
            <p className="section-caption">Agent architecture</p>
            <h2 className="section-title mt-2">IBM technology responsibilities</h2>
            <div className="mt-5 space-y-3">
              {[
                {
                  id: 'ctx',
                  icon: <Layers3 className="h-4 w-4" />,
                  name: 'Context Studio',
                  role: 'Engagement Knowledge Agent',
                  objective:
                    'Retrieve ontology, governance rules, and requirement definitions. Called once per assessment.',
                },
                {
                  id: 'wx',
                  icon: <BrainCircuit className="h-4 w-4" />,
                  name: 'watsonx.ai · IBM Granite',
                  role: 'Delivery Readiness Advisor',
                  objective:
                    'Score readiness, explain WHY, identify missing stakeholders/workshops/requirements, and recommend actions.',
                },
                {
                  id: 'ica',
                  icon: <Sparkles className="h-4 w-4" />,
                  name: 'IBM Consulting Advantage',
                  role: 'Consulting Productivity Layer',
                  objective:
                    'Generate 12 consulting artefacts on demand after the readiness assessment is complete.',
                },
              ].map((agent) => (
                <div key={agent.id} className="surface-card p-4">
                  <div className="flex items-center gap-3">
                    <span className="text-accent-strong">{agent.icon}</span>
                    <p className="text-sm font-medium text-foreground">{agent.name}</p>
                  </div>
                  <p className="mt-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">Role</p>
                  <p className="mt-1 text-sm text-foreground">{agent.role}</p>
                  <p className="mt-2 text-xs uppercase tracking-[0.12em] text-muted-foreground">Objective</p>
                  <p className="mt-1 text-sm text-muted-foreground">{agent.objective}</p>
                </div>
              ))}
            </div>
          </Panel>

          {/* Integration status */}
          <Panel>
            <p className="section-caption">Integration status</p>
            <h2 className="section-title mt-2">watsonx.ai pipeline</h2>
            <div className="mt-4 space-y-2">
              <div className="flex items-center justify-between rounded-xl border border-border/50 bg-white/[0.03] px-3 py-2.5">
                <span className="text-sm text-muted-foreground">watsonx.ai</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    analysis.integrationStatus.watsonx === 'live'
                      ? 'bg-green-500/15 text-green-400'
                      : 'bg-white/10 text-muted-foreground'
                  }`}
                >
                  {analysis.integrationStatus.watsonx}
                </span>
              </div>
              <div className="flex items-center justify-between rounded-xl border border-border/50 bg-white/[0.03] px-3 py-2.5">
                <span className="text-sm text-muted-foreground">Orchestrate</span>
                <span
                  className={`rounded-full px-2.5 py-1 text-xs font-semibold ${
                    analysis.integrationStatus.orchestrate === 'live'
                      ? 'bg-green-500/15 text-green-400'
                      : 'bg-white/10 text-muted-foreground'
                  }`}
                >
                  {analysis.integrationStatus.orchestrate}
                </span>
              </div>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}

// ─── Ask AI Panel ─────────────────────────────────────────────────────────────

interface AskMessage {
  role: 'user' | 'assistant';
  text: string;
}

function AskAIPanel({ openQuestions }: { openQuestions: string[] }) {
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function ask(question: string) {
    if (!question.trim() || loading) return;
    const q = question.trim();
    setInput('');
    setMessages((prev) => [...prev, { role: 'user', text: q }]);
    setLoading(true);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const json = (await res.json()) as { answer?: string; message?: string };
      const answer = json.answer ?? json.message ?? 'No answer returned.';
      setMessages((prev) => [...prev, { role: 'assistant', text: answer }]);
    } catch {
      setMessages((prev) => [...prev, { role: 'assistant', text: 'Failed to reach the AI. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <Panel>
      <div className="flex items-center gap-2">
        <MessageSquare className="h-4 w-4 text-accent-strong" />
        <p className="section-caption">Ask AI</p>
      </div>
      <h2 className="section-title mt-2">Follow-up questions &amp; explanations</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Ask Granite anything about these findings. Click a suggestion or type your own question.
      </p>

      {/* Suggestion chips from open questions */}
      {openQuestions.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2" data-no-print>
          {openQuestions.slice(0, 4).map((q, i) => (
            <button
              key={i}
              onClick={() => void ask(q)}
              disabled={loading}
              className="rounded-full border border-border/60 bg-white/[0.04] px-3 py-1.5 text-xs text-muted-foreground transition hover:border-accent-strong/50 hover:text-foreground disabled:opacity-40"
            >
              {q.length > 72 ? q.slice(0, 72) + '…' : q}
            </button>
          ))}
        </div>
      )}

      {/* Message thread */}
      {messages.length > 0 && (
        <div className="mt-4 max-h-80 space-y-3 overflow-y-auto rounded-2xl border border-border/50 bg-black/10 p-4">
          {messages.map((m, i) => (
            <div key={i} className={`flex gap-3 ${m.role === 'user' ? 'flex-row-reverse' : 'flex-row'}`}>
              <div
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                  m.role === 'user'
                    ? 'bg-accent/20 text-accent-strong'
                    : 'bg-white/10 text-muted-foreground'
                }`}
              >
                {m.role === 'user' ? 'You' : <Bot className="h-3.5 w-3.5" />}
              </div>
              <p
                className={`max-w-[85%] rounded-2xl px-4 py-2.5 text-sm leading-6 ${
                  m.role === 'user'
                    ? 'bg-accent/15 text-foreground'
                    : 'bg-white/[0.05] text-muted-foreground'
                }`}
              >
                {m.text}
              </p>
            </div>
          ))}
          {loading && (
            <div className="flex gap-3">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/10 text-muted-foreground">
                <Bot className="h-3.5 w-3.5" />
              </div>
              <div className="flex items-center gap-1.5 rounded-2xl bg-white/[0.05] px-4 py-3">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin text-accent-strong" />
                <span className="text-xs text-muted-foreground">Thinking…</span>
              </div>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div className="mt-4 flex gap-2" data-no-print>
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') void ask(input); }}
          disabled={loading}
          placeholder="e.g. Why is Security Architecture still blocking?"
          className="flex-1 rounded-xl border border-border/60 bg-white/[0.04] px-4 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/60 focus:border-accent-strong/60 focus:outline-none disabled:opacity-50"
        />
        <button
          onClick={() => void ask(input)}
          disabled={loading || !input.trim()}
          className="flex items-center gap-2 rounded-xl bg-accent/80 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          Ask
        </button>
      </div>
    </Panel>
  );
}

// ─── Explainable AI Reasoning Trace ──────────────────────────────────────────

function ExplainabilityPanel({ trace }: { trace: ReasoningTraceItem[] }) {
  const present = trace.filter((t) => t.status === 'present');
  const missing = trace.filter((t) => t.status === 'missing');
  const blocking = trace.filter((t) => t.status === 'blocking');

  return (
    <Panel>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-caption">Explainable AI</p>
          <h2 className="section-title mt-2">Why this recommendation was made</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Evidence-backed reasoning trace — every dimension of delivery readiness evaluated.
          </p>
        </div>
        <div className="flex shrink-0 gap-2 text-xs">
          <span className="flex items-center gap-1 rounded-full bg-green-500/15 px-2 py-1 text-green-400">
            <span className="font-bold">✓</span> {present.length}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-yellow-500/15 px-2 py-1 text-yellow-400">
            <span className="font-bold">⚠</span> {missing.length}
          </span>
          <span className="flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-1 text-danger">
            <span className="font-bold">✗</span> {blocking.length}
          </span>
        </div>
      </div>

      <div className="mt-5 space-y-2">
        {trace.map((item) => (
          <div
            key={item.category}
            className={`flex items-start gap-3 rounded-xl border p-3 ${
              item.status === 'present'
                ? 'border-green-500/20 bg-green-500/[0.04]'
                : item.status === 'blocking'
                  ? 'border-red-500/20 bg-red-500/[0.04]'
                  : 'border-yellow-500/20 bg-yellow-500/[0.03]'
            }`}
          >
            <span
              className={`mt-0.5 shrink-0 text-base font-bold leading-none ${
                item.status === 'present'
                  ? 'text-green-400'
                  : item.status === 'blocking'
                    ? 'text-danger'
                    : 'text-yellow-400'
              }`}
            >
              {item.status === 'present' ? '✓' : item.status === 'blocking' ? '✗' : '⚠'}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-foreground">{item.category}</p>
              <p className="mt-0.5 text-sm text-muted-foreground">{item.evidence}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                item.status === 'present'
                  ? 'bg-green-500/15 text-green-400'
                  : item.status === 'blocking'
                    ? 'bg-red-500/15 text-danger'
                    : 'bg-yellow-500/15 text-yellow-400'
              }`}
            >
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ─── Missing Stakeholders ─────────────────────────────────────────────────────

function MissingStakeholdersPanel({ stakeholders }: { stakeholders: MissingStakeholder[] }) {
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <UserX className="mt-1 h-5 w-5 shrink-0 text-warning" />
        <div>
          <p className="section-caption">Missing stakeholders</p>
          <h2 className="section-title mt-2">Roles not represented in the engagement</h2>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {stakeholders.map((s, i) => (
          <div key={i} className="surface-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{s.role}</p>
                <p className="mt-1 text-sm text-muted-foreground">{s.reason}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  s.impact === 'blocks-delivery'
                    ? 'bg-red-500/15 text-danger'
                    : s.impact === 'high'
                      ? 'bg-yellow-500/15 text-yellow-400'
                      : 'bg-white/10 text-muted-foreground'
                }`}
              >
                {s.impact === 'blocks-delivery' ? 'Blocks delivery' : s.impact}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ─── Missing Workshops ────────────────────────────────────────────────────────

function MissingWorkshopsPanel({ workshops }: { workshops: MissingWorkshop[] }) {
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <Wrench className="mt-1 h-5 w-5 shrink-0 text-warning" />
        <div>
          <p className="section-caption">Recommended workshops</p>
          <h2 className="section-title mt-2">Sessions to schedule before delivery</h2>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {workshops.map((w, i) => (
          <div key={i} className="surface-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{w.title}</p>
                <p className="mt-1 text-sm text-muted-foreground">{w.reason}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  w.priority === 'critical'
                    ? 'bg-red-500/15 text-danger'
                    : w.priority === 'high'
                      ? 'bg-yellow-500/15 text-yellow-400'
                      : 'bg-white/10 text-muted-foreground'
                }`}
              >
                {w.priority}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ─── Missing Requirements ─────────────────────────────────────────────────────

function MissingRequirementsPanel({ requirements }: { requirements: MissingRequirement[] }) {
  return (
    <Panel>
      <div className="flex items-start gap-3">
        <FileText className="mt-1 h-5 w-5 shrink-0 text-warning" />
        <div>
          <p className="section-caption">Missing requirements</p>
          <h2 className="section-title mt-2">Requirement categories with insufficient coverage</h2>
        </div>
      </div>
      <div className="mt-5 space-y-3">
        {requirements.map((r, i) => (
          <div key={i} className="surface-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-foreground">{r.category}</p>
                <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
              </div>
              <span
                className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  r.impact === 'blocks-delivery'
                    ? 'bg-red-500/15 text-danger'
                    : r.impact === 'high'
                      ? 'bg-yellow-500/15 text-yellow-400'
                      : 'bg-white/10 text-muted-foreground'
                }`}
              >
                {r.impact === 'blocks-delivery' ? 'Blocks delivery' : r.impact}
              </span>
            </div>
          </div>
        ))}
      </div>
    </Panel>
  );
}

// ─── Readiness Simulator ──────────────────────────────────────────────────────

function ReadinessSimulator({ analysis }: { analysis: AIAnalysisResult }) {
  const [conditions, setConditions] = useState<SimulatorCondition[]>(() =>
    buildSimulatorConditions(analysis),
  );
  const [showSim, setShowSim] = useState(false);

  const resolvedScore = calculateSimulatedScore(analysis.readinessScore, conditions);
  const delta = resolvedScore - analysis.readinessScore;

  function toggle(id: string) {
    setConditions((prev) =>
      prev.map((c) => (c.id === id ? { ...c, resolved: !c.resolved } : c)),
    );
  }

  return (
    <Panel>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-caption">Readiness Simulator</p>
          <h2 className="section-title mt-2">What if these gaps were resolved?</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Toggle conditions to simulate how resolving each gap would improve your readiness score.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowSim((v) => !v)}
          className="flex items-center gap-2 rounded-xl border border-border/60 bg-white/5 px-3 py-2 text-sm text-muted-foreground transition hover:border-border hover:text-foreground"
        >
          {showSim ? (
            <>
              <ChevronUp className="h-4 w-4" /> Collapse
            </>
          ) : (
            <>
              <ChevronDown className="h-4 w-4" /> Simulate
            </>
          )}
        </button>
      </div>

      {showSim && (
        <div className="mt-5">
          {/* Score display */}
          <div className="mb-5 grid grid-cols-3 gap-3">
            <div className="rounded-2xl border border-border/60 bg-white/5 p-3 text-center">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Current</p>
              <p className={`mt-1.5 text-2xl font-semibold ${statusTone(analysis.readinessDecision)}`}>
                {analysis.readinessScore}%
              </p>
            </div>
            <div className="flex items-center justify-center text-muted-foreground">→</div>
            <div className="rounded-2xl border border-accent/30 bg-accent/5 p-3 text-center">
              <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">Simulated</p>
              <p
                className={`mt-1.5 text-2xl font-semibold ${
                  resolvedScore >= 80
                    ? 'text-green-400'
                    : resolvedScore >= 60
                      ? 'text-yellow-400'
                      : 'text-danger'
                }`}
              >
                {resolvedScore}%
              </p>
              {delta > 0 && (
                <p className="mt-0.5 text-xs font-medium text-green-400">+{delta} pts</p>
              )}
            </div>
          </div>

          {/* Conditions */}
          <div className="space-y-2">
            {conditions.map((cond) => (
              <button
                key={cond.id}
                type="button"
                onClick={() => toggle(cond.id)}
                className={`flex w-full items-center gap-3 rounded-xl border px-4 py-3 text-left transition ${
                  cond.resolved
                    ? 'border-green-500/30 bg-green-500/5'
                    : 'border-border/50 bg-white/[0.02] hover:border-border/80'
                }`}
              >
                <div
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border-2 transition ${
                    cond.resolved ? 'border-green-500 bg-green-500' : 'border-border/60 bg-transparent'
                  }`}
                >
                  {cond.resolved && <CheckCircle2 className="h-3 w-3 text-white" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">{cond.label}</p>
                </div>
                <span
                  className={`shrink-0 text-xs font-semibold ${
                    cond.resolved ? 'text-green-400' : 'text-muted-foreground'
                  }`}
                >
                  {cond.resolved ? `+${cond.scoreImpact}` : `+${cond.scoreImpact} pts`}
                </span>
              </button>
            ))}
          </div>

          {/* Projected decision */}
          {delta > 0 && (
            <div className="mt-4 rounded-2xl border border-accent/20 bg-accent/5 p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-accent-strong">
                Projected outcome
              </p>
              <p className="mt-2 text-sm text-muted-foreground">
                Resolving {conditions.filter((c) => c.resolved).length} condition(s) would improve your score by{' '}
                <strong className="text-foreground">{delta} points</strong> to{' '}
                <strong
                  className={
                    resolvedScore >= 80
                      ? 'text-green-400'
                      : resolvedScore >= 60
                        ? 'text-yellow-400'
                        : 'text-danger'
                  }
                >
                  {resolvedScore}%
                </strong>
                {resolvedScore >= 80 && analysis.readinessScore < 80
                  ? ' — moving this engagement from conditions to Ready for Delivery.'
                  : resolvedScore >= 60 && analysis.readinessScore < 60
                    ? ' — moving this engagement from Not Ready to Ready with Conditions.'
                    : '.'}
              </p>
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}

function buildSimulatorConditions(analysis: AIAnalysisResult): SimulatorCondition[] {
  const conditions: SimulatorCondition[] = [];

  // Derive conditions from critical issues, missing stakeholders, missing workshops
  analysis.criticalIssues.forEach((issue, i) => {
    conditions.push({
      id: `issue-${i}`,
      label: issue.length > 70 ? `${issue.slice(0, 70)}…` : issue,
      scoreImpact: i === 0 ? 10 : i === 1 ? 8 : 5,
      category: 'risk',
      resolved: false,
    });
  });

  (analysis.missingStakeholders ?? []).forEach((s, i) => {
    conditions.push({
      id: `stakeholder-${i}`,
      label: `Engage ${s.role}`,
      scoreImpact: s.impact === 'blocks-delivery' ? 8 : 5,
      category: 'stakeholder',
      resolved: false,
    });
  });

  (analysis.missingWorkshops ?? []).forEach((w, i) => {
    conditions.push({
      id: `workshop-${i}`,
      label: `Complete: ${w.title}`,
      scoreImpact: w.priority === 'critical' ? 7 : 4,
      category: 'workshop',
      resolved: false,
    });
  });

  // Cap at 8 conditions to keep UI clean
  return conditions.slice(0, 8);
}

function calculateSimulatedScore(baseScore: number, conditions: SimulatorCondition[]): number {
  const added = conditions.filter((c) => c.resolved).reduce((sum, c) => sum + c.scoreImpact, 0);
  return Math.min(100, baseScore + added);
}

// ─── HITL Decision Panel ──────────────────────────────────────────────────────

type AnalysisInput = NonNullable<ReturnType<typeof useLiveAIAnalysis>['data']>['data'];

function HITLDecisionPanel({ analysis, lastDispatchResult }: { analysis: NonNullable<AnalysisInput>; lastDispatchResult?: DispatchResult | null }) {
  const [showForm, setShowForm] = useState(false);
  const [choice, setChoice] = useState<ReadinessStatus>(analysis.readinessDecision);
  const [justification, setJustification] = useState('');
  const pushToast = useToastStore((s) => s.push);
  const recordHITLDecision = useWorkflowStore((s) => s.recordHITLDecision);
  const advanceStage = useWorkflowStore((s) => s.advanceStage);
  const queryClient = useQueryClient();

  const existingDecision = analysis.hitlRecord;

  const submitMutation = useMutation({
    mutationFn: async (record: HITLRecord) => {
      const res = await fetch('/api/hitl-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(record),
      });
      if (!res.ok) throw new Error('Failed to record decision.');
      return res.json();
    },
    onSuccess: (_, record) => {
      recordHITLDecision(record);
      advanceStage('action-plan-accepted');
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['ai-analysis'] });
      void queryClient.invalidateQueries({ queryKey: ['task-list'] });
      setShowForm(false);
      pushToast({
        title:
          record.consultantDecision === 'accepted'
            ? '✓ Action plan accepted — tasks assigned'
            : '↩ Recommendation overridden — tasks assigned',
        description: 'ICA is notifying each assignee. Check Action Center for task status.',
        tone: 'success',
      });
    },
    onError: () =>
      pushToast({
        title: 'Decision failed',
        description: 'Could not record your decision. Try again.',
        tone: 'error',
      }),
  });

  function handleDecision(decisionType: 'accepted' | 'overridden') {
    if (decisionType === 'overridden' && !justification.trim()) {
      pushToast({
        title: 'Justification required',
        description: 'Please provide a reason for overriding the AI recommendation.',
        tone: 'error',
      });
      return;
    }

    const record: HITLRecord = {
      aiRecommendation: analysis.readinessDecision,
      aiScore: analysis.readinessScore,
      consultantDecision: decisionType,
      consultantChoice: decisionType === 'accepted' ? analysis.readinessDecision : choice,
      justification: decisionType === 'overridden' ? justification.trim() : null,
      decidedAt: new Date().toISOString(),
    };
    submitMutation.mutate(record);
  }

  if (existingDecision) {
    return (
      <Panel>
        <p className="section-caption">Consultant decision recorded</p>
        <h2 className="section-title mt-2">Human-in-the-loop record</h2>

        {/* ── What happens next — prominent CTA ──────────────────────────── */}
        <div className="mt-4 rounded-2xl border border-green-500/30 bg-green-500/[0.06] p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-green-400">
                Decision recorded — engagement marked as {readinessLabel(existingDecision.consultantChoice)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Follow-up tasks have been seeded and assigned. Go to the <strong className="text-foreground">Actions page</strong> to see each task, its assignee, and mark them done one by one.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" asChild>
                  <Link href="/maintenance-tasks">
                    <ListChecks className="mr-1.5 h-3.5 w-3.5" />
                    View assigned tasks
                    <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
                  </Link>
                </Button>
                <Button size="sm" variant="ghost" asChild>
                  <Link href="/workflow-timeline">
                    View full timeline
                  </Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div className="rounded-2xl border border-border/70 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">AI recommendation</p>
            <p className={`mt-2 text-sm font-semibold ${statusTone(existingDecision.aiRecommendation)}`}>
              {readinessLabel(existingDecision.aiRecommendation)} · {existingDecision.aiScore}%
            </p>
          </div>
          <div className="rounded-2xl border border-border/70 bg-white/5 p-4">
            <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">
              Consultant decision
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  existingDecision.consultantDecision === 'accepted'
                    ? 'bg-green-500/15 text-green-400'
                    : 'bg-yellow-500/15 text-yellow-400'
                }`}
              >
                {existingDecision.consultantDecision}
              </span>
            </p>
            <p className={`mt-2 text-sm font-semibold ${statusTone(existingDecision.consultantChoice)}`}>
              {readinessLabel(existingDecision.consultantChoice)}
            </p>
            {existingDecision.justification && (
              <p className="mt-2 text-xs italic text-muted-foreground">
                &ldquo;{existingDecision.justification}&rdquo;
              </p>
            )}
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Decision recorded at {new Date(existingDecision.decidedAt).toLocaleString()}
        </p>

        {/* Dispatch status — shows exactly what happened after decision */}
        {lastDispatchResult && (
          <div className="mt-5 rounded-2xl border border-border/50 bg-white/[0.02] p-4">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Dispatch status
            </p>
            <div className="space-y-2">
              <DispatchRow
                label="ICA package"
                status={lastDispatchResult.packageWritten ? 'ok' : 'fail'}
                detail={lastDispatchResult.packageWritten ? 'Written to disk — ICA can pull via /api/ica-package/[id]' : 'Write failed'}
              />
              <DispatchRow
                label="ICA Virtual Server"
                status={lastDispatchResult.langflow === 'accepted' ? 'ok' : lastDispatchResult.langflow === 'skipped' ? 'skip' : 'fail'}
                detail={
                  lastDispatchResult.langflow === 'accepted'
                    ? `Agent called${lastDispatchResult.toolCalled ? ` · tool: ${lastDispatchResult.toolCalled}` : ''}${lastDispatchResult.toolsFound?.length ? ` · tools: ${lastDispatchResult.toolsFound.join(', ')}` : ''}`
                    : (lastDispatchResult.langflowError ?? lastDispatchResult.langflow)
                }
              />
              <DispatchRow
                label="Email notifications"
                status={lastDispatchResult.emailsSent > 0 ? 'ok' : lastDispatchResult.emailsAttempted === 0 ? 'skip' : 'fail'}
                detail={
                  lastDispatchResult.emailsAttempted === 0
                    ? 'Not configured — add EMAIL_SMTP_HOST to .env.local'
                    : `${lastDispatchResult.emailsSent}/${lastDispatchResult.emailsAttempted} sent${lastDispatchResult.emailErrors.length > 0 ? ` · ${lastDispatchResult.emailErrors[0]}` : ''}`
                }
                icon={<Mail className="h-3 w-3" />}
              />
              <DispatchRow
                label="Context Studio"
                status={lastDispatchResult.contextStudio === 'posted' ? 'ok' : lastDispatchResult.contextStudio === 'skipped' ? 'skip' : 'fail'}
                detail={lastDispatchResult.contextStudioError ?? lastDispatchResult.contextStudio}
              />
            </div>
            {lastDispatchResult.langflow === 'accepted' && (
              <p className="mt-3 text-xs text-green-400">
                ✓ ICA agent running — your Virtual Server (engagement-readiness-evaluator) received the action plan. Each assignee will receive a message in ICA. When they reply &ldquo;Done&rdquo;, the app updates automatically.
              </p>
            )}
            {lastDispatchResult.langflow === 'failed' && (
              <p className="mt-3 text-xs text-yellow-400">
                ⚠ ICA Virtual Server not reached. Tasks are still seeded in the app — use the Actions page to mark them done manually. Error: {lastDispatchResult.langflowError}
              </p>
            )}
            {lastDispatchResult.emailsAttempted === 0 && (
              <p className="mt-3 text-xs text-muted-foreground">
                No emails sent. Add EMAIL_SMTP_HOST · EMAIL_USER · EMAIL_PASS to .env.local to also notify assignees by email.
              </p>
            )}
            {lastDispatchResult.emailsSent > 0 && (
              <p className="mt-3 text-xs text-green-400">
                ✓ {lastDispatchResult.emailsSent} assignee{lastDispatchResult.emailsSent === 1 ? '' : 's'} also notified by email.
              </p>
            )}
          </div>
        )}
      </Panel>
    );
  }

  return (
    <Panel>
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="section-caption">Human-in-the-loop</p>
          <h2 className="section-title mt-2">Make your consultant decision</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            The AI is advisory only. You must explicitly accept or override the recommendation before the
            engagement can be marked ready.
          </p>
        </div>
        <UserCheck className="mt-1 h-6 w-6 shrink-0 text-accent-strong" />
      </div>

      <div className="mt-5 rounded-2xl border border-border/70 bg-white/5 p-4">
        <p className="text-xs uppercase tracking-[0.12em] text-muted-foreground">AI recommendation</p>
        <div className="mt-2 flex items-center gap-3">
          <Bot className="h-5 w-5 text-accent-strong" />
          <p className={`text-base font-semibold ${statusTone(analysis.readinessDecision)}`}>
            {readinessLabel(analysis.readinessDecision)}
          </p>
          <span className="ml-auto text-sm text-muted-foreground">{analysis.readinessScore}%</span>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">{analysis.executiveSummary}</p>
      </div>

      {!showForm ? (
        <div className="mt-5 flex gap-3">
          <Button
            onClick={() => handleDecision('accepted')}
            disabled={submitMutation.isPending}
            className="flex-1"
          >
            {submitMutation.isPending ? (
              <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Accept recommendation
          </Button>
          <Button
            variant="secondary"
            onClick={() => setShowForm(true)}
            disabled={submitMutation.isPending}
            className="flex-1"
          >
            <XCircle className="mr-2 h-4 w-4" />
            Override recommendation
          </Button>
        </div>
      ) : (
        <div className="mt-5 space-y-4">
          <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/5 p-3">
            <p className="text-xs text-yellow-400">
              ⚠ You are overriding the AI recommendation. A justification is required and will be stored in
              the audit trail.
            </p>
          </div>
          <div>
            <label className="block">
              <span className="text-sm font-medium text-foreground">Override to</span>
              <select
                className="mt-2 h-11 w-full rounded-xl border border-border/70 bg-black/10 px-3 text-sm text-foreground outline-none focus:border-accent"
                value={choice}
                onChange={(e) => setChoice(e.target.value as ReadinessStatus)}
              >
                <option value="ready">Ready for Delivery</option>
                <option value="ready-with-conditions">Ready with Conditions</option>
                <option value="not-ready">Not Ready</option>
              </select>
            </label>
          </div>
          <div>
            <label className="block">
              <span className="text-sm font-medium text-foreground">
                Justification <span className="text-danger">*</span>
              </span>
              <textarea
                className="mt-2 h-24 w-full resize-none rounded-xl border border-border/70 bg-black/10 p-3 text-sm text-foreground outline-none focus:border-accent"
                placeholder="Explain why you are overriding the AI recommendation…"
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
              />
            </label>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => handleDecision('overridden')}
              disabled={submitMutation.isPending || !justification.trim()}
              variant="secondary"
              className="flex-1 border-yellow-500/40 text-yellow-400"
            >
              {submitMutation.isPending ? (
                <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Confirm override
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                setShowForm(false);
                setJustification('');
              }}
              disabled={submitMutation.isPending}
            >
              Cancel
            </Button>
          </div>
        </div>
      )}
    </Panel>
  );
}

// ─── Asset Card ───────────────────────────────────────────────────────────────

function AssetCard({ asset }: { asset: ConsultingAsset }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="surface-card">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-3 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
            {asset.type.replace(/-/g, ' ')}
          </p>
          <p className="mt-1 text-sm font-medium text-foreground">{asset.title}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
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
          {expanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
        </div>
      </button>

      {expanded && (
        <div className="mt-3 rounded-xl border border-border/50 bg-black/10 p-3">
          <pre className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground">{asset.content}</pre>
        </div>
      )}
    </div>
  );
}

// ─── Agent Execution Card ─────────────────────────────────────────────────────

function AgentExecutionCard({ step, index }: { step: AgentStepResult<unknown>; index: number }) {
  return (
    <div className="surface-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-border/60 bg-black/10 text-xs font-semibold text-muted-foreground">
            {index + 1}
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">{step.agentName}</p>
            <p className="text-xs text-muted-foreground">{step.role}</p>
          </div>
        </div>
        <span
          className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
            step.status === 'success' ? 'bg-green-500/15 text-green-400' : 'bg-white/10 text-muted-foreground'
          }`}
        >
          {step.status}
        </span>
      </div>
      <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
        <div className="flex items-center gap-1.5">
          <Timer className="h-3 w-3" />
          {step.durationMs}ms
        </div>
        <div className="flex items-center gap-1.5">
          <BrainCircuit className="h-3 w-3" />
          {step.tokenCount} tokens
        </div>
      </div>
    </div>
  );
}

// ─── Dispatch row ─────────────────────────────────────────────────────────────

function DispatchRow({
  label,
  status,
  detail,
  icon,
}: {
  label: string;
  status: 'ok' | 'fail' | 'skip';
  detail?: string;
  icon?: React.ReactNode;
}) {
  const dot =
    status === 'ok'
      ? 'bg-green-500'
      : status === 'fail'
        ? 'bg-red-500'
        : 'bg-white/20';
  const textColor =
    status === 'ok'
      ? 'text-green-400'
      : status === 'fail'
        ? 'text-red-400'
        : 'text-muted-foreground';

  return (
    <div className="flex items-start gap-3 text-xs">
      <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dot}`} />
      <span className="w-32 shrink-0 font-medium text-foreground">{label}</span>
      <span className={`flex items-center gap-1 ${textColor}`}>
        {icon}
        {detail ?? status}
      </span>
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Panel({ children }: { children: React.ReactNode }) {
  return <section className="glass-panel rounded-[30px] p-6">{children}</section>;
}

function AnalysisMeta({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="glass-subtle rounded-2xl p-4">
      <p className="text-xs uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
      <p className={`mt-2 text-sm font-semibold ${tone ? statusTone(tone) : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function AnalysisSkeleton() {
  return (
    <div className="page-stack">
      <div className="glass-panel rounded-[30px] p-6">
        <div className="h-7 w-72 animate-pulse rounded bg-white/10" />
        <div className="mt-4 h-4 w-96 animate-pulse rounded bg-white/10" />
      </div>
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <div className="space-y-6">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-[30px] bg-white/8" />
          ))}
        </div>
        <div className="space-y-6">
          {[0, 1].map((i) => (
            <div key={i} className="h-48 animate-pulse rounded-[30px] bg-white/8" />
          ))}
        </div>
      </div>
    </div>
  );
}
