/**
 * In-memory, single-process rate limiter for routes that call metered IBM
 * APIs (watsonx, ICA). Consistent with this app's existing single-instance,
 * file-based-state architecture — like workflow-state.ts, this does not
 * survive a multi-instance/serverless deployment, and isn't meant to.
 */

interface Bucket {
  count: number;
  windowStart: number;
}

const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    buckets.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: limit - 1, retryAfterSeconds: 0 };
  }

  if (existing.count < limit) {
    existing.count += 1;
    return { allowed: true, remaining: limit - existing.count, retryAfterSeconds: 0 };
  }

  return {
    allowed: false,
    remaining: 0,
    retryAfterSeconds: Math.ceil((windowMs - (now - existing.windowStart)) / 1000),
  };
}

/** Best-effort caller key — works behind ngrok/typical reverse proxies. */
export function clientKey(request: Request): string {
  const fwd = request.headers.get('x-forwarded-for');
  return fwd?.split(',')[0]?.trim() || 'unknown';
}

// Periodic cleanup so long-running dev servers don't accumulate stale entries.
const CLEANUP_INTERVAL_MS = 5 * 60_000;
const STALE_AFTER_MS = 10 * 60_000;
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [key, bucket] of buckets) {
    if (now - bucket.windowStart > STALE_AFTER_MS) buckets.delete(key);
  }
}, CLEANUP_INTERVAL_MS);
cleanupTimer.unref?.();
