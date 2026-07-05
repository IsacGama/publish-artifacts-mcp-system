export type Visibility = "public" | "unlisted";
export type CspMode = "strict" | "relaxed";

export interface ApiKeyRecord {
  id: string;
  key_prefix: string;
  key_hash: string;
  label: string;
  created_at: string;
  revoked_at: string | null;
}

export interface ArtifactRow {
  id: string;
  owner_key_id: string;
  slug: string;
  title: string;
  description: string;
  html: string;
  visibility: Visibility;
  csp_mode: CspMode;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Metadata view returned to callers (never includes the API key hash). */
export interface ArtifactMeta {
  id: string;
  slug: string;
  title: string;
  description: string;
  visibility: Visibility;
  csp_mode: CspMode;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
  share_url: string;
}

export function toMeta(row: ArtifactRow, contentBaseUrl: string): ArtifactMeta {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    visibility: row.visibility,
    csp_mode: row.csp_mode,
    expires_at: row.expires_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    share_url: `${contentBaseUrl}/a/${row.slug}`,
  };
}

export class NotFoundError extends Error {
  constructor(message = "Not found") {
    super(message);
    this.name = "NotFoundError";
  }
}
