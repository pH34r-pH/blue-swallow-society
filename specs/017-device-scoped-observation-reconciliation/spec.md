---
title: Device-scoped observation reconciliation
status: accepted
date: 2026-07-29
design: Designs/Wardriver Observation Identity Reconciliation/Wardriver Observation Identity Reconciliation - Proposal.md
---

# Device-Scoped Observation Reconciliation

## Scope

Repair the Cybermap ingest identity model so a Wardriver-local `external_observation_key` is unique within an authenticated source **and producer device**. The existing batch identity remains `source_id + device_id + idempotency_key`.

## User stories

### US1 — Exact replay after a cross-device key collision

**Given** device A owns an observation under `(source, key)`, device B has the same `external_observation_key`, and device B submits its original authenticated batch, **when** the server applies it after this migration, **then** the server treats device B's observation as a distinct device-scoped identity and emits the existing valid durable receipt after commit.

### US2 — Same-device conflict containment

**Given** an existing observation belongs to the same authenticated device and has the same external key, **when** content is identical, **then** the receipt counts it as a duplicate; **when** content differs, **then** the server returns the existing `409 observation_key_reused` result and writes nothing.

### US3 — Ambiguous legacy identity containment

**Given** an old observation has the same source/key but no provable producer device, **when** a batch would otherwise reuse it, **then** the server fails closed without creating a receipt, rewriting the old row, or guessing the identity owner.

## Functional requirements

- **FR-001:** New observations must persist `producer_device_id` and enforce unique `(source_id, producer_device_id, external_observation_key)` and `(source_id, producer_device_id, idempotency_key)` identities.
- **FR-002:** The migration must never update an append-only `observations` row. It must write one immutable `observation_identity_scopes` record for a legacy observation only when linked immutable `sync_batches.client_id` and a valid stored `content_hash` prove producer ownership; remaining rows stay unscoped. Once migration begins, the database must reject any new batch-linked observation without `producer_device_id` so an old process cannot create fresh ambiguous identities during rollout.
- **FR-003:** The store must lock/query both new observation identities and proven legacy scope records before insert. It must retain exact same-device duplicate and changed-content behavior.
- **FR-004:** Cross-device keys must not be treated as duplicate or changed-content conflicts merely because their source/key match.
- **FR-005:** An unscoped legacy matching key must fail closed. It must not be inserted, merged, remapped, or acknowledged as durable success.
- **FR-006:** The migration must be appended, registered in readiness, applied by the installer, and documented. Existing routes, mTLS checks, idempotency headers, receipt schema, and public surfaces remain unchanged.

## Non-goals

- A reconciliation UI, endpoint, export, mutable conflict ledger, client key rewrite, client retry automation, server-side response-body exposure, credential rotation, or deployment.

## Success criteria

- Tests prove US1–US3 and FR-001–FR-006.
- API and root contract suites pass; the changed SQL and source reveal no secrets.
- Graphify refresh completes after code changes.
