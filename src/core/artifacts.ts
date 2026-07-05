import type { DB } from "../db/index.js";
import {
  type ArtifactRow,
  type ArtifactMeta,
  type Visibility,
  type CspMode,
  NotFoundError,
  toMeta,
} from "./types.js";
import { generateId, generateSlug } from "../security/slugs.js";
import { assertWithinSize } from "../security/limits.js";
import { sanitizeStrict } from "../security/sanitize.js";

export interface ArtifactServiceDeps {
  db: DB;
  contentBaseUrl: string;
  maxHtmlBytes: number;
  defaultCspMode: CspMode;
}

export interface PublishInput {
  html: string;
  title?: string;
  description?: string;
  visibility?: Visibility;
  csp_mode?: CspMode;
  /** ISO timestamp; artifact stops resolving after this instant. */
  expires_at?: string | null;
  /** When true, run DOMPurify strict sanitization before storing. */
  sanitize?: boolean;
}

export type UpdateInput = Partial<PublishInput>;

function prepareHtml(html: string, maxBytes: number, sanitize: boolean | undefined): string {
  const out = sanitize ? sanitizeStrict(html) : html;
  assertWithinSize(out, maxBytes);
  return out;
}

/** Publishes a new artifact owned by `ownerKeyId`. */
export function publishArtifact(
  deps: ArtifactServiceDeps,
  ownerKeyId: string,
  input: PublishInput,
): ArtifactMeta {
  const html = prepareHtml(input.html, deps.maxHtmlBytes, input.sanitize);
  const now = new Date().toISOString();
  const row: ArtifactRow = {
    id: generateId(),
    owner_key_id: ownerKeyId,
    slug: generateSlug(),
    title: input.title ?? "",
    description: input.description ?? "",
    html,
    visibility: input.visibility ?? "unlisted",
    csp_mode: input.csp_mode ?? deps.defaultCspMode,
    expires_at: input.expires_at ?? null,
    created_at: now,
    updated_at: now,
  };
  deps.db
    .prepare(
      `INSERT INTO artifacts
         (id, owner_key_id, slug, title, description, html, visibility, csp_mode, expires_at, created_at, updated_at)
       VALUES (@id, @owner_key_id, @slug, @title, @description, @html, @visibility, @csp_mode, @expires_at, @created_at, @updated_at)`,
    )
    .run(row);
  return toMeta(row, deps.contentBaseUrl);
}

function getOwnedRow(db: DB, ownerKeyId: string, id: string): ArtifactRow {
  const row = db
    .prepare(`SELECT * FROM artifacts WHERE id = ? AND owner_key_id = ?`)
    .get(id, ownerKeyId) as ArtifactRow | undefined;
  if (!row) throw new NotFoundError(`Artifact ${id} not found`);
  return row;
}

/** Owner-scoped update. Only provided fields change. */
export function updateArtifact(
  deps: ArtifactServiceDeps,
  ownerKeyId: string,
  id: string,
  input: UpdateInput,
): ArtifactMeta {
  const existing = getOwnedRow(deps.db, ownerKeyId, id);
  const html =
    input.html !== undefined
      ? prepareHtml(input.html, deps.maxHtmlBytes, input.sanitize)
      : existing.html;
  const next: ArtifactRow = {
    ...existing,
    html,
    title: input.title ?? existing.title,
    description: input.description ?? existing.description,
    visibility: input.visibility ?? existing.visibility,
    csp_mode: input.csp_mode ?? existing.csp_mode,
    expires_at: input.expires_at !== undefined ? input.expires_at : existing.expires_at,
    updated_at: new Date().toISOString(),
  };
  deps.db
    .prepare(
      `UPDATE artifacts SET
         html = @html, title = @title, description = @description,
         visibility = @visibility, csp_mode = @csp_mode, expires_at = @expires_at,
         updated_at = @updated_at
       WHERE id = @id AND owner_key_id = @owner_key_id`,
    )
    .run(next);
  return toMeta(next, deps.contentBaseUrl);
}

/** Owner-scoped delete. Returns true if a row was removed. */
export function deleteArtifact(deps: ArtifactServiceDeps, ownerKeyId: string, id: string): boolean {
  const res = deps.db
    .prepare(`DELETE FROM artifacts WHERE id = ? AND owner_key_id = ?`)
    .run(id, ownerKeyId);
  return res.changes > 0;
}

export function getArtifact(
  deps: ArtifactServiceDeps,
  ownerKeyId: string,
  id: string,
  includeHtml = false,
): ArtifactMeta & { html?: string } {
  const row = getOwnedRow(deps.db, ownerKeyId, id);
  const meta = toMeta(row, deps.contentBaseUrl);
  return includeHtml ? { ...meta, html: row.html } : meta;
}

export interface ListOptions {
  limit?: number;
  offset?: number;
  visibility?: Visibility;
}

export function listArtifacts(
  deps: ArtifactServiceDeps,
  ownerKeyId: string,
  opts: ListOptions = {},
): { items: ArtifactMeta[]; total: number } {
  const limit = Math.min(Math.max(opts.limit ?? 50, 1), 200);
  const offset = Math.max(opts.offset ?? 0, 0);
  const where = opts.visibility
    ? `owner_key_id = ? AND visibility = ?`
    : `owner_key_id = ?`;
  const params = opts.visibility ? [ownerKeyId, opts.visibility] : [ownerKeyId];

  const total = (
    deps.db.prepare(`SELECT COUNT(*) AS c FROM artifacts WHERE ${where}`).get(...params) as {
      c: number;
    }
  ).c;
  const rows = deps.db
    .prepare(
      `SELECT * FROM artifacts WHERE ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, limit, offset) as ArtifactRow[];
  return { items: rows.map((r) => toMeta(r, deps.contentBaseUrl)), total };
}
