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
- **Azure Functions** for owner authentication, protected operator APIs, and Cybermap proxy routes
- An **Ubuntu VM API gateway** for the authenticated/idempotent Cybermap ingest service
- A **Cybermap-first geospatial backend design and P0 ingest implementation** using Azure Database for PostgreSQL Flexible Server B1MS + PostGIS
- A clean place to add **local model experiments** later on the VM
- An optional **Azure OpenAI** account, gated by a single Bicep parameter
- Documentation to evolve toward **Microsoft Entra External ID** for customer sign-up/sign-in later

## Current source map

Read [`docs/current-source-map.md`](docs/current-source-map.md) before changing
the companion dashboard, entity workbench, observation ingest, release delivery,
or paper runtime. It separates implemented source from deployment evidence and
physical-device acceptance. The dated implementation delta remains an immutable
historical audit, not current deployment proof.

## Architecture

```text
Browser / Wardriver
  ↓
Azure Static Web App (owner sign-in + private /operator companion)
  ↓
/api/* (managed Azure Functions proxy)
  ↓
VM API gateway on Ubuntu (authenticated Cybermap ingest)
  ↓
Azure Database for PostgreSQL Flexible Server B1MS + PostGIS (target Cybermap store)
```

The browser never calls the VM directly. Owner sessions use Microsoft Entra
authorization-code/PKCE and a short-lived Secure HttpOnly cookie; Functions
validates the owner/scopes before proxying. A source implementation or passing
test does not prove that Azure resources, migrations, identity settings, or
device flows are deployed.

The [Blue Swallow Society System Implementation Delta](./docs/blue-swallow-system-implementation-delta.md) is a dated historical audit with explicit source reconciliations; it is not deployment proof. Current source-state documentation is [`docs/current-source-map.md`](docs/current-source-map.md) and [`docs/static-web-app-functionality.md`](docs/static-web-app-functionality.md), with Cybermap route contracts in the Functions and their tests.

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
│       └── operator/                   # shell/assets; release bytes stay in private Blob storage
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

The root home page is the **Blue Swallow owner sign-in**: a title, session status,
and Microsoft sign-in button. `/api/owner-auth` verifies the exact configured
tenant, client audience, and owner object before issuing a five-minute signed
owner session. The legacy passcode handler remains only as a retired compatibility
route and returns `410` in Entra mode; it is not the current login flow.

The private companion half lives under `/operator`:

- the public route ships only a loader; the shell comes from
  `api/_private/operator/shell.html` after owner-session validation, then the
  loader fetches a fixed allowlist from `/api/operator-assets/{asset}`;
- Travels/history, nearby Cybermap, Entities, World, and Devices have separate
  controllers and teardown paths;
- entity reads require `Owner.Read`, while corrections require the explicit
  Entra `Entities.Write` flow with preview and optimistic revision checks;
- operator data APIs fail closed inside Functions before any VM/private read.

The WiGLE proxy at `/api/wigle` supports:

- `mode=current` → AR current-state path. Reads the device-local WiGLE database/export through `WIGLE_LOCAL_DB_PATH` or `WIGLE_LOCAL_DB_URL`, filters to recent rows (`maxAgeSeconds`, default 45), and orders candidates by signal strength.
- `mode=database` → Godeye/local snapshot path. Reads the same local database/export without AR recency gating.
- `mode=live` → bridge/global fallback. Uses `WIGLE_LIVE_BRIDGE_URL`; direct public WiGLE API lookup is disabled because its search endpoint requires coordinate-bearing URLs.

## Android release delivery

The current release is not stored in this repository or under a public static
path. The authenticated Devices surface reads a private `latest.json` release
manifest and exposes only:

- `/api/operator-downloads/wardriver/apk`
- `/api/operator-downloads/wardriver/metadata`

The manifest must validate as a release build for
`co.blueswallow.wardriver`, bind `sourceTag` to `versionName`, bind the immutable
Blob path to source commit and filename, and carry artifact/signer SHA-256,
source commit, source tag, build run, and publication time. The APK route returns
a five-minute HTTPS read-only Blob SAS or a redirect; it never serves tracked
bytes. Wardriver’s Android settings client reads metadata only and does not
download or install an update automatically. Live manifest/artifact state and
physical installation remain separate acceptance evidence.

The browser does **not** scan Wi-Fi directly or read an Android app-private
SQLite database. Wardriver owns local radio collection, authenticated upload,
and its ARCore/LiteRT camera feature. Society’s browser helpers parse/render
bounded data only; they do not establish physical AR, RF association, or device
behavior.

For a separate local lab bridge, the historical helper remains available:

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
- Operator access uses the short-lived owner/operator session, not anonymous SWA
  route roles, for `/api/operator-signals`, `/api/cybermap/*`, `/api/osint`,
  `/api/tzeentch`, and release routes. `/api/operator-assets/{asset}` is a fixed
  private allowlist; owner/API scopes are revalidated before backend reads.

Next hardening to consider:

- remove the VM public IP and reach it via private link / VNet integration on the SWA
- swap to Microsoft Entra External ID for customer sign-up/sign-in
- rotate the SWA deployment token quarterly

## AI path

If you want to keep **everything under Azure credits only**, the lowest-risk approach is:

1. **Use local/open models on the VM** for experimentation.
2. **Use Azure OpenAI pay-as-you-go** only for selective calls (`deployOpenAi: true`).
3. Avoid provisioned throughput and fine-tuned hosting early.
