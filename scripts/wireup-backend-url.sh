#!/usr/bin/env bash
# Manual fallback when you deploy the VM API gateway outside the main workflow.
# The deploy-static-web-app.yml workflow already sets CYBERMAP_BACKEND_BASE_URL
# from the Bicep output and CYBERMAP_BACKEND_TOKEN from the GitHub secret.
set -euo pipefail

if [ "$#" -lt 4 ]; then
  echo "Usage: $0 <resource-group> <static-web-app-name> <backend-api-base-url> <cybermap-backend-token>"
  echo "Tip: pass the token from a local secret store; do not commit or paste it into logs."
  exit 1
fi

RG="$1"
SWA_NAME="$2"
BACKEND_URL="$3"
BACKEND_TOKEN="$4"

if [ -z "$BACKEND_TOKEN" ]; then
  echo "CYBERMAP_BACKEND_TOKEN must be non-empty." >&2
  exit 1
fi

az staticwebapp appsettings set \
  --name "$SWA_NAME" \
  --resource-group "$RG" \
  --setting-names \
    "CYBERMAP_BACKEND_BASE_URL=$BACKEND_URL" \
    "CYBERMAP_BACKEND_TOKEN=$BACKEND_TOKEN"
