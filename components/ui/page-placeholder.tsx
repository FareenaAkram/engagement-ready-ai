import { Button } from '@/components/ui/button';

export function PagePlaceholder({ title, description }: { title: string; description: string }) {
  return (
    <section className="glass-panel flex min-h-[320px] flex-col justify-between rounded-[24px] p-6">
      <div>
        <p className="text-xs uppercase tracking-[0.24em] text-muted-foreground">Coming soon</p>
        <h3 className="mt-3 text-2xl font-semibold text-foreground">{title}</h3>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{description}</p>
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Button variant="secondary">Explore API contracts</Button>
        <Button variant="ghost">Review product scope</Button>
      </div>
    </section>
  );
}
