# Blue Swallow Society System Implementation Delta

**Review timestamp:** 2026-07-28 PDT
**Source baseline:** `6124e64f8cc4970657a6c060713f97c4f1eb4abd` on `feat/godeye-operator-map`
**Method:** local source, Graphify query, static configuration/dependency review, and local test execution recorded below

## Evidence boundary

This is a **source review**, not a cloud or field deployment audit. It establishes what this repository implements or declares. It does not prove Azure resource state, GitHub workflow completion, DNS, database migration execution, VM service health, release availability, Android scanner integration, or live public feeds.

Use these terms precisely:

| Status | Meaning |
|---|---|
| **Implemented in source** | Code and/or IaC exists in this repository. |
| **Verified locally** | A command in this review completed successfully; receipt is named below. |
| **Declared by IaC** | Bicep/workflow defines the resource or deployment action. |
| **Runtime unverified** | This review has no external runtime receipt. |
| **Designed only** | A proposal/spec exists without the corresponding executable path. |

## Executive verdict

The repository is a coherent multi-surface system rather than an echo-site starter:

```text
public cover -> passcode Function -> operator session -> protected shell/API
field device -> Functions batch proxy -> HTTPS VM gateway -> Cybermap API -> PostGIS
local paper engine -> authenticated paper-state API -> Tzeentch read adapter
```

The strongest seams are the explicit Static Web App / Function / VM / database layers, token revalidation at both edge and VM, strict idempotent observation ingestion, bounded Godeye MVT/viewport behavior, and immutable-release manifest validation.

The primary risks are not absent architecture. They are **runtime evidence gaps and boundary erosion**: deployment uses a mutable source archive, the operator client keeps bearer material in `sessionStorage`, the edge serializes validated viewport coordinates into its upstream URL, passcode throttling is per Function instance, static operator modules remain publicly enumerable, and several large UI/API modules carry too many concerns.

## Source capability matrix

| Capability | Source state | Primary evidence |
|---|---|---|
| Public cover and passcode split | Implemented in source | `app/index.html`, `app/main.js`, `api/validate-passcode/index.js` |
| Operator token/cookie verification | Implemented in source | `api/_lib/operator-auth.js` |
| Private operator shell | Implemented in source | `api/operator-shell/index.js`, `api/_private/operator/shell.html` |
| Operator JavaScript concealment | Partial | `app/staticwebapp.config.json` permits anonymous `/operator/*` static assets; client guard is not access control. |
| Wardriver release delivery | Implemented in source | `api/operator-downloads/index.js`, `api/_lib/wardriver-release-store.js`, `infra/modules/wardriver-release-storage.bicep` |
| Godeye policy-bound map | Implemented in source | `app/operator/godeye-*.mjs`, `api/cybermap-tiles`, `api/cybermap-viewport`, feature `008` artifacts |
| Device observation batch edge transport | Implemented in source | `api/cybermap-observations-batch/index.js` |
| VM Cybermap ingest, viewport, tiles | Implemented in source | `vm/cybermap-api/src/server.mjs`, `postgres-store.mjs` |
| PostGIS schema and migrations | Implemented in source | `vm/cybermap-api/db/migrations/0001`–`0003` |
| VM + private PostgreSQL topology | Declared by IaC | `infra/main.bicep`, `infra/modules/*`, `infra/vm-echo-lab.bicep` |
| VM install and Caddy gateway | Declared by IaC | `infra/scripts/install-cybermap-api.sh` |
| Canonical 3×8 paper ledger | Implemented in source | `scripts/mosaic_murmurs_paper_engine.py`, `api/paper-state`, VM paper-state route |
| Tzeentch canonical read adapter | Implemented in source | `api/tzeentch/index.js`, `app/operator/tzeentch*.mjs` |
| Live Cybermap/PG/VM deployment | Runtime unverified | Requires external receipts; none are in this review. |
| Wardriver scanner-to-batch exporter | Outside this repository / runtime unverified | Requires review of the Wardriver repository and a field receipt. |
| Device enrollment, Keystore, and WorkManager ownership | Outside this repository / runtime unverified | Requires review of the Wardriver repository. |
| Broader narrative, source-catalog, session, entity APIs | Designed only | Proposed in older docs; no handlers in `vm/cybermap-api/src/server.mjs`. |

## Adversarial findings — source repair status

### P0 — mutable VM deployment artifact

**Resolved in source:** `infra/main.bicep` now requires an immutable full commit revision, archive URL, and SHA-256 digest. The deployment workflow computes the archive digest for `GITHUB_SHA`; the installer validates revision/URL agreement and digest before extraction or migrations, then writes a release receipt. The current limitation is operational: no deployed-VM receipt is asserted here.

**Source evidence:** `infra/main.bicep`, `infra/vm-echo-lab.bicep`, `.github/workflows/deploy-static-web-app.yml`, and `infra/scripts/install-cybermap-api.sh`.

### P1 — operator bearer token remains script-readable

**Resolved in source:** a five-minute signed operator token is retained only in `app/operator/operator-session.mjs` module memory. Issuance no longer sets a browser cookie; incrementing `BLUE_SWALLOW_OPERATOR_TOKEN_VERSION` invalidates all prior tokens. Static operator assets remain public and are not treated as an authorization boundary.

**Source evidence:** `api/_lib/operator-auth.js`, `api/validate-passcode/index.js`, `app/main.js`, and `app/operator/operator-session.mjs`.

### P1 — passcode throttling is instance-local

**Resolved in source:** `api/_lib/passcode-rate-limit.js` uses a dedicated Azure Table counter keyed by a one-way caller hash, with bounded conditional-update retries and reset-on-success. Missing shared storage fails only passcode validation closed.

**Source evidence:** `infra/modules/passcode-rate-limit-storage.bicep`, `api/_lib/passcode-rate-limit.js`, and `api/validate-passcode/index.js`.

### P1 — precise viewport coordinates cross the edge/VM boundary in a URL

**Resolved in source:** both Browser→Function and Function→VM reads use authenticated JSON POST bodies. The VM rejects query-bearing viewport requests and the legacy GET/query route no longer succeeds.

**Source evidence:** `api/_lib/cybermap-backend.js`, `api/cybermap-viewport/index.js`, `vm/cybermap-api/src/server.mjs`, and `vm/cybermap-api/src/viewport.mjs`.

### P1 — operator asset names remain public

The root does not link operator material and private shell HTML is token-gated. However, `/operator/*` static assets are permitted for anonymous delivery, so guessed module URLs disclose operator route names and client behavior. This is information disclosure, not a data/API authorization bypass.

**Required repair:** explicitly accept this as non-secret client code, or deliver a protected bundle/shell architecture. Do not document the current surface as hidden by path alone.

### P2 — module-size and ownership drift risk

`app/operator/main.js` (~1,946 lines), `app/operator/tzeentch.mjs` (~1,706), `api/tzeentch/index.js` (~1,020), and `vm/cybermap-api/src/server.mjs` (~707) combine several responsibilities. Tests are present, but a small feature change can cross UI lifecycle, transport, parsing, and policy seams.

**Required repair:** extract narrow controllers/services with contracts: operator session transport, tab lifecycle, Godeye feed, AR feed, Tzeentch projection, public-feed adapters, canonical-state adapter, and VM route modules. Preserve current tests at each seam before extraction.

### P2 — edge route imports browser implementation

`api/wigle/index.js` dynamically imports `app/operator/wigle.mjs` by path. This reverses the intended dependency direction: an Azure Function deployment now depends on a browser module's location and compatibility.

**Required repair:** extract the shared data parser/model into a runtime-neutral module with focused tests. Let the browser and Function import that module; neither should import the other.

### P2 — documentation authority had drifted from implementation

Repository docs previously described a legacy echo-only VM, a three-book Tzeentch ledger, public 8080 ingress, and a source-only Cybermap service despite current IaC and handler implementation. This review updates the README, architecture, Cybermap backend, VM API, VM echo wiring, service README, Azure topology, paper API status, and this delta. Proposal documents remain proposals unless their own source authority is updated.

## What is sound

- Edge and backend require separate credentials for map reads; the VM does not trust the edge token alone.
- Tile paths reject query strings, constrain coordinates/zoom, use no-store responses, and select summary-only MVT data.
- Viewport coordinates are accepted from a Function POST body, not the browser URL. The current Function-to-VM hop uses a location-bearing upstream query and needs the P1 repair above.
- Device ingest preserves idempotency identity through edge forwarding and revalidates it in the VM store.
- The release path validates manifest identity and generates short-lived HTTPS read-only SAS URLs only after operator authorization.
- The paper-state reader rejects invalid/unavailable state rather than manufacturing a demo ledger.
- Functions remain on Node 22 while VM/repository tooling use Node 24, with a dedicated regression test guarding the boundary.

## Verification receipts

Local verification for this review is appended after the documentation change. A clean source-tree claim requires all of:

```bash
node --test tests/*.test.mjs
PYTHONPATH=scripts python3 -m unittest discover -s tests -p '*_test.py'
(cd vm/cybermap-api && npm ci && npm test)
git diff --check
```

Graphify is refreshed separately. Its current code graph is a local architectural aid; a documentation-only refresh is not a semantic documentation extraction unless an approved backend is used.

### 2026-07-28 local verification receipt

- Root Node suite: `151` passed, `0` failed — `node --test tests/*.test.mjs`.
- Python suite: `55` passed — `PYTHONPATH=scripts python3 -m unittest discover -s tests -p '*_test.py'`.
- VM Cybermap suite: `41` passed, `0` failed — `npm test` in `vm/cybermap-api` using the existing local dependency tree.
- Documentation: local Markdown links for the nine refreshed documents resolved; `git diff --check` passed.
- Graphify: `graphify update .` rebuilt the local code graph to `4,744` nodes and `10,826` links. Its output explicitly did not semantically re-extract documentation.

## Next honest milestone

Call the Cybermap path operational only when receipts prove this exact vertical slice:

1. a commit-pinned VM artifact deploys and its checksum is verified;
2. migrations `0001`–`0003` apply to a protected PostGIS instance;
3. an enrolled device submits a valid batch and an exact retry returns the durable receipt;
4. an authenticated operator receives both a bounded viewport response and a green-only tile from that store;
5. the release manifest/artifact checksums are verified; and
6. rollback and runtime health receipts are retained.

Until then, the repository contains a strong source architecture and contract suite, not proof of a running field intelligence system.
