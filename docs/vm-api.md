# VM API Gateway Specification

## Overview
The Blue Swallow Society VM is the **Cybermap API gateway** host, not a product echo path. The gateway is rebuilt by Bicep/cloud-init and remains replaceable: durable Cybermap state lives in Azure Database for PostgreSQL Flexible Server with PostGIS.

Target request flow:

```text
Browser / Wardriver / Jetson
  -> HTTPS 443 on the VM gateway or SWA /api/* proxy
  -> nginx reverse proxy
  -> cybermap-api on localhost:8000
  -> PgBouncer on localhost:6432
  -> Azure PostgreSQL Flexible Server / PostGIS
```

## Runtime services

| Service | Location | Purpose |
|---|---|---|
| `nginx` | `/etc/nginx/sites-available/cybermap-api` | Terminates HTTPS 443 and proxies requests to `127.0.0.1:8000`. |
| `cybermap-api.service` | `/opt/cybermap-api/server.mjs` | Node 20 API gateway with health, DB readiness, auth gate, and request limits. |
| `cybermap-worker.service` | `/opt/cybermap-worker/worker.mjs` | Node 20 background worker scaffold for Greenfeed polling and cell materialization. |
| `pgbouncer` | `/etc/pgbouncer/pgbouncer.ini` | Local transaction-pooler placeholder on `127.0.0.1:6432`; operator-managed credentials stay outside the repo. |

The Bicep module file is still named `infra/vm-echo-lab.bicep` for continuity, but its cloud-init provisions Cybermap gateway services. The old echo lab is retired as a production path and 8080 is not public product ingress.

## Endpoints

| Endpoint | Auth | Status | Notes |
|---|---|---|---|
| `GET /healthz` | none | implemented | Secret-free process health. Does not check PostgreSQL and does not expose dependency state. |
| `GET /readyz` | none | implemented | Checks DB configuration, PostgreSQL connectivity, and `schema_migrations` latest version. Fails closed with sanitized JSON. |
| `/api/v1/*` | bearer/operator token required | gated | Denies unauthenticated requests by default and enforces token scopes/source authority before route handlers. |
| `POST /api/v1/observations/batch` | `observations:write` bearer token + source authority | implemented | Authenticated Wardriver/RaID/Greenfeed batch ingest with `Idempotency-Key`, immutable observation rows, entity materialization, and sync receipts. |
| `GET /api/v1/cybermap/viewport?bbox=&zoom=&layers=&since=` | `cybermap:read` bearer token + source class authority | implemented | Bounded viewport read over materialized `cybermap_cells`; maps zoom to app-computed `gh7`/`gh9`/`gh11` resolution and returns projected cells with freshness, salience/confidence, provenance, and caveats. |
| `GET /api/v1/cybermap/nearby?lat=&lon=&radius_m=&heading_deg=&zoom=&source_class=&layers=` | `cybermap:read` bearer token + source class authority | implemented | Wardriver/RaID current-position context query over nearby materialized cells. Bounded radius/cell count; returns `bss.cybermap.nearby.v1` without raw observation payloads or raw PII columns. |
| `GET /api/v1/cybermap/cells/{h3Cell}` | `cybermap:read` bearer token + source class authority | implemented | Cell detail/provenance drilldown with bounded observation links; accepts app-computed `gh7:*`, `gh9:*`, or `gh11:*` IDs only. |
| `GET /api/v1/entities/{id}` | `cybermap:read` bearer token + source class authority | implemented | Entity summary plus bounded observation links. Raw observation payloads, raw frames, and raw PII columns are never selected. |
| `GET /api/v1/sources?bbox=&class=` | `sources:read` or `cybermap:read` bearer token + source class authority | implemented | Bounded source catalog / Greenfeed discovery with optional bbox and exact source-class filters. |

Remaining planned `/api/v1/*` routes are those in [`docs/cybermap-geospatial-backend.md`](./cybermap-geospatial-backend.md): sensorium sessions, direct observations, and Mosaic/Murmurs memory sync.

## Database configuration

`cybermap-api` reads PostgreSQL settings from environment/app settings only. No database host credentials or passwords are committed in repo files or Bicep parameters.

Required setting:

| Setting | Required | Default | Purpose |
|---|---:|---|---|
| `CYBERMAP_DATABASE_URL` | yes | none | libpq/PostgreSQL URL. On the VM this should normally target PgBouncer: `127.0.0.1:6432`. |

Supported settings:

| Setting | Default | Purpose |
|---|---|---|
| `CYBERMAP_DB_POOL_MAX` | `5` | Hard cap for the Node `pg` pool. Values above 5 are clamped for Flexible Server B1MS. |
| `CYBERMAP_DB_CONNECT_TIMEOUT_MS` | `3000` | PostgreSQL connection timeout used by `/readyz` and future DB-backed routes. |
| `CYBERMAP_DB_IDLE_TIMEOUT_MS` | `10000` | Idle timeout for the low-cardinality app pool. |
| `CYBERMAP_EXPECTED_MIGRATION` | `0003_cybermap_cells_provenance` | Migration version `/readyz` expects to see as the latest row in `schema_migrations`. |
| `CYBERMAP_MIGRATIONS_DIR` | `/opt/cybermap-api/db/migrations` | Optional override for the migration runner. |
| `CYBERMAP_DB_SSL` / `CYBERMAP_DB_SSLMODE` | unset | Set to `require` when connecting directly to Azure PostgreSQL instead of local PgBouncer. |
| `CYBERMAP_AUTH_REGISTRY_JSON` | unset | JSON array of hashed API token registry records. Each record carries `tokenHash` (`sha256:<hex>`), `tokenId`, `clientType`, `scopes`, `sourceIds`, `sourceClasses`, `expiresAt`, and optional revocation metadata. |
| `CYBERMAP_AUTH_TOKEN_HASHES` | unset | Comma-separated `sha256:<hex>` hashes for emergency operator-only bootstrap when JSON registry injection is not available. Prefer `CYBERMAP_AUTH_REGISTRY_JSON`. |
| `CYBERMAP_INGEST_RATE_LIMIT` / `CYBERMAP_INGEST_RATE_WINDOW_MS` | `60` / `60000` | Public HTTPS write/ingest rate limit per token ID (or source IP before auth identity exists, derived from nginx-managed `X-Real-IP`). |
| `CYBERMAP_READ_RATE_LIMIT` / `CYBERMAP_READ_RATE_WINDOW_MS` | `300` / `60000` | Public HTTPS read rate limit per token ID (or source IP before auth identity exists, derived from nginx-managed `X-Real-IP`). |
| `CYBERMAP_OBSERVATION_BATCH_MAX_ITEMS` | `100` | Maximum observations accepted by `POST /api/v1/observations/batch` in one sync batch. |
| `CYBERMAP_OBSERVATION_PAYLOAD_LIMIT_BYTES` | `16384` | Maximum JSON byte size for each observation `payload`; the whole HTTP request is still capped by `CYBERMAP_BODY_LIMIT_BYTES`. |
| `CYBERMAP_PRIVATE_MESH_ONLY` | unset | Set `true` only when VM ingress is restricted to a private mesh such as Tailscale; disables public rate-limit enforcement. |

Missing `CYBERMAP_DATABASE_URL` does **not** crash-loop the API. `/readyz` returns HTTP 503 with `dependencies.postgres.status = "not_configured"` and a non-secret `missing` list. Driver errors are collapsed to `db_unavailable` so passwords, URLs, private hostnames, and raw connection strings never leave the process.

## Auth and source-scope registry

`/api/v1/*` is closed by default. The API accepts a bearer token, hashes it with SHA-256, and compares the resulting `sha256:<hex>` value against the in-memory registry loaded from operator-managed settings. The registry stores token hashes only; plaintext device, SWA, Jetson, worker, and operator tokens must not be persisted in PostgreSQL, docs, logs, or API responses.

`CYBERMAP_AUTH_REGISTRY_JSON` records use this shape:

```json
[
  {
    "tokenId": "wardriver-alpha-2026q3",
    "tokenHash": "sha256:<64 lowercase hex chars>",
    "clientType": "wardriver_device",
    "subject": "device:wardriver-alpha",
    "scopes": ["observations:write"],
    "sourceIds": ["00000000-0000-4000-8000-000000000001"],
    "sourceClasses": ["owned_device"],
    "expiresAt": "2026-10-01T00:00:00.000Z"
  }
]
```

Allowed `clientType` values are `wardriver_device`, `swa_proxy`, `jetson`, `greenfeed_worker`, and `operator_admin`. Mutating ingest routes require write scopes such as `observations:write`; read routes require `cybermap:read` or source-specific read scopes. `source_id` and `source_class` values in request bodies or query strings are treated as claims. The middleware verifies them against runtime registry `sourceIds` and `sourceClasses`; clients cannot self-assert `source_class` authority.

PostgreSQL has durable registry tables in `0002_cybermap_auth_registry.sql`, an additive migration after the immutable `0001_cybermap_core.sql` base schema. Current runtime enforcement loads its registry from `CYBERMAP_AUTH_REGISTRY_JSON` or `CYBERMAP_AUTH_TOKEN_HASHES`; these tables are the durable admin/persistence model until the DB-backed registry loader/reload path lands:

- `api_tokens`: `token_hash`, `token_id`, `client_type`, `scopes`, `expires_at`, `revoked_at`, and rotation linkage. `token_hash` is constrained to `sha256:<64 hex chars>`.
- `api_token_source_scopes`: per-token `source_id`, `source_class`, and scope grants tied back to `source_catalog`.

Token generation/rotation runbook:

1. Generate a high-entropy token outside the repo and deliver it once to the client over an operator-approved secret channel.
2. Store only `sha256:<hex>` in `CYBERMAP_AUTH_REGISTRY_JSON` and/or `api_tokens.token_hash`.
3. To rotate, add the new hash with a new `tokenId` and short overlap window, deploy/reload, move the client, then set the old row `revoked_at` and remove it from runtime JSON.
4. To revoke immediately, remove the hash from `CYBERMAP_AUTH_REGISTRY_JSON` and set `api_tokens.revoked_at`; no API response or log should include the revoked plaintext token.

## Observation batch ingest

`POST /api/v1/observations/batch` is the P0 write spine for Wardriver/RaID devices, Greenfeed workers, Jetson jobs, and future owned devices. It requires a bearer token with `observations:write` and source authority that matches the claimed `source_id` and `source_class`; clients cannot self-assert authority by changing request fields.

Required request headers:

| Header | Purpose |
|---|---|
| `Authorization: Bearer ***` | Service/device token. Runtime stores and logs only the configured `sha256:` hash identity metadata. |
| `Idempotency-Key` | Batch-level sync key. Replays with the same `(source_id, token registry client identity, Idempotency-Key)` and identical normalized payload return the previous receipt without inserting duplicate immutable observations. |
| `Content-Type: application/json` | JSON batch body. |

Canonical body shape:

```json
{
  "contract_version": "bss.wardriver.batch.v1",
  "source_id": "00000000-0000-4000-8000-000000000001",
  "source_class": "owned_device",
  "client_id": "optional-reported-client-id",
  "session_id": "optional-session-uuid",
  "authorized_scope_ref": "optional-authorization-ref",
  "context": {
    "gps": { "lat": 47.6205, "lon": -122.3493, "accuracy_m": 5.8, "provider": "fused" },
    "heading_deg": 184.5,
    "speed_mps": 1.4,
    "map": { "zoom": 17, "visible_layers": ["green_preload", "local_owned"], "viewport_bbox": [-122.351, 47.619, -122.347, 47.622] },
    "raid": { "session_ref": "raid://blue-swallow/alpha/2026-07-10T115900Z", "mode": "owned-local", "sight_count": 2 }
  },
  "provenance": { "adapter": "wardriver-raid", "chain": ["device-local"] },
  "observations": [
    {
      "kind": "wifi_ap",
      "external_observation_key": "device-local-key",
      "idempotency_key": "item-key-within-batch",
      "observed_at": "2026-07-10T11:59:00.000Z",
      "lat": 47.6205,
      "lon": -122.3493,
      "confidence": 0.875,
      "pii_status": "redacted",
      "retention_class": "summary_only",
      "payload": {
        "wigle_enhanced": true,
        "radio_type": "wifi",
        "ssid_hash": "sha256:<hash>",
        "bssid_hash": "sha256:<hash>",
        "signal_dbm": -47,
        "raid_sight_summary": { "sight_id": "sight-wifi-0001", "category": "network-sighting", "confidence": 0.875 },
        "raw_frame_sha256": "sha256:<hash-only-when-known>",
        "raw_frame_present": false
      },
      "provenance": { "sensor": "wardriver", "contract_version": "bss.wardriver.batch.v1" }
    }
  ]
}
```

### Wardriver/RaID payload compatibility

Native Blue Swallow Wardriver P0.10b and RaID context/session work P0.10c should implement against fixture [`tests/fixtures/wardriver-raid-batch-v1.json`](../tests/fixtures/wardriver-raid-batch-v1.json). That fixture is the backend contract lock for `contract_version = "bss.wardriver.batch.v1"`:

- Request path is `POST /api/v1/observations/batch` with `Content-Type: application/json`, bearer auth, and a batch-level `Idempotency-Key`.
- Token registry identity must be `clientType: "wardriver_device"`, include `observations:write`, and authorize the exact owned/local `source_id` plus `source_class: "owned_device"`. The backend rejects spoofed classes such as `green_public`, `orange_exposure`, or `red_restricted` even when the body is otherwise valid.
- The top-level `contract_version` is optional for legacy ingest, but when present it must be a supported literal. Unknown values return `unsupported_contract_version`. Wardriver/RaID clients should always send `bss.wardriver.batch.v1`; additive v1 fields may be ignored by older readers, while breaking shape changes require a new literal and a new fixture.
- `context` is batch-scoped GPS/heading/map/RaID state, capped to 4 KiB, sanitized with the same raw/PII key denylist as observation payloads, and stored in sync-batch request metadata for replay diagnostics. It is not used as token authority.
- Each observation keeps its own `idempotency_key`, `external_observation_key`, `observed_at`, `lat`, `lon`, `confidence`, `pii_status`, `retention_class`, sanitized `payload`, and provenance. Enhanced WiGLE observations use `kind: "wifi_ap"` with hashed SSID/BSSID and radio fields; RaID sight summaries use `kind: "visual_summary"` with redacted `raid_sight_summary` and map context.
- Raw frames are omitted by default. Hash-only fields such as `raw_frame_sha256` are allowed, but raw bytes/base64 keys (`raw_frame`, `raw_frame_bytes`, images, raw PII refs) are rejected unless the explicit raw-retention gate is satisfied.

Validation gates:

- Missing/invalid bearer token returns `auth_required` or `auth_forbidden` before storage.
- Missing `Idempotency-Key` returns `idempotency_key_required`; the API does not use client-provided item keys as the P0 batch replay key.
- `contract_version`, batch `context`, `source_id`, `source_class`, `kind`, `observed_at`, `lat`, `lon`, `confidence`, `pii_status`, `retention_class`, batch/observation UUID references, batch provenance, and observation provenance are validated before DB writes.
- The request `client_id` is optional reported metadata only; sync receipts and idempotency partitioning use the authenticated token registry identity, not a client-supplied string.
- `observations` must contain at least one item.
- `lat`/`lon` are normalized into PostGIS `geom = ST_SetSRID(ST_MakePoint(lon, lat), 4326)`.
- App code computes geohash-equivalent cell IDs in `h3_7`, `h3_9`, and `h3_11` (`gh7:*`, `gh9:*`, `gh11:*`) so PostgreSQL does not require an H3 extension for P0.
- Whole request bodies are capped by `CYBERMAP_BODY_LIMIT_BYTES`; each observation `payload` is capped by `CYBERMAP_OBSERVATION_PAYLOAD_LIMIT_BYTES`; batch count is capped by `CYBERMAP_OBSERVATION_BATCH_MAX_ITEMS`.
- Green source classes (`green_public`, `green_owned`, `green_authorized`) may preload. `owned_device` and `local_observation` are direct/local. `grey_enrichment`, `orange_exposure`, and `red_restricted` require provenance trigger metadata with a `source_class` from a local/owned/green source and an observation/session/authorized-scope reference; self-asserted top-level strings are not sufficient. Violations return `source_policy_forbidden`.
- Product entities for `private-person`, `face`, `license-plate`, or `private-residence` are rejected by default, as are raw payload keys such as raw frames, face images, license-plate images, or raw PII.
- Raw/PII explicit retention (`raw_frame_explicit`, `pii_explicit`, or `pii_status=operator_explicit`) requires `raw_payload_ref`, `operator_approved_raw_ref`, `authorized_scope_ref`, and an authenticated token with `observations:raw-retention` scope; otherwise the route returns `raw_retention_forbidden`.
- Recognizable safe observations synchronously upsert `cyber_entities` and `entity_observations`: Wi-Fi AP/network, BLE device/class, Greenfeed source, claim/event anchor, and mapped place/source entities. Entity edges store confidence, first/last seen, source observation refs, and provenance/source-policy metadata.

Successful inserts create immutable rows in `observations`, update `sync_batches`, and return a receipt:

```json
{
  "ok": true,
  "duplicate": false,
  "receipt": {
    "batch_id": "<uuid>",
    "source_id": "00000000-0000-4000-8000-000000000001",
    "source_class": "owned_device",
    "client_id": "<token-registry-token-id>",
    "idempotency_key": "batch-key",
    "status": "applied",
    "observation_count": 1,
    "observation_ids": ["<uuid>"],
    "payload_hash": "sha256:<hash>",
    "received_at": "2026-07-10T12:00:00.000Z",
    "completed_at": "2026-07-10T12:00:00.000Z"
  }
}
```

Duplicate batch submissions with the same normalized payload return HTTP 200 with `duplicate: true` and the original `receipt`; first writes return HTTP 201. Reusing the same idempotency key for a different normalized payload returns HTTP 409 `idempotency_key_conflict`.

## Cybermap read APIs

Read routes require a valid service/device token with `cybermap:read` (or `sources:read` for `/sources`) plus registered `sourceClasses`. They use fixed product query shapes only; there is no arbitrary SQL-like filter language.

### `GET /api/v1/cybermap/viewport?bbox=&zoom=&layers=&since=`

Required query:

- `bbox=west,south,east,north` in WGS84 degrees. P0 rejects antimeridian-crossing boxes, out-of-range coordinates, and boxes wider/taller than 2 degrees or larger than 2 square degrees.
- `zoom=0..20`, mapped in app code to stored cell resolution: `0..8 -> gh7`, `9..14 -> gh9`, `15..20 -> gh11`.

Optional query:

- `layers=green_preload,local_owned,exposure_enrichment`; unknown layers return `layer_invalid`.
- `since=<ISO timestamp>` filters by caller-visible projected cell `updated_at`; hidden local/owned/restricted layer updates do not make green-only results appear fresh.

The response is bounded to 250 cells and includes `resolution`, normalized `bbox`, `source_classes`, per-cell `source_classes`, `freshness`, `caveats`, `salience`, `confidence` when available, and materialization `provenance`. The database candidate scan is also bounded, then cells are projected through caller authority before `since`, sorting, truncation, and top-level freshness/`updated_at` reporting. Grey/orange/red `exposure_enrichment` layers are projected through caller authority: operator scope can see all, matching restricted `sourceClasses` or `authorized-scope:*` registry scopes can see matching gates, and other callers receive `restricted_layer_filtered` caveats with the layer removed. Non-restricted materialized layers are also checked against the caller's registered source classes; local/owned layers are omitted with `source_class_layer_filtered` when the token only has green authority.

### `GET /api/v1/cybermap/nearby?lat=&lon=&radius_m=&heading_deg=&zoom=&source_class=&layers=`

Wardriver/RaID clients use the nearby context route after posting local observations or while rendering the current sight. It requires `cybermap:read` and registered `sourceClasses`; `source_class` is an exact authority filter, not a self-asserted expansion.

Required query:

- `lat` and `lon` in WGS84 degrees.

Optional query:

- `radius_m=1..1000`; default `250`. The response is bounded to 50 materialized cells even when the radius covers more cells.
- `heading_deg=0..360`; echoed in `context` for RaID overlay alignment and not used for DB authority.
- `zoom=0..20`, mapped with the same `gh7`/`gh9`/`gh11` app-computed resolution rules as viewport reads. Missing `zoom` defaults to resolution for zoom 15.
- `source_class=<canonical source class>` and `layers=green_preload,local_owned,exposure_enrichment` follow viewport projection/gating rules.

The response carries `contract_version: "bss.cybermap.nearby.v1"`, `context`, projected `cells`, `layers`, `source_classes`, `limit_reached`, and a `bounded_nearby_context` caveat. SQL selects from `cybermap_cells` with `ST_DWithin` and never selects raw observation `payload`, `raw_payload_ref`, `operator_approved_raw_ref`, raw frames, or raw PII columns.

### `GET /api/v1/cybermap/cells/{h3Cell}`

`h3Cell` must be an app-computed `gh7:*`, `gh9:*`, or `gh11:*` ID whose precision matches the prefix. The route returns the projected cell summary plus at most 100 observation links (`id`, `kind`, `source_id`, `source_class`, `observed_at`, `confidence`, `provenance`). It does not select raw observation `payload`, raw frame refs, or raw PII columns.

### `GET /api/v1/entities/{id}`

`id` must be a UUID. The route returns entity kind, stable key, display name, source class, first/last seen timestamps, app-computed cell IDs, labels, confidence, sanitized properties, provenance, caveats, and at most 100 observation links from `entity_observations`. Unsafe property keys such as raw frames, SSIDs/BSSIDs, face/license plate images, raw PII, emails, phones, and raw payload refs are stripped before response serialization.

### `GET /api/v1/sources?bbox=&class=`

The source catalog route returns enabled `source_catalog` entries using exact source-class authority and optional bounded bbox intersection. `class` accepts only canonical source classes (`green_public`, `green_owned`, `green_authorized`, `owned_device`, `local_observation`, `grey_enrichment`, `orange_exposure`, `red_restricted`); unauthorized or malformed classes are rejected before any database query. Responses are bounded to 100 sources and include freshness (`last_checked_at`, `cache_ttl_seconds`, `stale`), provenance, and caveats such as `green_preload_allowed`.

## PgBouncer and pooling

The VM cloud-init installs PgBouncer with a placeholder transaction-pooling config:

```ini
[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
pool_mode = transaction
max_client_conn = 50
default_pool_size = 5
reserve_pool_size = 2
```

Operators inject the real private PostgreSQL host and PgBouncer `userlist.txt` through `/etc/pgbouncer/*` on the VM or another secret-managed path. Until that happens, PgBouncer remains disabled and the API still fails closed through `/readyz`.

The app also clamps its own `pg` pool to max 5 connections. That keeps the service safe for Azure PostgreSQL Flexible Server B1MS even if PgBouncer is temporarily bypassed for diagnostics.

## Migration runner

`vm/cybermap-api/package.json` exposes:

```bash
npm run migrate
```

This runs `node migrate.mjs`, discovers `vm/cybermap-api/db/migrations/*.sql` in lexical order, reads applied versions from `schema_migrations`, and applies only unapplied SQL files.

Cloud-init wires startup through:

```text
ExecStartPre=/usr/bin/node /opt/cybermap-api/migrate.mjs --if-configured
```

`--if-configured` exits cleanly when DB settings are absent, preventing missing secrets from causing API crash loops. If DB settings are present but migrations fail, startup fails closed and `/readyz` remains unavailable until the operator fixes the database path.

## Security posture

- Public product ingress is **HTTPS 443** only.
- The Node service listens on **localhost:8000** and is not exposed directly by the NSG.
- `/healthz` and `/readyz` are the only unauthenticated routes; `/api/v1/*` requires auth by default.
- Runtime database URLs and hashed auth registry settings live in `/etc/cybermap-api.env` or an equivalent operator secret path, never in repo files.
- Request bodies are capped (default 1 MiB) before DB-backed routes exist.
- Public HTTPS ingest/read paths use per-token/IP in-memory rate limits by default; set `CYBERMAP_PRIVATE_MESH_ONLY=true` only when ingress is restricted to a private mesh.

## Observability

- `cybermap-api` emits structured JSON logs with method, path, status, duration, and request ID.
- `auth_decision` log events record allow/deny, client type, token ID, scope/source counts, and reason codes without bearer values or token hashes.
- Incoming `X-Request-Id` is preserved; otherwise the API generates one and returns it in the response header.
- `cybermap-worker` emits structured JSON logs for startup, ticks, and shutdown.
- `/readyz` returns migration state with `current`, `expected`, and `status`; it never returns connection strings or raw driver errors.

## Deployment configuration

- Bicep output: `backendApiBaseUrl` (`https://<vm-public-ip>`).
- SWA app setting: `BACKEND_API_BASE_URL`, used by future managed function proxy routes.
- VM secret file: `/etc/cybermap-api.env` for `CYBERMAP_DATABASE_URL`, hashed auth registry JSON/hash settings, rate limits, and pool/readiness overrides.
- PgBouncer config: `/etc/pgbouncer/pgbouncer.ini` and `/etc/pgbouncer/userlist.txt`, both operator-managed for actual credentials.

## Echo retirement note

The previous echo service remains historical scaffolding only. Do not document or wire it as a production route, do not expose 8080, and do not add new frontend affordances that call the retired echo path.
