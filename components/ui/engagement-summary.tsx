'use client';

import { useState } from 'react';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleDashed,
  Clock3,
  FileText,
  ListChecks,
  Mail,
  Sparkles,
  TriangleAlert,
  UserCheck,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { NoAssessmentYet } from '@/components/ui/empty-state';
import { useLiveDashboard } from '@/hooks/use-dashboard-data';
import { formatTimestamp, readinessLabel, statusTone } from '@/lib/utils';
import { useWorkflowStore } from '@/store/workflow-store';
import type { AIAnalysisResult, HITLRecord, TaskAssignment } from '@/types/domain';
import type { ReviewHistoryEntry } from '@/lib/workflow-state';

// ─── How It Works explainer (shown when no assessment yet) ───────────────────

function HowItWorksPanel() {
  const steps = [
    {
      num: '1', owner: 'You', title: 'Submit Assessment',
      desc: 'Paste discovery notes, meeting minutes, BRDs, or any project docs. Attach PDFs/DOCX for AI to read.',
      icon: <FileText className="h-4 w-4" />,
    },
    {
      num: '2', owner: 'watsonx', title: 'AI Analysis',
      desc: 'IBM Granite analyses your evidence. Scores readiness 0–100%, identifies risks, missing stakeholders, and creates an action plan.',
      icon: <Bot className="h-4 w-4" />,
    },
    {
      num: '3', owner: 'You', title: 'Review & Accept',
      desc: 'Review the AI findings. Accept or override the recommendation. This is your human-in-the-loop checkpoint.',
      icon: <UserCheck className="h-4 w-4" />,
    },
    {
      num: '4', owner: 'ICA', title: 'ICA Assigns Tasks',
      desc: 'IBM Consulting Advantage assigns each action to the right team member (Architect, Consultant, QA, Operations) and sends emails + Jira tickets.',
      icon: <ListChecks className="h-4 w-4" />,
    },
    {
      num: '5', owner: 'Team', title: 'Complete Actions',
      desc: 'Team marks tasks done in the Action Center. Add completion notes — these are fed back to watsonx for re-scoring.',
      icon: <CheckCircle2 className="h-4 w-4" />,
    },
    {
      num: '6', owner: 'You', title: 'Final Approval',
      desc: 'Lead consultant reviews completed work and approves. Status changes from "Needs Improvement" → "Ready for Engagement".',
      icon: <Zap className="h-4 w-4" />,
    },
    {
      num: '7', owner: 'ICA', title: 'Delivery Package',
      desc: 'ICA generates Executive Summary, Client Email, Internal Email, Slack message, and Jira Epic — and sends them.',
      icon: <Sparkles className="h-4 w-4" />,
    },
  ];
  return (
    <section className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
      <p className="section-caption">How it works</p>
      <h2 className="section-title mt-1">7-step engagement readiness workflow</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Each completed engagement appears on this page. Past engagements are preserved below.
      </p>
      <div className="mt-5 space-y-3">
        {steps.map((s) => (
          <div key={s.num} className="flex items-start gap-3 rounded-xl border border-border/50 bg-white/[0.02] p-3.5">
            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-bold text-accent-strong">
              {s.num}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-accent-strong/70">{s.icon}</span>
                <p className="text-sm font-semibold text-foreground">{s.title}</p>
                <span className="rounded-full bg-white/8 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-muted-foreground">
                  {s.owner}
                </span>
              </div>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{s.desc}</p>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-5">
        <Button size="sm" asChild>
          <Link href="/readiness-review">Start your first assessment →</Link>
        </Button>
      </div>
    </section>
  );
}

// ─── Single engagement card ───────────────────────────────────────────────────

function EngagementCard({
  engagementName,
  clientName,
  leadConsultant,
  assessedAt,
  tasks,
  hitlRecord,
  approvalStageHistory,
  isLatest,
  review,
  deliveryAssets,
}: {
  engagementName: string;
  clientName: string;
  leadConsultant: string;
  assessedAt: string | null;
  tasks: TaskAssignment[];
  hitlRecord?: HITLRecord;
  approvalStageHistory: Array<{ stage: string; label: string; enteredAt: string }>;
  isLatest: boolean;
  review: AIAnalysisResult;
  deliveryAssets?: {
    executiveSummary?: string;
    clientEmail?: string;
    internalEmail?: string;
    jiraEpic?: string;
    slackMessage?: string;
    deliveryEmailsSent?: number;
  } | null;
}) {
  const completedTasks = tasks.filter((t) => t.status === 'completed');
  const [expandedAsset, setExpandedAsset] = useState<string | null>(null);

  function toggleAsset(key: string) {
    setExpandedAsset((v) => v === key ? null : key);
  }

  return (
    <div className={`rounded-2xl border p-5 ${isLatest ? 'border-accent/30 bg-accent/[0.03]' : 'border-border/60 bg-white/[0.025]'}`}>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
            <span>{clientName}</span>
            <span>·</span>
            <span>{leadConsultant}</span>
            {isLatest && <span className="rounded-full bg-accent/15 px-2 py-0.5 text-accent-strong">Current</span>}
          </div>
          <h2 className="mt-1 text-lg font-semibold text-foreground">{engagementName}</h2>
          {assessedAt && <p className="mt-0.5 text-xs text-muted-foreground">Assessed {formatTimestamp(assessedAt)}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-2xl font-bold ${statusTone(review.readinessDecision)}`}>{review.readinessScore}%</p>
          <p className={`text-xs font-medium ${statusTone(review.readinessDecision)}`}>{readinessLabel(review.readinessDecision)}</p>
        </div>
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[1.4fr_0.6fr]">
        <div className="space-y-5">

          {/* Executive Summary */}
          <section>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Executive summary</p>
            <p className="mt-2 text-sm leading-6 text-foreground">{review.executiveSummary}</p>
            {review.riskExplanation && (
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{review.riskExplanation}</p>
            )}
          </section>

          {/* Final recommendations */}
          {review.recommendations.length > 0 && (
            <section>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Recommendations</p>
              <div className="mt-2 space-y-2">
                {review.recommendations.map((rec, i) => (
                  <div key={i} className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-white/[0.03] p-3">
                    <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent-strong" />
                    <p className="text-sm text-foreground">{rec}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Task completion log */}
          {tasks.length > 0 && (
            <section>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                Task completion log — {completedTasks.length}/{tasks.length} done
              </p>
              <div className="mt-2 space-y-2">
                {tasks.map((task) => (
                  <div key={task.taskId} className={`rounded-xl border p-3 ${task.status === 'completed' ? 'border-green-500/20 bg-green-500/[0.04]' : 'border-border/50 bg-white/[0.025]'}`}>
                    <div className="flex items-start gap-2.5">
                      {task.status === 'completed'
                        ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-400" />
                        : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground">{task.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <span className="flex items-center gap-1"><UserCheck className="h-3 w-3" />{task.assigneeName}</span>
                          <span className={`capitalize ${statusTone(task.ownerRole)}`}>{task.ownerRole}</span>
                        </div>
                        {task.completedAt && (
                          <p className="mt-1 flex items-center gap-1 text-[10px] text-green-400">
                            <Clock3 className="h-3 w-3" />
                            {formatTimestamp(task.completedAt)}
                            {task.completedBy && <span className="text-muted-foreground">· by {task.completedBy}</span>}
                          </p>
                        )}
                        {task.completionNote && (
                          <p className="mt-1 text-xs italic text-muted-foreground">&ldquo;{task.completionNote}&rdquo;</p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* ICA Delivery Assets */}
          {deliveryAssets && (
            <section>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                ICA delivery assets
                {deliveryAssets.deliveryEmailsSent ? ` — ${deliveryAssets.deliveryEmailsSent} emails sent` : ''}
              </p>
              <div className="mt-2 space-y-2">
                {[
                  { key: 'executiveSummary', label: 'Executive Summary', icon: <FileText className="h-3.5 w-3.5" /> },
                  { key: 'clientEmail', label: 'Client Email', icon: <Mail className="h-3.5 w-3.5" /> },
                  { key: 'internalEmail', label: 'Internal Team Email', icon: <Mail className="h-3.5 w-3.5" /> },
                  { key: 'jiraEpic', label: 'Jira Epic', icon: <ListChecks className="h-3.5 w-3.5" /> },
                  { key: 'slackMessage', label: 'Slack Message', icon: <Sparkles className="h-3.5 w-3.5" /> },
                ].map(({ key, label, icon }) => {
                  const content = deliveryAssets[key as keyof typeof deliveryAssets] as string | undefined;
                  const isExpanded = expandedAsset === key;
                  return (
                    <div key={key} className="rounded-xl border border-border/50 bg-white/[0.02] overflow-hidden">
                      <button
                        onClick={() => toggleAsset(key)}
                        className="flex w-full items-center gap-2.5 px-3.5 py-3 text-left hover:bg-white/[0.03] transition"
                      >
                        <span className={content ? 'text-green-400' : 'text-muted-foreground'}>{icon}</span>
                        <p className="flex-1 text-sm font-medium text-foreground">{label}</p>
                        {content
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-green-400" />
                          : <TriangleAlert className="h-3.5 w-3.5 text-muted-foreground" />}
                        {content && (isExpanded
                          ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" />
                          : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />)}
                      </button>
                      {isExpanded && content && (
                        <div className="border-t border-border/40 bg-black/10 px-3.5 py-3">
                          <pre className="whitespace-pre-wrap text-xs leading-5 text-muted-foreground font-sans">{content}</pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}
        </div>

        <div className="space-y-4">

          {/* HITL record */}
          {hitlRecord && (
            <div className="rounded-xl border border-border/50 bg-white/[0.025] p-4">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Human-in-the-loop</p>
              <div className="mt-3 space-y-2">
                <div className="rounded-lg border border-border/40 bg-white/[0.02] p-2.5">
                  <p className="text-[10px] text-muted-foreground">AI recommended</p>
                  <p className={`mt-0.5 text-sm font-semibold ${statusTone(hitlRecord.aiRecommendation ?? '')}`}>
                    {readinessLabel(hitlRecord.aiRecommendation ?? '')} · {hitlRecord.aiScore}%
                  </p>
                </div>
                <div className="rounded-lg border border-border/40 bg-white/[0.02] p-2.5">
                  <div className="flex items-center gap-2">
                    <p className="text-[10px] text-muted-foreground">Consultant chose</p>
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${(hitlRecord.consultantDecision ?? '') === 'accepted' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                      {hitlRecord.consultantDecision}
                    </span>
                  </div>
                  <p className={`mt-0.5 text-sm font-semibold ${statusTone(hitlRecord.consultantChoice ?? '')}`}>
                    {readinessLabel(hitlRecord.consultantChoice ?? '')}
                  </p>
                  {hitlRecord.justification && (
                    <p className="mt-1 text-xs italic text-muted-foreground">&ldquo;{hitlRecord.justification}&rdquo;</p>
                  )}
                  {hitlRecord.decidedAt && (
                    <p className="mt-1 text-[10px] text-muted-foreground">{formatTimestamp(hitlRecord.decidedAt)}</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Approval chain log */}
          {approvalStageHistory.length > 0 && (
            <div className="rounded-xl border border-border/50 bg-white/[0.025] p-4">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Workflow log</p>
              <div className="mt-3 space-y-1.5">
                {approvalStageHistory.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-lg border border-border/40 bg-white/[0.015] px-2.5 py-2">
                    <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-green-400" />
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-foreground truncate">{entry.label}</p>
                      <p className="text-[10px] text-muted-foreground">{formatTimestamp(entry.enteredAt)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

export function EngagementSummaryView() {
  const { data, isLoading, isError } = useLiveDashboard();
  const review = useWorkflowStore((s) => s.latestReview);
  const workflowStage = useWorkflowStore((s) => s.workflowStage);

  if (isLoading) return <SummarySkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-danger/25 bg-danger/5 p-6">
        <p className="text-sm font-semibold text-danger">Unable to load engagement summary.</p>
        <p className="mt-1 text-sm text-muted-foreground">Refresh the page to try again.</p>
      </div>
    );
  }

  if (!data.data.hasLiveReview || !review) {
    return (
      <div className="page-stack">
        <NoAssessmentYet
          icon={FileText}
          title="No engagements yet"
          description="Once you complete an assessment, the full engagement record — executive summary, task log, HITL decision, and ICA delivery assets — appears here. Each new engagement adds a card below."
        />
        <HowItWorksPanel />
      </div>
    );
  }

  const d = data.data;
  const tasks: TaskAssignment[] = d.taskAssignments ?? [];
  const isComplete = workflowStage === 'delivery-package-sent' || workflowStage === 'ready-for-engagement';

  // Delivery assets from last dispatch
  const deliveryAssets = d.lastDispatchResult?.deliveryAssets ?? null;

  return (
    <div className="page-stack">

      {/* Page header */}
      <section className="glass-panel rounded-[30px] p-6 md:p-7">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <p className="section-caption">Engagement Summary</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground md:text-4xl">
              {d.engagement.projectName}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {d.engagement.clientName} · Lead: {d.engagement.leadConsultant}
            </p>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              This page is the permanent record of the engagement. It shows the AI assessment, consultant decisions,
              completed tasks, and all ICA-generated delivery assets.
              {!isComplete && ' Complete the workflow (Action Center → Final Approval) to unlock the delivery package.'}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {isComplete ? (
              <Button size="sm" asChild>
                <Link href="/readiness-review">Start new assessment</Link>
              </Button>
            ) : (
              <>
                <Button size="sm" asChild>
                  <Link href="/maintenance-tasks">Action center <ArrowRight className="ml-1.5 h-3 w-3" /></Link>
                </Button>
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/ai-analysis">AI findings</Link>
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Status bar */}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Readiness score</p>
            <p className={`mt-1 text-xl font-bold ${statusTone(review.readinessDecision)}`}>{review.readinessScore}%</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">AI decision</p>
            <p className={`mt-1 text-sm font-semibold ${statusTone(review.readinessDecision)}`}>{readinessLabel(review.readinessDecision)}</p>
          </div>
          <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Tasks</p>
            <p className={`mt-1 text-sm font-semibold ${tasks.every(t => t.status === 'completed') && tasks.length > 0 ? 'text-green-400' : 'text-foreground'}`}>
              {tasks.filter(t => t.status === 'completed').length}/{tasks.length} done
            </p>
          </div>
          <div className={`rounded-xl border p-3 ${isComplete ? 'border-green-500/30 bg-green-500/5' : 'border-border/50 bg-white/[0.02]'}`}>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Status</p>
            <p className={`mt-1 text-sm font-semibold ${isComplete ? 'text-green-400' : 'text-yellow-400'}`}>
              {isComplete ? '✓ Complete' : 'In Progress'}
            </p>
          </div>
        </div>
      </section>

      {/* Current engagement card */}
      <EngagementCard
        engagementName={d.engagement.projectName}
        clientName={d.engagement.clientName}
        leadConsultant={d.engagement.leadConsultant}
        assessedAt={d.assessedAt}
        tasks={tasks}
        hitlRecord={review.hitlRecord}
        approvalStageHistory={d.approvalStageHistory}
        isLatest={true}
        review={review}
        deliveryAssets={deliveryAssets}
      />

      {/* Past assessment history (other runs) */}
      {d.history.length > 1 && (
        <section>
          <p className="section-caption mb-3">Assessment history</p>
          <div className="space-y-3">
            {d.history.slice(1).map((h) => (
              <HistoryRow key={h.id} entry={h} />
            ))}
          </div>
        </section>
      )}

      {/* How it works — shown at bottom for new users to understand the flow */}
      <HowItWorksPanel />
    </div>
  );
}

// ─── History row ──────────────────────────────────────────────────────────────

function HistoryRow({ entry }: { entry: ReviewHistoryEntry }) {
  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.015] p-3.5">
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className={`text-sm font-semibold ${statusTone(entry.decision)}`}>
            {readinessLabel(entry.decision)} · {entry.readinessScore}%
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{formatTimestamp(entry.assessedAt)}</p>
        </div>
        <div className="flex items-center gap-2">
          {entry.hitlDecision && (
            <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${entry.hitlDecision === 'accepted' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
              {entry.hitlDecision}
            </span>
          )}
          <span className="text-xs text-muted-foreground">{entry.confidenceScore}% confidence</span>
        </div>
      </div>
      {entry.executiveSummary && (
        <p className="mt-2 text-xs leading-5 text-muted-foreground line-clamp-2">{entry.executiveSummary}</p>
      )}
    </div>
  );
}

function SummarySkeleton() {
  return (
    <div className="page-stack">
      <div className="h-52 animate-pulse rounded-[30px] bg-white/5" />
      <div className="h-96 animate-pulse rounded-2xl bg-white/5" />
    </div>
  );
}
