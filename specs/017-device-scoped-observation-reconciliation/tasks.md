---
title: Device-scoped observation reconciliation tasks
date: 2026-07-29
implements: specs/017-device-scoped-observation-reconciliation/spec.md
---

# Tasks

- [x] T001 [US1] Add RED memory-store coverage for cross-device external-key reuse. Trace: TST-017-01.
- [x] T002 [US2] Add RED same-device duplicate/changed-content coverage. Trace: TST-017-02.
- [x] T003 [US3] Add RED unscoped legacy identity containment coverage. Trace: TST-017-03.
- [x] T004 Add RED Postgres SQL and migration/installer contract coverage. Trace: TST-017-04, TST-017-05.
- [x] T005 Implement the forward-only migration and registrations. Trace: FR-001, FR-002, FR-006.
- [x] T006 Implement matching memory/Postgres identity behavior. Trace: FR-003–FR-005.
- [x] T007 Preserve device-scoped identities through the viewport/operator merge path and fail closed on missing historical content hashes. Trace: TST-017-07, TST-017-08.
- [x] T008 Run focused and owning regressions, root contracts, Graphify refresh, secret scan, and scoped review.
