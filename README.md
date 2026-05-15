# Personal Site Starter on Azure Static Web Apps + VM Echo Backend

This starter repo gives you:

- A **publicly accessible website** on **Azure Static Web Apps**
- **GitHub Actions CI/CD** for the frontend, managed API, and infrastructure
- A small **Azure Functions proxy API** exposed as `/api/echo`, `/api/profile`, and `/api/agent`
- An **Ubuntu VM** that hosts a simple **echo service**, bootstrapped via cloud-init
- A clean place to add **local model experiments** later on the VM
- An optional **Azure OpenAI** account, gated by a single Bicep parameter
- Documentation to evolve toward **Microsoft Entra External ID** for customer sign-up/sign-in later

## Architecture

```text
Browser
  ↓
Azure Static Web App (public frontend)
  ↓
/api/* (managed Azure Functions: echo, profile, agent)
  ↓
VM-hosted echo service on Ubuntu (Bicep + cloud-init)
```

The browser never calls the VM directly. The frontend calls the Static Web App API, and the API proxies the request to the VM.

---

## Repo Layout

```text
.
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/
│       ├── deploy-static-web-app.yml          # canonical CI: infra + app
│       ├── infra-whatif.yml                   # manual what-if (RG scope, OIDC)
│       ├── azure-static-web-apps-wonderful-pond-0623ed81e.yml  # disabled
│       └── setup-azure-creds.md
├── api/
│   ├── echo/
│   ├── profile/
│   └── agent/
├── app/
│   ├── index.html
│   ├── agent.html
│   ├── main.js
│   ├── agent.js
│   ├── styles.css
│   └── staticwebapp.config.json
├── docs/
│   ├── architecture.md
│   ├── ai-options-and-budget.md
│   ├── external-id-setup-checklist.md
│   └── vm-echo-wiring.md
├── infra/
│   ├── main.bicep                  # single entrypoint, composes VM + optional OpenAI
│   ├── main.parameters.json
│   ├── vm-echo-lab.bicep           # VM + NSG + cloud-init + auto-shutdown
│   └── modules/
│       └── openai.bicep            # optional Azure OpenAI account
└── scripts/
    ├── local-dev.ps1
    ├── print-next-steps.sh
    └── wireup-backend-url.sh
```

## What the website does

The home page includes:
- sign in / sign out buttons (Easy Auth, AAD)
- a protected profile call that hits `/api/profile`
- an **Echo Lab** section that calls `/api/echo`

The Azure Function proxy at `/api/echo` forwards to the VM using the SWA app setting:
- `BACKEND_ECHO_BASE_URL` → e.g. `http://<vm-public-ip>:8080`

The proxy appends `/echo?msg=...` to that base, matching the path the VM cloud-init service serves.

## Deployment sequence

The CI pipeline drives everything. You only run shell commands when bootstrapping the GitHub → Azure trust.

### 1. Bootstrap Azure credentials (once)

Follow [.github/workflows/setup-azure-creds.md](.github/workflows/setup-azure-creds.md) to:
- create the `blue-swallow-deployer` service principal scoped to `rg-blue-swallow`
- add an OIDC federated credential for `repo:<you>/blue-swallow-society:ref:refs/heads/main`
- set GitHub secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `AZURE_STATIC_WEB_APPS_API_TOKEN`, `VM_SSH_PUBLIC_KEY`

### 2. Push to `main`

The **Deploy Infra + App** workflow will:
1. Create the resource group `rg-blue-swallow` if it does not exist.
2. Run `az deployment group create` against `infra/main.bicep` (SWA + VM echo lab; OpenAI optional).
3. Set `BACKEND_ECHO_BASE_URL` on the Static Web App using the Bicep output.
4. Deploy `app/` and `api/` to the Static Web App.

### 3. (Optional) Enable Azure OpenAI

Set `deployOpenAi` to `true` in [`infra/main.parameters.json`](./infra/main.parameters.json) and re-run the workflow.

### 4. (Optional) Tighten access

Replace `"allowedSourceIp": "*"` with your developer IP `/32` to restrict the VM NSG to SSH + 8080 from your address only. The VM auto-shutdown defaults to 02:00 Pacific to cap cost.

## Notes on security

This scaffold is intentionally simple so you can focus on experiments.

For the VM starter, the echo service listens on a public IP and port 8080. That is **good for short experiments**, but not the hardened end state. Hardening steps already supported:

- `allowedSourceIp` parameter restricts the NSG to your CIDR (default `*` is open).
- Daily auto-shutdown schedule (DevTestLab) caps idle cost.
- SWA `globalHeaders` set CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`.
- Authentication uses Easy Auth (AAD) with `/api/profile` requiring an authenticated principal.

Next hardening to consider:
- remove the VM public IP and reach it via private link / VNet integration on the SWA
- swap to Microsoft Entra External ID for customer sign-up/sign-in
- rotate the SWA deployment token quarterly

## AI path

If you want to keep **everything under Azure credits only**, the lowest-risk approach is:
1. **Use local/open models on the VM** for experimentation.
2. **Use Azure OpenAI pay-as-you-go** only for selective calls (`deployOpenAi: true`).
3. Avoid provisioned throughput and fine-tuned hosting early.

