'use client';

import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Bot, LoaderCircle, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [passcode, setPasscode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ passcode }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.message ?? 'Incorrect passcode.');
        setIsSubmitting(false);
        return;
      }
      const next = searchParams.get('next') ?? '/dashboard';
      router.replace(next);
      router.refresh();
    } catch {
      setError('Could not reach the server. Try again.');
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="glass-panel w-full max-w-sm rounded-[30px] p-7">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent/15">
            <Bot className="h-4.5 w-4.5 text-accent-strong" />
          </div>
          <div>
            <p className="text-[9px] font-medium uppercase tracking-widest text-muted-foreground">IBM watsonx</p>
            <p className="text-sm font-semibold text-foreground leading-tight">Engagement Ready AI</p>
          </div>
        </div>

        <div className="mt-6 flex items-center gap-2">
          <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          <p className="section-caption">Passcode required</p>
        </div>
        <h1 className="mt-1 text-lg font-semibold text-foreground">Enter passcode to continue</h1>

        <form onSubmit={handleSubmit} className="mt-5 space-y-3">
          <input
            type="password"
            autoFocus
            value={passcode}
            onChange={(e) => setPasscode(e.target.value)}
            placeholder="Passcode"
            disabled={isSubmitting}
            className="h-10 w-full rounded-xl border border-border/60 bg-black/15 px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/40 focus:border-accent disabled:opacity-50"
          />
          {error && <p className="text-xs text-danger">{error}</p>}
          <Button type="submit" className="w-full" disabled={!passcode || isSubmitting}>
            {isSubmitting ? <LoaderCircle className="h-4 w-4 animate-spin" /> : 'Continue'}
          </Button>
        </form>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
