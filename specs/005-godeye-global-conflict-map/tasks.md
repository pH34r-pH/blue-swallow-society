# Tasks: Godeye Global Conflict Map

**Input**: [`spec.md`](./spec.md), [`plan.md`](./plan.md), and [`../../docs/godeye-web-architecture.md`](../../docs/godeye-web-architecture.md)

**Tests**: Required. Write each focused test first, run it to prove the intended failure, implement the minimum behavior, then rerun the focused and full suites.

**Organization**: P0 builds the shared map foundation, ports Cybermap, and ships a data-free `conflicts` shell. No conflict source adapter or `/api/godeye/*` route is authorized by these tasks.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel because it changes different files and has no incomplete dependency.
- **[US#]**: Maps to the user story in `spec.md`.
- Every create/modify path is explicit. Existing paths use “Verify” or “Modify”; missing paths use “Create”.

## Phase 1: Specification and Safety Baseline

**Purpose**: Make the implementation boundary self-contained before code work.

- [x] T001 Verify the complete feature contract in `specs/005-godeye-global-conflict-map/spec.md`, including user stories, edge cases, entities, measurable success criteria, and out-of-scope capture/tactical work.
- [x] T002 [P] Verify the technical plan and constitution mapping in `specs/005-godeye-global-conflict-map/plan.md`.
- [x] T003 [P] Create the normative view/state/source/zoom/responsive contract in `docs/godeye-web-architecture.md`.
- [x] T004 Modify `docs/architecture.md` to link the Godeye contract and resolve the former public-view wording without changing the Cybermap-first product decision.

**Checkpoint**: An implementer can identify both views, defaults, deep links, states, responsive behavior, source classes, policy gates, and the active-force boundary without this Kanban card.

---

## Phase 2: Foundational Contract Tests (Blocking)

**Purpose**: Lock fail-closed behavior before adding MapLibre or UI code.

- [ ] T005 Create policy fixtures in `tests/fixtures/godeye-policy-data.mjs` for permitted Cybermap observations, six independently missing conflict gates, stale sources, strategic objects, clusters, low-precision events, retractions, Murmurs signals, and prohibited active-force records.
- [ ] T006 [P] [US2] Create failing URL/default/history tests in `tests/godeye-view-state.test.mjs` covering canonical deep links, invalid-view fallback, cross-view layer rejection, Back/Forward restoration, and forbidden serialization of coordinates/credentials/RF ids.
- [ ] T007 [P] [US3] Create failing source-gate tests in `tests/godeye-source-gates.test.mjs` proving all six gates are mandatory, unknown fails closed, the P0 registry exposes no conflict adapter callable/endpoint/enabled override, no conflict fetch occurs, and stale cached data is visibly degraded.
- [ ] T008 [P] [US4] Create failing zoom/safety tests in `tests/godeye-map-policy.test.mjs` covering zoom 0-4/5-7/8+, precision ceilings, server coarsening, Murmurs non-assertion, and active-force exclusion at every zoom.
- [ ] T009 [P] [US1] Modify `tests/security-review.test.mjs` with failing assertions for no browser camera/RF/loopback Godeye path, no runtime demo seed, no public-root/operator leak, no browser mutation/map-telemetry request, `lat`/`lon` excluded from all URL state, and no third-party script/style CSP origin.
- [ ] T010 [P] [US5] Create failing lifecycle/presentation tests in `tests/godeye-presentation-state.test.mjs` covering loading, refreshing, no-query empty, zero-result empty, filtered empty, policy unavailable, stale, partial error, view error, auth error, and non-omniscient copy.

Run after T005 creates the shared fixtures and T006-T010 are written:

```bash
node --test tests/godeye-*.test.mjs tests/security-review.test.mjs
```

Expected: focused failures caused by missing `godeye-state.mjs`, `godeye-sources.mjs`, `godeye-map.mjs`, and nested shell behavior—not syntax or fixture errors.

**Checkpoint**: No production implementation starts until every intended failure is understood.

---

## Phase 3: Reproducible MapLibre Foundation (Blocking)

**Purpose**: Self-host a pinned map runtime under the existing CSP.

- [ ] T011 Create root `package.json` with exact `maplibre-gl: "5.24.0"`, `vendor:maplibre`, and asset-check scripts; do not use a caret/range.
- [ ] T012 Generate root `package-lock.json` with `npm install --package-lock-only` and verify `npm ci` resolves the exact pin.
- [ ] T013 Create `scripts/vendor-maplibre.mjs` to copy the pinned JS, CSS, source-map policy-approved artifacts, and license from `node_modules/maplibre-gl/dist` into `app/operator/vendor/maplibre-gl/` and to support a byte-identity `--check` mode.
- [ ] T014 Run the vendor script and create `app/operator/vendor/maplibre-gl/maplibre-gl.js`, `app/operator/vendor/maplibre-gl/maplibre-gl.css`, and `app/operator/vendor/maplibre-gl/LICENSE.txt`.
- [ ] T015 Modify `app/operator/index.html` and `api/_private/operator/shell.html` only as needed to load the self-hosted MapLibre CSS/JS; do not add CDN imports or public-shell product content.
- [ ] T016 Modify `tests/security-review.test.mjs` to verify the exact pin, license, self-hosted paths, and unchanged self-only CSP; run `npm run vendor:maplibre -- --check` and the focused security test.

Run:

```bash
npm ci
npm run vendor:maplibre -- --check
node --test tests/security-review.test.mjs
```

Expected: all commands pass; `git diff --check` reports no generated-asset whitespace errors.

**Checkpoint**: The map dependency is reproducible, licensed, and self-hosted before application code imports it.

---

## Phase 4: Shared State, Source Gate, and Map Host (Blocking)

**Purpose**: Implement pure policy modules before DOM/controller integration.

- [ ] T017 [US2] Create `app/operator/godeye-state.mjs` with `GODEYE_VIEWS`, `DEFAULT_GODEYE_VIEW`, allowlist URL parse/serialize, per-view state reducer, safe history intents, request generations, and logout reset; make T006 pass.
- [ ] T018 [US3] Create `app/operator/godeye-sources.mjs` with namespaced Cybermap/conflict registries, record/source-role classes, all-six-gate evaluation, disabled-source fetch suppression, health/stale decisions, and cross-view layer rejection; make T007 pass.
- [ ] T019 [US4] Add the strategic zoom/detail predicate to `app/operator/godeye-sources.mjs`, including precision/coarsening ceilings, Murmurs restrictions, and unconditional active-force exclusions; make T008 pass.
- [ ] T020 [US5] Add lifecycle-state selectors and epistemic copy helpers to `app/operator/godeye-state.mjs`; make T010 pass without DOM-specific test hacks.
- [ ] T021 Create `app/operator/godeye-map.mjs` with one MapLibre instance, north-up defaults, control installation, namespaced atomic source/layer reconciliation, resize, selection summary, and teardown. Keep business/source gate decisions outside MapLibre callbacks.
- [ ] T022 Add focused map-host adapter tests to `tests/godeye-map-policy.test.mjs` using an injected fake MapLibre implementation; prove one instance survives view switches and old namespace layers are removed before new layers render.

Run:

```bash
node --test tests/godeye-view-state.test.mjs tests/godeye-source-gates.test.mjs tests/godeye-map-policy.test.mjs tests/godeye-presentation-state.test.mjs
```

Expected: all focused tests pass.

**Checkpoint**: URL privacy, source gates, zoom safety, lifecycle states, and map lifecycle are deterministic before changing the operator shell.

---

## Phase 5: User Story 1 - Hosted Cybermap Parity (Priority: P1)

**Goal**: Port current managed Cybermap behavior to MapLibre without adding browser capture.

**Independent Test**: Open `cybermap`, explicitly enable location, and compare location/accuracy/observation/freshness/provenance/empty/error behavior with the current renderer.

### Tests for User Story 1

- [ ] T023 [P] [US1] Modify `tests/wigle.test.mjs` with failing GeoJSON adapter tests for operator location, accuracy geometry, observation uncertainty, source class, freshness, provenance, caveats, zero results, and no fabricated fallback.
- [ ] T024 [P] [US1] Modify `tests/cybermap-viewport-api.test.mjs` to preserve POST-body-only coordinates, token failure, 25-5000 m radius, 1-500 limit, no-store response, HTTPS backend, and sanitized failures; add effective rate/abuse-control and location-free log-event assertions.
- [ ] T025 [P] [US1] Modify `tests/security-review.test.mjs` to prove Godeye imports no camera/vision/RF scan/loopback capture API, emits no mutation/map-telemetry request, and leaves the public root unchanged.

### Implementation for User Story 1

- [ ] T026 [US1] Add a pure Cybermap-to-GeoJSON adapter to `app/operator/godeye-sources.mjs`; reuse current `app/operator/wigle.mjs` normalization rather than duplicating Wi-Fi/source logic.
- [ ] T027 [US1] Modify `app/operator/main.js` to create the Godeye controller, initialize the shared map only inside the authenticated Godeye tab, request geolocation only after the existing explicit action, send exact coordinates only in the existing read-query POST body, and emit no browser map telemetry or mutation request.
- [ ] T028 [US1] Modify `api/_private/operator/shell.html` to replace the manual tile/marker internals with one map container plus Cybermap status/layer/inspector regions while preserving private-shell delivery.
- [ ] T029 [US1] Modify `app/operator/styles.css` with base shared-map sizing, location/accuracy/observation semantics, visible focus, and no-data/error overlays; do not touch public `app/styles.css`.
- [ ] T030 [US1] Modify `app/operator/main.js` to keep the existing manual renderer behind one temporary checked-in rollback constant and default it to MapLibre only after T023-T029 pass; no environment flag may enable conflict data.
- [ ] T031 [US1] Modify `api/cybermap-viewport/index.js` only as required to add effective rate/abuse controls and bounded location-free event-class logging while preserving token validation, POST-body coordinates, bounds, HTTPS backend, timeout, no-store response, and sanitized error semantics.

Run:

```bash
node --test tests/wigle.test.mjs tests/cybermap-viewport-api.test.mjs tests/security-review.test.mjs tests/godeye-*.test.mjs
```

Expected: all focused tests pass; no runtime fixture appears when the backend is absent.

**Checkpoint**: `cybermap` is a complete independently testable hosted viewer and the Wardriver app remains the field capture surface.

---

## Phase 6: User Story 2 - Explicit Views, Deep Links, and History (Priority: P1)

**Goal**: Make `cybermap` and `conflicts` explicit, accessible, and safely deep-linkable.

**Independent Test**: Open canonical links, switch by pointer/keyboard/mobile header swipe, use Back/Forward, and verify focus, URL, and independent state.

### Tests for User Story 2

- [ ] T032 [P] [US2] Modify `tests/godeye-view-state.test.mjs` with reducer tests for view-switch push, intra-view debounced replace, popstate no-push, independent per-view state, stale generation discard, and logout reset.
- [ ] T033 [P] [US2] Create `tests/godeye-shell-contract.test.mjs` with failing static/behavioral assertions for nested ARIA tab roles, roving `tabindex`, Left/Right/Home/End/Enter/Space, and canonical ids/labels.
- [ ] T034 [P] [US2] Create `tests/godeye-responsive.test.mjs` with failing shell/CSS contract assertions that swipe listeners bind only to the view-switch strip and that 44 px targets, safe areas, reduced motion, drawers, and bottom sheets exist.

### Implementation for User Story 2

- [ ] T035 [US2] Modify `api/_private/operator/shell.html` to add the two-tab Godeye view switch and shared panel regions with stable ids and ARIA ownership.
- [ ] T036 [US2] Modify `app/operator/main.js` to bind nested keyboard/pointer switching, validated boot URL, `pushState`/debounced `replaceState`/`popstate`, focus retention, stale request cancellation, and per-view polling stop/start.
- [ ] T037 [US2] Add mobile header-strip swipe handling in `app/operator/main.js` with pointer-distance/velocity thresholds and explicit exclusions for map, layer, inspector, timeline, form, and dialog targets.
- [ ] T038 [US2] Modify `app/operator/styles.css` for the sticky segmented switch and active/focus states across desktop/tablet/mobile/reduced-motion modes.
- [ ] T039 [US2] Verify `app/staticwebapp.config.json` keeps `/operator` deep links reachable, public navigation fallback unchanged, and no permissive CSP addition.

Run:

```bash
node --test tests/godeye-view-state.test.mjs tests/godeye-shell-contract.test.mjs tests/godeye-responsive.test.mjs tests/security-review.test.mjs
```

Expected: all tests pass.

**Checkpoint**: User Story 2 works without a conflict source and without serializing a live field position.

---

## Phase 7: User Story 3 - Fail-Closed Strategic Conflict Shell (Priority: P1)

**Goal**: Make the strategic view legible while every conflict source remains disabled.

**Independent Test**: Open `conflicts` in P0 and observe a world basemap plus named gate states, with zero conflict adapter requests and zero event/force geometry.

### Tests for User Story 3

- [ ] T040 [P] [US3] Modify `tests/godeye-source-gates.test.mjs` to assert the P0 registry has zero conflict adapter callables, endpoint descriptors, or enabled overrides and every descriptive candidate reports all missing gate reasons.
- [ ] T041 [P] [US3] Modify `tests/godeye-shell-contract.test.mjs` to reject “live battlefield,” aircraft-track scaffolds, tactical/force promises, unqualified certainty, and empty-state wording that implies safety.

### Implementation for User Story 3

- [ ] T042 [US3] Modify `app/operator/godeye-sources.mjs` to add the data-free `conflicts` view definition with `region=global`, zoom 2, strategic layer groups, separate Mosaic/Murmurs/source-role classes, descriptive candidate metadata, and no adapter callable, endpoint descriptor, or enabled override.
- [ ] T043 [US3] Modify `api/_private/operator/shell.html` with the strategic source-gate/health panel, unavailable timeline/inspector states, and no-active-force boundary copy; remove the existing aircraft/live-track scaffold copy.
- [ ] T044 [US3] Modify `app/operator/main.js` so entering `conflicts` initializes only basemap/control/state UI and performs zero conflict-data requests; no conflict fetch branch or runtime adapter registration may exist.
- [ ] T045 [US3] Modify `app/operator/styles.css` with separate disabled/degraded/Mosaic/Murmurs semantics that do not reuse Cybermap access-risk colors.

Run:

```bash
node --test tests/godeye-source-gates.test.mjs tests/godeye-shell-contract.test.mjs tests/security-review.test.mjs
```

Expected: all tests pass and adapter-fetch spy count is zero.

**Checkpoint**: The strategic view is an honest unavailable/product-contract surface, not a fake feed.

---

## Phase 8: User Story 4 - Strategic Zoom and Tactical Exclusion (Priority: P1)

**Goal**: Enforce the documented detail ceiling independently of the map's visual zoom.

**Independent Test**: Evaluate strategic, cluster, event, low-precision, Murmurs, and active-force fixtures across zoom bands.

- [ ] T046 [US4] Modify `tests/godeye-map-policy.test.mjs` with table-driven coverage for every record class and zoom band, including a passing individual event and one failure for each license/health/precision/delay/coarsening/safety gate.
- [ ] T047 [US4] Modify `app/operator/godeye-map.mjs` to apply layer min/max zoom only after the shared detail predicate approves the record/layer and to preserve server-provided generalized geometry.
- [ ] T048 [US4] Modify `app/operator/godeye-sources.mjs` to reject active-force classes before feature construction or any future export selector, prevent signal correlation from promoting verification/event/actor/casualty fields, and keep P0 export UI absent.
- [ ] T049 [US4] Add a visible “detail unavailable” reason path to `app/operator/main.js` and `api/_private/operator/shell.html` for zoom, precision, license, delay/coarsening, or safety restrictions; do not represent this as zero-result empty.

Run:

```bash
node --test tests/godeye-map-policy.test.mjs tests/godeye-presentation-state.test.mjs
```

Expected: all tests pass; active-force fixtures produce no render/export feature at every zoom.

**Checkpoint**: Zoom cannot bypass policy.

---

## Phase 9: User Story 5 - Provenance, Time, Uncertainty, and Accessibility (Priority: P2)

**Goal**: Make every permitted feature inspectable without collapsing epistemic dimensions.

**Independent Test**: Select each fixture class by pointer, keyboard result list, and screen-reader summary and compare inspector fields/labels.

### Tests for User Story 5

- [ ] T050 [P] [US5] Create `tests/godeye-inspector.test.mjs` with failing view-model tests for Cybermap source/freshness/caveats and conflict four-clock/verification/precision/license/safety/revision fields.
- [ ] T051 [P] [US5] Modify `tests/godeye-shell-contract.test.mjs` for ordered keyboard result list, screen-reader map summary, source-health live region discipline, inspector focus restore, non-color labels/patterns, and reduced-motion timeline state.

### Implementation for User Story 5

- [ ] T052 [US5] Add pure inspector/summary selectors to `app/operator/godeye-state.mjs` and make T050 pass without injecting HTML strings.
- [ ] T053 [US5] Modify `api/_private/operator/shell.html` with source/clock/verification/precision/license/safety/revision regions and an ordered selectable result list.
- [ ] T054 [US5] Modify `app/operator/main.js` to synchronize map/list selection, restore focus when sheets close, update the bounded screen-reader summary, and label retractions/supersession.
- [ ] T055 [US5] Modify `app/operator/styles.css` with independent icon/shape/border/pattern/opacity channels and text labels for access risk, type, verification, severity, precision, freshness, and Murmurs signals.

Run:

```bash
node --test tests/godeye-inspector.test.mjs tests/godeye-shell-contract.test.mjs tests/godeye-presentation-state.test.mjs
```

Expected: all tests pass; no semantic field is color-only or collapsed into one confidence value.

**Checkpoint**: A permitted item is inspectable as reported/assessed/detected evidence, never an omniscient assertion.

---

## Phase 10: Security, Privacy, Responsive, and Dependency Review

**Purpose**: Close constitution PARTIAL gates before fallback removal.

- [ ] T056 [P] Verify and update the threat-model/privacy-impact section in `docs/godeye-web-architecture.md` for URL/history leakage, stale async response injection, source-license drift, client-only gate bypass, active-force recombination, future export leakage, location logging, dependency/CSP compromise, and mitigations mapped to tests.
- [ ] T057 [P] Modify `tests/security-review.test.mjs` to verify no precise map/body data is logged or serialized, auth errors clear state, endpoint overrides are absent, no browser mutation/telemetry request exists, and conflict callables/endpoints cannot be introduced or enabled by URL/environment alone.
- [ ] T058 [P] Modify `tests/godeye-responsive.test.mjs` with captured assertions or an established browser harness for 320, 768, 1024, and 1440 px layouts, including safe-area and one-sheet-at-a-time behavior.
- [ ] T059 [P] Create `.github/workflows/codeql.yml` with pinned-by-SHA JavaScript/TypeScript CodeQL analysis, then run `npm audit --omit=dev` and MapLibre license/asset identity verification; include workflow/result evidence and any reviewed non-runtime advisory in the review handoff.
- [ ] T060 Verify `docs/godeye-web-architecture.md`, `specs/005-godeye-global-conflict-map/spec.md`, `plan.md`, and this task list still match source paths, auth, API method/body rules, defaults, read-only behavior, no-adapter P0 state, and Constitution Check after implementation; run spec-compliance review before code-quality/security review, and block rollout unless the inherited OAuth/OIDC governance gate has an approved resolution.

**Checkpoint**: Constitution monitoring, threat-model, security-test, privacy-impact, and dependency gates are closed.

---

## Phase 11: Full Verification and Manual-Renderer Removal

**Purpose**: Prove parity, safety, and no regressions before deleting fallback code.

- [ ] T061 Run `PYTHONPATH=scripts python -m unittest discover -s tests -p '*_test.py'`; expected: all discovered Python tests pass. The prefix is required by the existing `strategy_synthesis_test.py` import layout.
- [ ] T062 Run `node --test tests/*.test.mjs`; expected: all Node tests pass with no skipped Godeye security/policy cases.
- [ ] T063 Run browser smoke plus authenticated DAST/manual abuse cases at 320/768/1024/1440 px for both views, keyboard-only navigation, reduced motion, auth/bounds/rate-limit failures, URL/log/error privacy, location denial, zero results, filter empty, stale source, partial failure, slow response after switch, Back/Forward, and logout/session expiry; include exact evidence in the review handoff.
- [ ] T064 Verify the P0 `conflicts` view exposes zero conflict adapter callables/endpoints, produces zero conflict-data requests, and renders zero event/active-force geometry in browser network/runtime/render inspection.
- [ ] T065 Remove the temporary manual raster renderer, tile-grid imports, and rollback constant from `app/operator/main.js`; remove only now-unused helpers from `app/operator/map-math.mjs` and update `tests/map-math.test.mjs` accordingly.
- [ ] T066 Rerun T061-T064 plus `git diff --check`; expected: all pass and no runtime reference to the legacy renderer or unbounded public tile service remains.
- [ ] T067 Run `graphify update .` from the repository root and verify `graphify-out/graph.json` loads successfully; record node/link counts in the review handoff.
- [ ] T068 Commit the implementation and request human review with branch, commit, clean status, exact tests, responsive evidence, dependency audit, and the explicit statement “no conflict source enabled.”

---

## Policy-Gated Follow-On — Not Authorized by P0

Do not turn these into implementation work from this task. Create a separate Spec Kit feature for one selected source only after all listed evidence exists:

1. versioned normalized conflict contract and revision model;
2. written license/display/cache/export/redistribution decision;
3. source cadence, stale threshold, coverage gaps, and health contract;
4. region/source-specific delay policy;
5. server-side minimum precision/generalization/coarsening policy;
6. safety review covering audience, record/asset class, active-force exclusion, and exports;
7. test fixtures for corrections, retractions, outages, low precision, and prohibited detail.

Only then may a follow-on feature create `/api/godeye/*` routes, conflict tables/materializers, or an adapter for UCDP/ACLED/GDELT/FIRMS/another reviewed source. External reference products remain link-only unless reuse permission is established.

## Dependencies & Execution Order

- Phase 1 is complete and is the documentation source of truth.
- Phase 2 blocks every production-code phase.
- Phase 3 blocks MapLibre imports and shell integration.
- Phase 4 blocks Cybermap, conflict, and inspector integration.
- Phase 5 is an independently testable Cybermap parity slice, not the complete two-view feature.
- Phase 6 depends on Phase 5 shell/controller integration; Phase 7 depends on Phase 6's explicit view switch. Phases 8-9 may proceed after Phase 7, with one integrator owning shared shell/controller/style reconciliation.
- The implementation-complete P0 slice requires Phases 1-10; release/merge requires terminal Phase 11 verification and human review. Neither hosted view may be omitted.
- Phase 10 blocks fallback removal.
- Phase 11 is terminal verification and review handoff.
- The policy-gated follow-on is not a dependency and is not part of this feature.

## Parallel Opportunities

- T005 creates shared fixtures; T006-T010 can run in parallel only after T005.
- T023-T025, T032-T034, T040-T041, T050-T051, and T056-T059 are parallel test/review groups because each member writes a different file or only runs read-only verification.
- DOM changes in `api/_private/operator/shell.html`, controller changes in `app/operator/main.js`, and styles in `app/operator/styles.css` must be sequenced within a user story to avoid conflicting edits.
- Different user stories may be assigned in parallel only after Phase 4, with one integrator owning shared shell/controller/style reconciliation.

## Implementation Strategy

1. Preserve the current Cybermap path first.
2. Make safety policies pure and testable before map effects.
3. Ship `conflicts` honestly unavailable rather than prematurely useful.
4. Keep the two ontologies and visual channels namespaced.
5. Remove fallback only after full parity/security/responsive review.
6. Treat every future source as a separate gated product integration, not a URL/config toggle.

## Requirement Traceability

| Contract | Primary tests | Primary implementation / gate |
|---|---|---|
| FR-001-FR-007 (two views, URL/history, independent state, auth teardown) | T006, T032-T034 | T017, T035-T039 |
| FR-008-FR-012, FR-030, FR-035 (field boundary, read-only browser, auth/public silence, no demo) | T009, T024-T025, T057 | T027-T031, T039, T060 |
| FR-013-FR-017 (separate source classes/ontologies and six fail-closed gates) | T005, T007, T040-T041 | T018, T042-T045 |
| FR-018-FR-021, FR-024, FR-034 (strategic zoom, precision, signals, tactical exclusion, future bounded reads) | T008, T046, T064 | T019, T047-T049; follow-on API remains unauthorized |
| FR-022-FR-028 (clocks, verification, revisions, lifecycle, epistemic copy) | T010, T046, T050-T051 | T020, T048-T055 |
| FR-029 (one self-hosted namespaced MapLibre host) | T016, T022 | T011-T015, T021, T030, T065 |
| FR-031-FR-032 (responsive/accessibility) | T033-T034, T051, T058, T063 | T035-T038, T049, T052-T055 |
| FR-033 (no P0 export; future redistribution gate) | T009, T050, T057 | T048, T060; export UI remains out of scope |
| NFR-001-NFR-003 (pure parsing/gates, active-view lifecycle) | T006-T008, T032 | T017-T022, T036, T044 |
| NFR-004, NFR-007 (sanitized errors/logs, API abuse controls) | T024-T025, T057, T063 | T031, T056, T060 |
| NFR-005 (pinned/self-hosted dependency) | T016, T059 | T011-T015 |
| NFR-006 (repository and focused verification) | T061-T066 | T067-T068 |
| SC-001-SC-003 | T006-T007, T040 | T017-T018, T042-T044 |
| SC-004-SC-007 | T008-T010, T032, T046 | T019-T020, T036-T049 |
| SC-008-SC-011 | T022-T025, T050-T051, T058, T061-T064 | T026-T031, T035-T055, T065-T068 |

Every user story has focused tests and implementation coverage: US1 T023-T031; US2 T006/T017 and T032-T039; US3 T007/T018 and T040-T045; US4 T008/T019 and T046-T049; US5 T010/T020 and T050-T055.
