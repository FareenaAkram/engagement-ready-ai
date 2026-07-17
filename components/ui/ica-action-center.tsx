'use client';

/**
 * ICA Action Center
 *
 * Shows the full lifecycle of ICA-managed tasks after the consultant accepts the AI plan.
 * Includes: completion notes per task, re-assessment with updated evidence, final approval.
 */

import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  ArrowRight,
  CheckCircle2,
  Clock,
  FileText,
  HardHat,
  ListChecks,
  LoaderCircle,
  Mail,
  MessageSquare,
  RefreshCw,
  Ticket,
  User,
  Wrench,
  Zap,
} from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { NoAssessmentYet } from '@/components/ui/empty-state';
import { useToastStore } from '@/components/ui/toast';
import { useLiveDashboard } from '@/hooks/use-dashboard-data';
import { cn, statusTone } from '@/lib/utils';
import { useWorkflowStore } from '@/store/workflow-store';
import type { TaskAssignment } from '@/types/domain';

// ─── Role icons ───────────────────────────────────────────────────────────────

function roleIcon(role: string) {
  switch (role) {
    case 'architect': return <HardHat className="h-3.5 w-3.5" />;
    case 'consultant': return <Wrench className="h-3.5 w-3.5" />;
    case 'qa': return <CheckCircle2 className="h-3.5 w-3.5" />;
    case 'operations': return <Zap className="h-3.5 w-3.5" />;
    default: return <User className="h-3.5 w-3.5" />;
  }
}

// ─── API helpers ──────────────────────────────────────────────────────────────

interface TaskListResponse {
  tasks: TaskAssignment[];
  total: number;
  pending: number;
  acknowledged: number;
  completed: number;
  allDone: boolean;
}

async function fetchTasks(): Promise<TaskListResponse> {
  const res = await fetch('/api/task/list');
  if (!res.ok) throw new Error('Failed to fetch tasks');
  return res.json() as Promise<TaskListResponse>;
}

async function markTaskDone(taskId: string, completedBy: string, completionNote?: string): Promise<{ ok: boolean }> {
  const res = await fetch('/api/task/update', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ taskId, status: 'completed', completedBy, completionNote: completionNote ?? null }),
  });
  if (!res.ok) throw new Error('Failed to mark task done');
  return res.json() as Promise<{ ok: boolean }>;
}

async function requestFinalApproval(
  approvedBy: string,
  approvalPasscode?: string,
): Promise<{ ok: boolean; workflowStage?: string; reason?: string }> {
  const res = await fetch('/api/final-approval', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ approvedBy, approvalPasscode }),
  });
  if (!res.ok) {
    const b = await res.json().catch(() => ({})) as { reason?: string; message?: string };
    throw new Error(b.reason ?? b.message ?? 'Final approval failed.');
  }
  return res.json() as Promise<{ ok: boolean; workflowStage?: string; reason?: string }>;
}

async function requestReassess(additionalContext?: string): Promise<{ data?: unknown; error?: boolean; message?: string }> {
  const res = await fetch('/api/reassess', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ additionalContext: additionalContext ?? '' }),
  });
  return res.json() as Promise<{ data?: unknown; error?: boolean; message?: string }>;
}

// ─── ICA Action Center ────────────────────────────────────────────────────────

export function ICAActionCenter() {
  const hasLiveReview  = useWorkflowStore((s) => s.hasLiveReview);
  const liveReview     = useWorkflowStore((s) => s.latestReview);
  const workflowStage  = useWorkflowStore((s) => s.workflowStage);
  const advanceStage   = useWorkflowStore((s) => s.advanceStage);
  const pushToast      = useToastStore((s) => s.push);
  const queryClient    = useQueryClient();
  const { isLoading: dashLoading } = useLiveDashboard();

  const { data: taskData, isLoading: tasksLoading } = useQuery({
    queryKey: ['task-list'],
    queryFn: fetchTasks,
    refetchInterval: 15_000,
  });

  const isReadyForReview = workflowStage === 'ready-for-review';
  const isApproved       = workflowStage === 'ready-for-engagement' || workflowStage === 'delivery-package-sent';
  const allTasksDone     = taskData?.allDone ?? false;
  const liveTasks        = taskData?.tasks ?? [];
  const hasServerTasks   = liveTasks.length > 0;

  const completedCount = liveTasks.filter((t) => t.status === 'completed').length;
  const totalCount     = liveTasks.length || (liveReview?.actionPlan?.actions.length ?? 0);
  const pendingCount   = totalCount - completedCount;

  const [markingId, setMarkingId] = useState<string | null>(null);
  // completion note modal state
  const [noteModal, setNoteModal]   = useState<{ taskId: string; title: string; assigneeName: string } | null>(null);
  const [noteText, setNoteText]     = useState('');
  // re-assess state
  const [showReassess, setShowReassess]   = useState(false);
  const [reassessNote, setReassessNote]   = useState('');
  // final-approval passcode modal state
  const [showApprovalModal, setShowApprovalModal] = useState(false);
  const [approvalPasscode, setApprovalPasscode]   = useState('');

  // ── Mark one task done (with optional completion note) ──────────────────
  const markDoneMutation = useMutation({
    mutationFn: ({ taskId, completedBy, completionNote }: { taskId: string; completedBy: string; completionNote?: string }) =>
      markTaskDone(taskId, completedBy, completionNote),
    onMutate: ({ taskId }) => setMarkingId(taskId),
    onSettled: () => { setMarkingId(null); setNoteModal(null); setNoteText(''); },
    onSuccess: (_, { taskId }) => {
      void queryClient.invalidateQueries({ queryKey: ['task-list'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      const task = taskData?.tasks.find((t) => t.taskId === taskId);
      pushToast({ title: 'Task marked done', description: task?.title ?? taskId, tone: 'success' });
    },
    onError: () => pushToast({ title: 'Could not mark done', description: 'Try again.', tone: 'error' }),
  });

  // ── Final approval ──────────────────────────────────────────────────────
  const approvalMutation = useMutation({
    mutationFn: () => requestFinalApproval('Lead Consultant', approvalPasscode || undefined),
    onSettled: () => setShowApprovalModal(false),
    onSuccess: (result) => {
      if (!result.ok) {
        pushToast({ title: 'Could not approve', description: result.reason ?? 'Try again.', tone: 'error' });
        return;
      }
      setApprovalPasscode('');
      advanceStage('delivery-package-sent');
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['task-list'] });
      pushToast({
        title: '✓ Engagement approved',
        description: 'ICA is generating the delivery package — Executive Summary, Client Email, Jira Epic, Slack.',
        tone: 'success',
      });
    },
    onError: (e) =>
      pushToast({ title: 'Approval failed', description: e instanceof Error ? e.message : 'Try again.', tone: 'error' }),
  });

  // ── Re-assess with completion notes ────────────────────────────────────
  const reassessMutation = useMutation({
    mutationFn: () => requestReassess(reassessNote),
    onSuccess: (result) => {
      if (result.error) {
        pushToast({ title: 'Re-assessment failed', description: result.message ?? 'Try again.', tone: 'error' });
        return;
      }
      setShowReassess(false);
      setReassessNote('');
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      pushToast({
        title: '✓ Re-assessment complete',
        description: 'New readiness score generated with remediation evidence. Check AI Findings.',
        tone: 'success',
      });
    },
    onError: (e) =>
      pushToast({ title: 'Re-assessment failed', description: e instanceof Error ? e.message : 'Try again.', tone: 'error' }),
  });

  // ─── If engagement is fully complete, redirect user to Engagement Summary ─
  if (isApproved) {
    return (
      <div className="page-stack">
        <div className="rounded-[30px] glass-panel p-6 md:p-7">
          <p className="section-caption">Action Center</p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground">Engagement complete</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">
            All tasks have been completed and the lead consultant has approved. ICA has generated and sent the delivery package.
            The full engagement summary — including the task log, HITL record, delivery assets, and consultant notes — is on the
            Engagement Summary page.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Button size="sm" asChild>
              <Link href="/engagement-summary">View engagement summary →</Link>
            </Button>
            <Button variant="secondary" size="sm" asChild>
              <Link href="/readiness-review">Start new assessment</Link>
            </Button>
          </div>
        </div>

        {/* Summary of completed tasks for reference */}
        {liveTasks.length > 0 && (
          <section className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
            <p className="section-caption">Completed tasks</p>
            <h2 className="section-title mt-1">All {liveTasks.length} actions done</h2>
            <div className="mt-4 space-y-2">
              {liveTasks.map((task) => (
                <div key={task.taskId} className="flex items-center gap-3 rounded-xl border border-green-500/20 bg-green-500/5 p-3">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground">{task.title}</p>
                    <p className="text-xs text-muted-foreground">{task.assigneeName} · {task.ownerRole}</p>
                  </div>
                  {task.completedAt && (
                    <p className="shrink-0 text-[10px] text-green-400">{new Date(task.completedAt).toLocaleDateString()}</p>
                  )}
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    );
  }

  // ─── Loading ──────────────────────────────────────────────────────────────
  if (dashLoading || tasksLoading) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/5" />)}
      </div>
    );
  }

  if (!hasLiveReview && !hasServerTasks) {
    return (
      <NoAssessmentYet
        icon={ListChecks}
        title="No actions yet"
        description="Follow-up actions are assigned by ICA after you accept the AI plan. Run an assessment first."
      />
    );
  }

  // ─── ICA responsibility banner ────────────────────────────────────────────
  const icaTookOver = workflowStage !== 'draft' &&
    workflowStage !== 'assessment-complete' &&
    workflowStage !== 'ai-review-complete';

  return (
    <div className="page-stack">

      {/* ── Completion Note Modal ─────────────────────────────────────────────── */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border/60 bg-[#0d1117] p-6">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Mark task done
            </p>
            <h2 className="mt-1 text-base font-semibold text-foreground">{noteModal.title}</h2>
            <p className="mt-3 text-xs text-muted-foreground">
              Add a completion note — what was done, what evidence was produced, any caveats.
              This note will be used by watsonx to <strong className="text-foreground">re-evaluate readiness</strong> with your updated evidence.
            </p>
            <textarea
              className="mt-3 w-full rounded-xl border border-border/60 bg-white/[0.03] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
              rows={4}
              placeholder="e.g. Security architecture defined — MFA baseline established. Cloud provider selected: AWS us-east-1. Migration plan v0.1 drafted and reviewed by architect."
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
            />
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                onClick={() =>
                  markDoneMutation.mutate({
                    taskId: noteModal.taskId,
                    completedBy: noteModal.assigneeName,
                    completionNote: noteText.trim() || undefined,
                  })
                }
                disabled={markDoneMutation.isPending}
              >
                {markDoneMutation.isPending ? (
                  <><LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />Saving…</>
                ) : (
                  <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Mark done</>
                )}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setNoteModal(null); setNoteText(''); }}
                disabled={markDoneMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Final Approval Passcode Modal ───────────────────────────────────── */}
      {showApprovalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
          <div className="w-full max-w-md rounded-2xl border border-border/60 bg-[#0d1117] p-6">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Confirm final approval
            </p>
            <h2 className="mt-1 text-base font-semibold text-foreground">Approve — Ready for Engagement</h2>
            <p className="mt-3 text-xs text-muted-foreground">
              This triggers real delivery: emails are sent, Slack is posted, and a Jira Epic is created. If an
              approval passcode is configured for this deployment, enter it below. Leave blank if none is set.
            </p>
            <input
              type="password"
              className="mt-3 w-full rounded-xl border border-border/60 bg-white/[0.03] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-accent/50"
              placeholder="Approval passcode (if configured)"
              value={approvalPasscode}
              onChange={(e) => setApprovalPasscode(e.target.value)}
              autoFocus
            />
            <div className="mt-4 flex gap-2">
              <Button
                size="sm"
                onClick={() => approvalMutation.mutate()}
                disabled={approvalMutation.isPending}
              >
                {approvalMutation.isPending ? (
                  <><LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />Approving…</>
                ) : (
                  <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Confirm approval</>
                )}
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { setShowApprovalModal(false); setApprovalPasscode(''); }}
                disabled={approvalMutation.isPending}
              >
                Cancel
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Re-assess Panel ─────────────────────────────────────────────────── */}
      {showReassess && (
        <div className="rounded-2xl border border-accent/30 bg-accent/[0.04] p-5">
          <div className="flex items-start justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-accent-strong">
                Re-evaluate readiness
              </p>
              <h2 className="mt-0.5 text-base font-semibold text-foreground">
                Run new assessment with remediation evidence
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                watsonx will re-score the engagement using the original discovery notes + all completion notes from the team.
                The score should improve because the blockers have been resolved.
              </p>
            </div>
            <button
              onClick={() => setShowReassess(false)}
              className="text-muted-foreground hover:text-foreground ml-3 shrink-0"
            >
              ✕
            </button>
          </div>
          <textarea
            className="mt-3 w-full rounded-xl border border-border/60 bg-white/[0.03] px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground/50 resize-none focus:outline-none focus:ring-1 focus:ring-accent/50"
            rows={3}
            placeholder="Optional: Add any extra context for this re-assessment (e.g. video transcript, new meeting notes, sign-off from client)"
            value={reassessNote}
            onChange={(e) => setReassessNote(e.target.value)}
          />
          <div className="mt-3 flex gap-2">
            <Button
              size="sm"
              onClick={() => reassessMutation.mutate()}
              disabled={reassessMutation.isPending}
            >
              {reassessMutation.isPending ? (
                <><LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />Re-assessing (~30s)…</>
              ) : (
                <><RefreshCw className="mr-1.5 h-3.5 w-3.5" />Re-evaluate with evidence</>
              )}
            </Button>
            <Button variant="secondary" size="sm" onClick={() => setShowReassess(false)}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="rounded-2xl border border-border/60 bg-white/[0.025] p-5 md:p-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="max-w-xl">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              ICA Action Center
            </p>
            <h1 className="mt-1 text-xl font-semibold text-foreground">
              {icaTookOver ? 'ICA is managing remediation' : 'Action Center'}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {icaTookOver
                ? 'ICA has assigned tasks to the team, sent emails, and created Jira tickets. Mark each task done when complete.'
                : 'After you accept the AI plan, ICA assigns tasks to Architect, Consultant, QA, and Operations.'}
            </p>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-3 xl:w-[280px]">
            <Stat label="Pending" value={String(pendingCount)} tone={pendingCount > 0 ? 'warn' : undefined} />
            <Stat label="Done" value={String(completedCount)} tone={completedCount > 0 ? 'ok' : undefined} />
            <Stat label="Total" value={String(totalCount)} />
            <Stat label="Stage" value={workflowStage.replace(/-/g, ' ')} />
          </div>
        </div>
      </div>

      {/* ── Flow indicator ─────────────────────────────────────────────────── */}
      <ICAFlowIndicator stage={workflowStage} allDone={allTasksDone} />

      <div className="grid gap-5 xl:grid-cols-[1.3fr_0.7fr]">

        {/* ── Task board ─────────────────────────────────────────────────────── */}
        <section className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
                ICA-assigned tasks
              </p>
              <h2 className="mt-0.5 text-base font-semibold text-foreground">Action board</h2>
            </div>
            {totalCount > 0 && (
              <div className="flex items-center gap-2">
                <div className="h-1.5 w-24 rounded-full bg-white/10">
                  <div
                    className="h-1.5 rounded-full bg-green-500 transition-all duration-500"
                    style={{ width: `${totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0}%` }}
                  />
                </div>
                <span className="text-xs text-muted-foreground">{completedCount}/{totalCount}</span>
              </div>
            )}
          </div>

          {hasServerTasks ? (
            <TaskBoard
              tasks={liveTasks}
              markingId={markingId}
              onMarkDone={(taskId, assigneeName, title) => setNoteModal({ taskId, title, assigneeName })}
            />
          ) : liveReview?.actionPlan?.actions?.length ? (
            /* Pre-assignment fallback — show action plan before ICA has assigned */
            <div className="space-y-3">
              {liveReview.actionPlan.actions.map((action) => (
                <div
                  key={action.id}
                  className="rounded-xl border border-border/50 bg-white/[0.02] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-semibold text-foreground">{action.title}</p>
                    <span className={cn('shrink-0 text-xs font-medium', statusTone(action.priority))}>
                      {action.priority}
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">{action.instructions}</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <Tag label="Owner" value={action.ownerRole} />
                    <Tag label="Due" value={action.dueLabel} />
                  </div>
                </div>
              ))}
              <p className="mt-3 text-xs text-muted-foreground">
                Accept the AI plan to trigger ICA task assignment.
              </p>
            </div>
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">
              No tasks yet. Accept the AI plan to trigger ICA task assignment.
            </p>
          )}

          {/* ── Approval gate ─────────────────────────────────────────────── */}
          <div className="mt-5">
            {isApproved ? (
              <div className="flex items-center gap-2.5 rounded-xl border border-green-500/20 bg-green-500/5 p-3.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />
                <div>
                  <p className="text-sm font-semibold text-green-400">Engagement approved — delivery package sent</p>
                  <p className="text-xs text-muted-foreground">
                    ICA generated the Executive Summary, Client Email, Internal Email, Jira Epic, and Slack message.
                  </p>
                </div>
                <Button variant="secondary" size="sm" asChild className="ml-auto shrink-0">
                  <Link href="/workflow-timeline">View timeline <ArrowRight className="ml-1 h-3 w-3" /></Link>
                </Button>
              </div>
            ) : isReadyForReview ? (
              <div className="rounded-xl border border-accent/20 bg-accent/[0.03] p-3.5">
                <p className="text-sm font-semibold text-accent-strong">
                  All tasks complete — status is now Ready for Review
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  ICA has updated the readiness status from &ldquo;Needs Improvement&rdquo; to <strong>Ready for Review</strong>.
                  You can re-evaluate the readiness score with remediation evidence before approving.
                </p>
                <p className="mt-2 text-xs text-muted-foreground">
                  On approval, ICA generates: Executive Summary · Client Email · Internal Email · Slack · Jira Epic
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    onClick={() => setShowApprovalModal(true)}
                    disabled={approvalMutation.isPending}
                  >
                    {approvalMutation.isPending ? (
                      <><LoaderCircle className="mr-1.5 h-3.5 w-3.5 animate-spin" />Approving…</>
                    ) : (
                      <><CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />Approve — Ready for Engagement</>
                    )}
                  </Button>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setShowReassess((v) => !v)}
                  >
                    <RefreshCw className="mr-1.5 h-3.5 w-3.5" />Re-evaluate first
                  </Button>
                </div>
              </div>
            ) : !allTasksDone && hasServerTasks ? (
              <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 p-3.5">
                <p className="text-sm font-semibold text-yellow-400">Actions pending</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {pendingCount} action{pendingCount === 1 ? '' : 's'} still open.
                  Mark all actions done to advance the readiness status to Ready for Review.
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/50 bg-white/[0.02] p-3.5">
                <p className="text-sm text-muted-foreground">
                  Mark all actions done to advance to the final approval step.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ── Sidebar — ICA responsibilities ─────────────────────────────────── */}
        <div className="space-y-4">

          {/* AI verdict */}
          {liveReview && (
            <div className="rounded-2xl border border-accent/20 bg-accent/[0.03] p-4">
              <p className="text-[10px] font-semibold uppercase tracking-widest text-accent-strong">
                AI verdict
              </p>
              <p className={cn('mt-2 text-sm font-semibold', statusTone(liveReview.readinessDecision))}>
                {liveReview.readinessDecision.replace(/-/g, ' ')} · {liveReview.readinessScore}%
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{liveReview.businessImpact}</p>
            </div>
          )}

          {/* ICA responsibilities */}
          <section className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              Responsibilities
            </p>
            <h2 className="mt-0.5 text-base font-semibold text-foreground">Who does what</h2>

            <div className="mt-4 space-y-3">
              <ResponsibilityCard
                owner="watsonx"
                accent="blue"
                items={['Analyse discovery notes', 'Score readiness 0-100', 'Identify risks & gaps', 'Recommend action plan']}
              />
              <ResponsibilityCard
                owner="ICA"
                accent="purple"
                items={[
                  'Assign tasks (Architect / Consultant / QA / Operations)',
                  'Send task-assignment emails',
                  'Create Jira tickets per action',
                  'Post Slack team update',
                  'Generate delivery assets on approval',
                ]}
              />
              <ResponsibilityCard
                owner="Human"
                accent="green"
                items={['Accept or override AI findings', 'Mark tasks complete', 'Grant final approval']}
              />
              <ResponsibilityCard
                owner="App"
                accent="gray"
                items={['Store workflow state', 'Display Action Center', 'Route callbacks from ICA']}
              />
            </div>
          </section>

          {/* Delivery assets (Phase 2) */}
          <section className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              ICA Phase 2 deliverables
            </p>
            <h2 className="mt-0.5 text-sm font-semibold text-foreground">Generated after approval</h2>
            <div className="mt-3 space-y-2">
              <DeliverableRow icon={<FileText className="h-3.5 w-3.5" />} label="Executive Summary" done={isApproved} />
              <DeliverableRow icon={<Mail className="h-3.5 w-3.5" />} label="Client Email" done={isApproved} />
              <DeliverableRow icon={<Mail className="h-3.5 w-3.5" />} label="Internal Team Email" done={isApproved} />
              <DeliverableRow icon={<MessageSquare className="h-3.5 w-3.5" />} label="Slack Message" done={isApproved} />
              <DeliverableRow icon={<Ticket className="h-3.5 w-3.5" />} label="Jira Epic + Tickets" done={isApproved} />
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}

// ─── ICA Flow Indicator ───────────────────────────────────────────────────────

const FLOW_STEPS = [
  { key: 'assessment-complete',  label: 'Assessment',         owner: 'watsonx' },
  { key: 'ai-review-complete',   label: 'AI Findings',        owner: 'watsonx' },
  { key: 'action-plan-accepted', label: 'Accept AI Plan',     owner: 'human' },
  { key: 'tasks-in-progress',    label: 'ICA Assigns',        owner: 'ica' },
  { key: 'tasks-complete',       label: 'Tasks Complete',     owner: 'ica' },
  { key: 'ready-for-review',     label: 'Ready for Review',   owner: 'ica' },
  { key: 'ready-for-engagement', label: 'Human Approves',     owner: 'human' },
  { key: 'delivery-package-sent','label': 'ICA Delivers',     owner: 'ica' },
] as const;

const STAGE_ORDER = [
  'draft', 'assessment-complete', 'ai-review-complete', 'action-plan-accepted',
  'tasks-in-progress', 'tasks-complete', 'ready-for-review', 'ready-for-engagement',
  'delivery-package-sent',
];

function ICAFlowIndicator({ stage, allDone }: { stage: string; allDone: boolean }) {
  const currentIdx = STAGE_ORDER.indexOf(stage);

  return (
    <div className="rounded-2xl border border-border/60 bg-white/[0.025] p-4 overflow-x-auto">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground mb-3">
        Workflow progress
      </p>
      <div className="flex items-center gap-1 min-w-max">
        {FLOW_STEPS.map((step, i) => {
          const stepIdx = STAGE_ORDER.indexOf(step.key);
          const done    = stepIdx < currentIdx;
          const active  = stepIdx === currentIdx || (step.key === 'tasks-complete' && allDone);
          const ownerColour =
            step.owner === 'watsonx' ? 'text-blue-400 border-blue-400/30 bg-blue-400/5' :
            step.owner === 'ica'     ? 'text-purple-400 border-purple-400/30 bg-purple-400/5' :
            step.owner === 'human'   ? 'text-green-400 border-green-400/30 bg-green-400/5' :
                                       'text-muted-foreground border-border/40 bg-white/[0.02]';

          return (
            <div key={step.key} className="flex items-center gap-1">
              <div
                className={cn(
                  'rounded-lg border px-2.5 py-1.5 text-[10px] font-medium whitespace-nowrap transition-all',
                  done   ? 'border-green-500/30 bg-green-500/5 text-green-400' :
                  active ? ownerColour :
                           'border-border/30 bg-transparent text-muted-foreground/50',
                )}
              >
                {done && <span className="mr-1">✓</span>}
                {step.label}
              </div>
              {i < FLOW_STEPS.length - 1 && (
                <div className={cn('h-px w-4 shrink-0', done ? 'bg-green-500/40' : 'bg-border/30')} />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Task board ───────────────────────────────────────────────────────────────

function TaskBoard({
  tasks,
  markingId,
  onMarkDone,
}: {
  tasks: TaskAssignment[];
  markingId: string | null;
  onMarkDone: (taskId: string, assigneeName: string, title: string) => void;
}) {
  const byRole = tasks.reduce<Record<string, TaskAssignment[]>>((acc, t) => {
    const r = t.ownerRole;
    acc[r] = acc[r] ?? [];
    acc[r].push(t);
    return acc;
  }, {});

  return (
    <div className="mt-2 space-y-4">
      {Object.entries(byRole).map(([role, roleTasks]) => {
        const allRoleDone = roleTasks.every((t) => t.status === 'completed');
        return (
          <div key={role}>
            <div className="flex items-center gap-2 mb-2">
              <span className={cn('text-xs text-muted-foreground', allRoleDone && 'text-green-400')}>
                {roleIcon(role)}
              </span>
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {role}
              </span>
              {allRoleDone && <span className="text-[10px] text-green-400">Done</span>}
            </div>
            <div className="space-y-2">
              {roleTasks.map((task) => (
                <TaskCard
                  key={task.taskId}
                  task={task}
                  isMarking={markingId === task.taskId}
                  onMarkDone={onMarkDone}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function TaskCard({
  task,
  isMarking,
  onMarkDone,
}: {
  task: TaskAssignment;
  isMarking: boolean;
  onMarkDone: (taskId: string, assigneeName: string, title: string) => void;
}) {
  const isDone = task.status === 'completed';

  return (
    <div
      className={cn(
        'rounded-xl border p-4 transition-colors',
        isDone
          ? 'border-green-500/20 bg-green-500/[0.03]'
          : 'border-border/50 bg-white/[0.02]',
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {isDone && <CheckCircle2 className="h-4 w-4 shrink-0 text-green-400" />}
            <p className={cn('text-sm font-semibold', isDone ? 'text-muted-foreground line-through' : 'text-foreground')}>
              {task.title}
            </p>
          </div>
          {!isDone && (
            <p className="mt-1 text-xs leading-5 text-muted-foreground">{task.instructions}</p>
          )}
          {isDone && task.completedBy && (
            <p className="mt-1 text-xs text-green-400">Completed by {task.completedBy}</p>
          )}
          {isDone && task.completionNote && (
            <p className="mt-1 text-xs text-muted-foreground italic">&ldquo;{task.completionNote}&rdquo;</p>
          )}
        </div>
        <span className={cn('shrink-0 text-xs font-medium', statusTone(task.priority))}>
          {task.priority}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
        {task.assigneeName && (
          <span className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-white/[0.02] px-2 py-0.5">
            <Mail className="h-3 w-3 text-muted-foreground" />
            <span className="text-foreground">{task.assigneeName}</span>
          </span>
        )}
        <span className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-white/[0.02] px-2 py-0.5">
          <Clock className="h-3 w-3 text-muted-foreground" />
          <span className={statusTone(task.status)}>{task.status}</span>
        </span>
        <Tag label="Due" value={task.dueLabel} />
      </div>

      {!isDone && (
        <div className="mt-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => onMarkDone(task.taskId, task.assigneeName ?? task.ownerRole, task.title)}
            disabled={isMarking}
            className="text-xs"
          >
            {isMarking ? (
              <><LoaderCircle className="mr-1.5 h-3 w-3 animate-spin" />Marking…</>
            ) : (
              <><CheckCircle2 className="mr-1.5 h-3 w-3" />Mark done + add note</>
            )}
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Small components ─────────────────────────────────────────────────────────

function Stat({ label, value, tone }: { label: string; value: string; tone?: 'warn' | 'ok' }) {
  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] p-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className={cn(
        'mt-1.5 text-sm font-semibold',
        tone === 'warn' ? 'text-yellow-400' :
        tone === 'ok'   ? 'text-green-400' :
        'text-foreground',
      )}>
        {value}
      </p>
    </div>
  );
}

function Tag({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border/40 bg-white/[0.02] px-2 py-0.5 text-[10px]">
      <span className="text-muted-foreground">{label}:</span>
      <span className="text-foreground">{value}</span>
    </span>
  );
}

function DeliverableRow({ icon, label, done }: { icon: React.ReactNode; label: string; done: boolean }) {
  return (
    <div className={cn('flex items-center gap-2.5 rounded-lg border px-3 py-2', done ? 'border-green-500/20 bg-green-500/[0.03]' : 'border-border/40 bg-white/[0.02]')}>
      <span className={done ? 'text-green-400' : 'text-muted-foreground'}>{icon}</span>
      <span className={cn('text-xs', done ? 'text-green-400' : 'text-muted-foreground')}>{label}</span>
      {done && <CheckCircle2 className="ml-auto h-3.5 w-3.5 text-green-400" />}
    </div>
  );
}

function ResponsibilityCard({
  owner,
  accent,
  items,
}: {
  owner: string;
  accent: 'blue' | 'purple' | 'green' | 'gray';
  items: string[];
}) {
  const colours = {
    blue:   'border-blue-400/20 bg-blue-400/[0.03] text-blue-400',
    purple: 'border-purple-400/20 bg-purple-400/[0.03] text-purple-400',
    green:  'border-green-400/20 bg-green-400/[0.03] text-green-400',
    gray:   'border-border/40 bg-white/[0.02] text-muted-foreground',
  }[accent];

  return (
    <div className={cn('rounded-xl border p-3', colours)}>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-2">{owner}</p>
      <ul className="space-y-1">
        {items.map((item, i) => (
          <li key={i} className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <span className={cn('mt-0.5 shrink-0', colours.split(' ').find((c) => c.startsWith('text-')))}>✓</span>
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}
