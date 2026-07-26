# Test Design: Godeye Global Map and Source Integration

## Test matrix

| Test | Level | Covers | Procedure | Expected result | Planned path |
|---|---|---|---|---|---|
| TST-001 | Node contract | FR-004–FR-005, FR-013, SC-004 | Validate valid and malformed `GlobalViewportRequestV1` payloads and sample responses. | Reject invalid/wrapped bounds, unknown layers, excess cells, raw observation fields, and unsupported zoom. | `vm/cybermap-api/test/global-viewport-contract.test.mjs` |
| TST-002 | Node store | FR-003–FR-006, FR-010, FR-014, SC-001/003 | Seed cells/sources of every class and query aggregate viewport at each zoom band. | Only approved green cells return; rows contain aggregate fields/provenance only; query has a bounded limit. | `vm/cybermap-api/test/global-viewport-postgres.test.mjs` |
| TST-003 | Node HTTP | FR-003–FR-005, FR-015, FR-019–FR-020 | Exercise VM route with missing/invalid/valid backend read tokens and malformed bodies. | Anonymous/invalid requests fail closed; valid request returns no-store aggregate data; VM performs no provider fetch. | `vm/cybermap-api/test/global-viewport-http.test.mjs` |
| TST-004 | Node materializer | FR-009–FR-010, FR-013, FR-021–FR-022, SC-004 | Normalize synthetic DeFlock-like GeoJSON fixtures; materialize H3 2/4/5 cells; inspect generated payloads. | Deterministic aggregate cells; no raw point, OSM, brand, operator, direction, or routing fields; fixture-only tests perform no network call. | `vm/cybermap-api/test/greenfeed-materializer.test.mjs` |
| TST-005 | Node worker | FR-007–FR-009, FR-011, FR-016–FR-019, FR-021–FR-022, SC-005 | Use injected fetch doubles for fixed-file success, gzip success, empty, oversized compressed/decompressed object, rate limit, invalid payload, timeout, disabled source, and terms-unreviewed cases. | Worker uses only the fixed URL, records immutable source run/state, discards raw features, never calls routing, and never leaks credentials/error bodies. | `vm/cybermap-api/test/greenfeed-worker.test.mjs` |
| TST-006 | SWA API unit | FR-003, FR-015, FR-020 | Invoke Function with anonymous, valid operator, invalid backend, and upstream error doubles. | Operator guard applies; only fixed backend token is forwarded; response is no-store; errors are controlled. | `tests/cybermap-global-viewport-api.test.mjs` |
| TST-007 | static/browser unit | FR-001–FR-002, FR-012, FR-016, SC-002/006 | Inspect the retained Field view and separately labelled Global panel with DOM/fetch doubles. | Field mode retains existing 100 m path; the Global panel does not request geolocation; stale/error/empty ledger states are visible; no provider URLs/keys are bundled. | `tests/godeye-deflock-ui.test.mjs` |
| TST-008 | migration integration | FR-006, FR-011, FR-013–FR-014 | With `CYBERMAP_TEST_DATABASE_URL` bound to an approved disposable PostGIS database, apply 0001–0004 to an isolated schema and attempt invalid catalog/cell writes. | Green preload constraints, H3 2/4/5 rules, source-fetch immutability, and source-class exclusion hold in the database. A missing variable yields a named skip, never a false pass. | `vm/cybermap-api/test/global-viewport-migration.test.mjs` |
| TST-009 | operator/deployment acceptance | FR-007, FR-009, FR-016–FR-017, FR-023, SC-001–SC-006 | Deploy the enabled source, verify the first bounded service run has a redacted receipt, then inspect the authenticated Global ledger and map. | Bounded p95 read, provenance ledger, no client provider fetch, explicit intelligence gap, local field regression green. | source receipt + authenticated deployment probes |
| TST-010 | deployment static/runtime | FR-007, FR-023 | Inspect migration and installer; execute the source-process unit with a catalog entry. | Migration enables and preloads DeFlock; installer applies migration 0004, enables the timer, and starts the source service. | `tests/cybermap-schema.test.mjs`, `vm/cybermap-api/test/deflock-source-job.test.mjs` |

## Traceability

| Requirement | Tests |
|---|---|
| FR-001–FR-002 | TST-007 |
| FR-003–FR-005 | TST-001–TST-003, TST-006 |
| FR-006–FR-008 | TST-002, TST-005, TST-008 |
| FR-009–FR-011 | TST-004, TST-005, TST-008 |
| FR-012–FR-013 | TST-001, TST-002, TST-007 |
| FR-014–FR-016 | TST-002, TST-005, TST-007, TST-008 |
| FR-017–FR-020 | TST-003, TST-005–TST-007 |
| FR-021–FR-022 | TST-004–TST-005 |
| FR-023 | TST-009–TST-010 |
| SC-001–SC-006 | TST-002, TST-004–TST-009 |

## TDD sequence

1. Add TST-001–TST-003 before adding the global contract, store query, or VM endpoint. Observe the expected RED failures against the current local-only route.
2. Add TST-004–TST-005 before adding the materializer, worker, or adapters. Fixtures must be source-owned test data with no real credentials.
3. Add TST-006–TST-007 before adding SWA proxy and operator controls. Observe RED against the absent route/mode controls.
4. Implement the minimum contract, storage, worker, proxy, and UI slices to make focused tests GREEN.
5. Apply TST-008 against disposable PostGIS before production deployment; TST-010 proves the installer/source-process contract without contacting a live provider.
6. Run existing local viewport and repository regressions, then conduct TST-009 against the enabled DeFlock source. Preserve the source-run and deployment receipts.
