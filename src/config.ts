/**
 * Central configuration, parsed once from the environment.
 *
 * The most important invariant enforced here is ORIGIN ISOLATION:
 * the control plane (API + admin + MCP-over-HTTP, which handle API keys)
 * must live on a different origin from the content plane (which serves
 * arbitrary, untrusted published HTML). If they share an origin, a
 * malicious artifact could reach admin/API endpoints and read credentials.
 */

import { loadDotenv } from "./env.js";

export type CspMode = "strict" | "relaxed";

export interface AppConfig {
  port: number;
  controlBaseUrl: string;
  contentBaseUrl: string;
  controlOrigin: string;
  contentOrigin: string;
  contentHost: string;
  dbPath: string;
  maxHtmlBytes: number;
  publishRatePerMin: number;
  defaultCspMode: CspMode;
  allowSameOrigin: boolean;
}

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === "") {
    throw new Error(`Missing required env var: ${name}`);
  }
  return v;
}

function toInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === "") return fallback;
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`Env var ${name} must be a positive integer, got: ${raw}`);
  }
  return n;
}

function originOf(urlStr: string, label: string): { origin: string; host: string } {
  let url: URL;
  try {
    url = new URL(urlStr);
  } catch {
    throw new Error(`${label} is not a valid URL: ${urlStr}`);
  }
  return { origin: url.origin, host: url.host };
}

let cached: AppConfig | null = null;

export function loadConfig(): AppConfig {
  if (cached) return cached;
  loadDotenv();

  const controlBaseUrl = required("CONTROL_BASE_URL", "http://localhost:8787").replace(/\/+$/, "");
  const contentBaseUrl = required("CONTENT_BASE_URL", "http://content.localhost:8787").replace(/\/+$/, "");
  const allowSameOrigin = process.env.ALLOW_SAME_ORIGIN === "1";

  const control = originOf(controlBaseUrl, "CONTROL_BASE_URL");
  const content = originOf(contentBaseUrl, "CONTENT_BASE_URL");

  if (control.origin === content.origin && !allowSameOrigin) {
    throw new Error(
      "CONTROL_BASE_URL and CONTENT_BASE_URL resolve to the same origin " +
        `(${control.origin}). This is unsafe: untrusted artifact HTML would share ` +
        "an origin with the API/admin. Use distinct hosts, or set ALLOW_SAME_ORIGIN=1 " +
        "for local development only.",
    );
  }

  const defaultCspRaw = (process.env.DEFAULT_CSP_MODE ?? "strict").toLowerCase();
  if (defaultCspRaw !== "strict" && defaultCspRaw !== "relaxed") {
    throw new Error(`DEFAULT_CSP_MODE must be "strict" or "relaxed", got: ${defaultCspRaw}`);
  }

  cached = {
    port: toInt("PORT", 8787),
    controlBaseUrl,
    contentBaseUrl,
    controlOrigin: control.origin,
    contentOrigin: content.origin,
    contentHost: content.host,
    dbPath: required("DB_PATH", "./data/artifacts.db"),
    maxHtmlBytes: toInt("MAX_HTML_BYTES", 2 * 1024 * 1024),
    publishRatePerMin: toInt("PUBLISH_RATE_PER_MIN", 60),
    defaultCspMode: defaultCspRaw as CspMode,
    allowSameOrigin,
  };
  return cached;
}

/** Test helper: reset the memoized config so env changes take effect. */
export function resetConfigForTests(): void {
  cached = null;
}
