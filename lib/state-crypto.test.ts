import { describe, it, expect } from 'vitest';
import { encryptState, decryptState, isEncryptedEnvelope, hasStateEncryptionConfig } from './state-crypto';

describe('hasStateEncryptionConfig', () => {
  it('is true when the vitest config env key is set', () => {
    expect(hasStateEncryptionConfig()).toBe(true);
  });
});

describe('encryptState / decryptState', () => {
  it('round-trips plaintext exactly', () => {
    const plaintext = JSON.stringify({ hello: 'world', n: 42 });
    const envelope = encryptState(plaintext);
    expect(decryptState(envelope)).toBe(plaintext);
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const plaintext = 'same input, twice';
    const a = encryptState(plaintext);
    const b = encryptState(plaintext);
    expect(a.data).not.toBe(b.data);
    expect(a.iv).not.toBe(b.iv);
  });

  it('never leaks the plaintext in the envelope fields', () => {
    const secretMarker = 'super-secret-client-name-xyz';
    const envelope = encryptState(JSON.stringify({ client: secretMarker }));
    expect(envelope.data).not.toContain(secretMarker);
  });

  it('throws on a tampered ciphertext instead of silently returning garbage', () => {
    const envelope = encryptState('trust me');
    const tampered = { ...envelope, data: Buffer.from('not the real ciphertext').toString('base64') };
    expect(() => decryptState(tampered)).toThrow();
  });

  it('throws on a tampered auth tag', () => {
    const envelope = encryptState('trust me');
    const tamperedTag = Buffer.from(envelope.tag, 'base64');
    tamperedTag[0] ^= 0xff;
    const tampered = { ...envelope, tag: tamperedTag.toString('base64') };
    expect(() => decryptState(tampered)).toThrow();
  });
});

describe('isEncryptedEnvelope', () => {
  it('recognizes a real envelope', () => {
    const envelope = encryptState('x');
    expect(isEncryptedEnvelope(envelope)).toBe(true);
  });

  it('rejects plain JSON state (pre-encryption format)', () => {
    expect(isEncryptedEnvelope({ stage: 'assessment', tasks: [] })).toBe(false);
  });

  it('rejects null and non-objects', () => {
    expect(isEncryptedEnvelope(null)).toBe(false);
    expect(isEncryptedEnvelope('a string')).toBe(false);
    expect(isEncryptedEnvelope(42)).toBe(false);
  });
});
