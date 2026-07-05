import { describe, it, expect } from "vitest";
import { buildCsp, contentSecurityHeaders } from "./csp.js";

describe("buildCsp", () => {
  it("strict mode blocks network egress and framing", () => {
    const csp = buildCsp("strict");
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    // still allows the artifact to render its own inline script/style
    expect(csp).toContain("script-src 'unsafe-inline'");
  });

  it("relaxed mode allows https network but still blocks forms", () => {
    const csp = buildCsp("relaxed");
    expect(csp).toContain("connect-src https:");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toContain("connect-src 'none'");
  });
});

describe("contentSecurityHeaders", () => {
  it("includes the full hardening header set", () => {
    const h = contentSecurityHeaders("strict");
    expect(h["Content-Security-Policy"]).toBeTruthy();
    expect(h["X-Content-Type-Options"]).toBe("nosniff");
    expect(h["Referrer-Policy"]).toBe("no-referrer");
    expect(h["X-Frame-Options"]).toBe("DENY");
    expect(h["Permissions-Policy"]).toContain("geolocation=()");
  });
});
