# Implementation Plan: Godeye Global Map Source Integration

**Branch**: `kanban/godeye-global-map-source-integration`
**Reconciled**: 2026-07-25
**Spec**: [spec.md](./spec.md)

## Goal

Ship the already implemented operator-only Global Godeye read path with a complete, source-accurate documentation package. Preserve all three initial provider candidates as fixture-only, disabled infrastructure until independent policy and operational evidence exists.

## Architecture

```text
fixture-only source normalizer
  -> injected bounded worker test harness
  -> normalized snapshots
  -> H3 5/7/9/11 materialization
  -> append-only observations + source_fetch_runs + cybermap_cells
  -> VM POST /api/v1/cybermap/global-viewport
  -> SWA POST /api/cybermap/global-viewport
  -> authenticated Godeye Global renderer + source-health ledger
```

The VM and SWA are access layers. PostgreSQL/PostGIS is the durable evidence ledger and materialized read model. The browser and Global API read path do not contact provider endpoints.

## Reconciled Source Layout

```text
blue-swallow-society/
├── api/cybermap-global-viewport/{index.js,function.json}
├── app/operator/{godeye-global.mjs,main.js,styles.css}
├── api/_private/operator/shell.html
├── vm/cybermap-api/
│   ├── db/migrations/0004_godeye_global_cells_and_sources.sql
│   ├── src/{server,postgres-store,memory-store,global-viewport-contract}.mjs
│   ├── src/{greenfeed-worker,greenfeed-materializer}.mjs
│   ├── src/sources/{adapter-contract,usgs-earthquakes,gdacs-alerts,nasa-eonet-events}.mjs
│   └── test/{global-viewport-*,greenfeed-*,global-viewport-postgres}.test.mjs
├── tests/{cybermap-global-viewport-api,godeye-global-shell}.test.mjs
└── specs/008-godeye-global-map-source-integration/
```

## Implementation State

- `0004_godeye_global_cells_and_sources.sql` adds Global-layer policy columns, immutable source-fetch runs, and disabled source catalog rows for USGS, GDACS, and NASA EONET.
- The Global read contract, memory/Postgres query paths, VM endpoint, SWA proxy, and operator Global renderer are implemented and tested.
- `materializeGreenfeedSnapshots` creates only H3 5, 7, 9, and 11 aggregates. It removes raw evidence fields from the aggregate product.
- Source adapters normalize owned fixtures only. `runGreenfeedWorker` accepts injected `fetch`, `normalize`, persistence, and time dependencies; it has no adapter registry, network endpoint, source configuration, or scheduler.
- USGS carries a static attribution/terms link and timestamp but remains disabled. GDACS and NASA EONET have null review timestamps and remain disabled. No provider account, key, or runtime configuration is in this branch.

## Constitution Check

| Constraint | Result | Evidence / required action |
|---|---|---|
| PostgreSQL/PostGIS is the durable authority; VM is replaceable | Pass | Global reads use the materialized store boundary and migration `0004`; do not make an in-memory production cache authoritative. |
| Only policy-approved green layers preload globally | Pass for current disabled state | Store and migration enforce eligibility. Any live source still requires T013 and its source-specific T014–T019 work. |
| No runtime demo or fallback data | Pass | Source adapters are fixture-only; UI/API tests assert explicit empty, stale, error, and disabled states. |
| Operator-only capability | Pass | Same-origin SWA proxy validates operator access; VM validates a separate backend-read credential. |
| No raw PII, raw RF records, or raw provider payloads in Global mode | Pass | Materializer and viewport contract exclude raw fields; TST-001, TST-002, and TST-004 cover the boundary. |
| Provider policy and provenance remain explicit | Partial by design | USGS has static attribution metadata but no live approval; GDACS and NASA EONET are unreviewed. T014–T019 are mandatory before any enablement. |

## Runtime and Release Preflight

- Node 24 is required by `.nvmrc` and `vm/cybermap-api/package.json`; observed in this worktree: `v24.18.0`.
- Fresh 2026-07-25 local evidence: `node --test tests/*.test.mjs` passed `154/154`; `npm test` in `vm/cybermap-api` passed `79`, skipped one named PostGIS gate, and failed `0`.
- `CYBERMAP_TEST_DATABASE_URL` is absent in this worktree. TST-009 migration proof cannot be re-executed locally without an approved disposable PostGIS database.
- The canonical release workflow is `.github/workflows/deploy-static-web-app.yml`. It deploys on pushes to `main`; the generated SWA workflow is manual-only and explicitly disabled.
- This branch is behind `origin/main`. Production deployment must use an integration/PR merge to current `main`; dispatching this stale branch directly would risk rolling back unrelated mainline changes.

## Delivery Sequence

1. Commit this reconciled `spec.md` → `plan.md` → `tests.md` → `tasks.md` package on the feature branch.
2. Rebase or merge the feature branch with current `origin/main` in an isolated worktree. Resolve and test integration conflicts before production deployment.
3. Run the package tests, repository regression suite, `git diff --check`, and scoped secret review.
4. Open and merge a reviewable PR into `main` when repository checks permit it. Do not use a manual branch deployment as a substitute for integration.
5. Let the canonical `Deploy Infra + App` workflow deploy `main`; verify its actual run, default SWA hostname, public/authenticated surface, and protected Global endpoint behavior.
6. Keep all three sources disabled after site deployment. Live enablement follows the separate per-source tasks only.

## Controlled Enablement Design

For one source at a time, the future change must:

1. Record the provider's reviewed access, attribution, retention, redistribution, rate-limit, and account/API-key requirements in a dated source card.
2. Add an allowlisted backend fetch implementation with request timeout, payload/page bounds, conditional fetch semantics where supported, redacted logs, and no browser read-path access.
3. Add explicit worker registration and an operator-controlled schedule. Keep credentials backend-only if required.
4. Run fixture, failure, disposable-PostGIS, and one real approved-source acceptance receipt.
5. Set `terms_reviewed_at`, `enabled`, and `allowed_preload` only in the reviewed server-side source configuration. Record a reversible disable receipt.

## Rollback

- Disable a source by setting `enabled=false` and recording an immutable disabled run. Do not relabel historical aggregate cells as fresh.
- Roll back Global UI visibility without deleting observations or source-run records.
- Roll back a site release through the repository's reviewed mainline release process; do not deploy a stale feature branch over mainline.

## Verification Commands

```bash
node --test tests/*.test.mjs
(cd vm/cybermap-api && npm test)
CYBERMAP_TEST_DATABASE_URL='<approved-ephemeral-postgis-url>' \
  node --test vm/cybermap-api/test/global-viewport-migration.test.mjs
git diff --check
```

The protected PostGIS command is required for a fresh migration acceptance receipt. A named skip is correct local behavior when the URL is not injected; it is not operational proof.
