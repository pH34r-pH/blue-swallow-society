# Blue Swallow Society

Blue Swallow Society is a policy-bounded public/cover site and authenticated operator surface. This repository contains the Static Web App, Azure Functions edge layer, Cybermap VM service, Azure infrastructure, paper-only Mosaic & Murmurs automation, and the release-delivery contract for the separate Wardriver repository.

**Source baseline:** `6124e64f8cc4970657a6c060713f97c4f1eb4abd` (`feat(godeye): add policy-bound operator map`), reviewed 2026-07-28. This repository describes source and deployment intent. It does not prove the state of a deployed Azure subscription, DNS, release container, VM, or database. See [System Implementation Delta](./docs/blue-swallow-system-implementation-delta.md).

## Architecture

```text
public browser
  -> app/ public cover and passcode split
  -> /api/validate-passcode
  -> five-minute signed operator token held only in browser module memory
  -> root document fetches and injects the token-gated operator shell
  -> /api/operator-shell (token-gated private HTML)
  -> app/operator/ browser modules
       -> token-gated Functions
            -> HTTPS VM gateway (Caddy)
                 -> loopback Node 24 Cybermap API
                      -> private PostgreSQL/PostGIS

field device
  -> /api/cybermap/observations/batch
  -> HTTPS VM gateway
  -> strict device-token/idempotent ingest
  -> PostgreSQL/PostGIS observation ledger
```

The root cover does not link to the operator shell, operator APIs, or Wardriver artifacts. After passcode validation, the root document holds the short-lived session only in module memory, fetches private HTML, and injects it in place. Direct static operator routes redirect to the root. Static operator JavaScript remains a public Static Web App asset; it is not an authorization boundary.

Godeye uses self-hosted MapLibre, same-origin MVT tiles, and a bounded POST viewport path. Tile data is summary-only and green-source constrained in the VM store. The browser does not connect directly to PostgreSQL and does not persist map observations.

## Runtime boundaries

| Surface | Runtime | Owner |
|---|---|---|
| Repository tooling | Node.js 24 | `.nvmrc` |
| Azure Static Web Apps Functions | Node.js 22 | `app/staticwebapp.config.json`, `api/package.json` |
| Cybermap VM service | Node.js 24 | `vm/cybermap-api/package.json`, `infra/scripts/install-cybermap-api.sh` |
| Paper engine and collectors | Python 3 | `scripts/` |

Do not raise the Functions runtime to Node 24 until Azure Static Web Apps supports it. [Node runtime policy](./docs/node-runtime-policy.md) owns this constraint.

## Repository layout

```text
app/                  public cover, authenticated operator client, self-hosted MapLibre
api/                  Azure Functions routes and shared edge helpers
api/_private/         operator-only HTML and release-delivery material
vm/cybermap-api/      Node HTTP service, stores, migrations, VM contract tests
infra/                Bicep composition, network/database modules, VM installer
scripts/              local collectors and canonical paper-state engine/sync
specs/                Spec Kit feature authorities and verification records
tests/                root Node and Python tests
docs/                 source architecture, contracts, operations, proposals, research
```

## Current source capabilities

- Passcode verification uses a configured SHA-256 digest and independently signed, expiring operator tokens.
- Operator data routes require the signed operator token. The release route validates a manifest and redirects an authorized request to a short-lived HTTPS Blob SAS URL.
- Cybermap edge routes proxy device ingest, POST viewport reads, and MVT cell tiles over HTTPS. The VM validates its own read/device tokens; edge and VM controls are separate.
- IaC defines a Standard Static Web App, VM gateway, public HTTPS ingress, private PostgreSQL Flexible Server networking, release storage, and an optional Azure OpenAI account. The VM installer deploys the Node service behind Caddy and disables the legacy echo systemd service.
- The paper-only engine owns a canonical 3×8, 24-book ledger. Tzeentch reads a valid HTTPS VM snapshot and renders an empty/unavailable state rather than synthetic fallback data.

Deployment/runtime status is deliberately not inferred from this source tree.

## Verification

Run the owning suites from the repository root:

```bash
node --test tests/*.test.mjs
PYTHONPATH=scripts python3 -m unittest discover -s tests -p '*_test.py'
(cd vm/cybermap-api && npm ci && npm test)
git diff --check
```

The root suite is static/contract-oriented. VM PostgreSQL behavior requires a deliberately provisioned PostGIS instance; the in-memory store does not prove a live database deployment.

## Documentation map

- [Architecture decisions](./docs/architecture.md) — current module boundaries, data paths, and known gaps.
- [System Implementation Delta](./docs/blue-swallow-system-implementation-delta.md) — source-only capability matrix and adversarial review baseline.
- [Adversarial Review Repair Guidance](./docs/adversarial-review-repair-guidance.md) — implementation sequence, decision boundaries, and proof conditions for the review findings.
- [VM API](./docs/vm-api.md) — implemented HTTP contract, deployment wiring, and secret boundary.
- [Cybermap Geospatial Backend](./docs/cybermap-geospatial-backend.md) — current Godeye/ingest data boundary and the precise location-handling scope.
- [VM echo compatibility wiring](./docs/vm-echo-wiring.md) — legacy probe route and its current Caddy/Node deployment path.
- [Cybermap API README](./vm/cybermap-api/README.md) — service-local contract and local test/run procedure.
- [Azure Resources](./docs/azure-resources.md) — Bicep topology and GitHub Actions deployment declaration.
- [Tzeentch Paper API Status](./docs/tzeentch-paper-api-status.md) — canonical 24-book read model and unavailable-state behavior.
- [Godeye feature specification](./specs/008-godeye-operator-map/spec.md) — observable behavior; its plan/tests/tasks record implementation evidence.

## Deployment declaration

`.github/workflows/deploy-static-web-app.yml` runs on `main` and manual dispatch. It deploys Bicep, sets required SWA app settings from GitHub secrets, uploads `app/` and `api/`, and attempts custom-domain wiring. Required secret values must never enter this repository, browser bundles, logs, or documentation.

The VM installer currently fetches the repository tarball from the mutable `main` branch. Treat that as a deployment-integrity limitation until it is replaced with a commit-pinned, checksummed release artifact.
