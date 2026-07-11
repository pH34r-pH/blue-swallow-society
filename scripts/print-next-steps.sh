#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
Next steps:
  1. Review infra/main.parameters.json and set allowedSourceIp to your
     developer IP address (NOT "*") before production SSH access.
     Run: curl -s https://ipinfo.io/ip  to discover your current IP.

  2. Dry-run the deployment before creating any resources. Pass secure
     values from your shell or CI secret store; do not commit them:
       az deployment group what-if \
         --resource-group rg-blue-swallow \
         --template-file infra/main.bicep \
         --parameters infra/main.parameters.json \
         --parameters sshPublicKey="$VM_SSH_PUBLIC_KEY" \
         --parameters postgresAdministratorPassword="$POSTGRES_ADMIN_PASSWORD"

     Scan what-if before deploy: no VM/NIC/VNet replacement, no public
     PostgreSQL firewall rules, and no destructive resource deletion.

  3. Push this repo to GitHub.
  4. Create the Azure service principal + OIDC federated credential
     (see .github/workflows/setup-azure-creds.md).
  5. Add the GitHub secrets listed in that doc:
       AZURE_CLIENT_ID, AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID,
       VM_SSH_PUBLIC_KEY, POSTGRES_ADMIN_PASSWORD
  6. Push to main (or run "Deploy Infra + App" via workflow_dispatch).
     The workflow:
       - creates resource group rg-blue-swallow
       - deploys infra/main.bicep (SWA + shared VNet + Cybermap VM API gateway + private PostgreSQL B1MS, optional OpenAI)
       - sets BACKEND_API_BASE_URL on the SWA
       - uploads the app + API
       - wires blueswallow.co.in and www.blueswallow.co.in through Azure DNS to the canonical blue-swallow-swa Static Web App
     Legacy Static Web Apps blue-swallow-society and wonderful-pond-0623ed81e were deleted after cutover, so keep only blue-swallow-swa connected.
     Redeployments are idempotent — running the workflow again will
     update existing resources without destroying state.

  7. Browse to the Static Web App default hostname and verify Cybermap gateway health through the managed API once proxy routes land.
  8. If public Godeye is live, disable VM auto-shutdown or surface a visible offline/degraded state before relying on the 02:00 Pacific shutdown schedule.
EOF
