# Personal Site Starter on Azure Static Web Apps + VM Echo Backend

This starter repo gives you:

- A **publicly accessible website** on **Azure Static Web Apps**
- **GitHub Actions CI/CD** for the frontend, managed API, infrastructure, and custom-domain wiring
- A small **Azure Functions proxy API** exposed as `/api/echo`, `/api/profile`, and `/api/agent`
- An **Ubuntu VM** currently hosting a simple echo service; the first authenticated/idempotent Cybermap ingest service now exists in source but is not deployed
- A **Cybermap-first geospatial backend design and P0 ingest implementation** using Azure Database for PostgreSQL Flexible Server B1MS + PostGIS
- A clean place to add **local model experiments** later on the VM
- An optional **Azure OpenAI** account, gated by a single Bicep parameter
- Documentation to evolve toward **Microsoft Entra External ID** for customer sign-up/sign-in later

## Architecture

```text
Browser
  ↓
Azure Static Web App (public face + protected /operator console)
  ↓
/api/* (managed Azure Functions proxy)
  ↓
VM API gateway on Ubuntu (deployed scaffold: echo; source P0: authenticated ingest)
  ↓
Azure Database for PostgreSQL Flexible Server B1MS + PostGIS (target Cybermap store)
```

The browser never calls the VM directly. The frontend calls the Static Web App API, and the API proxies the request to the VM.

The audited implementation-versus-design matrix is maintained in [Blue Swallow Society System Implementation Delta](./docs/blue-swallow-system-implementation-delta.md). It distinguishes deployed, working-tree, prototype, schema-only, and designed-only capabilities across the website, VM/API, and Wardriver.

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
│   ├── agent/
│   ├── operator-downloads/
│   ├── operator-shell/
│   └── _private/
│       ├── downloads/
│       └── operator/
├── app/
│   ├── index.html
│   ├── main.js
│   ├── styles.css
│   ├── operator/
│   │   ├── index.html
│   │   ├── agent.html
│   │   ├── main.js
│   │   ├── agent.js
│   │   ├── styles.css
│   │   └── *.mjs
│   └── staticwebapp.config.json
├── docs/
│   ├── architecture.md
│   ├── ai-options-and-budget.md
│   ├── blue-swallow-system-implementation-delta.md
│   ├── cybermap-geospatial-backend.md
│   ├── wardriver-raid-backend-repair-plan.md
│   ├── external-id-setup-checklist.md
│   ├── mosaic-and-murmurs-operating-doctrine.md
│   ├── mosaic-and-murmurs-s0-sensorium-proposal.md
│   ├── mosaic-and-murmurs-morning-brief-proposal.md
│   ├── mosaic-and-murmurs-morning-brief-implementation.md
│   ├── mosaic-and-murmurs-self-pentest-proposal.md
│   ├── mosaic-and-murmurs-source-expansion-research.md
│   ├── microsoft-layoff-risk-radar.md
│   ├── public-official-political-signal-radar.md
│   ├── crypto-paper-trading-strategy-research.md
│   ├── anti-surveillance-style-research.md
│   ├── tzeentch-paper-api-status.md
│   └── vm-echo-wiring.md
├── config/
│   └── mosaic-murmurs-paper-ledger.json        # paper-only morning brief books/positions
├── infra/
│   ├── main.bicep                  # single entrypoint, composes VM + optional OpenAI
│   ├── custom-domains.bicep        # custom-domain bindings for the Static Web App
│   ├── custom-domains-dns.bicep    # Azure DNS records for apex/www
│   ├── main.parameters.json
│   ├── vm-echo-lab.bicep           # VM + NSG + cloud-init + auto-shutdown
│   └── modules/
│       └── openai.bicep            # optional Azure OpenAI account
├── scripts/
│   ├── local-dev.ps1
│   ├── mosaic-murmurs-morning-brief-collect.py  # public-source morning brief collector
│   ├── print-next-steps.sh
│   ├── wireup-custom-domains.py    # helper script used by CI for custom-domain wiring
│   └── wireup-backend-url.sh
└── vm/
    └── cybermap-api/
        ├── README.md                    # P0 authenticated/idempotent ingest contract
        ├── package.json
        ├── src/                         # HTTP, validation, memory/PostgreSQL stores
        ├── test/
        └── db/migrations/               # ordered PostGIS + ingest migrations
```

## What the website does

The root home page is the **Blue Swallow Society passcode split**: a title, one passcode field, and a lowercase `login` button.
It does not link to, embed, or name the operator console, Wardriver APK, operator APIs, or download artifacts.

The split behavior is server-side:
- the canonical operator passcode is configured only as the GitHub/Azure secret `BLUE_SWALLOW_PASSCODE_SHA256`;
- a matching passcode receives a signed operator session token and opens `/operator`;
- any non-matching passcode falls through to the standard event-planning personal page;
- the standard page currently renders an events calendar, list view, and local-browser supply-claim POC seeded with **The Great Northern Hoot** camping trip at Penrose Point State Park, site 83, July 17–20, 2026;
- no browser bundle contains the canonical passcode literal or hash.

The hidden operator half lives under `/operator` and `/agent`:
- `/operator` ships only a token-aware loader; the real operator shell is served by `/api/operator-shell` from `api/_private/operator/shell.html` after `X-Blue-Swallow-Operator-Token` validation;
- operator data APIs (`/api/wigle`, `/api/agent`, `/api/osint`, `/api/tzeentch`) fail closed inside the Functions layer with `requireOperatorToken`;
- the Wardriver APK is no longer a public static asset and is served only by `/api/operator-downloads/wardriver/*` after the same operator-token check;
- Godeye, Tzeentch, WiGLE, and agent surfaces are lazy-loaded from operator assets only.

The Azure Function proxy at `/api/echo` forwards to the VM using the SWA app setting:
- `BACKEND_ECHO_BASE_URL` → e.g. `http://<vm-public-ip>:8080`

The WiGLE proxy at `/api/wigle` supports:
- `mode=current` → AR current-state path. Reads the device-local WiGLE database/export through `WIGLE_LOCAL_DB_PATH` or `WIGLE_LOCAL_DB_URL`, filters to recent rows (`maxAgeSeconds`, default 45), and orders candidates by signal strength.
- `mode=database` → Godeye/local snapshot path. Reads the same local database/export without AR recency gating.
- `mode=live` → bridge/global fallback. Uses `WIGLE_LIVE_BRIDGE_URL`; direct public WiGLE API lookup is disabled because its search endpoint requires coordinate-bearing URLs.

## Android APK download

The branded Blue Swallow Wardriver debug APK is stored under [`api/_private/downloads/`](./api/_private/downloads/) so it is packaged with Functions, not published as a public static file. Static `/downloads/*` requests return `404`. Operator sessions download through:

- `/api/operator-downloads/wardriver/apk`
- `/api/operator-downloads/wardriver/metadata`

Artifact details:

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
- set GitHub secrets: `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID`, `VM_SSH_PUBLIC_KEY`

### 2. Push to `main`

The **Deploy Infra + App** workflow will:
1. Create the resource group `rg-blue-swallow` if it does not exist.
2. Run `az deployment group create` against `infra/main.bicep` (SWA resource `blue-swallow-swa` + VM echo lab; OpenAI optional).
3. Set `BACKEND_ECHO_BASE_URL`, `BLUE_SWALLOW_PASSCODE_SHA256`, and `BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY` from GitHub/Azure secrets on the Static Web App.
4. Deploy `app/` and `api/` to the Static Web App.
5. Ensure the Azure DNS zone for `blueswallow.net` exists, then wire the apex `blueswallow.net` and `www.blueswallow.net` hostnames through the custom-domain helper script and Azure DNS in `rg-blue-swallow` (the canonical SWA is `blue-swallow-swa`; legacy SWAs `blue-swallow-society` and `wonderful-pond-0623ed81e` have been deleted after cutover). The helper stages the Azure DNS apex A alias and `www` CNAME even before public delegation is live; final SWA custom-domain binding still requires the domain to be registered and delegated at the registrar to the Azure DNS nameservers.

> Current registrar-side prerequisite: `blueswallow.net` must be registered and delegated to the nameservers on the Azure DNS zone for `blueswallow.net`. Azure App Service Domains may reject this subscription as ineligible for domain purchase; if that happens, register the domain with an external registrar and set the registrar nameservers to the Azure DNS zone nameservers. Azure DNS usually propagates within about an hour after registrar delegation, but apex-domain changes can still take up to 72 hours in the worst case.

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
- Operator access uses the passcode-issued token, not SWA Easy Auth, for `/api/wigle`, `/api/agent`, `/api/osint`, `/api/tzeentch`, and `/api/operator-downloads/wardriver/*`. `/api/profile` and `/account/*` remain SWA-authenticated.

Next hardening to consider:
- remove the VM public IP and reach it via private link / VNet integration on the SWA
- swap to Microsoft Entra External ID for customer sign-up/sign-in
- rotate the SWA deployment token quarterly

## AI path

If you want to keep **everything under Azure credits only**, the lowest-risk approach is:
1. **Use local/open models on the VM** for experimentation.
2. **Use Azure OpenAI pay-as-you-go** only for selective calls (`deployOpenAi: true`).
3. Avoid provisioned throughput and fine-tuned hosting early.

