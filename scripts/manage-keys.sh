#!/usr/bin/env bash
# Convenience wrapper around the in-pod API key CLI (dist/cli/createKey.js).
# Requires cluster access (kubectl) by design — key management is intentionally
# NOT exposed over the network, so a leaked API key alone can never mint more.
#
# Usage:
#   scripts/manage-keys.sh "some label"     create a key (prints plaintext ONCE)
#   scripts/manage-keys.sh --list           list keys (no secrets)
#   scripts/manage-keys.sh --revoke <id>    revoke a key
set -euo pipefail

NAMESPACE="${BEACON_NAMESPACE:-mcp-artifacts}"
LABEL_SELECTOR="${BEACON_LABEL_SELECTOR:-app=publish-artifacts-mcp}"

pod="$(kubectl -n "${NAMESPACE}" get pods -l "${LABEL_SELECTOR}" -o jsonpath='{.items[0].metadata.name}')"
if [[ -z "${pod}" ]]; then
  echo "No running pod found in namespace ${NAMESPACE} matching ${LABEL_SELECTOR}" >&2
  exit 1
fi

kubectl -n "${NAMESPACE}" exec -i "${pod}" -- node dist/cli/createKey.js "$@"
