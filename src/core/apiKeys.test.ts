import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { memDb } from "../test-helpers.js";
import { createApiKey, authenticate, revokeApiKey } from "./apiKeys.js";

describe("api keys", () => {
  it("creates and authenticates a key", () => {
    const db = memDb();
    const key = createApiKey(db, "laptop");
    const owner = authenticate(db, key.plaintext);
    assert.strictEqual(owner?.id, key.id);
    assert.strictEqual(owner?.label, "laptop");
  });

  it("rejects unknown and malformed keys", () => {
    const db = memDb();
    createApiKey(db, "a");
    assert.strictEqual(
      authenticate(db, "ak_00000000.0000000000000000000000000000000000000000"),
      null,
    );
    assert.strictEqual(authenticate(db, "garbage"), null);
  });

  it("rejects revoked keys", () => {
    const db = memDb();
    const key = createApiKey(db, "temp");
    assert.strictEqual(revokeApiKey(db, key.id), true);
    assert.strictEqual(authenticate(db, key.plaintext), null);
    // second revoke is a no-op
    assert.strictEqual(revokeApiKey(db, key.id), false);
  });

  it("does not store the plaintext secret", () => {
    const db = memDb();
    const key = createApiKey(db, "x");
    const row = db
      .prepare("SELECT * FROM api_keys WHERE id = ?")
      .get(key.id) as {
      key_hash: string;
    };
    assert.ok(!row.key_hash?.includes(key.plaintext));
    assert.ok(!key.plaintext?.includes(row.key_hash));
  });
});
