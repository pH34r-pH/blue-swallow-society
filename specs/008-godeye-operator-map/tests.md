# Test Design: Godeye Policy-Bound Operator Map

## Test matrix

| Test | Level | Covers | Preconditions / procedure | Observable expected result | Planned path |
|---|---|---|---|---|---|
| TST-001 | Node unit | US1, FR-001/002/011 | Import layer registry; validate all entries, safe fields, valid layer-state parse/serialize, and zoom applicability. | Only static BSS IDs; no arbitrary URL/plugin/project/file fields; URL state contains only approved layer ID. | `tests/godeye-layers.test.mjs` |
| TST-002 | Node unit | US4, FR-012/014, SC-006 | Feed authorized, malformed, empty, and oversized viewport records to the session reducer; clear it. | Bounded source counts/timeline/newest timestamp; no payload copying; clear produces empty state. | `tests/godeye-session-analysis.test.mjs` |
| TST-003 | Function unit | US2, FR-004/005/014, SC-002/003 | Invoke tile Function with no session, invalid z/x/y, query string, missing backend settings, and valid fake binary backend. | 403/400/503 fail closed before invalid I/O; valid response preserves MVT type/bytes/no-store and forwards only a validated HTTPS path. | `tests/cybermap-tiles-api.test.mjs` |
| TST-004 | VM HTTP | US2, FR-004/005/006/007, SC-002/003 | Start API with memory/scripted stores; request anonymous, malformed, out-of-range, query-bearing, and valid tile paths. | Token required; invalid request never calls `queryVectorTile`; valid route sends MVT media type/no-store and empty/fixture-safe bytes. | `vm/cybermap-api/test/http.test.mjs` |
| TST-005 | VM store SQL shape | FR-006/007 | Call `PostgresObservationStore.queryVectorTile` against a scripted pool. | SQL reads `cybermap_cells`, uses tile envelope/transform/MVT functions, limits projection to summary fields, and requires nonempty all-green source classes. | `vm/cybermap-api/test/postgres-store.test.mjs` |
| TST-006 | Static shell | US3, FR-003/009/010/013 | Inspect private operator shell, `main.js`, map controller, vendor provenance, and styles. | MapLibre is self-hosted; no manual tile-grid runtime or editable endpoint field; layer ledger, source health, provenance, timeline, selected-cell hooks exist. | `tests/godeye-map-shell.test.mjs` |
| TST-007 | Security/static config | FR-004/005/008/010/013/014 | Inspect SWA route/CSP, Function source, map module, and client sources. | Tile route stays application-token gated; only minimal CSP allowances; no script/style CDN, `localStorage`, IndexedDB, Cache Storage, generic source input, or coordinate URL assembly. | `tests/security-review.test.mjs` |
| TST-008 | Existing regression | Existing viewport/operator behavior | Run current viewport API and operator shell suites. | Existing POST current-fix contract, passcode session boundary, and public/operator separation remain intact. | `tests/cybermap-viewport-api.test.mjs`, `tests/ui-shell.test.mjs` |
| TST-009 | Rendered responsive | US3, SC-005 | Serve a controlled operator shell with locally hosted assets; render 390×844, 768×1024, and 1440×900. | Required workbench controls are visible; document width does not exceed viewport; no overlap/clipping; operator-only aesthetic remains legible. | temporary harness + screenshot/DOM receipt |
| TST-010 | Full regression | SC-001 | Run root and VM owning suites after all focused tests pass. | No unrelated regression. | `node --test tests/*.test.mjs`; `npm test` in `vm/cybermap-api` |

## Traceability

| Requirement | Tests |
|---|---|
| FR-001–FR-002 | TST-001, TST-006, TST-007 |
| FR-003 | TST-006, TST-007, TST-009 |
| FR-004–FR-005 | TST-003, TST-004, TST-007 |
| FR-006–FR-007 | TST-004, TST-005 |
| FR-008 | TST-007, TST-008 |
| FR-009–FR-010 | TST-001, TST-006, TST-009 |
| FR-011 | TST-001, TST-007 |
| FR-012 | TST-002, TST-006 |
| FR-013–FR-014 | TST-003, TST-006, TST-007 |
| SC-001 | TST-001–TST-010 |
| SC-002 | TST-003, TST-004 |
| SC-003 | TST-003–TST-005 |
| SC-004 | TST-006, TST-007 |
| SC-005 | TST-009 |
| SC-006 | TST-002, TST-006 |

## TDD sequence

1. Add `TST-001` and `TST-002` before their registry/analysis modules exist. Record expected module-not-found or missing-export RED failures.
2. Add `TST-003` through `TST-007` before tile/map production behavior exists. Each must fail because the route, module, asset, shell hook, or SQL behavior is absent—not due to a test typo.
3. Implement the smallest registry/analysis code to GREEN.
4. Implement VM validation/store MVT behavior to GREEN, then the Function proxy to GREEN.
5. Add self-hosted vendor asset/provenance, controller, shell, lifecycle, and CSS only after the corresponding static test is RED; reach GREEN.
6. Run `TST-008` and `TST-010`; inspect failures against a clean baseline before calling any failure pre-existing.
7. Run `TST-009` only after the static/behavioral contract is green. Retain screenshots and DOM/overflow assertions as evidence.
8. Run `git diff --check`, source-policy scans, and Graphify refresh. Update task checkboxes only with the recorded GREEN/regression evidence.

## Fixtures and safety

- Tile fixtures are synthetic byte buffers or scripted SQL rows. They do not contain real locations, RF identifiers, or secrets.
- Browser rendering uses an empty map/current-location fixture or temporary local harness. It must not authenticate against production or request a live operator token.
- Tests may verify that no persistence API is referenced but must not create persistent browser state in the repository.
- SQL tests assert parameterization and safe projection; they do not call a production database.

## Execution evidence — 2026-07-26

- RED: the initial feature test run failed because the registry, analysis reducer, tile Function, and MapLibre workbench artifacts did not yet exist. The VM contract run failed until the MVT store method was added.
- Focused root coverage: 47/47 passed for `godeye-*`, tile Function, security, and UI-shell suites.
- Full root regression: `node --test tests/*.test.mjs` passed 151/151.
- Focused VM contract coverage: 28/28 passed. Full VM suite: `npm test` passed 41/41.
- Rendered local harness: CDP emulation set exact 390×844, 768×1024, and 1440×900 viewports. Each DOM receipt reported `map=true` and `overflow=false` at its target width; the desktop and narrow renders showed the ledger, map, health, inspector, and timeline without overlap. The harness and captures are temporary local validation material, not product fixtures.
- Graphify: local `graphify update .` completed and `graphify-out/graph.json` parsed. The final incremental pass reported no code-graph topology delta. Semantic document extraction was not run because no approved local semantic backend was configured.
- Rebase integration: the feature was rebased onto `origin/main`, retaining the existing Field/Global separation and moving the new MapLibre modules, distribution, and styles behind `api/operator-assets` so the authenticated private-asset boundary remains authoritative.
- Rebased root regression: after `npm ci` in `api/`, `node --test tests/*.test.mjs` passed 202/202. The Function package reports the expected local Node 24 versus declared Node 22 engine warning; the deployment workflow uses its pinned supported runtime.
- Rebased VM regression: `npm test` passed 109/109 with two disposable-PostGIS proofs skipped because `CYBERMAP_TEST_DATABASE_URL` was not configured.
- Rebased Graphify: `graphify update .` rebuilt 5,631 nodes and 12,014 edges; `graphify-out/graph.json` parsed. It did not run semantic extraction because no approved local backend is configured.