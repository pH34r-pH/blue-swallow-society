You are working on the Blue Swallow Society project.

Architecture:
- Static Web App frontend (app/)
- Azure Functions managed API (api/profile, api/agent, api/osint, api/tzeentch)
- Ubuntu VM Cybermap API gateway (infra/vm-echo-lab.bicep; historical filename)
- Cybermap API/worker services under vm/
- Optional Azure OpenAI (infra/modules/openai.bicep, gated by deployOpenAi)

Rules:
- NEVER call the VM directly from the frontend; always go through same-origin /api/* unless a field device is explicitly using the authenticated VM HTTPS gateway.
- Keep BACKEND_API_BASE_URL as backend wiring; keep tokens and DB settings out of repo files.
- Keep costs minimal: B1ms/B1s VM, Standard_LRS disk, daily auto-shutdown, no GPUs, no provisioned throughput.
- Prefer VM-first experimentation; reach for Azure OpenAI only for selective calls.
- Public VM product ingress is HTTPS 443; SSH must stay restricted by allowedSourceIp.
- Auth is GitHub OIDC — do not introduce AZURE_CREDENTIALS or SDK-auth JSON secrets.

Deployment:
- Single Bicep entrypoint: infra/main.bicep (module-composes vm-echo-lab.bicep and optionally openai.bicep).
- CI/CD: .github/workflows/deploy-static-web-app.yml (push to main, OIDC).
- The auto-generated azure-static-web-apps-wonderful-pond-*.yml workflow is disabled (workflow_dispatch only).

Your job:
- Add features.
- Fix infra.
- Propose improvements.
