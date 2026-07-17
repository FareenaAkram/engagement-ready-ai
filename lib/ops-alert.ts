/**
 * Minimal operational alert for conditions too serious for a console log
 * alone — currently just state-file integrity failures (DASC SR-AU-2).
 *
 * Deliberately not services/notification-service.ts: this is lib-layer code
 * (workflow-state.ts is the lowest layer in the app, imported by services),
 * so it stays a raw webhook post rather than importing a service, keeping
 * the dependency direction one-way.
 */

import { appEnv, hasSlackConfig } from '@/lib/env';

export function alertOps(message: string): void {
  console.error(`[ops-alert] ${message}`);

  if (!hasSlackConfig()) return;

  // Fire-and-forget — an alert must never itself become a new failure mode
  // for the read/write path that triggered it.
  fetch(appEnv.slackWebhookUrl!, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text: `:rotating_light: Engagement Ready AI — ${message}` }),
  }).catch(() => { /* alerting is best-effort */ });
}
