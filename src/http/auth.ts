import type { Context, Next } from "hono";
import type { DB } from "../db/index.js";
import type { AppConfig } from "../config.js";
import { authenticate } from "../core/apiKeys.js";
import type { ToolContext } from "../mcp/tools.js";

export interface AuthEnv {
  Variables: {
    ownerKeyId: string;
    toolCtx: ToolContext;
  };
}

/**
 * Extracts a presented key from `Authorization: Bearer`, `X-API-Key`, or an
 * `api_key` query parameter.
 *
 * The query-param form exists for clients (e.g. claude.ai's custom-connector
 * UI) that only let the user configure a single URL and don't support custom
 * headers or a static-token field. Note this means the token can end up in
 * server/proxy access logs wherever this form is used.
 */
export function extractKey(c: Context): string | null {
  const auth = c.req.header("authorization");
  if (auth && /^Bearer\s+/i.test(auth)) return auth.replace(/^Bearer\s+/i, "").trim();
  const x = c.req.header("x-api-key");
  if (x) return x.trim();
  const q = c.req.query("api_key");
  return q ? q.trim() : null;
}

/**
 * Bearer API-key auth for the control plane. On success, attaches an owner-
 * scoped ToolContext to the request so downstream handlers (REST + MCP) share
 * one code path.
 */
export function apiKeyAuth(db: DB, cfg: AppConfig) {
  return async (c: Context<AuthEnv>, next: Next) => {
    const key = extractKey(c);
    if (!key) return c.json({ error: "missing_api_key" }, 401);
    const owner = authenticate(db, key);
    if (!owner) return c.json({ error: "invalid_api_key" }, 401);

    c.set("ownerKeyId", owner.id);
    c.set("toolCtx", {
      db,
      contentBaseUrl: cfg.contentBaseUrl,
      maxHtmlBytes: cfg.maxHtmlBytes,
      defaultCspMode: cfg.defaultCspMode,
      ownerKeyId: owner.id,
    });
    await next();
  };
}
