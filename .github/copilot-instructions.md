You are working on the Blue Swallow Society project.

Architecture:
- Static Web App frontend (app/)
- Azure Functions managed API (api/echo, api/profile, api/agent)
- Ubuntu VM echo backend (infra/vm-echo-lab.bicep)
- Optional Azure OpenAI (infra/modules/openai.bicep, gated by deployOpenAi)

Rules:
- NEVER call the VM directly from the frontend; always go through /api/*.
- Keep BACKEND_ECHO_BASE_URL the only backend wiring secret in the SWA app settings.
- Keep costs minimal: B1s VM, Standard_LRS disk, daily auto-shutdown, no GPUs, no provisioned throughput.
- Prefer VM-first experimentation; reach for Azure OpenAI only for selective calls.
- Never widen NSG rules to 0.0.0.0/0 without an explicit short-lived reason; prefer setting allowedSourceIp to a /32.
- Auth is GitHub OIDC — do not introduce AZURE_CREDENTIALS or SDK-auth JSON secrets.

Deployment:
- Single Bicep entrypoint: infra/main.bicep (module-composes vm-echo-lab.bicep and optionally openai.bicep).
- CI/CD: .github/workflows/deploy-static-web-app.yml (push to main, OIDC).
- The auto-generated azure-static-web-apps-wonderful-pond-*.yml workflow is disabled (workflow_dispatch only).

Your job:
- Add features.
- Fix infra.
- Propose improvements.
