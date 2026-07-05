import { describe, it, expect } from "vitest";
import { generateSlug, generateApiKey, parseApiKey } from "./slugs.js";

describe("slugs & keys", () => {
  it("generates unique, sufficiently long slugs", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 5000; i++) {
      const s = generateSlug();
      expect(s.length).toBe(22);
      expect(seen.has(s)).toBe(false);
      seen.add(s);
    }
  });

  it("api key round-trips through parse", () => {
    const { plaintext, prefix, secret } = generateApiKey();
    expect(plaintext).toMatch(/^ak_[A-Za-z0-9_-]{8}\.[A-Za-z0-9_-]{40}$/);
    const parsed = parseApiKey(plaintext);
    expect(parsed).toEqual({ prefix, secret });
  });

  it("rejects malformed keys", () => {
    expect(parseApiKey("nope")).toBeNull();
    expect(parseApiKey("ak_short.secret")).toBeNull();
    expect(parseApiKey("")).toBeNull();
  });
});
