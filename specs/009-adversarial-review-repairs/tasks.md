# Tasks: Adversarial Review Repairs

**Spec**: `spec.md` · **Plan**: `plan.md` · **Tests**: `tests.md`

## Phase 1 — Artifact and transport foundations

- [x] T001 [P] Add red static tests for immutable VM artifact parameters, workflow inputs, and pre-extraction checksum verification in `tests/adversarial-repair-config.test.mjs`.
- [x] T002 [P] Add red Function and VM POST viewport contract tests in `tests/cybermap-viewport-api.test.mjs` and `vm/cybermap-api/test/http.test.mjs`.
- [x] T003 Implement immutable commit URL/digest Bicep, workflow, what-if, and installer changes in `infra/**` and `.github/workflows/**`.
- [x] T004 Implement `vm/cybermap-api/src/viewport.mjs`, POST viewport handling, and retirement of the VM GET/query route.
- [x] T005 Implement `api/_lib/cybermap-backend.js` and body-only Function viewport forwarding.
- [x] T006 Verify T001–T005 focused suites.

## Phase 2 — Session and shared throttling

- [x] T007 [P] Add red token-version/default-TTL and no-persistent-storage tests in `tests/passcode-api.test.mjs`, `tests/operator-session-boundary.test.mjs`, `tests/operator-token-revocation.test.mjs`, and `tests/security-review.test.mjs`.
- [x] T008 [P] Add red shared-limiter contention/expiry/reset/outage tests in `tests/passcode-rate-limit.test.mjs`.
- [x] T009 Implement versioned five-minute server token behavior in `api/_lib/operator-auth.js` and `api/validate-passcode/index.js`.
- [x] T010 Implement module-private browser session handoff in `app/main.js` and `app/operator/**`.
- [x] T011 Implement dedicated Azure Table storage, dependency lock, limiter seam, and workflow app setting.
- [x] T012 Verify T007–T011 focused suites.

## Phase 3 — Wardriver/VM projection and legacy separation

- [x] T013 [P] Add red VM projection, Function proxy, browser adapter, and no-browser-import tests.
- [x] T014 Implement VM `bss.operator_signal_snapshot.v1` projection and `api/operator-signals` adapter.
- [x] T015 Implement `app/operator/operator-signal-client.mjs` and move Godeye reads to it.
- [x] T016 Move the API legacy WiGLE parser to `shared/legacy-wigle-parser.mjs`, retain the browser's presentation parser, and preserve migration endpoint behavior.
- [x] T017 Verify T013–T016 focused suites.

## Phase 4 — Evidence and documentation

- [x] T018 Update API/VM/architecture/repair guidance documentation for contracts, migration, rollback, and operational boundaries.
- [x] T019 Run full Node, Python, VM, diff, Markdown, and Graphify verification.
- [x] T020 Record local evidence and unperformed live Azure acceptance gates in the daily note and final report.
