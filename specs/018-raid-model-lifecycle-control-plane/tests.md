---
title: RaID model lifecycle control plane test design
date: 2026-07-29
implements: specs/018-raid-model-lifecycle-control-plane/spec.md
---

# Test Design

| ID | Authority | Test | Expected result |
|---|---|---|---|
| TST-018-01 | FR-001/004/005 | Contract validates catalog compatibility and filters a mixed release set. | At most five approved/published/non-revoked/compatible releases ordered deterministically. |
| TST-018-02 | FR-002/004 | Store resolves an eligible artifact and rejects digest/signature/eligibility inconsistencies. | Exact bytes and manifest only for eligible release; otherwise no bytes. |
| TST-018-03 | FR-003/007 | Store records feedback and replays exact idempotent content. | First write 201; exact replay 200; changed reuse 409; mismatched model digest rejected. |
| TST-018-04 | FR-006 | Lifecycle claim evaluates reviewed/deduplicated policy inputs twice. | One immutable snapshot/job is created; second claim observes no duplicate job. |
| TST-018-05 | FR-001–003/008/009 | HTTP routes use valid/invalid/absent mTLS proxy assertions and scopes, GET catalog/artifact headers, and POST feedback bodies. | Valid scoped callers work; invalid verb, channel/query/body, duplicate/missing compatibility header, or assertion remains generic forbidden/error; unrelated routes unchanged. |
| TST-018-06 | FR-010 | Scripted Postgres client and migration contract inspect query/DDL shape. | Required migration/tables/constraints/readiness registration are present; no raw capture columns. |
| TST-018-07 | FR-002/003 | Artifact and feedback HTTP bodies exceed bounds or have malformed JSON/unknown fields. | Controlled 400/413/422 response; no stored feedback or bytes. |
| TST-018-08 | FR-009 | Rendered Caddy/installer contract checks listener allowlist. | Only observation batch, viewport, and three exact model paths reach the loopback API. |

Run each test RED before production implementation. Run `npm test` in `vm/cybermap-api`, then `node --test tests/*.test.mjs` at repository root. A private PostgreSQL integration test is skipped by name until the user authorizes an isolated disposable database/runner receipt.
