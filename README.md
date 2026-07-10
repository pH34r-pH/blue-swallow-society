# Personal Site Starter on Azure Static Web Apps + VM Echo Backend

This starter repo gives you:

- A **publicly accessible website** on **Azure Static Web Apps**
- **GitHub Actions CI/CD** for the frontend, managed API, infrastructure, and custom-domain wiring
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
│       ├── deploy-static-web-app.yml          # canonical CI: infra + app + custom domains
│       ├── infra-whatif.yml                   # manual what-if (RG scope, OIDC)
│       ├── azure-static-web-apps-wonderful-pond-0623ed81e.yml  # disabled legacy workflow; delete after cutover to blue-swallow-swa
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
│   ├── custom-domains.bicep        # custom-domain bindings for the Static Web App
│   ├── custom-domains-dns.bicep    # Azure DNS records for apex/www
│   ├── main.parameters.json
│   ├── vm-echo-lab.bicep           # VM + NSG + cloud-init + auto-shutdown
│   └── modules/
│       └── openai.bicep            # optional Azure OpenAI account
└── scripts/
    ├── local-dev.ps1
    ├── print-next-steps.sh
    ├── wireup-custom-domains.py    # helper script used by CI for custom-domain wiring
    └── wireup-backend-url.sh
```

## What the website does

The home page includes:
- sign in / sign out buttons (Easy Auth, AAD)
- a protected profile call that hits `/api/profile`
- an **Echo Lab** section that calls `/api/echo`

The Azure Function proxy at `/api/echo` forwards to the VM using the SWA app setting:
- `BACKEND_ECHO_BASE_URL` → e.g. `http://<vm-public-ip>:8080`

The WiGLE proxy at `/api/wigle` supports:
- `mode=current` → AR current-state path. Reads the device-local WiGLE database/export through `WIGLE_LOCAL_DB_PATH` or `WIGLE_LOCAL_DB_URL`, filters to recent rows (`maxAgeSeconds`, default 45), and orders candidates by signal strength.
- `mode=database` → Godeye/local snapshot path. Reads the same local database/export without AR recency gating.
- `mode=live` → bridge/global fallback. Uses `WIGLE_LIVE_BRIDGE_URL`, then `WIGLE_API_NAME` + `WIGLE_API_TOKEN` for the public WiGLE search API when geolocation is available.

The browser does **not** scan Wi-Fi directly and cannot read WiGLE's Android app-private sqlite database by itself. For AR, run a device-local process with file permission and expose JSON to the app, for example:

```bash
python3 scripts/wigle-local-bridge.py --db /path/to/wiglewifi.sqlite --host 127.0.0.1 --port 8787
```

In local development, point the WiGLE endpoint field at `http://127.0.0.1:8787/api/wigle`. In the deployed Static Web App, the production CSP keeps browser calls same-origin; configure `/api/wigle` with a server-reachable `WIGLE_LOCAL_DB_PATH` or `WIGLE_LOCAL_DB_URL` instead of asking the hosted browser to read device-local storage.

## Deployment sequence

The CI pipeline drives everything. You only run shell commands when bootstrapping the GitHub → Azure trust.

### 1. Bootstrap Azure credentials (once)

Follow [.github/workflows/setup-azure-creds.md](.github/workflows/setup-azure-creds.md) to:
- create the `blue-swallow-deployer` service principal scoped to `rg-blue-swallow`
- add an OIDC federated credential for `repo:<you>/blue-swallow-society:ref:refs/heads/main`
- set GitHub secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `VM_SSH_PUBLIC_KEY`

### 2. Push to `main`

The **Deploy Infra + App** workflow will:
1. Create the resource group `rg-blue-swallow` if it does not exist.
2. Run `az deployment group create` against `infra/main.bicep` (SWA resource `blue-swallow-swa` + VM echo lab; OpenAI optional).
3. Set `BACKEND_ECHO_BASE_URL` and the canonical `BLUE_SWALLOW_PASSCODE_SHA256` runtime hash on the Static Web App.
4. Deploy `app/` and `api/` to the Static Web App.
5. Wire the apex `blueswallow.co.in` and `www.blueswallow.co.in` hostnames through the custom-domain helper script and Azure DNS in `rg-blue-swallow` (the DNS zone is referenced as an existing resource in `infra/custom-domains-dns.bicep`; the canonical SWA is `blue-swallow-swa`, and legacy SWAs `blue-swallow-society` and `wonderful-pond-0623ed81e` should be deleted after cutover). The helper stages the Azure DNS apex A alias and `www` CNAME even before public delegation is live; final SWA custom-domain binding still requires the domain to be registered and delegated at the registrar to the Azure DNS nameservers.

> Current registrar-side prerequisite: `blueswallow.co.in` must be registered and its nameservers set to `ns1-09.azure-dns.com`, `ns2-09.azure-dns.net`, `ns3-09.azure-dns.org`, and `ns4-09.azure-dns.info`. Azure DNS usually propagates within about an hour after registrar delegation, but apex-domain changes can still take up to 72 hours in the worst case.

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

