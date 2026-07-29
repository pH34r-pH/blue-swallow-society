---
title: Best-effort authenticated observation progress tasks
created: 2026-07-29
implements: specs/018-best-effort-observation-progress/spec.md
---

# Tasks

- [x] T001 [US1] Add RED v2 progress parser and malformed-cursor contract tests. Trace: TST-018-01, TST-018-05.
- [x] T002 [US1] Add RED memory/HTTP exact v2 apply and exact replay receipt tests. Trace: TST-018-02, TST-018-06.
- [x] T003 [US2] Add RED v2 first-writer-wins changed-content tests and v1 compatibility regression. Trace: TST-018-03, TST-018-04.
- [x] T004 [US3] Add RED v2 unresolved legacy identity regression. Trace: TST-018-07.
- [x] T005 Add RED Postgres scripted receipt ordering and migration constraint coverage. Trace: TST-018-08, TST-018-09.
- [x] T006 Implement v1/v2 contract validation and server-derived Wardriver progress. Trace: FR-001, FR-002.
- [x] T007 Implement memory/Postgres v2 resolution counts and immutable replay receipts. Trace: FR-003–FR-008.
- [x] T008 Add forward-only sync-batch migration, registrations, and documentation. Trace: FR-009, FR-010.
- [x] T009 Run focused RED→GREEN receipts, API/root regressions, Graphify update, secret scan, and exact-diff review. Trace: TST-018-01–TST-018-09.
