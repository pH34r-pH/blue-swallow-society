# BSS Cybermap API

Node 24 service for the Cybermap backend. It owns strict observation ingest, bounded map reads, and canonical paper-state persistence. It is not a browser service.

**Source baseline:** `6124e64f8cc4970657a6c060713f97c4f1eb4abd`, reviewed 2026-07-28. IaC contains a VM installation path, but this file does not assert that the service, PostgreSQL, migrations, or DNS are live.

## Implemented routes

| Route | Required credential | Purpose |
|---|---|---|
| `GET /healthz` | none | Process health. |
| `GET /readyz` | none | Store readiness. |
| `GET /echo` | none | Legacy compatibility route. |
| `POST /api/v1/observations/batch` | device ingest token + device ID + idempotency key | Strict batch ingest. |
| `POST /api/v1/cybermap/viewport` | backend read token | Bounded current-location detail. Coordinates are accepted only in an authenticated JSON body. |
| `POST /api/v1/cybermap/operator-signals` | backend read token | Redaction-safe, provenance-bearing operator projection. |
| `GET /api/v1/cybermap/tiles/{z}/{x}/{y}` | backend read token | Green-source MVT cell summaries. |
| `GET` / `PUT /api/v1/paper/state` | paper-state token; PUT also needs idempotency key | Canonical 3×8 paper-state read/write. |

## Ingest contract

The service accepts only JSON `bss.observation_batch.v1`. The request must include:

```http
Content-Type: application/json; charset=utf-8
X-Blue-Swallow-Ingest-Token: [REDACTED]
X-Blue-Swallow-Device-Id: wardriver-device-id
Idempotency-Key: batch-00000000-0000-4000-8000-000000000001
```

Header/body `device_id` and `idempotency_key` must match. The PostgreSQL store persists only a SHA-256 digest of the device token, rechecks credential state in the transaction, rejects changed-content replays, and returns the original durable receipt for an exact replay.

| Response | Meaning |
|---|---|
| `201` | Initial successful application. |
| `200` with `Idempotent-Replayed: true` | Exact replay; response is the original receipt. |
| `400` | Invalid JSON, parameter, or header/body identity mismatch. |
| `403` | Invalid, disabled, expired, or under-scoped device credential. |
| `409` | Existing batch or observation identity has different content. |
| `413` | Body or observation count exceeds a bound. |
| `415` | Content type is not JSON. |
| `422` | Payload violates the strict contract or privacy policy. |

Clients cannot choose `source_id`, `source_class`, geometry, H3 cells, ingest timestamps, trust, or authorization fields. The server derives geometry and H3 resolutions 7, 9, and 11.

## Paper state

`PUT /api/v1/paper/state` accepts the closed, paper-only 24-book state emitted by the local deterministic paper engine. The current schema is `bss.paper_state.v3`; the reader accepts v2 during the rolling transition. The store validates all book IDs, timestamps, accounting/cost fields, bounded events, idempotency keys, and governance invariants.

No real-money, brokerage, wallet, or exchange adapter belongs in this service.

## Local test

```bash
cd vm/cybermap-api
npm ci
npm test
```

Root schema/edge tests:

```bash
cd ../..
node --test tests/cybermap-schema.test.mjs \
  tests/cybermap-ingest-api.test.mjs \
  tests/cybermap-viewport-api.test.mjs \
  tests/cybermap-tiles-api.test.mjs \
  tests/paper-state-contract.test.mjs \
  tests/paper-state-proxy.test.mjs
```

## Local PostgreSQL/PostGIS run

Apply the ordered migrations from `db/migrations/` to an isolated PostGIS database. Then provide only local secret values:

```bash
export DATABASE_URL='postgresql://bss_api:[REDACTED]@127.0.0.1:5432/cybermap?sslmode=require'
export BSS_CYBERMAP_BIND_HOST='127.0.0.1'
export BSS_CYBERMAP_PORT='8080'
export BSS_CYBERMAP_READ_TOKEN='[REDACTED]'
export BSS_PAPER_STATE_TOKEN='[REDACTED]'
npm start
```

`DATABASE_URL` and raw tokens must remain in protected runtime configuration. Do not place them in the repository, browser state, Android APK, process arguments, or logs.

## IaC installation path

`infra/scripts/install-cybermap-api.sh` installs Node 24, copies the service to `/opt/bss/cybermap-api`, applies migrations `0001`–`0003`, writes `/etc/bss/cybermap-api.env` mode `0600`, installs `bss-cybermap-api.service`, configures Caddy to proxy HTTPS traffic to loopback port 8080, and disables `echo-server.service`.

The installer accepts only a deployment-supplied full Git commit archive and SHA-256 digest. It verifies their agreement before extraction or migrations, then writes `/etc/bss/cybermap-api-release.json` with the revision, archive digest, installation time, and applied migrations. The declared path is source evidence; inspect that receipt on the VM after deployment before treating it as live proof.
