#!/usr/bin/env bash
set -euo pipefail

echo "Next steps:"
echo "1. Push this repo to GitHub"
echo "2. Create an Azure Static Web App (Standard)"
echo "3. Add GitHub secret: AZURE_STATIC_WEB_APPS_API_TOKEN"
echo "4. Deploy infra/vm-echo-lab.bicep into a resource group"
echo "5. Capture backendEchoBaseUrl output"
echo "6. Add Static Web App setting: BACKEND_ECHO_BASE_URL=<that output>"
echo "7. Push again or restart the app and test /api/echo"
