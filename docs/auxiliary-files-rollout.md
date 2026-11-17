# Auxiliary-file rollout — 2026-11-17

Implementation: `e4d37982f833a4f0b37e57d3d83f5074eca4e90a`, branch `feat/artifact-assets`, draft PR #1.

## OCI deployment

- Existing Kubernetes namespace: `mcp-artifacts`; deployment: `publish-artifacts-mcp`.
- ARM64 image: `docker.io/library/publish-artifacts-mcp:assets-e4d3798`.
- Image index digest: `sha256:e7f479b33e99fc24cfefadb130a81674daa63c3ba45e47fe56a531cee9910d76`.
- Existing PVC and control/content origins retained. Ingress body limit raised from 10m to 32m.
- SQLite backup before rollout: `/data/artifacts-before-assets-20261117.db` on the existing volume.
- Integrity manifest: `/data/before-assets-manifest-20261117.json`. All 60 pre-existing artifact HTML hashes matched after rollout; none missing.
- Deployment rollout completed and public `/health` returned 200.

The published example is **https://mcp-content.isacgama.shop/a/mv2TA-tzvNSs0WsfzvCooW/**. It was uploaded through a fresh Streamable HTTP MCP client using `scripts/publish-directory.mjs`, not by editing the database.

## Validation

- 37 automated tests: REST/MCP compatibility, path/type/base64 validation, per-file and total limits, bounded HTTP request body, binary fidelity, atomic replacement, ownership, expiry, deletion and share rotation.
- TypeScript production build passed; ARM64 Docker build passed.
- Local npm tarball from Arcca DS commit `603842f`, package version 0.22.0. Preparation extracted its `/web` bundle, four Inter font weights and the font license. No npm release or CDN used.
- Eight public auxiliary files fetched successfully; every response body matched its returned SHA-256 manifest.
- Existing native MCP `publish_artifact` HTML-only call created a test page, publicly returned 200 with the original strict CSP, and the test artifact was deleted afterward.
- Browser checks and screenshots are in the delivery kit; no JavaScript page errors. The DS emits an existing React Native Web `useNativeDriver` fallback warning (animation runs in JS).

Clients caching the old MCP tool schema may need to reconnect to discover `files`; old HTML-only calls continue working without that change. The directory publisher discovers the current schema using a fresh client.

## Rollback

The previous image tag `docker.io/library/publish-artifacts-mcp:latest` was preserved (prior index digest `sha256:255ac5ca4c66401b75d845c25006bf660deb15e62962a221e7de1a800ec65485`). Roll back the deployment image to it and wait for rollout. The database migration only adds `artifact_files`, so old HTML artifacts remain readable; the old server cannot render new bundles. The backup is available if a data restore is required.

## Existing dependency advisories

`npm audit --omit=dev` on the inherited lockfile reported 10 production findings (3 moderate, 5 high, 2 critical), including Hono, the MCP SDK, DOMPurify and Zod. This change did not alter dependency versions. Updating the runtime and validation dependencies is separate follow-up work; the README's previous claim that findings were development-only was corrected. Application tests are not a substitute for a clean dependency audit.
