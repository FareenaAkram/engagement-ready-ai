'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAppStore } from '@/store/app-store';
import { useToastStore } from '@/components/ui/toast';
import type { ApiResponse, SettingsState } from '@/types/domain';

async function fetchSettings(): Promise<ApiResponse<SettingsState>> {
  const response = await fetch('/api/settings');
  if (!response.ok) throw new Error('Failed to load settings.');
  return response.json();
}

async function postSettings(body: Partial<SettingsState>): Promise<ApiResponse<SettingsState>> {
  const response = await fetch('/api/settings', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) throw new Error('Failed to save settings.');
  return response.json();
}

export function SettingsView() {
  const queryClient = useQueryClient();
  const pushToast = useToastStore((s) => s.push);
  const { data, isLoading, isError } = useQuery({
    queryKey: ['settings'],
    queryFn: fetchSettings,
  });
  const settings = useAppStore((state) => state.settings);
  const setSettings = useAppStore((state) => state.setSettings);

  // Server value wins when available; falls back to local Zustand store
  const serverSettings = data?.data;
  const activeSettings = serverSettings ?? settings;

  const saveMutation = useMutation({
    mutationFn: (updated: Partial<SettingsState>) => postSettings(updated),
    onSuccess: (result) => {
      if (result.data) {
        setSettings(result.data);
        void queryClient.invalidateQueries({ queryKey: ['settings'] });
        pushToast({ title: 'Settings saved', description: 'Workspace updated.', tone: 'success' });
      }
    },
    onError: () => pushToast({ title: 'Could not save settings', description: 'Try again.', tone: 'error' }),
  });

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[0, 1].map((i) => <div key={i} className="h-32 animate-pulse rounded-2xl bg-white/5" />)}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-2xl border border-red-500/20 bg-red-500/5 p-5">
        <p className="text-sm font-semibold text-danger">Unable to load settings</p>
        <p className="mt-1 text-sm text-muted-foreground">Refresh the page to try again.</p>
      </div>
    );
  }

  function handleSave() {
    saveMutation.mutate(activeSettings);
  }

  return (
    <div className="page-stack">
      {/* Header */}
      <div className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Settings</p>
        <h1 className="mt-1 text-xl font-semibold text-foreground">Workspace configuration</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Manage how Engagement Ready AI is labelled and behaves.
        </p>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        {/* Current config */}
        <section className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Active configuration</p>
          <h2 className="mt-0.5 text-base font-semibold text-foreground">Current settings</h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <SettingDisplay label="Engagement label" value={activeSettings.engagementLabel} />
            <SettingDisplay label="Consultant name" value={activeSettings.consultantName} />
            <SettingDisplay label="Auto refresh" value={`${activeSettings.autoRefreshSeconds}s`} />
            <SettingDisplay label="Animations" value={activeSettings.enableAnimations ? 'Enabled' : 'Disabled'} />
          </div>
        </section>

        {/* Preferences form */}
        <section className="rounded-2xl border border-border/60 bg-white/[0.025] p-5">
          <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">Preferences</p>
          <h2 className="mt-0.5 text-base font-semibold text-foreground">Update workspace</h2>
          <div className="mt-4 space-y-4">
            <Field
              label="Engagement label"
              hint="Shown in the dashboard header"
            >
              <input
                className="mt-1.5 h-10 w-full rounded-xl border border-border/60 bg-black/15 px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-accent"
                value={activeSettings.engagementLabel}
                onChange={(e) => setSettings({ engagementLabel: e.target.value })}
              />
            </Field>

            <Field label="Consultant name" hint="Shown in generated artefacts">
              <input
                className="mt-1.5 h-10 w-full rounded-xl border border-border/60 bg-black/15 px-3.5 text-sm text-foreground outline-none transition placeholder:text-muted-foreground/50 focus:border-accent"
                value={activeSettings.consultantName}
                onChange={(e) => setSettings({ consultantName: e.target.value })}
              />
            </Field>

            <Field label="Auto refresh interval" hint="How often the dashboard polls for updates (seconds)">
              <input
                type="number"
                min={10}
                className="mt-1.5 h-10 w-full rounded-xl border border-border/60 bg-black/15 px-3.5 text-sm text-foreground outline-none transition focus:border-accent"
                value={activeSettings.autoRefreshSeconds}
                onChange={(e) => setSettings({ autoRefreshSeconds: Number(e.target.value) })}
              />
            </Field>

            <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-border/50 bg-white/[0.02] px-4 py-3">
              <div>
                <p className="text-sm font-medium text-foreground">Enable motion effects</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Controls UI animation intensity.</p>
              </div>
              <div className={`relative h-5 w-9 rounded-full transition-colors ${activeSettings.enableAnimations ? 'bg-accent' : 'bg-white/15'}`}>
                <div className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform ${activeSettings.enableAnimations ? 'translate-x-4' : 'translate-x-0.5'}`} />
                <input
                  type="checkbox"
                  className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
                  checked={activeSettings.enableAnimations}
                  onChange={(e) => setSettings({ enableAnimations: e.target.checked })}
                />
              </div>
            </label>

            <button
              className="mt-2 h-10 w-full rounded-xl bg-accent px-4 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-50"
              onClick={handleSave}
              disabled={saveMutation.isPending}
            >
              {saveMutation.isPending ? 'Saving…' : 'Save settings'}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}

function SettingDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border/40 bg-white/[0.02] p-3">
      <p className="text-[10px] font-medium uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-sm font-semibold text-foreground">{value}</p>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <p className="text-sm font-medium text-foreground">{label}</p>
      <p className="text-xs text-muted-foreground">{hint}</p>
      {children}
    </label>
  );
}
