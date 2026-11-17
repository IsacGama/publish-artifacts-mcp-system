# Security update 0.2.1 — 2026-11-17

## Dependency changes

| Dependency | Previous lockfile | Updated |
|---|---|---|
| DOMPurify | 3.4.11 | 3.4.18 |
| proxy-addr (transitive through MCP SDK) | 2.0.7 | 2.0.8 |
| MCP TypeScript SDK | 1.29.0 | 1.32.2 |
| Hono | 4.12.27 | 4.13.19 |
| Hono Node adapter | 1.19.14 | 2.1.9 |
| Zod | 3.25.76 | 4.6.7 |
| body-parser | 2.3.0 | 2.4.0 |
| fast-uri | 3.1.3 | 3.1.9 |
| ip-address | 10.2.0 | 10.7.6 |
| qs | 6.15.3 | 6.17.1 |
| Vitest (dev) | 2.1.9 | Removed; native Node runner |
| Vite (dev) | 5.4.21 | Removed |

The two critical production findings (DOMPurify and proxy-addr) are gone.
The critical Vitest/tinypool development findings are gone too; tinypool is no
longer in the resolved tree. No `--force`, audit suppression or fabricated overrides
were used. Lockfile regeneration followed by a clean `npm ci` validates resolution.

## Complete audit, including development dependencies

Both `npm audit --json` and `npm audit --omit=dev --json` report **zero** findings
at this snapshot: no low, moderate, high or critical alerts.

The test suite only needs ordinary assertions and lifecycle hooks. It now uses
`node:test` and `node:assert/strict` with the already-present `tsx` loader, retaining
all 46 scenarios and replacing assertions directly rather than introducing an adapter.
Removing Vitest also removes Vite, fdir, tinyglobby and Picomatch. This eliminates the
unpatched [Picomatch advisory](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
without downgrading to vulnerable test tooling, suppressing audits or maintaining a fork.
No automated test was skipped or removed.

## Compatibility and validation

- Node 22 compatibility is retained; tests run with `node --import tsx --test`.
- The new SDK defaults to a 4 MiB HTTP body limit. Its explicit bound now uses the
  same configured, finite raw-body limit as Hono, preserving local bundle uploads.
- New HTTP MCP tests cover publication above 4 MiB, configured rejection above the
  limit, authentication and invalid arguments with Zod 4.
- New sanitizer regressions cover scripts, event handlers, javascript links, SVG
  active content, iframe srcdoc, and preservation of readable documents/safe links.
- 46 tests and the TypeScript production build passed before rollout.

## Rollout preparation

Before updating the OCI Kubernetes deployment, a new consistent SQLite backup was
created at `/data/artifacts-before-security-20261117.db`. Integrity manifest:
`/data/before-security-manifest-20261117.json` (61 artifact HTML bodies, 8 files).
The earlier image `publish-artifacts-mcp:assets-e4d3798` is retained for rollback.

The original local DS playground URL remains unchanged:
https://mcp-content.isacgama.shop/a/mv2TA-tzvNSs0WsfzvCooW/
