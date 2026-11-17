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
| Vitest (dev) | 2.1.9 | 5.1.0 |
| Vite (dev) | 5.4.21 | 8.3.8 |

The two critical production findings (DOMPurify and proxy-addr) are gone.
The critical Vitest/tinypool development findings are gone too; tinypool is no
longer in the resolved tree. No `--force`, audit suppression or fabricated overrides
were used. Lockfile regeneration followed by a clean `npm ci` validates resolution.

## Remaining development-only advisory

`npm audit --omit=dev --json`: **0** findings in every severity.
Full `npm audit --json`: **5 high**, **0 critical**, all from the same Picomatch
ReDoS advisory propagated through fdir, tinyglobby, Vite and Vitest.

- [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)
- The registry's latest Picomatch is 4.0.7; the advisory affects <=4.0.7 and lists
  no patched release at this snapshot.
- Vitest 5.1.0 uses that current release. npm's proposed Vitest downgrade to 3.1.4
  is not an acceptable substitute for a patch: it would reintroduce older tooling
  with other advisories.
- These tools process repository-owned test patterns and are removed with
  `npm prune --omit=dev` from the runtime image. The application does not use
  Picomatch to process artifact content or file paths.
- Follow-up: upgrade Picomatch when a patched compatible version is published,
  rerun the full audit and suite. This residual issue is disclosed, not marked fixed.

## Compatibility and validation

- Node minimum raised to 22.12.0 for the new test tooling; deployment remains Node 22.
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
