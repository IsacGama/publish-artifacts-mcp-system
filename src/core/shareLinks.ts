import type { DB } from "../db/index.js";
import { type ArtifactRow, type ArtifactMeta, NotFoundError, toMeta } from "./types.js";
import { generateSlug } from "../security/slugs.js";
import type { ArtifactServiceDeps } from "./artifacts.js";

/** True if the artifact has an expiry in the past. */
export function isExpired(row: Pick<ArtifactRow, "expires_at">, now = Date.now()): boolean {
  if (!row.expires_at) return false;
  const t = Date.parse(row.expires_at);
  return Number.isFinite(t) && t <= now;
}

/**
 * PUBLIC resolution used by the content plane: looks up by slug only (no owner
 * scope, since share links are meant to be shared) and returns null if the
 * artifact is missing or expired. Callers must still apply CSP on serve.
 */
export function resolveForServe(db: DB, slug: string): ArtifactRow | null {
  const row = db.prepare(`SELECT * FROM artifacts WHERE slug = ?`).get(slug) as
    | ArtifactRow
    | undefined;
  if (!row) return null;
  if (isExpired(row)) return null;
  return row;
}

/**
 * Returns the current share link for an owned artifact, optionally rotating the
 * slug first (which immediately invalidates the previous public URL).
 */
export function getShareLink(
  deps: ArtifactServiceDeps,
  ownerKeyId: string,
  id: string,
  rotate = false,
): ArtifactMeta {
  const row = deps.db
    .prepare(`SELECT * FROM artifacts WHERE id = ? AND owner_key_id = ?`)
    .get(id, ownerKeyId) as ArtifactRow | undefined;
  if (!row) throw new NotFoundError(`Artifact ${id} not found`);

  if (rotate) {
    const slug = generateSlug();
    deps.db
      .prepare(`UPDATE artifacts SET slug = ?, updated_at = ? WHERE id = ? AND owner_key_id = ?`)
      .run(slug, new Date().toISOString(), id, ownerKeyId);
    row.slug = slug;
  }
  return toMeta(row, deps.contentBaseUrl);
}
