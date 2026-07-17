'use client';

import { CheckCircle2, CircleDashed, Clock3, Workflow } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { NoAssessmentYet } from '@/components/ui/empty-state';
import { useLiveDashboard } from '@/hooks/use-dashboard-data';
import { formatTimestamp, readinessLabel, statusTone } from '@/lib/utils';
import { useWorkflowStore } from '@/store/workflow-store';

const PIPELINE_LABELS: Record<string, string> = {
  pending: 'Pending',
  'collecting-data': 'Collecting data',
  'running-watsonx-analysis': 'Running watsonx analysis',
  'building-recommendations': 'Building recommendations',
  'generating-action-plan': 'Generating action plan',
  'dispatching-workflow': 'Dispatching to Orchestrate',
  completed: 'Completed',
  failed: 'Failed',
};

export function WorkflowTimelineView() {
  const liveStage = useWorkflowStore((s) => s.workflowStage);
  const hasLiveReview = useWorkflowStore((s) => s.hasLiveReview);
  const assessedAt = useWorkflowStore((s) => s.assessedAt);
  const assessmentCount = useWorkflowStore((s) => s.assessmentCount);
  const liveReviewResult = useWorkflowStore((s) => s.latestReview);

  const { data, isLoading } = useLiveDashboard();

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-20 animate-pulse rounded-2xl bg-white/5" />)}
      </div>
    );
  }

  if (!hasLiveReview) {
    return (
      <NoAssessmentYet
        icon={Workflow}
        title="No timeline yet"
        description="This page shows the full audit trail — from discovery notes through AI analysis, actions, and consultant decision. Run an assessment to populate it."
      />
    );
  }

  const workflow = data?.data.workflow ?? [];
  const pipelineStage = data?.data.pipelineStage ?? 'pending';
  const pipelineStageHistory = data?.data.pipelineStageHistory ?? [];
  const pipelineError = data?.data.pipelineError;
  const pipelineFailed = pipelineStage === 'failed';
  const hitlRecord = liveReviewResult?.hitlRecord;
  const isReady = liveStage === 'ready-for-engagement' || liveStage === 'delivery-package-sent';
  const isDelivered = liveStage === 'delivery-package-sent';
  const isReadyForReview = liveStage === 'ready-for-review';
  const completed = workflow.filter((e) => e.state === 'complete').length;
  const currentStep = workflow.find((e) => e.state === 'current');

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="rounded-2xl border border-border/60 bg-white/[0.025] p-5 md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-xl">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Engagement timeline</p>
            <h1 className="mt-1 text-xl font-semibold text-foreground">End-to-end audit trail</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Timestamped record from discovery through AI analysis, actions, and final consultant decision.
              {assessedAt && (
                <span className="ml-2 rounded-full bg-green-500/15 px-2 py-0.5 text-xs text-green-400">
                  {assessmentCount} assessment{assessmentCount !== 1 ? 's' : ''} · {formatTimestamp(assessedAt)}
                </span>
              )}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 xl:w-[280px]">
            <Stat label="Stages done" value={`${completed}/${workflow.length}`} />
            <Stat label="Current" value={currentStep?.title ?? liveStage.replace(/-/g, ' ')} />
            <Stat
              label="AI verdict"
              value={liveReviewResult ? readinessLabel(liveReviewResult.readinessDecision) : '—'}
              tone={liveReviewResult?.readinessDecision}
            />
            <Stat
              label="Status"
              value={isDelivered ? 'Delivered' : isReady ? 'Approved' : isReadyForReview ? 'Needs approval' : 'In progress'}
              tone={isDelivered || isReady ? 'ready' : undefined}
            />
          </div>
        </div>
      </div>

      {/* Pipeline failure */}
      {pipelineFailed && (
        <div className="rounded-2xl border border-red-500/25 bg-red-500/5 p-5">
          <p className="text-xs font-semibold uppercase tracking-widest text-danger">Pipeline failed</p>
          <p className="mt-1.5 text-sm font-semibold text-foreground">The watsonx.ai pipeline did not complete</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {pipelineError ?? 'An unexpected error stopped the run.'}{' '}
            Submit a new assessment to retry.
          </p>
        </div>
      )}

      {/* Pipeline trace */}
      {pipelineStageHistory.length > 0 && (
        <section className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">AI pipeline</p>
              <h2 className="mt-0.5 text-base font-semibold text-foreground">Execution lifecycle</h2>
            </div>
            <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${pipelineFailed ? 'bg-red-500/15 text-danger' : pipelineStage === 'completed' ? 'bg-green-500/15 text-green-400' : 'bg-accent/15 text-accent-strong'}`}>
              {PIPELINE_LABELS[pipelineStage] ?? pipelineStage}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {pipelineStageHistory.map((entry, index) => (
              <div
                key={`${entry.stage}-${index}`}
                className="grid gap-2 rounded-xl border border-border/50 bg-white/[0.02] p-3.5 md:grid-cols-[180px_1fr_auto] md:items-center"
              >
                <p className={`text-sm font-semibold ${entry.stage === 'failed' ? 'text-danger' : 'text-foreground'}`}>
                  {PIPELINE_LABELS[entry.stage] ?? entry.stage}
                </p>
                <p className="text-xs text-muted-foreground">{entry.label}</p>
                <p className="text-[10px] text-muted-foreground">{formatTimestamp(entry.enteredAt)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Workflow stages */}
      <section className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Engagement workflow</p>
            <h2 className="mt-0.5 text-base font-semibold text-foreground">Stage-by-stage progress</h2>
          </div>
          <span className="rounded-full bg-white/8 px-2.5 py-1 text-xs text-muted-foreground">
            {liveStage.replace(/-/g, ' ')}
          </span>
        </div>

        <div className="mt-4 space-y-3">
          {workflow.map((event, index) => {
            const icon =
              event.state === 'complete' ? <CheckCircle2 className="h-4 w-4" /> :
              event.state === 'current' ? <Clock3 className="h-4 w-4 animate-pulse" /> :
              <CircleDashed className="h-4 w-4" />;

            return (
              <div
                key={event.id}
                className={`flex items-start gap-4 rounded-xl border p-4 ${
                  event.state === 'complete'
                    ? 'border-green-500/15 bg-green-500/[0.02]'
                    : event.state === 'current'
                      ? 'border-accent/20 bg-accent/[0.02]'
                      : 'border-border/40 bg-white/[0.015] opacity-60'
                }`}
              >
                <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-xs font-bold ${statusTone(event.state)}`}>
                  {index + 1}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold text-foreground">{event.title}</p>
                    <span className={`flex items-center gap-1 text-xs ${statusTone(event.state)}`}>
                      {icon} {event.state}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{event.description}</p>
                </div>
                <p className="shrink-0 text-[10px] text-muted-foreground">{formatTimestamp(event.timestamp)}</p>
              </div>
            );
          })}
        </div>
      </section>

      {/* HITL record */}
      {hitlRecord && (
        <section className={`rounded-2xl border p-5 ${hitlRecord.consultantDecision === 'overridden' ? 'border-yellow-500/20 bg-yellow-500/[0.02]' : 'border-green-500/20 bg-green-500/[0.02]'}`}>
          <p className={`text-xs font-semibold uppercase tracking-widest ${hitlRecord.consultantDecision === 'overridden' ? 'text-yellow-400' : 'text-green-400'}`}>
            Consultant decision recorded
          </p>
          <h2 className="mt-1 text-base font-semibold text-foreground">
            {hitlRecord.consultantDecision === 'accepted' ? 'AI recommendation accepted' : 'AI recommendation overridden'}
          </h2>
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">AI recommended</p>
              <p className={`mt-1.5 text-sm font-semibold ${statusTone(hitlRecord.aiRecommendation)}`}>
                {readinessLabel(hitlRecord.aiRecommendation)} · {hitlRecord.aiScore}%
              </p>
            </div>
            <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3">
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Consultant chose</p>
              <p className={`mt-1.5 text-sm font-semibold ${statusTone(hitlRecord.consultantChoice)}`}>
                {readinessLabel(hitlRecord.consultantChoice)}
              </p>
              {hitlRecord.justification && (
                <p className="mt-1.5 text-xs italic text-muted-foreground">&ldquo;{hitlRecord.justification}&rdquo;</p>
              )}
            </div>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">
            Decided at {new Date(hitlRecord.decidedAt).toLocaleString()}
          </p>
        </section>
      )}

      {/* Awaiting final approval */}
      {isReadyForReview && !isReady && (
        <section className="rounded-2xl border border-accent/20 bg-accent/[0.02] p-5">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-accent-strong">Final approval required</p>
              <h2 className="mt-1 text-base font-semibold text-foreground">All tasks complete — awaiting lead consultant approval</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Go to the Action Center to approve this engagement for delivery. Approval triggers ICA Phase 2 asset generation.
              </p>
            </div>
            <Button size="sm" asChild>
              <Link href="/maintenance-tasks">Go to Action Center</Link>
            </Button>
          </div>
        </section>
      )}

      {/* Approved / delivered */}
      {(isReady || isDelivered) && (
        <section className={`rounded-2xl border p-5 ${isDelivered ? 'border-green-500/25 bg-green-500/[0.03]' : 'border-accent/20 bg-accent/[0.02]'}`}>
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className={`text-xs font-semibold uppercase tracking-widest ${isDelivered ? 'text-green-400' : 'text-accent-strong'}`}>
                {isDelivered ? 'Delivery package sent' : 'Approved — generating delivery package'}
              </p>
              <h2 className="mt-1 text-base font-semibold text-foreground">
                {isDelivered ? 'ICA delivery assets generated and sent' : 'Lead consultant approved this engagement'}
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {isDelivered
                  ? 'Executive summary, client email, internal email, Jira epic, and Slack message have been delivered.'
                  : 'ICA is generating the delivery package. Assets will be emailed shortly.'}
              </p>
            </div>
            <Button size="sm" asChild>
              <Link href="/dashboard">View dashboard</Link>
            </Button>
          </div>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] p-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-sm font-semibold ${tone ? statusTone(tone) : 'text-foreground'}`}>{value}</p>
    </div>
  );
}
