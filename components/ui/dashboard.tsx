'use client';

import {
  AlertTriangle,
  ArrowRight,
  Bot,
  CheckCircle2,
  CircleDashed,
  Clock3,
  FileText,
  ListChecks,
  Sparkles,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { NoAssessmentYet } from '@/components/ui/empty-state';
import { useLiveDashboard } from '@/hooks/use-dashboard-data';
import { formatTimestamp, readinessLabel, statusTone } from '@/lib/utils';
import { useWorkflowStore } from '@/store/workflow-store';
import type { WorkflowEvent } from '@/types/domain';

export function DashboardView() {
  const liveReview = useWorkflowStore((s) => s.latestReview);
  const { data, isLoading, isError } = useLiveDashboard();

  if (isLoading) return <DashboardSkeleton />;

  if (isError || !data) {
    return (
      <div className="rounded-2xl border border-red-500/25 bg-red-500/5 p-6">
        <p className="text-sm font-semibold text-danger">Unable to load dashboard</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The server could not be reached. Refresh the page to try again.
        </p>
      </div>
    );
  }

  if (!data.data.hasLiveReview) {
    return (
      <div className="page-stack">
        <NoAssessmentYet
          icon={AlertTriangle}
          title="No assessment run yet"
          description="Run an AI assessment to see your delivery readiness score, critical risks, workflow status, and consulting actions here."
        />
        <IBMStackExplainer />
      </div>
    );
  }

  const dashboard = data.data;
  const review = liveReview ?? undefined;
  const isComplete = dashboard.workflowStage === 'delivery-package-sent' || dashboard.workflowStage === 'ready-for-engagement';

  const engagement = review
    ? { ...dashboard.engagement, status: review.readinessDecision, readinessScore: review.readinessScore }
    : dashboard.engagement;

  const latestReview = review
    ? { ...dashboard.latestReview, decision: review.readinessDecision, readinessScore: review.readinessScore, executiveSummary: review.executiveSummary, riskExplanation: review.riskExplanation, businessImpact: review.businessImpact }
    : dashboard.latestReview;

  // Use live task assignments — these reflect real completion state
  const taskAssignments = data.data.taskAssignments ?? [];
  const openActions = taskAssignments.length > 0
    ? taskAssignments.filter((t: { status: string }) => t.status !== 'completed').length
    : (review?.actionPlan.actions ?? dashboard.actions).filter((a) => a.status !== 'completed').length;

  // Critical risks = critical issues count from AI (not stale mock data)
  const criticalRisks = review?.criticalIssues?.length ?? dashboard.risks.filter((r) => r.severity === 'critical').length;
  const currentWorkflow = dashboard.workflow.find((e) => e.state === 'current') ?? dashboard.workflow[0];
  const hitlRecord = review?.hitlRecord;

  return (
    <div className="page-stack">
      {/* Hero */}
      <div className={`rounded-2xl border p-5 md:p-6 ${isComplete ? 'border-green-500/30 bg-green-500/5' : 'border-border/60 bg-white/[0.025]'}`}>
        <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-xl">
            <div className="flex flex-wrap items-center gap-2 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              <span>{engagement.clientName}</span>
              <span>·</span>
              <span>{engagement.projectName}</span>
              {isComplete && (
                <span className="rounded-full bg-green-500/15 px-2 py-0.5 text-green-400">
                  Engagement complete
                </span>
              )}
            </div>
            <h1 className="mt-2 text-xl font-semibold text-foreground">{engagement.projectName}</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {isComplete
                ? 'All remediation tasks complete. Lead consultant has approved. ICA delivery package sent.'
                : 'Delivery readiness evaluated by watsonx.ai. Review findings and complete the consulting workflow.'}
            </p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button asChild size="sm">
                <Link href="/readiness-review">New assessment</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                {isComplete
                  ? <Link href="/engagement-summary">View engagement summary →</Link>
                  : <Link href="/ai-analysis">Review AI findings →</Link>}
              </Button>
              {!isComplete && taskAssignments.length > 0 && (
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/maintenance-tasks">Action center ({openActions} pending) →</Link>
                </Button>
              )}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:w-[320px]">
            <HeroStat label="Client" value={engagement.clientName} />
            <HeroStat label="Lead consultant" value={engagement.leadConsultant} />
            <HeroStat label="Readiness" value={`${engagement.readinessScore}%`} tone={isComplete ? 'ready' : engagement.status} />
            <HeroStat label="Last assessed" value={dashboard.assessedAt ? formatTimestamp(dashboard.assessedAt) : '—'} />
          </div>
        </div>
      </div>

      {/* Metrics — reflect real live state */}
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Delivery readiness"
          value={isComplete ? 'Approved' : `${engagement.readinessScore}%`}
          tone={isComplete ? 'ready' : engagement.status}
          note={isComplete ? 'Ready for engagement' : readinessLabel(engagement.status)}
        />
        <MetricCard
          label={isComplete ? 'Tasks completed' : 'Open actions'}
          value={isComplete ? `${taskAssignments.length}/${taskAssignments.length}` : String(openActions)}
          tone={isComplete ? 'completed' : openActions > 0 ? 'not-ready' : 'completed'}
          note={isComplete ? 'All done' : 'Require follow-up'}
        />
        <MetricCard
          label="AI findings"
          value={isComplete ? '✓ Reviewed' : String(criticalRisks)}
          tone={isComplete ? 'completed' : criticalRisks > 0 ? 'not-ready' : 'completed'}
          note={isComplete ? 'Accepted by consultant' : 'Critical issues'}
        />
        <MetricCard label="Time saved" value={`${data.data.totalTimeSavedHours.toFixed(0)}h`} tone="info" note="Estimated by AI" />
      </div>

      {/* When complete — short confirmation + link out. Full detail (executive
          summary, HITL record, task log, delivery assets) lives on
          /engagement-summary — no need to duplicate it here. */}
      {isComplete ? (
        <div className="grid gap-5 xl:grid-cols-[1.55fr_0.95fr]">
          <Panel title="Engagement complete" caption="Final status">
            <div className="mt-4 flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/5 p-4">
              <CheckCircle2 className="h-5 w-5 shrink-0 text-green-400" />
              <p className="text-sm font-semibold text-green-400">All tasks completed · Lead consultant approved · ICA delivery sent</p>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button size="sm" asChild>
                <Link href="/engagement-summary">View full engagement summary →</Link>
              </Button>
              <Button variant="secondary" size="sm" asChild>
                <Link href="/readiness-review">Start new assessment</Link>
              </Button>
            </div>
          </Panel>
          <IBMStackExplainer />
        </div>
      ) : (
        /* ── Active assessment — show AI findings + action center panels ── */
        <div className="grid gap-5 xl:grid-cols-[1.55fr_0.95fr]">
          <div className="space-y-5">
            {/* AI recommendation */}
            <Panel title="AI recommendation" caption="Readiness verdict">
              <div className="flex items-start justify-between gap-4">
                <p className="text-sm font-semibold text-foreground leading-6">{latestReview.executiveSummary}</p>
                <span className={`shrink-0 text-xl font-bold ${statusTone(latestReview.decision)}`}>
                  {latestReview.readinessScore}%
                </span>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <InfoBox icon={<Bot className="h-3.5 w-3.5" />} label="Risk assessment" value={latestReview.riskExplanation} />
                <InfoBox icon={<Clock3 className="h-3.5 w-3.5" />} label="Business impact" value={latestReview.businessImpact} />
              </div>
              <div className="mt-3 flex gap-2">
                <Button variant="secondary" size="sm" asChild>
                  <Link href="/ai-analysis">Review full findings <ArrowRight className="ml-1 h-3 w-3" /></Link>
                </Button>
              </div>
            </Panel>

            {/* Live action center preview */}
            {taskAssignments.length > 0 && (
              <Panel
                title={openActions > 0 ? `${openActions} action${openActions === 1 ? '' : 's'} pending` : 'All tasks complete'}
                caption="Action center"
                action={<Button variant="ghost" size="sm" asChild><Link href="/maintenance-tasks">Manage <ArrowRight className="ml-1 h-3 w-3" /></Link></Button>}
              >
                <div className="mt-3 space-y-2">
                  {taskAssignments.slice(0, 4).map((task) => (
                    <div key={task.taskId} className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-white/[0.025] p-3">
                      <ListChecks className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${task.status === 'completed' ? 'text-green-400' : statusTone(task.priority)}`} />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-foreground leading-tight">{task.title}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{task.ownerRole} · {task.dueLabel}</p>
                      </div>
                      <span className={`shrink-0 text-xs font-medium ${task.status === 'completed' ? 'text-green-400' : 'text-yellow-400'}`}>
                        {task.status === 'completed' ? '✓ Done' : 'Pending'}
                      </span>
                    </div>
                  ))}
                </div>
              </Panel>
            )}

            {/* HITL decision */}
            {hitlRecord && (
              <Panel title="Human-in-the-loop record" caption="Consultant decision">
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="rounded-xl border border-border/50 bg-white/[0.03] p-3">
                    <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">AI recommended</p>
                    <p className={`mt-1.5 text-sm font-semibold ${statusTone(hitlRecord.aiRecommendation)}`}>
                      {readinessLabel(hitlRecord.aiRecommendation)} · {hitlRecord.aiScore}%
                    </p>
                  </div>
                  <div className="rounded-xl border border-border/50 bg-white/[0.03] p-3">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Consultant chose</p>
                      <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${hitlRecord.consultantDecision === 'accepted' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                        {hitlRecord.consultantDecision}
                      </span>
                    </div>
                    <p className={`mt-1.5 text-sm font-semibold ${statusTone(hitlRecord.consultantChoice)}`}>
                      {readinessLabel(hitlRecord.consultantChoice)}
                    </p>
                    {hitlRecord.justification && (
                      <p className="mt-1.5 text-xs italic text-muted-foreground">&ldquo;{hitlRecord.justification}&rdquo;</p>
                    )}
                  </div>
                </div>
              </Panel>
            )}
          </div>

          <div className="space-y-5">
            <IBMStackExplainer />
            <Panel title="Current stage" caption="Engagement workflow">
              <div className="mt-3 rounded-xl border border-accent/20 bg-accent/[0.03] p-3.5">
                <p className="text-sm font-semibold text-foreground">{currentWorkflow.title}</p>
                <p className="mt-1 text-xs text-muted-foreground">{currentWorkflow.description}</p>
                <div className="mt-2 flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{formatTimestamp(currentWorkflow.timestamp)}</span>
                  <span className={statusTone(currentWorkflow.state)}>{currentWorkflow.state}</span>
                </div>
              </div>
              <div className="mt-3 space-y-1.5">
                {dashboard.workflow.map((event) => <WorkflowRow key={event.id} event={event} />)}
              </div>
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function Panel({
  title,
  caption,
  action,
  children,
}: {
  title: string;
  caption: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{caption}</p>
          <h2 className="mt-0.5 text-base font-semibold text-foreground">{title}</h2>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function HeroStat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-sm font-semibold ${tone ? statusTone(tone) : 'text-foreground'}`}>{value}</p>
    </div>
  );
}

function MetricCard({ label, value, tone, note }: { label: string; value: string; tone: string; note: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-white/[0.025] p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-2.5 text-3xl font-bold tracking-tight ${statusTone(tone)}`}>{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{note}</p>
    </div>
  );
}

function WorkflowRow({ event }: { event: WorkflowEvent }) {
  const icon =
    event.state === 'complete' ? <CheckCircle2 className="h-3 w-3" /> :
    event.state === 'current' ? <Clock3 className="h-3 w-3" /> :
    <CircleDashed className="h-3 w-3" />;
  return (
    <div className="flex items-center gap-2.5 rounded-lg border border-border/40 bg-white/[0.015] px-3 py-2">
      <span className={statusTone(event.state)}>{icon}</span>
      <p className="flex-1 text-xs text-foreground">{event.title}</p>
      <span className="text-[10px] text-muted-foreground">{formatTimestamp(event.timestamp)}</span>
    </div>
  );
}

function InfoBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-black/10 p-3">
      <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
        <span className="text-accent-strong">{icon}</span>
        {label}
      </div>
      <p className="mt-1.5 text-xs leading-5 text-foreground">{value}</p>
    </div>
  );
}

function IBMStackExplainer() {
  return (
    <section className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">IBM stack</p>
      <h3 className="mt-0.5 text-base font-semibold text-foreground">How this works</h3>
      <div className="mt-4 space-y-2.5">
        <IBMStackItem icon={<Bot className="h-3.5 w-3.5" />} title="watsonx.ai · IBM Granite" desc="3-agent pipeline parses discovery notes and scores delivery readiness with explainable reasoning." />
        <IBMStackItem icon={<Sparkles className="h-3.5 w-3.5" />} title="IBM Consulting Advantage" desc="Generates consulting artefacts post-assessment — executive summaries, requirements, RAID logs, emails." />
        <IBMStackItem icon={<FileText className="h-3.5 w-3.5" />} title="Human-in-the-loop" desc="Consultant must explicitly accept or override the AI recommendation before the engagement is marked ready." />
      </div>
    </section>
  );
}

function IBMStackItem({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
        <span className="text-accent-strong">{icon}</span>
        {title}
      </div>
      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{desc}</p>
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="page-stack">
      <div className="h-36 animate-pulse rounded-2xl bg-white/5" />
      <div className="grid gap-3 md:grid-cols-4">
        {[0,1,2,3].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/5" />)}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.5fr_1fr]">
        <div className="h-96 animate-pulse rounded-2xl bg-white/5" />
        <div className="h-96 animate-pulse rounded-2xl bg-white/5" />
      </div>
    </div>
  );
}
