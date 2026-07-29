---
title: Device-scoped observation reconciliation test design
date: 2026-07-29
implements: specs/017-device-scoped-observation-reconciliation/spec.md
---

# Test Design

| ID | Authority | Test | Expected result |
|---|---|---|---|
| TST-017-01 | US1, FR-001/004 | Memory store submits equal external keys from two enrolled devices under one source. | Both observations persist; second receipt accepts one, not duplicate/conflict. |
| TST-017-02 | US2, FR-003 | Same device reuses a key with exact and changed content. | Exact is duplicate; changed content is `observation_key_reused`; no extra row. |
| TST-017-03 | US3, FR-005 | Memory store has a matching unscoped legacy identity. | Typed conflict; no receipt/write. |
| TST-017-04 | FR-001/003 | Postgres scripted store asserts scoped lock/query/insert SQL and values. | Device identity participates in every observation-identity operation. |
| TST-017-05 | FR-002/006 | Root schema/installer contract inspects migration and registrations. | Forward-only backfill, old uniqueness removal, new constraints, installer/readiness/docs registration. |
| TST-017-06 | Non-goal: client-visible diagnostics | HTTP request matches an unscoped legacy identity. | Internal server classification remains `observation_identity_unscoped`; the `409` response exposes only existing `observation_key_reused`. |
| TST-017-07 | FR-002/003 | A scoped historical row has no valid content hash. | Server fails closed as legacy ambiguity; migration never scopes that row. |
| TST-017-08 | FR-004 | Two device-scoped BLE observations reuse an external key. | Viewport emits opaque distinct IDs; operator merge retains both records. |

Run each new test RED before production code. Then run `npm test` in `vm/cybermap-api` and `node --test tests/*.test.mjs` at repo root.
