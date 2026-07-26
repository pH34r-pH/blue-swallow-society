# Implementation Plan: Godeye Global Map and Source Integration

**Branch**: `008-godeye-global-map-source-integration` | **Date**: 2026-07-22 | **Spec**: [spec.md](./spec.md)

## Goal

Add an operator-only, provenance-first Global Godeye mode that reads materialized BSS H3 cells for narrowly selected green sources while retaining the existing local Field Godeye path unchanged.

## Architecture

```text
approved provider adapter (worker only)
  -> sanitized aggregate counts; raw features discarded
  -> H3 2/4/5 materializer + source_fetch_runs
  -> PostgreSQL/PostGIS cybermap_cells
  -> VM POST /api/v1/cybermap/global-viewport
  -> token-gated SWA POST /api/cybermap/global-viewport
  -> authenticated Godeye Global renderer + layer-health ledger
```

The VM and SWA remain thin, replaceable access layers. PostgreSQL/PostGIS remains the durable evidence ledger and materialized read model. A browser map read never fetches a provider. Field mode continues to use the established local-radius route.

## Technical context

- **Current renderer**: vanilla browser JavaScript in `app/operator/main.js`, DOM tile grid, fixed zoom, 100 m field overlay.
- **Current shell/style**: `api/_private/operator/shell.html` and `app/operator/styles.css`.
- **Current backend**: Node HTTP VM API, `vm/cybermap-api/src/server.mjs`; Postgres store in `src/postgres-store.mjs`; in-memory test store in `src/memory-store.mjs`.
- **Current storage**: `source_catalog`, append-only observations, and materialized `cybermap_cells`; no source worker or aggregate global API is implemented.
- **Renderer decision**: Use MapLibre after an independent dependency/license/supply-chain review. Add deck.gl only if a measured P0 aggregate-layer requirement cannot be met without it. Do not copy World Monitor source, styles, or assets.
- **Worker decision**: P0 uses a bounded Node worker invoked by a VM systemd service and timer. It uses the fixed provider allowlist, 45-second deadline, bounded input/decompression, append-only receipts, and no network access from browser/API read paths.

## Constitution / guardrail check

| Constraint | Result | Required treatment |
|---|---|---|
| PostGIS is source of truth; VM is replaceable | Pass | Materialize from append-only observations; no in-memory production cache as authority. |
| Green globally preloadable; grey/orange/red locally or explicitly scope-gated | Pass | Enforce at SQL/query boundary and test it. |
| No runtime demo/fallback data | Pass | Empty/error source state is explicit; fixtures stay in tests. |
| Operator-only capability | Pass | SWA validates operator session; VM validates a separate backend-read token. |
| No raw PII/raw frames by default | Pass | Global response is cell aggregates only. |
| World Monitor dashboard AGPL | Pass only with clean-room implementation | Do not copy its source, styles, assets, or provider credentials. |

## Source layout

```text
blue-swallow-society/
├── api/
│   ├── cybermap-global-viewport/{index.js,function.json}
│   └── _lib/operator-auth.js                         # reuse, do not weaken
├── app/operator/
│   ├── main.js                                       # mode controller and field/global dispatch
│   ├── godeye-global.mjs                             # new map client; no provider fetches
│   └── styles.css                                    # global-mode and layer-ledger states
├── api/_private/operator/shell.html                  # global mode controls and ledger container
├── vm/cybermap-api/
│   ├── db/migrations/0004_godeye_global_cells_and_sources.sql
│   ├── src/server.mjs                                # new POST endpoint and validation
│   ├── src/postgres-store.mjs                        # aggregate cell query
│   ├── src/memory-store.mjs                          # contract-equivalent test store
│   ├── src/global-viewport-contract.mjs              # strict request/response validation
│   ├── src/greenfeed-materializer.mjs                # H3 2/4/5 aggregate materialization
│   ├── src/greenfeed-worker.mjs                      # bounded source-job runner
│   └── src/sources/deflock-osm-alpr-reports.mjs      # fixed URL, aggregate-only adapter
├── vm/cybermap-api/test/
│   ├── global-viewport-contract.test.mjs
│   ├── global-viewport-http.test.mjs
│   ├── global-viewport-postgres.test.mjs
│   ├── global-viewport-migration.test.mjs             # disposable PostGIS; CYBERMAP_TEST_DATABASE_URL
│   ├── greenfeed-materializer.test.mjs
│   ├── greenfeed-worker.test.mjs
│   └── fixtures/greenfeeds/*.json
├── tests/
│   ├── cybermap-global-viewport-api.test.mjs
│   └── godeye-global-shell.test.mjs
└── specs/008-godeye-global-map-source-integration/
```

## Runtime preflight

The VM package and repository `.nvmrc` require Node 24 (`>=24.0.0 <25` for `vm/cybermap-api`). Every code or test task that touches `vm/cybermap-api` must first observe a Node 24 runtime in its workspace. The execution lane must block with the observed version if Node 24 is absent; it must not install, replace, or bypass the system runtime. Preflight passed on 2026-07-23: `/home/ph3/.local/bin/node` reports `v24.18.0`.

## Implementation sequence

1. **Schema and contracts**: Add migration 0004, strict request/response validation, source-health model, and no-network in-memory store behavior. Seed the operator-approved DeFlock catalog record enabled.
2. **Materialized read model**: Add H3 parent materialization and bounded aggregate query. Preserve the existing local raw observation query untouched.
3. **Protected transport**: Add SWA proxy and VM POST route with independent operator/backend credentials, request bounds, rate limits, and no-store responses.
4. **P0 adapter and deployment**: Implement the `deflock-osm-alpr-reports` source with a fixed URL, a 35 MiB/45 s compressed-input bound, a 256 MiB decompressed-output ceiling, fixture normalization, source-run audit records, raw-feature discard, and enabled catalog entry. Install a bounded VM service/timer and start one post-migration source run.
5. **Operator renderer**: Add the separately labelled Global aggregate panel, source-health ledger, empty/error/stale UX, and provenance drilldown. Do not initialize the Global panel on public/unauthenticated shell paths.
6. **Operational proof**: Run migrations against disposable PostGIS, simulate source state transitions, execute the source worker against controlled fixtures, run UI/API suites, then verify the deployed source receipt and authenticated map path.

### Disposable PostGIS test boundary

`vm/cybermap-api/test/global-viewport-migration.test.mjs` is TST-008. It uses the existing `pg` dependency and requires `CYBERMAP_TEST_DATABASE_URL` to name a clean, disposable PostGIS database. It applies `0001` through `0004`, runs invalid-write assertions, and drops only its isolated schema/database according to the explicit harness configuration. The command is:

```bash
CYBERMAP_TEST_DATABASE_URL='<ephemeral-postgis-url>' \
  node --test test/global-viewport-migration.test.mjs
```

The ordinary VM suite must skip this integration test with a clear reason when the variable is absent; a skip is not TST-008 proof. The T019 gate requires an executed, passing receipt from an approved disposable database. The local host has no PostgreSQL client/server or Docker-daemon access at planning time, so the task must not pull an image, use privilege escalation, or claim this proof locally without an injected test database.

## Rollout and rollback

- Deploy schema/API/UI with the `deflock-osm-alpr-reports` catalog row enabled, preload allowed, and attribution recorded.
- Install and enable a bounded VM source service/timer after migration 0004. Start one source job during deployment; a bounded source failure records health without blocking map reads.
- Keep USGS, GDACS, NASA EONET, and every other candidate disabled in independent later changes; do not batch providers.
- Disable a source by setting `enabled=false` and recording a `source_fetch_runs.outcome='disabled'` row. Existing aggregate cells remain visibly stale or are excluded according to the configured retention policy; they are never relabeled fresh.
- Roll back the global renderer by hiding Global mode. Do not delete append-only observations or fetch-run receipts as a UI rollback.

## Verification plan

1. Run TST-001–TST-007 from [tests.md](./tests.md) in RED/GREEN order.
2. Run existing `vm/cybermap-api/test/http.test.mjs` to prove the local viewport regression remains green.
3. Run the repository Node suite: `node --test tests/*.test.mjs`.
4. Run the VM package test command from `vm/cybermap-api/package.json`; run `CYBERMAP_TEST_DATABASE_URL='<ephemeral-postgis-url>' node --test test/global-viewport-migration.test.mjs` from `vm/cybermap-api`; prove the installer applies migration 0004 and enables the DeFlock service/timer; then run `git diff --check` and a scoped credential/secret scan.
5. After code changes, run `graphify update .` locally from the repository root; do not send private semantic corpus content to a cloud backend.

## Complexity tracking

The new endpoint and materializer are required because the existing local-radius API returns raw observation rows and cannot safely/performantly serve a global map. A separate renderer module is required because the current DOM tile-grid renderer deliberately centers a fixed 100 m field view. No generic feed framework, browser-direct provider path, real-time track service, or broad source fleet is in P0.
