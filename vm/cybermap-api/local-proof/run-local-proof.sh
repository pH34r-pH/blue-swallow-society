#!/usr/bin/env bash
set -euo pipefail

root="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
api_root="$(CDPATH= cd -- "$root/.." && pwd)"
: "${BSS_LOCAL_PROOF_ENV_FILE:?Set BSS_LOCAL_PROOF_ENV_FILE to the protected local-proof.env path.}"

cd -- "$api_root"

if [[ "${1:-}" == "proof" ]]; then
  if [[ "$#" -ne 1 ]]; then
    printf '%s\n' 'usage: run-local-proof.sh proof' >&2
    exit 64
  fi
  docker compose --env-file "$BSS_LOCAL_PROOF_ENV_FILE" -f local-proof/compose.yaml down --volumes --remove-orphans
  docker compose --env-file "$BSS_LOCAL_PROOF_ENV_FILE" -f local-proof/compose.yaml up --build --wait
  exec node local-proof/verify-local-proof.mjs
fi

exec docker compose --env-file "$BSS_LOCAL_PROOF_ENV_FILE" -f local-proof/compose.yaml "$@"
