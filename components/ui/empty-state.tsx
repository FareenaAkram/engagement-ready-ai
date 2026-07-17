import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function NoAssessmentYet({
  icon: Icon,
  title,
  description,
  staleNotice,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  staleNotice?: string;
}) {
  return (
    <section className="flex min-h-[360px] flex-col items-center justify-center gap-5 rounded-2xl border border-border/50 bg-white/[0.02] p-10 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-xl border border-border/60 bg-white/5">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <div className="max-w-sm">
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">{description}</p>
        {staleNotice && (
          <p className="mt-3 text-xs text-muted-foreground/60">{staleNotice}</p>
        )}
      </div>
      <Button asChild size="sm">
        <Link href="/readiness-review">
          Start assessment <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
        </Link>
      </Button>
    </section>
  );
}
