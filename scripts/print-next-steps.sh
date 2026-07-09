#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
Next steps:
  1. Review infra/main.parameters.json and set allowedSourceIp to your
     developer IP address (NOT "*") before deploying to production.
     Run: curl -s https://ipinfo.io/ip  to discover your current IP.

  2. Dry-run the deployment before creating any resources:
       az deployment group what-if \
         --resource-group rg-blue-swallow \
         --template-file infra/main.bicep \
         --parameters infra/main.parameters.json

  3. Push this repo to GitHub.
  4. Create the Azure service principal + OIDC federated credential
     (see .github/workflows/setup-azure-creds.md).
  5. Add the GitHub secrets listed in that doc:
       AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID,
       VM_SSH_PUBLIC_KEY
  6. Push to main (or run "Deploy Infra + App" via workflow_dispatch).
     The workflow:
       - creates resource group rg-blue-swallow
       - deploys infra/main.bicep (SWA + VM echo lab, optional OpenAI)
       - sets BACKEND_ECHO_BASE_URL on the SWA
       - uploads the app + API
       - wires blueswallow.co.in and www.blueswallow.co.in through Azure DNS
     Redeployments are idempotent — running the workflow again will
     update existing resources without destroying state.

  7. Browse to the Static Web App default hostname and exercise /api/echo.
EOF
