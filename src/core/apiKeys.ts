import type { DB } from "../db/index.js";
import type { ApiKeyRecord } from "./types.js";
import { generateApiKey, generateId, parseApiKey } from "../security/slugs.js";
import { hashSecret, verifySecret } from "../security/hash.js";

export interface CreatedApiKey {
  id: string;
  label: string;
  /** Full plaintext key — shown ONCE, never stored. */
  plaintext: string;
}

/** Creates a new API key, persisting only its hash + prefix. */
export function createApiKey(db: DB, label: string): CreatedApiKey {
  const { plaintext, prefix, secret } = generateApiKey();
  const id = generateId();
  db.prepare(
    `INSERT INTO api_keys (id, key_prefix, key_hash, label, created_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(id, prefix, hashSecret(secret), label, new Date().toISOString());
  return { id, label, plaintext };
}

/**
 * Resolves a presented plaintext key to its owner record, or null if invalid,
 * unknown, or revoked. Uses the non-secret prefix to index, then a
 * constant-time hash comparison on the secret.
 */
export function authenticate(db: DB, plaintext: string): ApiKeyRecord | null {
  const parsed = parseApiKey(plaintext);
  if (!parsed) return null;
  const rows = db
    .prepare(`SELECT * FROM api_keys WHERE key_prefix = ? AND revoked_at IS NULL`)
    .all(parsed.prefix) as ApiKeyRecord[];
  for (const row of rows) {
    if (verifySecret(parsed.secret, row.key_hash)) return row;
  }
  return null;
}

export function revokeApiKey(db: DB, id: string): boolean {
  const res = db
    .prepare(`UPDATE api_keys SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`)
    .run(new Date().toISOString(), id);
  return res.changes > 0;
}

export function listApiKeys(db: DB): Array<Omit<ApiKeyRecord, "key_hash">> {
  return db
    .prepare(
      `SELECT id, key_prefix, label, created_at, revoked_at FROM api_keys ORDER BY created_at DESC`,
    )
    .all() as Array<Omit<ApiKeyRecord, "key_hash">>;
}
