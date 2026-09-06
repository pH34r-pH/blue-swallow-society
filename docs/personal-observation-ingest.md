# Personal observation ingest

This document defines the recovery contract for Blue Swallow Wardriver uploads to Society/Cybermap.

## Design rule

Wardriver's local SQLite database is the durable client-side source of truth. Upload does not require a second durable encrypted outbox, client-side receipt reconciliation, or a second progress state machine.

The recovery path intentionally uses the existing `bss.observation_batch.v1` contract. A new protocol version is not required to remove the client-side complexity.

## Stable observation identity

Each Wardriver SQLite observation row has a stable source identity. Wardriver serializes it as:

`wardriver-observation:<sqlite-row-id>`

Society scopes that key to the authenticated source and producer device. The effective observation identity is therefore:

`(source_id, device_id, external_observation_key)`

This allows an uncertain client retry to resend an observation in a different batch without creating a second stored observation.

## Replay semantics

Two independent idempotency layers are deliberate:

1. `idempotency_key` identifies one exact batch request. Repeating the same key with the same body returns the original receipt.
2. The device-scoped `external_observation_key` identifies each underlying observation. Re-sending the same observation under a new batch key is counted as a duplicate rather than inserted again.

A changed observation reusing the same stable observation key is a conflict and must not silently replace previously stored evidence.

## Client algorithm

Wardriver may use one understandable local acknowledgement watermark:

1. Read a bounded set of SQLite rows after the last acknowledged row.
2. Serialize them as `bss.observation_batch.v1` observations, preserving the stable row-derived external keys.
3. POST the batch over the existing Android KeyChain mTLS transport.
4. On transport failure or an uncertain response, leave the watermark unchanged. A later attempt may replay rows safely.
5. After a successful Society receipt, advance the watermark only through rows represented by the accepted/duplicate response.

The client does not need a durable encrypted copy of the serialized request because the underlying observations remain in SQLite.

## Authentication

The enrolled Android client certificate is the device authentication mechanism. The private key remains managed by Android KeyChain; Wardriver does not need Azure credentials or direct Key Vault access at runtime.

## Privacy boundary

Only observations personally collected by the operator's Blue Swallow devices participate in bogey inference. External datasets may provide display context or generic enrichment, but they must not create, merge, identify, or label bogeys.

## Compatibility

The existing v2 progress/reconciliation path may remain temporarily for compatibility while the simplified Wardriver path is proven on a physical device. It is not a prerequisite for the recovered upload path and should be pruned only after that path is accepted end-to-end.
