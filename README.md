# publish-artifacts-mcp

Publish self-contained **HTML artifacts safely**, controlled by **API key**, and
manage them over **MCP** (stdio + Streamable HTTP). Minimal admin UI included.

The hard part here is not "serve HTML" — it's hosting *untrusted* HTML without
letting it steal credentials or exfiltrate data. The design centers on **origin
isolation + strict CSP + scoped API keys**.

## Stack

TypeScript · Node 22 · [Hono](https://hono.dev) · `@modelcontextprotocol/sdk`
· SQLite (`better-sqlite3`, WAL) · zod. Deploy via Docker.

## How it works

Two planes share one process and one SQLite file, but are **routed by Host header**:

| Plane | Origin (example) | Serves | Auth |
|---|---|---|---|
| Control | `api.example.com` | REST API, admin UI (`/admin`), MCP-over-HTTP (`/mcp`) | API key (Bearer) |
| Content | `content.example.com` | published artifacts at `/a/:slug` | public, no cookies |

They **must be different origins** — the server refuses to boot otherwise (set
`ALLOW_SAME_ORIGIN=1` only for local dev). This guarantees untrusted artifact
HTML can never reach the API/admin surface.

### Safety layers

- **Origin isolation** (above) + host-based routing.
- **Strict CSP** on every served artifact: `default-src 'none'`, `connect-src 'none'`,
  `form-action 'none'`, `frame-ancestors 'none'`, `base-uri 'none'` — blocks
  network/form exfiltration and framing while still allowing the artifact's own
  inline script/style to render. `relaxed` mode (opt-in per artifact) permits
  https network access.
- **Hardening headers**: `X-Content-Type-Options`, `Referrer-Policy`,
  `X-Frame-Options`, `Permissions-Policy`, `Cross-Origin-Resource-Policy`. No
  cookies are ever set on the content origin.
- **Unguessable slugs** (~132 bits), optional **expiry**, and **rotate** to
  invalidate a shared link.
- **API keys**: high-entropy, **SHA-256-hashed at rest**, prefix-indexed,
  revocable, and **owner-scoped** (a key sees/mutates only its own artifacts).
- **Limits**: max HTML size + per-key publish rate limiting. Optional `sanitize`
  tier strips scripts via DOMPurify.

> **Accepted trade-off (raw-path model):** all artifacts share one content
> origin, so they can read each other's `localStorage`. That's why no credentials
> live on the content origin. Upgrading to per-artifact subdomains
> (`<slug>.content-domain`) later requires only routing + wildcard DNS changes.

## Quick start (local dev)

```bash
npm install
cp .env.example .env          # defaults use content.localhost for isolation
npm run build

# Bootstrap an API key (printed once):
npm run create-key -- "my laptop"

# Run the server:
npm start
# admin UI: http://localhost:8787/admin  (paste the key when prompted)
```

`content.localhost` resolves to 127.0.0.1 on most systems. If yours differs, add
`127.0.0.1 content.localhost` to `/etc/hosts`, or set `ALLOW_SAME_ORIGIN=1` for
dev only.

## MCP tools

`publish_artifact`, `update_artifact`, `delete_artifact`, `get_artifact`,
`list_artifacts`, `get_share_link`. All owner-scoped by the calling key.

### stdio (Claude Code / Desktop) — `.mcp.json`

```json
{
  "mcpServers": {
    "artifacts": {
      "command": "node",
      "args": ["/abs/path/dist/mcp/stdio.js"],
      "env": {
        "ARTIFACTS_API_KEY": "ak_...",
        "CONTENT_BASE_URL": "https://content.example.com",
        "CONTROL_BASE_URL": "https://api.example.com",
        "DB_PATH": "/data/artifacts.db"
      }
    }
  }
}
```

### Remote (Streamable HTTP)

`POST https://api.example.com/mcp` with header `Authorization: Bearer ak_...`.

## Deploy (Docker)

Point two hostnames you control at the container (reverse proxy / DNS), set them
as `CONTROL_BASE_URL` / `CONTENT_BASE_URL` in `docker-compose.yml`, then:

```bash
docker compose up -d --build
docker compose exec artifacts node dist/cli/createKey.js "prod key"
```

SQLite persists in the `artifacts-data` volume (`/data`).

## Tests

```bash
npm test        # unit + MCP in-memory + HTTP host-isolation integration
```

Run `npm audit` and `npm audit --omit=dev` separately from the application tests.
Version 0.2.1 reports zero findings in both audits at the 2026-11-17 snapshot.
Tests use Node's built-in runner and strict assertions via the existing TypeScript
loader; no Vite/Vitest/Picomatch dependency is needed. See
[security validation](docs/security-0.2.1.md) for versions and evidence.

## Publish a directory or a local design-system package

The existing `publish_artifact({ html })` call still works. Add `files` to publish
JS modules, CSS, fonts and images with the document, without a CDN or npm release:

```json
{
  "html": "<!doctype html><link rel=stylesheet href=\"./assets/site.css\"><arcca-button>Testar</arcca-button><script type=module src=\"./assets/arcca-ds.mjs\"></script>",
  "files": [
    { "path": "assets/arcca-ds.mjs", "content": "/* built local runtime */" },
    { "path": "assets/site.css", "content": "body { margin: 2rem }" },
    { "path": "assets/inter.woff2", "encoding": "base64", "content": "..." }
  ]
}
```

`encoding` defaults to `utf8`. Binary files use standard padded `base64`. MIME
types are inferred from the extension; HTML documents and unknown types are rejected.
Paths are relative, case-sensitive, unique, and cannot contain traversal, backslashes,
query strings, percent escapes or empty segments. Use **`./assets/...`**, not `/assets/...`.
Bundles redirect their share link to a trailing slash so relative imports work.
Single-HTML links keep their previous behavior. Nested JS imports and CSS font URLs
resolve relative to their own file. No HTML rewriting or remote package installation occurs.

`update_artifact` accepts the same `files` field: omit it to preserve files, supply
an array to replace the entire set atomically, or `[]` to remove them. Metadata/get/list
responses include file paths, MIME, byte counts and SHA-256 digests, never file bodies.
The REST POST/PATCH `/api/artifacts` API supports the same shape.

For a prepared local folder with `index.html`:

```bash
export CONTROL_BASE_URL=https://your-api-host
# Set ARTIFACTS_API_KEY securely in the environment; never put it in the HTML.
npm run publish:directory -- ./site "Meu protótipo"
```

This helper uploads the directory through **MCP**, including binary assets, and
returns the share URL. It rejects symlinks. Publish a dedicated output folder, not
your repository or a directory containing credentials. It needs no server filesystem access.

For a local `.tgz` from `npm pack`, extract it locally and copy the package's built
browser entry (for Arcca DS: `package/dist/universal/web/index.mjs`) to the output
folder as `assets/arcca-ds.mjs`. Copy any relative chunks plus fonts/images needed by
that build. Load it using `<script type="module" src="./assets/arcca-ds.mjs"></script>`.
The package is only an input to local preparation: Beacons does not run npm install,
package scripts, or build arbitrary source on the server. A package still containing
bare imports must be bundled before publication.

### Storage, limits and CSP for files

An additive `artifact_files` SQLite table stores file bytes with the artifact's
foreign key. HTML and files update in one transaction. Backup/restore includes both;
no extra bucket or service is required. Files inherit deletion, expiry, ownership
and share-link rotation. Responses use `no-store` so revocation is not delayed by caches.

Defaults: HTML 2 MiB (`MAX_HTML_BYTES`), each file 8 MiB (`MAX_FILE_BYTES`), total
HTML + decoded files 20 MiB (`MAX_BUNDLE_BYTES`), at most 64 files (`MAX_FILES`).
HTTP bodies are bounded before parsing, allowing for base64 overhead. Configure
reverse-proxy body limits accordingly (e.g. Nginx Ingress `proxy-body-size: 32m`).

Strict mode still blocks fetch/XHR/WebSocket and external CDN scripts. It permits
scripts/styles only under **that artifact's directory**, in addition to the existing
inline allowance. The control/API origin remains separate. Asset responses use
`nosniff`, correct MIME and a sandbox policy for direct navigation (including SVG).
`sanitize: true` still removes executable markup; use the default raw mode for an
interactive DS demo. The accepted shared-content-origin trade-off above still applies.

Rollback: roll back the container image; the new table is additive and old servers
ignore it. Back up SQLite before deployment. Old servers cannot serve file-based
artifacts, but existing single-HTML documents require no migration.

### Ready-made Arcca DS playground

For the current experimental Arcca package (with its browser bundle and bundled
reference fonts), prepare the included interactive example directly from a local tarball:

```bash
node scripts/prepare-arcca-demo.mjs ./arcca-arcca-ds-0.22.0.tgz ./site
npm run publish:directory -- ./site "Arcca DS · playground"
```

The output directory must be empty. Preparation uses `tar` to read only known package
members; it does not install dependencies or execute package scripts. Runtime, Inter
font weights and license are all read from the supplied tarball. The example includes
buttons, dropdown, text field, checkbox, switch, progress and inline message.
