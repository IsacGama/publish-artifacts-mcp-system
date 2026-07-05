import type { CspMode } from "../config.js";

/**
 * Builds the Content-Security-Policy applied to every SERVED artifact.
 *
 * Published artifacts are untrusted. We still want them to render richly
 * (inline scripts/styles, data-URI images), so we permit `'unsafe-inline'`
 * for script/style — that is inherent to hosting a self-contained document.
 * What we deny is EXFILTRATION and escape:
 *
 *  - connect-src 'none'  -> no fetch / XHR / WebSocket / beacon to any host
 *  - form-action 'none'  -> no form-based data POST to an attacker endpoint
 *  - base-uri 'none'     -> no <base> hijacking of relative URLs
 *  - frame-ancestors 'none' -> cannot be framed by another page (clickjacking)
 *  - default-src 'none'  -> deny anything not explicitly allowed
 *
 * `relaxed` mode is an opt-in for artifacts that legitimately need network
 * access; it widens connect/img/frame to https: but still blocks form-action
 * and keeps default-src closed.
 */
export function buildCsp(mode: CspMode): string {
  if (mode === "relaxed") {
    return [
      "default-src 'none'",
      "script-src 'unsafe-inline' 'unsafe-eval' https:",
      "style-src 'unsafe-inline' https:",
      "img-src 'self' data: blob: https:",
      "font-src 'self' data: https:",
      "media-src 'self' data: blob: https:",
      "connect-src https:",
      "frame-src https:",
      "form-action 'none'",
      "base-uri 'none'",
      "frame-ancestors 'none'",
    ].join("; ");
  }

  // strict (default)
  return [
    "default-src 'none'",
    "script-src 'unsafe-inline' 'unsafe-eval'",
    "style-src 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "media-src 'self' data: blob:",
    "connect-src 'none'",
    "form-action 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
}

/** Hardening headers set alongside CSP on every served artifact response. */
export function contentSecurityHeaders(mode: CspMode): Record<string, string> {
  return {
    "Content-Security-Policy": buildCsp(mode),
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Resource-Policy": "same-origin",
    "X-Frame-Options": "DENY",
    "Permissions-Policy":
      "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), payment=(), usb=()",
  };
}
