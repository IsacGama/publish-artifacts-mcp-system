import { Hono } from "hono";
import type { DB } from "../db/index.js";
import { resolveForServe } from "../core/shareLinks.js";
import { contentSecurityHeaders } from "../security/csp.js";

/**
 * Content plane: serves published artifacts publicly at /a/:slug with strict
 * security headers. This router must only ever be mounted on the content
 * origin (enforced by the host guard in app.ts) — it sets NO cookies and
 * requires NO auth, so isolation from the control plane is preserved.
 */
export function contentRouter(db: DB): Hono {
  const app = new Hono();

  app.get("/a/:slug", (c) => {
    const slug = c.req.param("slug");
    const row = resolveForServe(db, slug);
    if (!row) return c.text("Artifact not found or expired", 404);

    const headers = contentSecurityHeaders(row.csp_mode);
    return c.body(row.html, 200, {
      ...headers,
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
  });

  app.get("/", (c) => c.text("artifact content plane", 200));
  return app;
}
