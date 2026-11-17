import { Hono } from "hono";
import type { DB } from "../db/index.js";
import { resolveForServe } from "../core/shareLinks.js";
import { listFiles, validFilePath, type PreparedFile } from "../core/files.js";
import { contentSecurityHeaders } from "../security/csp.js";

/** Public content routes. Never mounted on the control origin. */
export function contentRouter(db: DB, contentBaseUrl: string): Hono {
  const app = new Hono();
  const serveHtml = (c: import("hono").Context) => {
    const slug = c.req.param("slug")!;
    const row = resolveForServe(db, slug);
    if (!row) return c.text("Artifact not found or expired", 404);
    const hasFiles = listFiles(db, row.id).length > 0;
    const path = new URL(c.req.url).pathname;
    // A directory URL makes ./assets/... resolve without rewriting user HTML.
    // Single-HTML share links keep their original behavior and URL.
    if (hasFiles && path === `/a/${slug}`)
      return c.redirect(`/a/${slug}/`, 302);
    const source = hasFiles
      ? `${contentBaseUrl}/a/${slug}/`
      : undefined;
    return c.body(row.html, 200, {
      ...contentSecurityHeaders(row.csp_mode, source),
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    });
  };
  app.get("/a/:slug", serveHtml);
  app.get("/a/:slug/", serveHtml);
  app.get("/a/:slug/*", (c) => {
    const slug = c.req.param("slug");
    const row = resolveForServe(db, slug);
    if (!row) return c.text("Artifact not found or expired", 404);
    let path: string;
    try {
      path = decodeURIComponent(
        new URL(c.req.url).pathname.slice(`/a/${slug}/`.length),
      );
    } catch {
      return c.text("File not found", 404);
    }
    if (!validFilePath(path)) return c.text("File not found", 404);
    const file = db
      .prepare(
        "SELECT content_type, data FROM artifact_files WHERE artifact_id = ? AND path = ?",
      )
      .get(row.id, path) as
      | Pick<PreparedFile, "content_type" | "data">
      | undefined;
    if (!file) return c.text("File not found", 404);
    return c.body(new Uint8Array(file.data), 200, {
      ...contentSecurityHeaders("strict"),
      // SVG/JSON/text must never become an executable document when navigated to.
      "Content-Security-Policy":
        "default-src 'none'; sandbox; frame-ancestors 'none'",
      "Content-Type": file.content_type,
      // Revocation/rotation/expiry apply to files too; don't retain public caches.
      "Cache-Control": "no-store",
    });
  });
  app.get("/", (c) => c.text("artifact content plane", 200));
  return app;
}
