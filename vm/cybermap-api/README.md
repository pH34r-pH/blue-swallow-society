# BSS Cybermap API — authenticated observation ingest

This directory contains the first executable Wardriver → VM ingest slice. It replaces the echo-only contract in source, but it is **not yet promoted to the Azure VM**.

## Implemented

- `GET /healthz`
- `GET /readyz`
- `POST /api/v1/observations/batch`
- scoped device authentication using `X-Blue-Swallow-Ingest-Token`
- SHA-256 token digests only in PostgreSQL; raw bearer tokens are never persisted by the API
- required `X-Blue-Swallow-Device-Id` and `Idempotency-Key` headers
- strict `bss.observation_batch.v1` and `bss.observation_batch.v2` validation
- v2 server-derived Wardriver progress receipts, exact replay, and immutable first-writer-wins changed-content resolution
- preservation of passively observed broadcast identifiers and passive management-frame metadata, with explicit `redaction_class`/`retention_class` tags
- strict timezone-qualified RFC3339 clocks and UUID session IDs; session ownership is bound to the authenticated device
- 1 MiB request cap, 256-observation batch cap, bounded headers, and HTTP/DB timeouts
- exact batch replay with the original immutable durable receipt
- observation-level duplicate detection and changed-content conflict rejection across observation and batch-level storage semantics
- transaction-scoped advisory locks plus in-transaction credential revocation rechecks for concurrent batch/observation identity safety
- database-clock receipt timestamps
- server-derived PostGIS geometry and H3 resolutions 7, 9, and 11
- append-only observation inserts linked to source-consistent durable `sync_batches`

## Deployment boundary

The repository contains an immutable-archive VM installer and ordered migrations. A source checkout, test result, or workflow configuration is **not** deployment evidence. For a particular release, verify the deployed commit provenance, health/readiness, migration receipt, and authenticated device result separately.

The remaining acceptance boundary is a live-device end-to-end field test: an enrolled Android device must receive a committed durable receipt and prove exact replay behavior.

## Run tests

```bash
cd vm/cybermap-api
npm ci
npm test
npm audit --omit=dev
```

The service requires Node.js 24.x. The repository-level schema tests also cover both ordered migrations:

```bash
node --test tests/cybermap-schema.test.mjs
```

## Run locally against PostgreSQL/PostGIS

Apply migrations in lexical order; see [`db/README.md`](./db/README.md).

```bash
cd vm/cybermap-api
export DATABASE_URL='postgresql://bss_api:[REDACTED]@127.0.0.1:5432/bss_cybermap?sslmode=require'
export BSS_CYBERMAP_BIND_HOST='127.0.0.1'
export BSS_CYBERMAP_PORT='8080'
npm start
```

`DATABASE_URL` belongs in the VM service secret environment, never in the repository, browser bundle, APK, process arguments, or logs.

## Device enrollment record

Generate at least 32 random bytes for each device token. Deliver the raw token once into Android Keystore through the future enrollment flow. Store only its lowercase SHA-256 hex digest:

```sql
INSERT INTO device_ingest_credentials (
  device_id,
  source_id,
  token_sha256,
  scopes,
  enabled
) VALUES (
  'wardriver-device-id',
  '00000000-0000-4000-8000-000000000000',
  '[64-LOWERCASE-HEX-SHA256-DIGEST]',
  ARRAY['observations:write'],
  true
);
```

The referenced `source_catalog` row must be enabled and should use `source_class = 'owned_device'`. Rotation creates a new credential, enrolls it, and disables the old credential after cutover. Revocation sets `enabled = false`.

## Request contract

The endpoint accepts strict V1 and V2 envelopes. V1 preserves changed-content conflict behavior. V2 requires canonical Wardriver row-key progress and returns a durable `bss.sync_receipt.v2` only after commit; changed same-device content is a receipt-bound `preserved_conflict_count` no-op. The example below is V1 compatibility syntax.

Headers:

```http
Content-Type: application/json; charset=utf-8
X-Blue-Swallow-Ingest-Token: [REDACTED]
X-Blue-Swallow-Device-Id: wardriver-device-id
Idempotency-Key: batch-00000000-0000-4000-8000-000000000001
```

Body:

```json
{
  "schema_version": "bss.observation_batch.v1",
  "idempotency_key": "batch-00000000-0000-4000-8000-000000000001",
  "device_id": "wardriver-device-id",
  "session_id": null,
  "client_clock": "2026-07-11T18:42:31.120Z",
  "redaction_class": "hashed",
  "retention_class": "hash_only",
  "observations": [
    {
      "external_observation_key": "scan-42:wifi:1",
      "kind": "wifi_ap",
      "observed_at": "2026-07-11T18:42:29.814Z",
      "location": {
        "latitude": 47.6062,
        "longitude": -122.3321,
        "accuracy_m": 8.4
      },
      "confidence": 0.82,
      "payload": {
        "bssid_hmac": "hmac-sha256:0123456789abcdef",
        "ssid_hmac": "hmac-sha256:fedcba9876543210",
        "rssi_dbm": -67,
        "frequency_mhz": 2412,
        "passive_only": true
      },
      "provenance": {
        "collector": "co.blueswallow.wardriver",
        "app_version": "2.109-bss.1"
      }
    }
  ]
}
```

Header and body device/idempotency values must match. Clients cannot set `source_id`, `source_class`, geometry, H3 cells, ingest time, trust, or authorization fields.

## Response semantics

- `201`: first successful application
- `200` + `Idempotent-Replayed: true`: exact batch replay; body is the original receipt
- `400`: malformed JSON or header/body identity mismatch
- `403`: missing, invalid, expired, disabled, or under-scoped credential
- `409`: batch or observation key reused with changed content
- `413`: request body or observation count limit exceeded
- `415`: unsupported media type
- `422`: valid JSON that violates the strict contract or privacy policy

Receipt:

```json
{
  "schema_version": "bss.sync_receipt.v1",
  "server_batch_id": "00000000-0000-4000-8000-000000000000",
  "idempotency_key": "batch-00000000-0000-4000-8000-000000000001",
  "status": "applied",
  "accepted_count": 1,
  "rejected_count": 0,
  "duplicate_count": 0,
  "validation_errors": [],
  "server_clock": "2026-07-11T18:43:00.000Z"
}
```

Retries must preserve the exact serialized body and idempotency key from the encrypted outbox. A changed body under an existing key is a conflict, never an update.
