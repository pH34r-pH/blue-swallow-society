# 006 — Task Ledger

- [x] T001 [US1] Harden market adapter normalization and prove malformed prediction marks cannot mutate the paper ledger. Trace: TST-001.
- [x] T002 [US1] Add canonical freshness/wake validation that emits withheld receipts before render, archive, or dispatch. Trace: TST-001.
- [x] T003 [US2] Build deterministic seven-lane Field Dossier HTML/1200x1500 PNG rendering, source index, and provenance-safe redaction. Trace: TST-002.
- [x] T004 [US2] Build local immutable package/archive/dispatch planning with ≤10-page batches and hash-bound receipts. Trace: TST-003.
- [x] T005 [US2] Bind Discord dispatch receipts to the persisted archive-envelope hash, never the renderer-internal hash. Trace: TST-004.
- [x] T006 [US3] Add append-only VM archive migration/store/routes and reject artifact or canonical-envelope hash tampering. Trace: TST-005, TST-006.
- [x] T007 [US3] Add SWA operator-token gateway and private Morning Brief UI. Trace: TST-008.
- [x] T008 [US3] Remove the competing VM timer/webhook producer; only the local Hermes scheduler may dispatch a validated package. Trace: TST-007.
- [ ] T009 Reconcile this feature branch with current `origin/main`, complete static/security/full-suite review, and refresh Graphify. Trace: all local TSTs.
- [ ] T010 Deploy the reconciled production path and prove private archive plus SWA operator proxy against the live backend. Trace: TST-009.
- [ ] T011 Update the local Hermes publishing job only after the live archive/proxy probe succeeds; run one fresh valid wake → collect → render → archive → scheduler-managed delivery → UI hash acceptance. Trace: TST-009.
