import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateSlug, generateApiKey, parseApiKey } from "./slugs.js";

describe("slugs & keys", () => {
  it("generates unique, sufficiently long slugs", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const s = generateSlug();
      assert.strictEqual(s.length, 22);
      assert.strictEqual(seen.has(s), false);
      seen.add(s);
    }
  });

  it("api key round-trips through parse", () => {
    const { plaintext, prefix, secret } = generateApiKey();
    assert.match(plaintext, /^ak_[A-Za-z0-9_-]{8}\.[A-Za-z0-9_-]{40}$/);
    const parsed = parseApiKey(plaintext);
    assert.deepStrictEqual(parsed, { prefix, secret });
  });

  it("rejects malformed keys", () => {
    assert.strictEqual(parseApiKey("nope"), null);
    assert.strictEqual(parseApiKey("ak_short.secret"), null);
    assert.strictEqual(parseApiKey(""), null);
  });
});
