#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
Next steps:
  1. Push this repo to GitHub.
  2. Create the Azure service principal + OIDC federated credential
     (see .github/workflows/setup-azure-creds.md).
  3. Add the GitHub secrets listed in that doc:
       AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID,
       AZURE_STATIC_WEB_APPS_API_TOKEN, VM_SSH_PUBLIC_KEY
  4. Push to main (or run "Deploy Infra + App" via workflow_dispatch).
     The workflow:
       - creates resource group rg-blue-swallow
       - deploys infra/main.bicep (SWA + VM echo lab, optional OpenAI)
       - sets BACKEND_ECHO_BASE_URL on the SWA
       - uploads the app + API
  5. Browse to the Static Web App default hostname and exercise /api/echo.
EOF
