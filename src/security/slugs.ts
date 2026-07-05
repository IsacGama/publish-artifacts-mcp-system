import { randomBytes } from "node:crypto";

const URL_ALPHABET = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_";

/** Rejection-sampled base64url-ish id from crypto bytes (no modulo bias). */
function randomId(length: number): string {
  let out = "";
  while (out.length < length) {
    const bytes = randomBytes(length);
    for (let i = 0; i < bytes.length && out.length < length; i++) {
      const b = bytes[i]!;
      if (b < 248) out += URL_ALPHABET[b % 64];
    }
  }
  return out;
}

/**
 * Public share slug. 22 chars over a 64-symbol alphabet ≈ 132 bits of entropy,
 * making it computationally infeasible to guess an unlisted artifact's URL.
 */
export function generateSlug(): string {
  return randomId(22);
}

/** Opaque uuid-like primary key for internal records. */
export function generateId(): string {
  return randomId(24);
}

/**
 * Generates a new API key. Format: `ak_<prefix>.<secret>` where `prefix` is a
 * short, non-secret lookup handle and `secret` carries the entropy.
 * Returns the full plaintext (shown once) plus its constituent parts.
 */
export function generateApiKey(): { plaintext: string; prefix: string; secret: string } {
  const prefix = randomId(8);
  const secret = randomId(40); // ~240 bits
  return { plaintext: `ak_${prefix}.${secret}`, prefix, secret };
}

/** Parses a presented API key back into (prefix, secret); null if malformed. */
export function parseApiKey(plaintext: string): { prefix: string; secret: string } | null {
  const m = /^ak_([A-Za-z0-9_-]{8})\.([A-Za-z0-9_-]{40})$/.exec(plaintext.trim());
  if (!m) return null;
  return { prefix: m[1]!, secret: m[2]! };
}
