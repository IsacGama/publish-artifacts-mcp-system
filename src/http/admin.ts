import { Hono } from "hono";
import { z } from "zod";
import type { DB } from "../db/index.js";
import type { AppConfig } from "../config.js";
import { apiKeyAuth, type AuthEnv } from "./auth.js";
import { RateLimiter, PayloadTooLargeError } from "../security/limits.js";
import {
  publishArtifact,
  updateArtifact,
  deleteArtifact,
  getArtifact,
  listArtifacts,
} from "../core/artifacts.js";
import { getShareLink } from "../core/shareLinks.js";
import { NotFoundError } from "../core/types.js";
import { adminPage } from "./adminUi.js";

const visibility = z.enum(["public", "unlisted"]);
const cspMode = z.enum(["strict", "relaxed"]);

const publishSchema = z.object({
  html: z.string().min(1),
  title: z.string().optional(),
  description: z.string().optional(),
  visibility: visibility.optional(),
  csp_mode: cspMode.optional(),
  expires_at: z.string().datetime().nullable().optional(),
  sanitize: z.boolean().optional(),
});
const updateSchema = publishSchema.partial();

/**
 * Control plane: the API-key-protected REST API used by the admin UI, plus the
 * (unauthenticated-to-load) admin HTML page which authenticates client-side.
 */
export function adminRouter(db: DB, cfg: AppConfig): Hono<AuthEnv> {
  const app = new Hono<AuthEnv>();
  const limiter = new RateLimiter(cfg.publishRatePerMin);

  // The page shell is public; it holds no secrets and asks for a key at runtime.
  app.get("/", (c) => c.redirect("/admin"));
  app.get("/admin", (c) => c.html(adminPage()));

  const api = new Hono<AuthEnv>();
  api.use("*", apiKeyAuth(db, cfg));

  api.get("/artifacts", (c) => {
    const q = c.req.query();
    const ctx = c.get("toolCtx");
    const res = listArtifacts(ctx, ctx.ownerKeyId, {
      limit: q.limit ? Number(q.limit) : undefined,
      offset: q.offset ? Number(q.offset) : undefined,
      visibility: q.visibility === "public" || q.visibility === "unlisted" ? q.visibility : undefined,
    });
    return c.json(res);
  });

  api.post("/artifacts", async (c) => {
    const ctx = c.get("toolCtx");
    if (!limiter.take(ctx.ownerKeyId)) return c.json({ error: "rate_limited" }, 429);
    const parsed = publishSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", details: parsed.error.issues }, 400);
    try {
      return c.json(publishArtifact(ctx, ctx.ownerKeyId, parsed.data), 201);
    } catch (err) {
      if (err instanceof PayloadTooLargeError) return c.json({ error: "payload_too_large" }, 413);
      throw err;
    }
  });

  api.get("/artifacts/:id", (c) => {
    const ctx = c.get("toolCtx");
    try {
      const includeHtml = c.req.query("include_html") === "true";
      return c.json(getArtifact(ctx, ctx.ownerKeyId, c.req.param("id"), includeHtml));
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: "not_found" }, 404);
      throw err;
    }
  });

  api.patch("/artifacts/:id", async (c) => {
    const ctx = c.get("toolCtx");
    if (!limiter.take(ctx.ownerKeyId)) return c.json({ error: "rate_limited" }, 429);
    const parsed = updateSchema.safeParse(await c.req.json().catch(() => null));
    if (!parsed.success) return c.json({ error: "invalid_body", details: parsed.error.issues }, 400);
    try {
      return c.json(updateArtifact(ctx, ctx.ownerKeyId, c.req.param("id"), parsed.data));
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: "not_found" }, 404);
      if (err instanceof PayloadTooLargeError) return c.json({ error: "payload_too_large" }, 413);
      throw err;
    }
  });

  api.delete("/artifacts/:id", (c) => {
    const ctx = c.get("toolCtx");
    const removed = deleteArtifact(ctx, ctx.ownerKeyId, c.req.param("id"));
    if (!removed) return c.json({ error: "not_found" }, 404);
    return c.json({ ok: true });
  });

  api.post("/artifacts/:id/share", async (c) => {
    const ctx = c.get("toolCtx");
    const body = (await c.req.json().catch(() => ({}))) as { rotate?: boolean };
    try {
      const meta = getShareLink(ctx, ctx.ownerKeyId, c.req.param("id"), body.rotate ?? false);
      return c.json({ id: meta.id, slug: meta.slug, share_url: meta.share_url });
    } catch (err) {
      if (err instanceof NotFoundError) return c.json({ error: "not_found" }, 404);
      throw err;
    }
  });

  app.route("/api", api);
  return app;
}
