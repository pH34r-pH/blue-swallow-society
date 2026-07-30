---
title: RaID model lifecycle control plane tasks
date: 2026-07-29
implements: specs/018-raid-model-lifecycle-control-plane/spec.md
---

# Tasks

- [x] T001 [US1] Add RED catalog/release-manifest contract tests. Trace: TST-018-01.
- [x] T002 [US2] Add RED artifact integrity/eligibility tests. Trace: TST-018-02, TST-018-07.
- [x] T003 [US3] Add RED feedback create/replay/conflict/privacy tests. Trace: TST-018-03, TST-018-07.
- [x] T004 [US4] Add RED snapshot/job claim contention tests. Trace: TST-018-04.
- [x] T005 Implement bounded lifecycle contracts and memory store. Trace: FR-004–FR-007.
- [x] T006 Add RED PostgreSQL migration/readiness/SQL-shape tests, then implement durable lifecycle store and migration. Trace: TST-018-06, FR-006/010.
- [x] T007 Add RED mTLS catalog/artifact/feedback HTTP tests, then implement exact server routes. Trace: TST-018-05, FR-001–FR-003/008.
- [x] T008 Add RED Caddy/installer allowlist contract, then amend mTLS authority/configuration. Trace: TST-018-08, FR-009.
- [x] T009 Run focused and full VM/root regressions, static privacy/secret scans, Graphify refresh, and scoped review. Trace: all. VM suite passed `163` with `2` named protected-PostGIS skips; root passed `204/204`; isolated private PostgreSQL migration and Caddy mTLS evidence passed; Graphify, diff, and added-line secret scan passed.
- [x] T011 Add RED GET catalog/artifact method, `channel=field`, compatibility-header, body/query rejection, and revocation-list tests. Trace: TST-018-05.
- [x] T012 Align the mTLS router, durable revocation selector, and Caddy contract with T011; preserve POST feedback and generic authorization behavior. Trace: FR-001–FR-003/008/009.
- [ ] T010 [BLOCKED — external authority] Execute TensorFlow training from a rights-approved data/checkpoint snapshot, sign a candidate with approved release authority, and run real trusted-device catalog/artifact/feedback receipts. This task must not be simulated. Trace: US4, FR-006.
