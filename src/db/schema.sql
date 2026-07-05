-- API keys. We store only a SHA-256 hash of the secret plus a short,
-- non-secret prefix used to index the lookup. The plaintext key is shown
-- to the user exactly once at creation time and never persisted.
CREATE TABLE IF NOT EXISTS api_keys (
  id          TEXT PRIMARY KEY,
  key_prefix  TEXT NOT NULL,
  key_hash    TEXT NOT NULL,
  label       TEXT NOT NULL DEFAULT '',
  created_at  TEXT NOT NULL,
  revoked_at  TEXT
);
CREATE INDEX IF NOT EXISTS idx_api_keys_prefix ON api_keys (key_prefix);

-- Published artifacts. `html` holds the raw published document. Each artifact
-- is owned by the API key that created it; listing/mutation is owner-scoped.
CREATE TABLE IF NOT EXISTS artifacts (
  id           TEXT PRIMARY KEY,
  owner_key_id TEXT NOT NULL,
  slug         TEXT NOT NULL UNIQUE,
  title        TEXT NOT NULL DEFAULT '',
  description  TEXT NOT NULL DEFAULT '',
  html         TEXT NOT NULL,
  visibility   TEXT NOT NULL DEFAULT 'unlisted',  -- 'public' | 'unlisted'
  csp_mode     TEXT NOT NULL DEFAULT 'strict',    -- 'strict' | 'relaxed'
  expires_at   TEXT,                              -- ISO timestamp or NULL
  created_at   TEXT NOT NULL,
  updated_at   TEXT NOT NULL,
  FOREIGN KEY (owner_key_id) REFERENCES api_keys (id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_artifacts_owner ON artifacts (owner_key_id, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_artifacts_slug ON artifacts (slug);
