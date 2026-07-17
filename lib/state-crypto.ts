/**
 * Encryption-at-rest + integrity verification for the persisted workflow
 * state file (DASC Gap Analysis SR-DP-4 and SR-AU-2).
 *
 * Uses AES-256-GCM — authenticated encryption, so one mechanism satisfies
 * both requirements at once: the auth tag makes tampering/corruption
 * detectable on decrypt, without a separate SHA-256 checksum alongside a
 * separate cipher (the two-mechanism approach DASC's Work Items proposed).
 *
 * Feature-gated like every other integration in this app: if
 * STATE_ENCRYPTION_KEY isn't set, the state file is written in plain JSON
 * (today's behavior) with a clear warning, rather than breaking existing
 * deployments that haven't configured it yet.
 */

import crypto from 'crypto';
import { appEnv } from '@/lib/env';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // recommended for GCM

export function hasStateEncryptionConfig(): boolean {
  return Boolean(appEnv.stateEncryptionKey && appEnv.stateEncryptionKey.length >= 8);
}

function deriveKey(): Buffer {
  // scrypt turns an arbitrary-length passphrase into a fixed 32-byte AES-256 key.
  return crypto.scryptSync(appEnv.stateEncryptionKey!, 'era-state-v1', 32);
}

export interface EncryptedEnvelope {
  encrypted: true;
  iv: string;
  tag: string;
  data: string;
}

export function encryptState(plaintext: string): EncryptedEnvelope {
  const key = deriveKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf-8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    encrypted: true,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: encrypted.toString('base64'),
  };
}

/**
 * Throws if the ciphertext or tag were tampered with or corrupted — callers
 * must treat a thrown error here as an integrity failure, not a generic
 * parse error, and alert accordingly rather than silently discarding it.
 */
export function decryptState(envelope: EncryptedEnvelope): string {
  const key = deriveKey();
  const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(envelope.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(envelope.data, 'base64')),
    decipher.final(),
  ]);
  return decrypted.toString('utf-8');
}

export function isEncryptedEnvelope(value: unknown): value is EncryptedEnvelope {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<string, unknown>).encrypted === true &&
    typeof (value as Record<string, unknown>).iv === 'string' &&
    typeof (value as Record<string, unknown>).tag === 'string' &&
    typeof (value as Record<string, unknown>).data === 'string'
  );
}
