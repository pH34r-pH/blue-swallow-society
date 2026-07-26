# Test Design: Godeye Global Map Source Integration

**Reconciled**: 2026-07-25
**Spec**: [spec.md](./spec.md)
**Plan**: [plan.md](./plan.md)

## Test Matrix

| Test | Level | Covers | Procedure | Expected result | Implemented path |
|---|---|---|---|---|---|
| TST-001 | Node contract | FR-004–FR-005, FR-011, SC-004 | Validate valid and malformed `GlobalViewportRequestV1` payloads and aggregate responses. | Invalid/wrapped bounds, unknown layers, excess cells, unsupported zooms, and raw fields fail closed. | `vm/cybermap-api/test/global-viewport-contract.test.mjs` |
| TST-002 | Node store | FR-004–FR-006, FR-011–FR-013, SC-003–SC-004 | Seed source and aggregate fixtures; query each Global zoom band. | Only eligible green cells return, response is bounded, and raw observation values never escape. | `vm/cybermap-api/test/global-viewport-postgres.test.mjs`, `test/memory-store.test.mjs` |
| TST-003 | Node HTTP | FR-003–FR-005, FR-009, FR-014–FR-015 | Exercise VM route with missing, invalid, and valid backend-read credentials. | Unauthorized requests fail closed; valid aggregate response is no-store; no provider fetch occurs. | `vm/cybermap-api/test/global-viewport-http.test.mjs` |
| TST-004 | Node materializer | FR-010–FR-011, SC-004 | Materialize deterministic normalized snapshots. | H3 5/7/9/11 aggregate cells and event keys are deterministic; raw provider fields are absent. | `vm/cybermap-api/test/greenfeed-materializer.test.mjs` |
| TST-005 | Node adapter | FR-007–FR-008, FR-012, FR-014, SC-005 | Normalize owned USGS, GDACS, and NASA EONET fixtures; inspect module surfaces. | P0 metadata is disabled; payloads normalize deterministically; malformed/mismatched input fails; no transport or scheduler surface exists. | `vm/cybermap-api/test/greenfeed-source-adapters.test.mjs` |
| TST-006 | Node worker | FR-007–FR-010, FR-016, SC-005 | Use injected success, empty, rate-limit, invalid, timeout, disabled, and terms-unreviewed cases. | Source-run outcomes are bounded and redacted; disabled/unreviewed sources do not fetch or seed. | `vm/cybermap-api/test/greenfeed-worker.test.mjs` |
| TST-007 | SWA Function unit | FR-003, FR-014–FR-015 | Invoke the SWA proxy with anonymous, authenticated, missing-backend-token, and upstream-failure doubles. | Operator guard and fixed backend token apply; no-store response/error behavior is controlled. | `tests/cybermap-global-viewport-api.test.mjs` |
| TST-008 | Static/browser unit | FR-001–FR-004, FR-012, FR-016 | Inspect Field/Global controls, Global client, renderer states, and provenance ledger with DOM/fetch doubles. | Field flow remains separate; Global avoids geolocation/provider URLs; disabled/stale/error/empty states are visible. | `tests/godeye-global-shell.test.mjs` |
| TST-009 | Disposable PostGIS integration | FR-006, FR-010–FR-013 | Apply migrations through `0004` to an approved isolated PostGIS database and attempt invalid writes. | Policy constraints, H3 resolutions, and immutable source-fetch runs hold in the database. Missing URL creates a named skip. | `vm/cybermap-api/test/global-viewport-migration.test.mjs` |
| TST-010 | Reviewed live-source acceptance | SC-006 | Enable one separately approved provider, run one bounded job, inspect ledger, then disable it. | Dated provider approval, bounded fetch, attribution, source health, no client provider read, and reversible disable receipt exist. | Deployment/approval receipt; not implemented in this branch |

## Traceability

| Requirement | Tests |
|---|---|
| FR-001–FR-003 | TST-003, TST-007, TST-008 |
| FR-004–FR-006 | TST-001–TST-003, TST-009 |
| FR-007–FR-010 | TST-005, TST-006, TST-009 |
| FR-011–FR-013 | TST-001, TST-002, TST-004, TST-009 |
| FR-014–FR-016 | TST-003, TST-005–TST-008 |
| SC-001–SC-005 | TST-001–TST-008 |
| SC-006 | TST-009–TST-010 |

## TDD and Evidence Sequence

1. Contract, store, VM HTTP, source normalizer, worker, proxy, and UI tests were introduced before or with their corresponding implementation slices.
2. Run the repository suite and VM package suite before every merge. The 2026-07-25 local run passed `154/154` repository tests and `79` VM tests with `0` failures; TST-009 was a named skip because no protected disposable database URL was injected.
3. Obtain a fresh TST-009 receipt from an approved ephemeral PostGIS database before a source is configured for live operation.
4. TST-010 is required for each provider independently. Fixture normalization, anonymous endpoint reachability, or a passing unit suite does not satisfy it.
