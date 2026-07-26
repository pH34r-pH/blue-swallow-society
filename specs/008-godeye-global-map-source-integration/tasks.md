# Tasks: Godeye Global Map Source Integration

**Reconciled**: 2026-07-25
**Authority chain**: [spec.md](./spec.md) → [plan.md](./plan.md) → [tests.md](./tests.md) → this file

## Phase 0 — Execution Preflight

- [x] T000 Verify Node 24 in the isolated worktree. Observed 2026-07-25: `v24.18.0`.
- [x] T001 Reconcile the branch implementation against the four-artifact package. The package describes USGS, GDACS, and NASA EONET fixture adapters; it does not claim the unrelated local DeFlock experiment.

## Phase 1 — Global Read Path

- [x] T002 [US1] Verify strict Global viewport contract validation in `vm/cybermap-api/src/global-viewport-contract.mjs` with its contract tests.
- [x] T003 [US1] Verify bounded Global viewport reads in `src/{memory-store,postgres-store}.mjs` without altering the local Field viewport contract.
- [x] T004 [US1] Verify token-gated VM `POST /api/v1/cybermap/global-viewport` and SWA `POST /api/cybermap/global-viewport` with no provider read in either request path.
- [x] T005 [US1] Verify Field/Global operator controls, Global renderer, provenance ledger, and explicit empty/stale/error/disabled UI states.

## Phase 2 — Source Policy, Materialization, and Fixture Adapters

- [x] T006 [US2] Verify migration `0004_godeye_global_cells_and_sources.sql` has source-policy fields, disabled catalog seeds, and immutable `source_fetch_runs`.
- [x] T007 [US2] Verify H3 5/7/9/11 materialization with raw-field exclusion tests.
- [x] T008 [US2] Verify fixture-only normalizers for `usgs-earthquakes`, `gdacs-alerts`, and `nasa-eonet-events` plus adapter-surface tests.
- [x] T009 [US3] Verify dependency-injected worker outcomes and redacted immutable fetch-run receipts. No scheduler or provider transport is registered.

## Phase 3 — Current Verification

- [x] T010 Run `node --test tests/*.test.mjs`; 2026-07-25 result: `154` pass, `0` fail.
- [x] T011 Run `npm test` from `vm/cybermap-api`; 2026-07-25 result: `79` pass, `0` fail, `1` named TST-009 skip.
- [x] T012 Run `git diff --check` before staging this package.
- [ ] T013 Execute TST-009 against a protected ephemeral PostGIS database and preserve a fresh receipt. `CYBERMAP_TEST_DATABASE_URL` is absent in this worktree; historical receipts are not a substitute for a current injected-environment result.

## Phase 4 — Source-Specific Live Enablement

- [ ] T014 [USGS] Record a dated source card covering official endpoint selection, access/account requirement, license, attribution, retention, redistribution, rate limits, payload/page bounds, and disable policy. Static metadata alone does not authorize live fetch.
- [ ] T015 [USGS] Add allowlisted backend transport, worker registration/schedule, secret handling if required, and fixture-to-live acceptance coverage. Run TST-009 and TST-010 before setting `enabled=true` and `allowed_preload=true`.
- [ ] T016 [GDACS] Complete the same source card. `terms_reviewed_at` is currently null; do not add a transport, schedule, or live flag first.
- [ ] T017 [GDACS] After approval, implement and verify its bounded backend transport and TST-010 receipt before enablement.
- [ ] T018 [NASA EONET] Complete the same source card. `terms_reviewed_at` is currently null; anonymous reachability is not an approval record.
- [ ] T019 [NASA EONET] After approval, implement and verify its bounded backend transport and TST-010 receipt before enablement.

## Phase 5 — Release

- [ ] T020 Reconcile this branch with current `origin/main`, resolve integration conflicts in the isolated worktree, and rerun T010–T012.
- [ ] T021 Push the reviewed branch, merge it into `main` through the repository review path, and verify the canonical `Deploy Infra + App` workflow.
- [ ] T022 Verify the deployed default SWA hostname: public/cover surface succeeds, operator Global route remains token-gated, anonymous Global API access fails closed, and the Global ledger reports all three sources disabled.

## Dependency Order

`T000–T012` are complete local branch evidence. `T013` is required before any live provider enablement. Each provider pair is sequential (`T014 → T015`, `T016 → T017`, `T018 → T019`) and independent of the other providers. `T020–T022` release the site only; they do not authorize source enablement.
