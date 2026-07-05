import { createHash, timingSafeEqual } from "node:crypto";

/**
 * API keys are high-entropy random secrets, so a fast cryptographic hash is
 * sufficient and appropriate — a slow password hash (argon2/bcrypt) exists to
 * defend low-entropy human passwords against brute force, which does not apply
 * to a 240-bit random token.
 */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** Constant-time comparison of a presented secret against a stored hash. */
export function verifySecret(secret: string, storedHash: string): boolean {
  const a = Buffer.from(hashSecret(secret), "hex");
  const b = Buffer.from(storedHash, "hex");
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
