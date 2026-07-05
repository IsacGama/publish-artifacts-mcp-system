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

> The only `npm audit` findings are in the dev-only `vitest`/`vite`/`esbuild`
> chain (not shipped to production). Left unpinned to avoid a breaking vitest v4
> bump; revisit when upgrading the test tooling.
