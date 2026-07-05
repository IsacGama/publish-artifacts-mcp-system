import { describe, it, expect } from "vitest";
import { memDb } from "../test-helpers.js";
import { createApiKey, authenticate, revokeApiKey } from "./apiKeys.js";

describe("api keys", () => {
  it("creates and authenticates a key", () => {
    const db = memDb();
    const key = createApiKey(db, "laptop");
    const owner = authenticate(db, key.plaintext);
    expect(owner?.id).toBe(key.id);
    expect(owner?.label).toBe("laptop");
  });

  it("rejects unknown and malformed keys", () => {
    const db = memDb();
    createApiKey(db, "a");
    expect(authenticate(db, "ak_00000000.0000000000000000000000000000000000000000")).toBeNull();
    expect(authenticate(db, "garbage")).toBeNull();
  });

  it("rejects revoked keys", () => {
    const db = memDb();
    const key = createApiKey(db, "temp");
    expect(revokeApiKey(db, key.id)).toBe(true);
    expect(authenticate(db, key.plaintext)).toBeNull();
    // second revoke is a no-op
    expect(revokeApiKey(db, key.id)).toBe(false);
  });

  it("does not store the plaintext secret", () => {
    const db = memDb();
    const key = createApiKey(db, "x");
    const row = db.prepare("SELECT * FROM api_keys WHERE id = ?").get(key.id) as {
      key_hash: string;
    };
    expect(row.key_hash).not.toContain(key.plaintext);
    expect(key.plaintext).not.toContain(row.key_hash);
  });
});
