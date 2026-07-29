---
title: Best-effort authenticated observation progress
status: implementation-default-pending-production-review
created: 2026-07-29
design: Designs/Wardriver Best-Effort Reconciliation/Wardriver Best-Effort Reconciliation - Decision.md
---

# Best-Effort Authenticated Observation Progress

## Scope

Provide a versioned Cybermap ingest contract that lets an authenticated Wardriver producer resend observations safely and receive a durable, server-derived local progress acknowledgement. The contract removes changed-content observation reuse as a global client stop condition for **v2** while preserving the first committed evidence row.

## User scenarios and acceptance

### P1 — First authenticated send survives a lost response

**Given** an authenticated Wardriver device submits a valid v2 batch and the database commits it, **when** the response is lost and the phone resends the unchanged encrypted body, **then** the server returns the stored committed receipt or a receipt whose observation identities are durable duplicates, and no second `observations` row is inserted.

### P1 — Existing same-device key does not brick a new send

**Given** the authenticated producer submits a v2 observation whose `(source_id, producer_device_id, external_observation_key)` already exists with different canonical content, **when** the transaction commits, **then** the original append-only row remains unchanged, no replacement is inserted, the receipt increments `preserved_conflict_count`, and the v2 progress acknowledgement covers that submitted key.

### P1 — The server, not the client, derives progress

**Given** a v2 batch requests Wardriver progress through a local row identifier, **when** the request reaches ingest, **then** the server verifies that the requested value equals the greatest valid `wardriver-observation:<positive-row-id>` key actually present in the submitted batch and writes only that derived value to the committed receipt.

### P2 — Legacy evidence remains fail-closed

**Given** a matching historical observation has missing, malformed, unscoped, ambiguous, or contradictory producer evidence, **when** a v2 batch reaches it, **then** the server returns the established generic non-durable conflict and writes no v2 receipt or observation. It does not count that row as a preserved conflict or acknowledge progress through it.

### Edge cases

- A client sends a v2 cursor that exceeds the greatest submitted Wardriver row key: reject the request before persistence.
- A v2 batch includes a non-Wardriver external key: reject its progress request before persistence.
- A v2 idempotency-key replay with a changed batch body remains `409 idempotency_key_reused`; it is not reclassified as observation deduplication.
- A v1 request retains the v1 strict same-device changed-content `409 observation_key_reused` behavior.
- A successful v2 receipt can be emitted only after the transaction commits and is immutable on replay.

## Functional requirements

- **FR-001:** The server must accept existing `bss.observation_batch.v1` and new `bss.observation_batch.v2` requests. V1 observable behavior remains unchanged.
- **FR-002:** A v2 request must include `progress = {schema_version: "bss.wardriver_progress.v1", requested_through: "<positive decimal row id>"}`. `requested_through` is a canonical base-10 string in the signed-64-bit range `1..9223372036854775807`: no whitespace, sign, exponent, leading zero, or JSON number. The server must derive the greatest Wardriver row ID from every request observation key, require exact equality with `requested_through`, and reject any mismatch, malformed/mixed key, or out-of-range value.
- **FR-003:** A committed v2 response must be `bss.sync_receipt.v2` with the existing receipt identity/time/count fields, `preserved_conflict_count`, `validation_errors: []`, and `progress = {schema_version: "bss.wardriver_progress.v1", acknowledged_through: "<derived row id>"}`. A nonempty validation error array is never durable receipt evidence.
- **FR-004:** For v2 only, same authenticated producer/key with changed canonical content must be a durable first-writer-wins no-op: preserve the existing observation, insert no replacement, increment `preserved_conflict_count`, and include the key in the durable acknowledgement. Exact content remains `duplicate_count`.
- **FR-005:** The receipt count invariant is `accepted_count + duplicate_count + preserved_conflict_count + rejected_count == observation_count`. This feature emits `rejected_count == 0` only when all observations are durably resolved.
- **FR-006:** The transaction must persist the complete v2 receipt, including derived progress and count fields, before commit. Exact idempotency replay must return that stored receipt unchanged.
- **FR-007:** Device identity remains exclusively credential-derived. The request body and headers must continue to bind to, but cannot override, the authenticated producer identity.
- **FR-008:** Missing, malformed, unscoped, ambiguous, or contradictory historical producer scope remains fail-closed. It must not be converted into a v2 no-op acknowledgement.
- **FR-009:** The migration must preserve append-only `observations` triggers and all historical rows. It may alter `sync_batches` receipt constraints and add reconciliation count metadata, but it must not update an `observations` row.
- **FR-010:** Public responses and logs must not disclose raw keys, payloads, locations, device identity, credentials, or internal reconciliation classifications.

## Key entities

- **V2 progress request:** A bounded Wardriver-local cursor assertion structurally tied to submitted observation keys.
- **V2 durable receipt:** Immutable post-commit receipt containing the server-derived acknowledged cursor and aggregate resolution counts.
- **Preserved conflict:** An existing same-device immutable observation whose key is reused with changed canonical content; the existing row remains authoritative and no new row is appended.

## Non-goals

- A new enrollment or authentication lane.
- Cross-device UX or direct fabrication of historical ambiguous records.
- Mutation, deletion, remapping, or replacement of an observation ledger row.
- Client-side receipt diagnostics or raw reconciliation details.
- Deployment or a claim that a physical phone upload has succeeded.

## Success criteria

- A v2 exact replay returns the same immutable receipt and leaves the observation ledger cardinality unchanged.
- A v2 changed-content reuse produces one preserved-conflict count, no replacement row, and a valid derived progress acknowledgement.
- A client cannot use a high arbitrary progress value to advance its marker.
- V1 strict behavior, mTLS/token authentication, append-only triggers, and unresolved legacy fail-closed behavior remain covered by regression tests.
