---
title: Best-effort authenticated observation progress test design
created: 2026-07-29
implements: specs/018-best-effort-observation-progress/spec.md
---

# Test Design

| ID | Authority | Test | Expected result |
|---|---|---|---|
| TST-018-01 | FR-001/002 | Contract parser receives v2 progress with a valid decimal cursor, mismatch, non-Wardriver key, and unsafe/invalid decimal. | Only a cursor equal to the derived greatest submitted Wardriver key validates. |
| TST-018-02 | US1, FR-003/005/006 | Memory store applies a v2 batch and replays its exact body/idempotency key. | First request is `201`; replay is `200`; both receipts are byte-equivalent semantically and have one derived acknowledgement; one observation effect exists. |
| TST-018-03 | US2, FR-004/005 | Memory store receives v2 same-device/key changed content after a committed initial observation. | No extra observation; original content stays authoritative; receipt has `preserved_conflict_count: 1`, `rejected_count: 0`, and derived acknowledgement. |
| TST-018-04 | FR-001/004 | Memory and HTTP paths submit the corresponding v1 changed-content reuse. | Existing public `409 observation_key_reused` behavior remains. |
| TST-018-05 | US3, FR-002/003 | HTTP request supplies a valid v2 payload with a mismatched progress cursor. | Request is rejected before persistence; no receipt or observation is created. |
| TST-018-06 | FR-006/007/010 | HTTP exact v2 replay and changed-content no-op use token/mTLS authenticated paths. | Response body is the committed v2 receipt only; headers/body contain no raw key, credential, or internal scope classification. |
| TST-018-07 | FR-008 | V2 matches an unscoped/malformed legacy identity. | Existing generic non-durable conflict; no v2 progress receipt and no write. |
| TST-018-08 | FR-009 | Root schema/installer contract examines migration. | New receipt/count constraints accept valid old v1 and new v2 receipts, reject inconsistent v2 receipt state, register migration, and leave observation append-only triggers enabled. |
| TST-018-09 | FR-004/006 | Postgres scripted/store test inspects conflict classification and receipt persistence ordering. | V2 content mismatch does not execute an observation insert; receipt persistence precedes commit; replay parses the stored v2 receipt. |

Run each new test RED first. Then run `npm test` in `vm/cybermap-api`, `node --test tests/*.test.mjs` at repository root, syntax/static checks, and a protected disposable Postgres lane when approved.
