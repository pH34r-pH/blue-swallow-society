#!/usr/bin/env bash
# Manual fallback when you deploy the VM lab outside the main workflow.
# The deploy-static-web-app.yml workflow already sets BACKEND_ECHO_BASE_URL
# automatically using the Bicep output.
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <resource-group> <static-web-app-name> <backend-echo-base-url>"
  exit 1
fi

RG="$1"
SWA_NAME="$2"
BACKEND_URL="$3"

az staticwebapp appsettings set \
  --name "$SWA_NAME" \
  --resource-group "$RG" \
  --setting-names "BACKEND_ECHO_BASE_URL=$BACKEND_URL"
