# Tasks: Godeye Policy-Bound Operator Map

**Input**: [spec.md](./spec.md), [plan.md](./plan.md), [tests.md](./tests.md)
**Prerequisites**: Accepted proposal and all four feature artifacts.
**Rule**: Each test task must show the intended RED failure before its matching implementation task. Mark a task complete only with command evidence.

## Phase 1 — Authority and reconciliation

- [x] T001 [US1] Record the accepted design delta in `Designs/Godeye Operator Map/Godeye Operator Map - Proposal.md`; trace the five enhancements to scope/exclusions.
- [x] T002 [US1] Create `specs/008-godeye-operator-map/{spec.md,plan.md,tests.md,tasks.md}` with complete FR/TST/task traceability.
- [x] T003 [US1] Reconcile current manual map, POST viewport, VM stores, operator shell, CSP, and existing tests against this package; preserve unrelated working-tree changes.

## Phase 2 — Policy/analysis foundation

- [x] T004 [US1] [TST-001 RED] Add failing registry tests in `tests/godeye-layers.test.mjs` for reviewed IDs, safe state, zoom bounds, and forbidden generic-source fields.
- [x] T005 [US4] [TST-002 RED] Add failing reducer tests in `tests/godeye-session-analysis.test.mjs` for bounded source/timeline derivation, malformed/empty input, and clear behavior.
- [x] T006 [US1] [TST-001 GREEN] Implement frozen static layer policy and safe layer-only URL state in `api/_private/operator/assets/godeye-layers.mjs`.
- [x] T007 [US4] [TST-002 GREEN] Implement bounded no-persistence session reducer in `api/_private/operator/assets/godeye-session-analysis.mjs`.

## Phase 3 — Green-cell MVT read path

- [x] T008 [US2] [TST-004 RED] Add VM HTTP tests in `vm/cybermap-api/test/http.test.mjs` for token-gated valid/invalid/query-bearing tile paths and binary response contract.
- [x] T009 [US2] [TST-005 RED] Add scripted pool tests in `vm/cybermap-api/test/postgres-store.test.mjs` for green-only `cybermap_cells` MVT SQL and safe projection.
- [x] T010 [US2] [TST-003 RED] Add Function proxy tests in `tests/cybermap-tiles-api.test.mjs` for auth, bounded inputs, HTTPS forwarding, bytes, media type, and no-store.
- [x] T011 [US2] [TST-004/TST-005 GREEN] Implement tile path validation, VM route/binary response, memory-store empty tile contract, and parameterized PostGIS MVT query in `vm/cybermap-api/src/{server.mjs,memory-store.mjs,postgres-store.mjs}`.
- [x] T012 [US2] [TST-003 GREEN] Implement token-gated tile Function and binding in `api/cybermap-tiles/{index.js,function.json}`; add the explicit SWA tile route in `app/staticwebapp.config.json`.

## Phase 4 — MapLibre workbench

- [x] T013 [US3] [TST-006 RED] Add shell/runtime tests in `tests/godeye-map-shell.test.mjs` for self-hosted assets, workbench hooks, fixed route controls, and removal of manual renderer/endpoint input.
- [x] T014 [US3] [TST-007 RED] Extend `tests/security-review.test.mjs` for tile-route reachability, narrowed CSP, no CDN, no generic endpoint, no persistence, and no coordinate URL regression.
- [x] T015 [US3] [TST-006/TST-007 GREEN] Vendor the pinned MapLibre JS/CSS/license/provenance under `api/_private/operator/assets/`; implement `api/_private/operator/assets/godeye-map.mjs` with same-origin tile auth, no remote fallback, safe MVT/GeoJSON sources, selected-cell callback, clear lifecycle.
- [x] T016 [US1] [TST-001/TST-006 GREEN] Replace the editable Godeye endpoint UI in `api/_private/operator/shell.html` with reviewed layer controls, health/provenance/timeline, and selected-cell hooks.
- [x] T017 [US3] [TST-006/TST-007 GREEN] Wire the controller and session reducer into `api/_private/operator/assets/main.js`; remove manual tile-grid/marker renderer imports and clear analysis/map data on Godeye stop/logout.
- [x] T018 [US3] [TST-006/TST-009 GREEN] Add responsive workbench styles in `api/_private/operator/assets/styles.css` and minimal MapLibre CSP allowances in `app/staticwebapp.config.json`.
- [x] T019 [US3] [TST-008 GREEN] Update `tests/ui-shell.test.mjs` and other affected existing tests only for intentional private Godeye changes; retain public/cover assertions.

## Phase 5 — Integration and evidence

- [x] T020 [US1] Focused root tests passed: 47/47 for feature, security, and shell coverage.
- [x] T021 [US2] Focused VM tests passed 28/28; `npm test` passed 41/41 from `vm/cybermap-api`.
- [x] T022 [US3] [TST-009] CDP-emulated 390×844, 768×1024, and 1440×900 MapLibre captures each initialized the map and reported exact `overflow=false` at the target viewport width.
- [x] T023 [US1] Root `node --test tests/*.test.mjs` passed 151/151; `git diff --check` and source-policy scans passed.
- [x] T024 [US1] `graphify update .` completed; `graphify-out/graph.json` parsed successfully. The local code graph reported no final topology delta; document-semantic extraction was not run because no approved local semantic backend was configured.
- [x] T025 [US1] Rebase the feature onto `origin/main`; preserve the current private operator asset boundary and the separate Godeye Global surface while moving the workbench and MapLibre distribution behind the operator-asset manifest.
- [x] T026 [US1] Rebased full root regression passed 202/202 after installing the checked-in Function dependencies with `npm ci` in `api/`.
- [x] T027 [US2] Rebased VM suite passed 109/109; two protected disposable-PostGIS proofs were explicitly skipped because `CYBERMAP_TEST_DATABASE_URL` was not configured.
- [x] T028 [US1] Rebased `graphify update .` rebuilt the local graph (5,631 nodes, 12,014 edges); `graphify-out/graph.json` parsed. Semantic extraction remains disabled without an approved local backend.

## Dependencies

`T004 -> T006`, `T005 -> T007`, `T008/T009 -> T011`, `T010 -> T012`, `T013/T014 -> T015`, `T006/T007/T011/T012/T015 -> T016/T017/T018`, `T016/T017/T018 -> T019 -> T020/T021/T022 -> T023 -> T024`.

No task may introduce a GeoLibre fork, external plugin/source loader, deployment, or persistent browser data. Deployment is outside this feature unless separately authorized.