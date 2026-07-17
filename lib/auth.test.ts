import { describe, it, expect } from 'vitest';
import { expectedSessionToken, timingSafeEqualStrings } from './auth';

describe('expectedSessionToken', () => {
  it('is deterministic for the same passcode', async () => {
    const a = await expectedSessionToken('correct-horse-battery-staple');
    const b = await expectedSessionToken('correct-horse-battery-staple');
    expect(a).toBe(b);
  });

  it('never contains the raw passcode', async () => {
    const token = await expectedSessionToken('correct-horse-battery-staple');
    expect(token).not.toContain('correct-horse-battery-staple');
  });

  it('differs for different passcodes', async () => {
    const a = await expectedSessionToken('passcode-one');
    const b = await expectedSessionToken('passcode-two');
    expect(a).not.toBe(b);
  });
});

describe('timingSafeEqualStrings', () => {
  it('returns true for identical strings', () => {
    expect(timingSafeEqualStrings('abc123', 'abc123')).toBe(true);
  });

  it('returns false for different strings of the same length', () => {
    expect(timingSafeEqualStrings('abc123', 'abc124')).toBe(false);
  });

  it('returns false for different-length strings without throwing', () => {
    expect(timingSafeEqualStrings('short', 'muchlonger')).toBe(false);
  });

  it('returns false comparing against an empty string', () => {
    expect(timingSafeEqualStrings('abc', '')).toBe(false);
  });
});
