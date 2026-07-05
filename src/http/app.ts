import { Hono } from "hono";
import type { DB } from "../db/index.js";
import type { AppConfig } from "../config.js";
import { contentRouter } from "./content.js";
import { adminRouter } from "./admin.js";
import { mcpHttpRouter } from "./mcpHttp.js";

/**
 * Assembles the full app with HOST-BASED origin isolation.
 *
 * One process listens on one port, but routes by Host header:
 *   - requests to the content host  -> ONLY the public content router
 *   - requests to the control host  -> API, admin UI, and MCP-over-HTTP
 *
 * This guarantees untrusted artifact HTML (served on the content host) can
 * never reach the API/admin surface, even though they share a process. When
 * ALLOW_SAME_ORIGIN is set (dev only), both planes are served together.
 */
export function createApp(db: DB, cfg: AppConfig): Hono {
  const app = new Hono();

  const controlHost = new URL(cfg.controlBaseUrl).host;
  const content = contentRouter(db);
  const control = new Hono();
  control.route("/", adminRouter(db, cfg));
  control.route("/mcp", mcpHttpRouter(db, cfg));
  control.get("/health", (c) => c.json({ status: "ok" }));

  if (cfg.allowSameOrigin) {
    // Dev convenience: serve both planes on the same host.
    app.route("/", control);
    app.route("/", content);
    return app;
  }

  app.all("*", (c) => {
    // The node-server adapter builds the request URL from the real Host header;
    // the URL host is therefore the reliable discriminator (and works in tests).
    const host = (c.req.header("host") ?? new URL(c.req.url).host).toLowerCase();
    if (host === cfg.contentHost.toLowerCase()) return content.fetch(c.req.raw);
    if (host === controlHost.toLowerCase()) return control.fetch(c.req.raw);
    return c.text("Unknown host", 404);
  });

  return app;
}
