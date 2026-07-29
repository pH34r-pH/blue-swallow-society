---
title: Device-scoped observation reconciliation plan
date: 2026-07-29
implements: specs/017-device-scoped-observation-reconciliation/spec.md
---

# Plan

1. Add migration `0005_device_scoped_observation_identity.sql`. Add nullable `producer_device_id` for new immutable rows; reject a new batch-linked row that lacks it without scanning or rewriting old data; preserve old append-only rows unchanged; write immutable `observation_identity_scopes` records only from linked `sync_batches.client_id` plus valid content hashes; remove obsolete source-only uniqueness constraints; add device-scoped uniqueness/indexes; record the migration version.
2. Extend the Postgres store's advisory lock, lookup, and insert operations to use `source_id + device_id + external_observation_key`. Query both direct new rows and proven legacy scope records; detect any otherwise matching unscoped legacy row and fail closed with a typed non-durable conflict.
3. Mirror the same identity semantics in `MemoryObservationStore` so unit and HTTP contracts remain equivalent.
4. Register the migration in `REQUIRED_MIGRATIONS`, the VM installer, schema contract tests, and migration documentation.
5. Add focused tests RED first for cross-device success, same-device changed content, unscoped legacy containment, and Postgres SQL shape/values. Then implement the minimum changes and run subsystem/root regressions.

No deploy occurs in this change. A later private PostgreSQL migration and real authenticated exact replay are separate operational acceptance gates.
