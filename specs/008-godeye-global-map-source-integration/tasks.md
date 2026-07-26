# Tasks: Godeye Global Map and Source Integration

## Phase 0 — execution preflight

- [x] T000 Verify a Node 24 runtime in the execution workspace against `.nvmrc` and `vm/cybermap-api/package.json`; observed 2026-07-23: `/home/ph3/.local/bin/node` is `v24.18.0`.

## Phase 1 — Contracts and database guardrails

- [x] T001 [US1] Added RED/green GlobalViewport request/response validation and forbidden raw-field cases in `vm/cybermap-api/test/global-viewport-contract.test.mjs`.
- [x] T002 [US2] Added `vm/cybermap-api/test/global-viewport-migration.test.mjs`; it name-skips without `CYBERMAP_TEST_DATABASE_URL` and otherwise isolates 0001–0004 in a generated schema.
- [x] T003 [US1] Added `vm/cybermap-api/db/migrations/0004_godeye_global_cells_and_sources.sql`; protected ephemeral database execution remains T019.
- [x] T004 [US1] Implemented strict `GlobalViewportRequestV1` parsing/aggregate-only response shaping in `vm/cybermap-api/src/global-viewport-contract.mjs`.
- [x] T005 [US1] Added RED aggregate-only query tests in `vm/cybermap-api/test/global-postgres-store.test.mjs` and `test/global-memory-store.test.mjs`.
- [x] T006 [US1] Added bounded `queryGlobalViewport` to Postgres and contract-equivalent memory behavior; `queryViewport` is unchanged.

## Phase 2 — protected API read path

- [x] T007 [US1] Added RED VM auth/body/bounds/no-network tests in `vm/cybermap-api/test/global-viewport-http.test.mjs`.
- [x] T008 [US1] Added `POST /api/v1/cybermap/global-viewport` with token guard, strict body validation, and no provider fetch in `vm/cybermap-api/src/server.mjs`.
- [x] T009 [US1] Added RED SWA proxy authentication/header/no-store/error tests in `tests/cybermap-global-viewport-api.test.mjs`.
- [x] T010 [US1] Added token-gated `api/cybermap-global-viewport/{index.js,function.json}`; it forwards only the bounded aggregate request and fixed backend credential.

## Phase 3 — materialization and source health

- [x] T011 [US2] Added RED H3 aggregate/cell-sanitization tests in `vm/cybermap-api/test/greenfeed-materializer.test.mjs`.
- [x] T012 [US2] Implemented H3 2/4/5 aggregate materialization in `vm/cybermap-api/src/greenfeed-materializer.mjs`; it emits no raw source feature fields.
- [x] T013 [US3] Added RED/green worker outcome, terms-unreviewed, gzip, size-bound, fixture-only, and receipt-redaction tests in `vm/cybermap-api/test/greenfeed-worker.test.mjs`.
- [x] T014 [US3] Implemented bounded source worker and append-only `source_fetch_runs` receipts in `vm/cybermap-api/src/greenfeed-worker.mjs`.
- [x] T015 [US2] Added the fixed-URL `deflock-osm-alpr-reports` adapter and synthetic fixture. It materializes only H3 2/4/5, discards raw fields, calls no route API, and deploys enabled through the catalog; every other candidate remains disabled.

## Phase 4 — operator surface

- [x] T016 [US1] Added retained-Field/separate-Global-panel, no-geolocation, state, attribution, and no-provider-URL static tests in `tests/godeye-deflock-ui.test.mjs`.
- [x] T017 [US1] Updated `app/operator/main.js` to retain the Field map and render the Global aggregate panel through the bounded endpoint.
- [x] T018 [US2] Updated `api/_private/operator/shell.html` and `app/operator/styles.css` with the authenticated Global-panel surface, status/attribution ledger, and visible intelligence-gap states.

## Phase 5 — verification and enabled deployment

- [ ] T019 Run TST-001–TST-010: focused Node suites, existing local viewport regression, repository Node suite, `CYBERMAP_TEST_DATABASE_URL='<ephemeral-postgis-url>' node --test test/global-viewport-migration.test.mjs` from `vm/cybermap-api`, installer syntax/compile checks, `git diff --check`, and a scoped secret scan. The protected ephemeral PostGIS URL remains required for the one named integration gate.
- [ ] T020 Deploy the operator-approved DeFlock catalog configuration, bounded VM service/timer, and source worker. Record the first redacted source-run receipt and authenticated map/API result. Keep every other candidate disabled.
- [ ] T021 Run `graphify update .` after the final code changes, inspect the scoped diff, track generated Graphify artifacts, update this package status, and append verified evidence to the daily log.
