import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildCsp, contentSecurityHeaders } from "./csp.js";

describe("buildCsp", () => {
  it("strict mode blocks network egress and framing", () => {
    const csp = buildCsp("strict");
    assert.ok(csp?.includes("default-src 'none'"));
    assert.ok(csp?.includes("connect-src 'none'"));
    assert.ok(csp?.includes("form-action 'none'"));
    assert.ok(csp?.includes("frame-ancestors 'none'"));
    assert.ok(csp?.includes("base-uri 'none'"));
    // still allows the artifact to render its own inline script/style
    assert.ok(csp?.includes("script-src 'unsafe-inline'"));
  });

  it("permits only the bundle directory for external scripts in strict mode", () => {
    const csp = buildCsp("strict", "https://content.example.com/a/slug/");
    const scripts = csp
      .split("; ")
      .find((part) => part.startsWith("script-src"))!;
    assert.ok(scripts?.includes("https://content.example.com/a/slug/"));
    assert.ok(!scripts?.includes("'self'"));
    assert.ok(csp?.includes("connect-src 'none'"));
  });

  it("relaxed mode allows https network but still blocks forms", () => {
    const csp = buildCsp("relaxed");
    assert.ok(csp?.includes("connect-src https:"));
    assert.ok(csp?.includes("form-action 'none'"));
    assert.ok(!csp?.includes("connect-src 'none'"));
  });
});

describe("contentSecurityHeaders", () => {
  it("includes the full hardening header set", () => {
    const h = contentSecurityHeaders("strict");
    assert.ok(h["Content-Security-Policy"]);
    assert.strictEqual(h["X-Content-Type-Options"], "nosniff");
    assert.strictEqual(h["Referrer-Policy"], "no-referrer");
    assert.strictEqual(h["X-Frame-Options"], "DENY");
    assert.ok(h["Permissions-Policy"]?.includes("geolocation=()"));
  });
});
