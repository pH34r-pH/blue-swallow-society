#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -lt 3 ]; then
  echo "Usage: $0 <resource-group> <static-web-app-name> <backend-echo-base-url>"
  exit 1
fi

RG="$1"
SWA_NAME="$2"
BACKEND_URL="$3"

az staticwebapp appsettings set   --name "$SWA_NAME"   --resource-group "$RG"   --setting-names BACKEND_ECHO_BASE_URL="$BACKEND_URL"
