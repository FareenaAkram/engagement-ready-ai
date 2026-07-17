'use client';

import { BarChart3 } from 'lucide-react';
import { NoAssessmentYet } from '@/components/ui/empty-state';
import { useWorkflowStore } from '@/store/workflow-store';
import { formatTimestamp, readinessLabel, statusTone } from '@/lib/utils';

export function AnalyticsView() {
  const hasLiveReview = useWorkflowStore((s) => s.hasLiveReview);
  const totalTimeSavedHours = useWorkflowStore((s) => s.totalTimeSavedHours);
  const liveReview = useWorkflowStore((s) => s.latestReview);
  const history = useWorkflowStore((s) => s.history);

  if (history.length === 0) {
    return (
      <NoAssessmentYet
        icon={BarChart3}
        title="No analytics yet"
        description="Analytics are built from completed assessments. Run your first assessment to see delivery readiness trends and time-saved metrics."
      />
    );
  }

  const chronological = [...history].reverse();
  const readyCount = history.filter((h) => h.decision === 'ready').length;
  const conditionsCount = history.filter((h) => h.decision === 'ready-with-conditions').length;
  const notReadyCount = history.filter((h) => h.decision === 'not-ready').length;
  const averageScore = Math.round(history.reduce((sum, h) => sum + h.readinessScore, 0) / history.length);
  const scoreTrend = chronological.map((h, i) => ({ label: `#${i + 1}`, value: h.readinessScore }));
  const maxScore = Math.max(...scoreTrend.map((p) => p.value), 1);

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="rounded-2xl border border-border/60 bg-white/[0.025] p-5 md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-xl">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Analytics</p>
            <h1 className="mt-1 text-xl font-semibold text-foreground">Readiness over time</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Built from {history.length} {history.length === 1 ? 'assessment' : 'assessments'} — every number traces to a real analysis.
            </p>
          </div>
          <div className="grid grid-cols-3 gap-3 xl:w-[360px]">
            <Stat label="Total assessments" value={String(history.length)} />
            <Stat label="Avg. score" value={`${averageScore}%`} />
            <Stat label="Time saved" value={`${totalTimeSavedHours.toFixed(0)}h`} />
          </div>
        </div>
      </div>

      {/* Decision breakdown */}
      <div className="grid gap-3 md:grid-cols-3">
        <DecisionCard label="Ready for delivery" value={readyCount} tone="ready" total={history.length} />
        <DecisionCard label="Ready with conditions" value={conditionsCount} tone="ready-with-conditions" total={history.length} />
        <DecisionCard label="Not ready" value={notReadyCount} tone="not-ready" total={history.length} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Bar chart */}
        <section className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Score trend</p>
          <h2 className="mt-0.5 text-base font-semibold text-foreground">Readiness per assessment</h2>
          <div className="mt-5 flex items-end gap-2">
            {scoreTrend.map((point, i) => (
              <div key={point.label} className="flex flex-1 flex-col items-center gap-2">
                <p className="text-[10px] font-semibold text-muted-foreground">{point.value}%</p>
                <div className="flex h-40 w-full items-end rounded-xl bg-white/[0.03] p-1.5">
                  <div
                    className={`w-full rounded-lg transition-all ${i === scoreTrend.length - 1 ? 'bg-accent' : 'bg-accent/40'}`}
                    style={{ height: `${(point.value / maxScore) * 100}%` }}
                  />
                </div>
                <p className="text-[10px] text-muted-foreground">{point.label}</p>
              </div>
            ))}
          </div>
        </section>

        {/* History log */}
        <section className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Assessment log</p>
          <h2 className="mt-0.5 text-base font-semibold text-foreground">All assessments</h2>
          <div className="mt-4 space-y-2.5">
            {history.map((entry, index) => (
              <div key={entry.id} className="rounded-xl border border-border/40 bg-white/[0.02] p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <span className="flex h-6 w-6 items-center justify-center rounded-full border border-border/50 bg-black/10 text-[10px] font-bold text-muted-foreground">
                      #{history.length - index}
                    </span>
                    <div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`text-sm font-semibold ${statusTone(entry.decision)}`}>
                          {readinessLabel(entry.decision)}
                        </span>
                        <span className="text-xs text-muted-foreground">·</span>
                        <span className="text-xs text-muted-foreground">{entry.readinessScore}%</span>
                        {entry.hitlDecision && (
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${entry.hitlDecision === 'accepted' ? 'bg-green-500/15 text-green-400' : 'bg-yellow-500/15 text-yellow-400'}`}>
                            {entry.hitlDecision}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-muted-foreground line-clamp-1">{entry.executiveSummary}</p>
                    </div>
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${entry.integrationStatus.watsonx === 'live' ? 'bg-green-500/15 text-green-400' : 'bg-white/8 text-muted-foreground'}`}>
                      {entry.integrationStatus.watsonx === 'live' ? 'Live AI' : 'Mock'}
                    </span>
                    <span className="text-[10px] text-muted-foreground">{formatTimestamp(entry.assessedAt)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* Current session */}
      {hasLiveReview && liveReview && (
        <section className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Latest assessment</p>
          <h2 className="mt-0.5 text-base font-semibold text-foreground">Current session metrics</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-4">
            <ImpactStat label="Decision" value={readinessLabel(liveReview.readinessDecision)} />
            <ImpactStat label="Readiness" value={`${liveReview.readinessScore}%`} />
            <ImpactStat label="Confidence" value={`${liveReview.confidenceScore}%`} />
            <ImpactStat label="Time saved" value={`${liveReview.estimatedTimeSavedHours}h`} />
          </div>
          <p className="mt-3 text-sm leading-5 text-muted-foreground">{liveReview.businessImpact}</p>
        </section>
      )}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] p-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function DecisionCard({ label, value, tone, total }: { label: string; value: number; tone: string; total: number }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-2xl border border-border/60 bg-white/[0.025] p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-2.5 text-3xl font-bold tracking-tight ${statusTone(tone)}`}>{value}</p>
      <div className="mt-2 h-1 w-full rounded-full bg-white/8">
        <div className={`h-1 rounded-full bg-current ${statusTone(tone)}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[10px] text-muted-foreground">{pct}% of total</p>
    </div>
  );
}

function ImpactStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] p-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-2 text-lg font-bold text-foreground">{value}</p>
    </div>
  );
}
