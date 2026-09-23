# Blue Swallow Society on Azure Static Web Apps + Cybermap Backend

Deployment ownership is moving to the private Wardriver repository. The new
[public CI and source handoff](docs/public-ci-handoff.md) validates Society code
for that path. The legacy public Azure workflow is manual and main-only during
migration; normal commits no longer reapply infrastructure. Its authority will
be removed after the private Wardriver deployment passes the cutover gates.

Current public site: **https://blueswallow.ph34r.dev** (the existing default Azure Static Web Apps hostname remains reachable). Fleet delegates the `ph34r.dev` child label; private Wardriver owns its DNS, SWA binding, VM gateway, release CORS and deployment authority. Society owns the app, Functions, Cybermap runtime and public validation. The separate device-ingest gateway is `https://mtls.blueswallow.ph34r.dev:8443`; installed Android clients retain their existing compiled VM origin until Wardriver's verified migration.

This repository gives you:

- A **publicly accessible website** on **Azure Static Web Apps**
- **Credential-free public GitHub Actions CI** for the frontend, managed API, and Cybermap runtime
- **Azure Functions** for the passcode split, protected operator APIs, and Cybermap proxy routes
- An **Ubuntu VM API gateway** for the authenticated/idempotent Cybermap ingest service
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
VM API gateway on Ubuntu (authenticated Cybermap ingest)
  ↓
Azure Database for PostgreSQL Flexible Server B1MS + PostGIS (target Cybermap store)
```

The browser never calls the VM directly. The frontend calls the Static Web App API, and the API proxies the request to the VM.

The [Blue Swallow Society System Implementation Delta](./docs/blue-swallow-system-implementation-delta.md) is a dated historical audit with explicit source reconciliations; it is not deployment proof. Current source-state documentation is `docs/static-web-app-functionality.md`, with Cybermap route contracts in the Functions and their tests.

---

## Repo Layout

```text
.
├── .github/
│   ├── copilot-instructions.md
│   └── workflows/
│       ├── deploy-static-web-app.yml          # temporary manual recovery path
│       ├── infra-whatif.yml                   # manual what-if (RG scope, OIDC)
│       ├── azure-static-web-apps-wonderful-pond-0623ed81e.yml  # disabled legacy workflow; delete after cutover to blue-swallow-swa
│       └── setup-azure-creds.md
├── api/
│   ├── profile/
│   ├── operator-assets/
│   ├── operator-downloads/
│   ├── operator-shell/
│   └── _private/
│       ├── downloads/
│       └── operator/assets/
├── app/
│   ├── index.html
│   ├── main.js
│   ├── styles.css
│   ├── operator/
│   │   ├── index.html
│   │   ├── loader.css
│   │   └── loader.js
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
│   ├── vm-echo-wiring.md              # historical retired-path record
├── config/
│   └── mosaic-murmurs-paper-ledger.json        # paper-only morning brief books/positions
├── infra/
│   ├── main.bicep                  # single entrypoint, composes VM + optional OpenAI
│   ├── custom-domains.bicep        # legacy deployable snapshot; private Wardriver owns live binding
│   ├── custom-domains-dns.bicep    # legacy unowned-domain snapshot; do not deploy
│   ├── main.parameters.json
│   ├── vm-echo-lab.bicep           # legacy-named VM API gateway + NSG + auto-shutdown
│   └── modules/
│       └── openai.bicep            # optional Azure OpenAI account
├── scripts/
│   ├── local-dev.ps1
│   ├── mosaic-murmurs-morning-brief-collect.py  # public-source morning brief collector
│   ├── print-next-steps.sh
│   ├── wireup-custom-domains.py    # legacy helper; current DNS is private Wardriver-owned
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

The hidden operator half lives under `/operator`:
- `/operator` ships only a token-aware loader; the real operator shell is served by `/api/operator-shell` from `api/_private/operator/shell.html` after `X-Blue-Swallow-Operator-Token` validation, then loads allowlisted private assets from `/api/operator-assets/{asset}` with a short-lived cookie grant;
- operator data APIs (`/api/wigle`, `/api/osint`, `/api/tzeentch`) fail closed inside the Functions layer with `requireOperatorToken`;
- the Wardriver APK is no longer a public static asset and is served only by `/api/operator-downloads/wardriver/*` after the same operator-token check;
- Godeye, Tzeentch, and WiGLE surfaces are lazy-loaded from token-gated operator assets only.

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

## Development and deployment

Pull requests and `main` run [Society public CI](docs/public-ci-handoff.md) on free GitHub runners without Azure permissions. Society commits do not automatically apply Azure infrastructure. The intended private Wardriver promoter will check both named CI jobs on one exact Society main SHA, independently verify its archive digest, and deploy the app/Functions and VM runtime from that immutable source. Work and acceptance are tracked in [Wardriver #46](https://github.com/pH34r-pH/blue-swallow-wardriver/issues/46), [Wardriver #47](https://github.com/pH34r-pH/blue-swallow-wardriver/issues/47), and [Society #53](https://github.com/pH34r-pH/blue-swallow-society/issues/53).

Until that private path passes production probes, an operator can manually dispatch the legacy **Deploy Infra + App** workflow from `main` for recovery. It is a broad resource-group/VM deployment, not the routine source path. A full run can restore the historical Caddyfile and the old Blob CORS origins. After such a recovery, use [Wardriver's guarded domain steps](https://github.com/pH34r-pH/blue-swallow-wardriver/tree/main/infra/dns) to reapply its mTLS SNI and current `release-cors.bicep` overlay after the full infrastructure deployment, then verify both hosts and operator flows. Do not run the old `.net` domain-wiring helper or recreate an unowned zone. Public Azure credentials and manual workflow remain only until private parity and rollback are proven; [Society #53](https://github.com/pH34r-pH/blue-swallow-society/issues/53) tracks their removal.

The [dated infrastructure specification](docs/azure-resources.md) describes the former public deployment and its old domain assumptions. Current Azure DNS authority and validation evidence are in Wardriver's `infra/dns` runbook. The default SWA hostname and old VM hostname remain available during the Android compatibility window.

## Notes on security

This scaffold is intentionally simple so you can focus on experiments.

The VM API gateway exposes HTTPS only; the retired echo service is not deployed or routed. Hardening steps already supported:

- `allowedSourceIp` parameter restricts SSH to your CIDR.
- Daily auto-shutdown schedule (DevTestLab) caps idle cost.
- SWA `globalHeaders` set CSP, HSTS, `X-Content-Type-Options`, `X-Frame-Options`, and `Referrer-Policy`.
- Operator access uses the passcode-issued token, not SWA Easy Auth, for `/api/wigle`, `/api/osint`, `/api/tzeentch`, and `/api/operator-downloads/wardriver/*`. `/api/operator-assets/{asset}` additionally requires a short-lived asset-grant cookie. `/api/profile` and `/account/*` remain SWA-authenticated.

Next hardening to consider:
- remove the VM public IP and reach it via private link / VNet integration on the SWA
- swap to Microsoft Entra External ID for customer sign-up/sign-in
- rotate the SWA deployment token quarterly

## AI path

If you want to keep **everything under Azure credits only**, the lowest-risk approach is:
1. **Use local/open models on the VM** for experimentation.
2. **Use Azure OpenAI pay-as-you-go** only for selective calls (`deployOpenAi: true`).
3. Avoid provisioned throughput and fine-tuned hosting early.
