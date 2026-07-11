# Blue Swallow Society on Azure Static Web Apps + Cybermap VM Gateway

This starter repo gives you:

- A **publicly accessible website** on **Azure Static Web Apps**
- **GitHub Actions CI/CD** for the frontend, managed API, infrastructure, and custom-domain wiring
- A small **Azure Functions API** for profile, agent, OSINT, Tzeentch, and future Cybermap proxy routes
- An **Ubuntu VM** hosting the Node 20 Cybermap API gateway scaffold behind HTTPS 443
- A **private Cybermap datastore** on Azure Database for PostgreSQL Flexible Server B1MS + PostGIS
- A clean place to add **local model experiments** later on the VM
- An optional **Azure OpenAI** account, gated by a single Bicep parameter
- Documentation to evolve toward **Microsoft Entra External ID** for customer sign-up/sign-in later

## Architecture

```text
Browser
  ↓
Azure Static Web App (public frontend: Godeye/Tzeentch)
  ↓
/api/* (managed Azure Functions proxy)
  ↓
VM API gateway on Ubuntu (nginx HTTPS 443 -> cybermap-api localhost:8000)
  ↓
PgBouncer on localhost:6432
  ↓
Azure Database for PostgreSQL Flexible Server B1MS + PostGIS (private Cybermap store)
```

The browser never calls PostgreSQL directly. The frontend calls the Static Web App API, and the API proxies product requests to the VM gateway.

---

## Repo Layout
```text
.
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/
│       ├── deploy-static-web-app.yml          # canonical CI: infra + app + custom domains
│       ├── infra-whatif.yml                   # manual what-if (RG scope, OIDC)
│       ├── azure-static-web-apps-wonderful-pond-0623ed81e.yml  # disabled legacy workflow; legacy SWAs deleted after cutover
│       └── setup-azure-creds.md
├── api/
│   ├── profile/
│   ├── agent/
│   ├── osint/
│   └── tzeentch/
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
│   ├── azure-resources.md
│   ├── cybermap-geospatial-backend.md
│   ├── external-id-setup-checklist.md
│   ├── mosaic-and-murmurs-operating-doctrine.md
│   ├── mosaic-and-murmurs-s0-sensorium-proposal.md
│   ├── vm-api.md
│   └── vm-echo-wiring.md            # historical echo note; not product wiring
├── infra/
│   ├── main.bicep                  # single entrypoint, composes SWA + network + VM + PostgreSQL + optional OpenAI
│   ├── custom-domains.bicep        # custom-domain bindings for the Static Web App
│   ├── custom-domains-dns.bicep    # Azure DNS records for apex/www
│   ├── main.parameters.json
│   ├── vm-echo-lab.bicep           # historical filename; Cybermap VM gateway + NSG + cloud-init
│   └── modules/
│       ├── network.bicep           # shared VNet, VM subnet, delegated PostgreSQL subnet, private DNS
│       ├── postgres-flexible.bicep # private PostgreSQL Flexible Server B1MS datastore
│       └── openai.bicep            # optional Azure OpenAI account
└── scripts/
    ├── cybermap-logical-backup.sh  # optional disabled-by-default pg_dump -> Blob export helper
    ├── local-dev.ps1
    ├── print-next-steps.sh
    ├── wireup-custom-domains.py    # helper script used by CI for custom-domain wiring
    └── wireup-backend-url.sh
```

## What the website does

The home page includes:
- sign in / sign out buttons (Easy Auth, AAD)
- a protected profile call that hits `/api/profile`
- same-origin operator/API calls through the Static Web App
- Cybermap VM gateway wiring via `BACKEND_API_BASE_URL` for future `/api/v1/*` proxy routes

The WiGLE proxy at `/api/wigle` supports:
- `mode=current` → AR current-state path. Reads the device-local WiGLE database/export through `WIGLE_LOCAL_DB_PATH` or `WIGLE_LOCAL_DB_URL`, filters to recent rows (`maxAgeSeconds`, default 45), and orders candidates by signal strength.
- `mode=database` → Godeye/local snapshot path. Reads the same local database/export without AR recency gating.
- `mode=live` → bridge/global fallback. Uses `WIGLE_LIVE_BRIDGE_URL`, then `WIGLE_API_NAME` + `WIGLE_API_TOKEN` for the public WiGLE search API when geolocation is available.

## Android APK download

The Static Web App publishes the branded Blue Swallow Wardriver debug APK from [`app/downloads/blue-swallow-wardriver-2.109-bss.1-debug.apk`](./app/downloads/blue-swallow-wardriver-2.109-bss.1-debug.apk). The landing page links to the APK and [`blue-swallow-wardriver.json`](./app/downloads/blue-swallow-wardriver.json) for checksum verification.

- Package: `co.blueswallow.wardriver`
- Version: `2.109-bss.1` / versionCode `310`
- SHA-256: `f50d2dcf726ef52297968e1a0af9119c7569b7692e1813d70a1ed0274ba95a0e`

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
- set GitHub secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `VM_SSH_PUBLIC_KEY`, `POSTGRES_ADMIN_PASSWORD`

### 2. Push to `main`

The **Deploy Infra + App** workflow will:
1. Create the resource group `rg-blue-swallow` if it does not exist.
2. Run `az deployment group create` against `infra/main.bicep` (SWA resource `blue-swallow-swa` + shared VNet + Cybermap VM API gateway + private PostgreSQL B1MS; OpenAI optional).
3. Set `BACKEND_API_BASE_URL` and the canonical `BLUE_SWALLOW_PASSCODE_SHA256` runtime hash on the Static Web App.
4. Deploy `app/` and `api/` to the Static Web App.
5. Wire the apex `blueswallow.co.in` and `www.blueswallow.co.in` hostnames through the custom-domain helper script and Azure DNS in `rg-blue-swallow` (the DNS zone is referenced as an existing resource in `infra/custom-domains-dns.bicep`; the canonical SWA is `blue-swallow-swa`; legacy SWAs `blue-swallow-society` and `wonderful-pond-0623ed81e` have been deleted after cutover). The helper stages the Azure DNS apex A alias and `www` CNAME even before public delegation is live; final SWA custom-domain binding still requires the domain to be registered and delegated at the registrar to the Azure DNS nameservers.

> Current registrar-side prerequisite: `blueswallow.co.in` must be registered and its nameservers set to `ns1-09.azure-dns.com`, `ns2-09.azure-dns.net`, `ns3-09.azure-dns.org`, and `ns4-09.azure-dns.info`. Azure DNS usually propagates within about an hour after registrar delegation, but apex-domain changes can still take up to 72 hours in the worst case.

### 3. (Optional) Enable Azure OpenAI

Set `deployOpenAi` to `true` in [`infra/main.parameters.json`](./infra/main.parameters.json) and re-run the workflow.

### 4. (Optional) Tighten access

Replace `"allowedSourceIp": "*"` with your developer IP `/32` to restrict direct SSH. The Cybermap product ingress is HTTPS 443 with API-layer auth hooks. The VM auto-shutdown defaults to 02:00 Pacific to cap cost for dev, but public Godeye must either disable it or surface a clear offline/degraded UI state.

## Notes on security

This scaffold is intentionally simple so you can focus on experiments.

For the VM starter, nginx exposes HTTPS 443 and proxies to `cybermap-api` on `localhost:8000`; 8080 is not product ingress. Hardening steps already supported:

- `allowedSourceIp` parameter restricts SSH to your CIDR (default `*` is open and should be tightened).
- Daily auto-shutdown schedule (DevTestLab) caps idle dev cost.
- SWA `globalHeaders` set CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`.
- Authentication uses Easy Auth (AAD) with `/api/profile` requiring an authenticated principal.
- PostgreSQL Flexible Server is private VNet-only (`publicNetworkAccess: Disabled`) on the delegated `postgres-subnet`; browsers never receive database credentials.
- The PostgreSQL admin password is supplied through `POSTGRES_ADMIN_PASSWORD`, not committed in `infra/main.parameters.json` or emitted as an output.
- PgBouncer on the VM uses transaction pooling so app bursts do not fan out into unsafe B1MS server connections.

Next hardening to consider:
- remove the VM public IP and reach it via private link / VNet integration on the SWA
- swap to Microsoft Entra External ID for customer sign-up/sign-in
- rotate the SWA deployment token quarterly
- wire Log Analytics / alerts once public Godeye runs continuously

## AI path

If you want to keep **everything under Azure credits only**, the lowest-risk approach is:
1. **Use local/open models on the VM** for experimentation.
2. **Use Azure OpenAI pay-as-you-go** only for selective calls (`deployOpenAi: true`).
3. Avoid provisioned throughput and fine-tuned hosting early.
