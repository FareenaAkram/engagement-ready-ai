import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkRateLimit } from './rate-limit';

describe('checkRateLimit', () => {
  beforeEach(() => {
    vi.useRealTimers();
  });

  it('allows the first request under a fresh key', () => {
    const result = checkRateLimit(`test-key-${Math.random()}`, 3, 60_000);
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2);
  });

  it('allows requests up to the limit, then blocks', () => {
    const key = `test-key-${Math.random()}`;
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);
    expect(checkRateLimit(key, 2, 60_000).allowed).toBe(true);
    const third = checkRateLimit(key, 2, 60_000);
    expect(third.allowed).toBe(false);
    expect(third.remaining).toBe(0);
    expect(third.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('resets the window after it expires', async () => {
    const key = `test-key-${Math.random()}`;
    expect(checkRateLimit(key, 1, 10).allowed).toBe(true);
    expect(checkRateLimit(key, 1, 10).allowed).toBe(false);
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(checkRateLimit(key, 1, 10).allowed).toBe(true);
  });

  it('tracks separate keys independently', () => {
    const keyA = `test-key-a-${Math.random()}`;
    const keyB = `test-key-b-${Math.random()}`;
    expect(checkRateLimit(keyA, 1, 60_000).allowed).toBe(true);
    expect(checkRateLimit(keyA, 1, 60_000).allowed).toBe(false);
    expect(checkRateLimit(keyB, 1, 60_000).allowed).toBe(true);
  });
});
