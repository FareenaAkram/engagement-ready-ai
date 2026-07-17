/**
 * Lightweight shared-secret session helper.
 *
 * Not a full user-account system — one passcode (APP_PASSCODE), one cookie.
 * The cookie never stores the passcode itself; it stores an HMAC derived
 * from it, so a stolen cookie doesn't reveal the passcode, and verification
 * never needs server-side session storage (stateless, works with the app's
 * existing file-based-state architecture).
 *
 * Uses the Web Crypto API (not Node's `crypto` module) so this works
 * unchanged in both the Edge middleware runtime and Node route handlers.
 */

export const SESSION_COOKIE = 'era_session';
const DERIVE_LABEL = 'era-session-v1';

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export async function expectedSessionToken(passcode: string): Promise<string> {
  return hmacHex(passcode, DERIVE_LABEL);
}

/** Constant-time string compare — avoids leaking cookie validity via response timing. */
export function timingSafeEqualStrings(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
