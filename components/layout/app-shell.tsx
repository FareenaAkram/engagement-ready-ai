'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  BarChart3,
  Bot,
  BriefcaseBusiness,
  CheckSquare,
  ClipboardList,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Settings,
  Workflow,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useLiveAIAnalysis, useLiveDashboard } from '@/hooks/use-dashboard-data';
import { useWorkflowStore } from '@/store/workflow-store';

const navigation = [
  { href: '/dashboard',            label: 'Dashboard',          icon: LayoutDashboard,   step: null,  alwaysShow: true  },
  { href: '/readiness-review',     label: 'New Assessment',     icon: BriefcaseBusiness, step: '1',   alwaysShow: true  },
  { href: '/ai-analysis',          label: 'AI Findings',        icon: Bot,               step: '2',   alwaysShow: false },
  { href: '/maintenance-tasks',    label: 'Action Center',      icon: ListChecks,        step: '3',   alwaysShow: false },
  { href: '/qa-review',            label: 'ICA Accelerator',    icon: CheckSquare,       step: '4',   alwaysShow: false },
  { href: '/engagement-summary',   label: 'Engagement Summary', icon: ClipboardList,     step: null,  alwaysShow: false },
  { href: '/workflow-timeline',    label: 'Timeline',           icon: Workflow,          step: null,  alwaysShow: false },
  { href: '/analytics',            label: 'Analytics',          icon: BarChart3,         step: null,  alwaysShow: true  },
  { href: '/settings',             label: 'Settings',           icon: Settings,          step: null,  alwaysShow: true  },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const currentPage = navigation.find((item) => item.href === pathname);

  async function handleLogout() {
    await fetch('/api/logout', { method: 'POST' });
    router.replace('/login');
    router.refresh();
  }

  const { data: liveDashboard } = useLiveDashboard();
  const { data: liveAnalysis } = useLiveAIAnalysis();
  const hydrateFromServer = useWorkflowStore((s) => s.hydrateFromServer);

  useEffect(() => {
    if (!liveDashboard || !liveAnalysis) return;
    const d = liveDashboard.data;
    hydrateFromServer({
      latestReview: liveAnalysis.data,
      workflowStage: d.workflowStage,
      pipelineStage: d.pipelineStage,
      assessedAt: d.assessedAt,
      assessmentCount: d.assessmentCount,
      totalTimeSavedHours: d.totalTimeSavedHours,
      hasLiveReview: d.hasLiveReview,
      isCurrentSession: d.isCurrentSession,
      history: d.history,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [liveDashboard, liveAnalysis]);

  const hasLiveReview = useWorkflowStore((s) => s.hasLiveReview);
  const workflowStage = useWorkflowStore((s) => s.workflowStage);

  return (
    <div className="page-shell">
      {/* Sidebar */}
      <aside className="glass-panel hidden w-[240px] shrink-0 rounded-2xl p-3 lg:flex lg:flex-col">
        {/* Brand */}
        <div className="flex items-center justify-between gap-2.5 px-2 py-3 border-b border-border/60 mb-2">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15">
              <Bot className="h-4 w-4 text-accent-strong" />
            </div>
            <div>
              <p className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">IBM watsonx</p>
              <p className="text-xs font-semibold text-foreground leading-tight">Engagement Ready AI</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            title="Log out"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-muted-foreground/60 transition hover:bg-white/5 hover:text-foreground"
          >
            <LogOut className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Workflow steps label */}
        <p className="px-2 pt-2 pb-1 text-[9px] font-semibold uppercase tracking-widest text-muted-foreground/60">
          Workflow
        </p>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5">
          {navigation.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            // Hide assessment-flow items when no live review, unless always shown or currently on that page
            if (!item.alwaysShow && !hasLiveReview && !active) return null;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  'group flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-sm transition-all',
                  active
                    ? 'bg-accent/10 text-foreground'
                    : 'text-muted-foreground hover:bg-white/5 hover:text-foreground',
                )}
              >
                <Icon
                  className={cn(
                    'h-4 w-4 shrink-0 transition-colors',
                    active ? 'text-accent-strong' : 'text-muted-foreground/70 group-hover:text-foreground',
                  )}
                />
                <span className="flex-1 text-sm leading-none">{item.label}</span>
                {item.step && (
                  <span
                    className={cn(
                      'flex h-4 w-4 items-center justify-center rounded-full text-[9px] font-bold',
                      active ? 'bg-accent text-white' : 'bg-white/8 text-muted-foreground',
                    )}
                  >
                    {item.step}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>

        {/* Status card */}
        <div className="mt-3 rounded-xl border border-border/60 bg-white/[0.025] p-3">
          {hasLiveReview ? (
            <>
              <div className="flex items-center gap-2 mb-2">
                <span className={`h-1.5 w-1.5 rounded-full ${workflowStage === 'delivery-package-sent' ? 'bg-green-400' : 'bg-green-400 animate-pulse'}`} />
                <p className="text-xs font-medium text-foreground">
                  {workflowStage === 'delivery-package-sent' ? 'Engagement complete' : 'Assessment active'}
                </p>
              </div>
              <p className="text-[11px] text-muted-foreground capitalize">
                {workflowStage.replace(/-/g, ' ')}
              </p>
              <Button className="mt-2.5 w-full" variant="secondary" size="sm" asChild>
                {workflowStage === 'delivery-package-sent' || workflowStage === 'ready-for-engagement'
                  ? <Link href="/engagement-summary">View summary →</Link>
                  : <Link href="/ai-analysis">View findings →</Link>}
              </Button>
            </>
          ) : (
            <>
              <p className="text-xs font-medium text-foreground mb-1">No active assessment</p>
              <p className="text-[11px] text-muted-foreground">
                Start by pasting discovery notes.
              </p>
              <Button className="mt-2.5 w-full" size="sm" asChild>
                <Link href="/readiness-review">Start assessment →</Link>
              </Button>
            </>
          )}
        </div>
      </aside>

      {/* Main content */}
      <div className="content-shell">
        {/* Top bar */}
        <header className="mb-5 flex items-center justify-between gap-4 border-b border-border/60 pb-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">
              {currentPage?.label ?? 'Engagement Ready AI'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="secondary" size="sm" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/readiness-review">New Assessment</Link>
            </Button>
          </div>
        </header>

        <AnimatePresence mode="wait">
          <motion.main
            key={pathname}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
            className="flex-1"
          >
            {children}
          </motion.main>
        </AnimatePresence>
      </div>
    </div>
  );
}
