# VM Cybermap API

**Source baseline:** `6124e64f8cc4970657a6c060713f97c4f1eb4abd`, reviewed 2026-07-28. This document describes the implementation and the Bicep deployment declaration. It is not a live-service status report.

## Responsibility

`vm/cybermap-api/` is the Node 24 backend for Cybermap ingest, map reads, and canonical paper-state persistence. It binds to loopback by default. Caddy terminates HTTPS on the VM public gateway and reverse-proxies to the local process. PostgreSQL Flexible Server is the durable store; the browser never connects to it.

```text
SWA Functions -> HTTPS Caddy :443 -> 127.0.0.1:8080 Cybermap API -> private PostgreSQL/PostGIS
field device  -> HTTPS Caddy :443 -> 127.0.0.1:8080 Cybermap API -> private PostgreSQL/PostGIS
```

The Bicep path is `infra/main.bicep` -> `infra/vm-echo-lab.bicep` -> `infra/scripts/install-cybermap-api.sh`. The installer disables the legacy echo systemd service after installing the Cybermap service. It currently retrieves a mutable `main` archive; deployment integrity is not yet commit-pinned.

## Implemented HTTP contract

| Method and route | Authentication | Source behavior |
|---|---|---|
| `GET /healthz` | none | Process health response. |
| `GET /readyz` | none | Store readiness response. |
| `GET /echo` | none | Legacy compatibility echo path. |
| `POST /api/v1/observations/batch` | device token, device ID, idempotency key | Strict `bss.observation_batch.v1` ingest with replay/conflict semantics. |
| `POST /api/v1/cybermap/viewport` | `X-Blue-Swallow-Cybermap-Read-Token` | Bounded exact-location detail query. Coordinates are accepted only in authenticated JSON bodies. |
| `POST /api/v1/cybermap/operator-signals` | `X-Blue-Swallow-Cybermap-Read-Token` | VM-owned `bss.operator_signal_snapshot.v1` projection; suppresses raw network identifiers. |
| `GET /api/v1/cybermap/tiles/{z}/{x}/{y}` | backend read token | Green-source-only MVT cell summary. Zoom is constrained to `0..12`. |
| `GET /api/v1/paper/state` | paper-state token | Read the latest validated canonical paper snapshot. |
| `PUT /api/v1/paper/state` | paper-state token and idempotency key | Validate and persist the canonical paper snapshot. |

Any other path returns `404`. The source contains no implementation for the larger historical proposal list of sessions, entities, narrative, journal, source-catalog, or generic memory endpoints.

## Ingest guarantees

The observation-batch handler:

- requires JSON, a device token, device ID, and `Idempotency-Key`;
- requires header/body device and idempotency values to match;
- limits body size and batch cardinality;
- authenticates a scoped device credential through the store;
- validates the closed batch schema before persistence;
- returns the original durable receipt for an exact retry;
- rejects changed content under an existing batch or observation identity;
- derives geometry and H3 7/9/11 server-side; and
- uses bounded PostgreSQL transactions, advisory locks, credential revalidation, and active-session ownership checks in `PostgresObservationStore`.

The Function route `POST /api/cybermap/observations/batch` is a transport boundary for field devices. It forwards the three required device headers and exact body over HTTPS; it does not use an operator session as a substitute for device authentication.

## Map-read guarantees

The Static Web App Functions enforce an operator token before forwarding map reads. The VM then verifies a separate backend read token.

- Viewport: location data is rejected at the Function query string and accepted only from a POST body. Radius is bounded to 25–5,000 metres and result limit to 1–500.
- Tiles: request queries are rejected; `z`, `x`, and `y` are checked before outbound I/O. The VM returns MVT bytes only.
- Both paths require an HTTPS `BACKEND_CYBERMAP_BASE_URL`, use a bounded request timeout, and return `Cache-Control: no-store`.

## Paper-state guarantees

The paper-state route accepts only a canonical `bss.paper_state.v3` snapshot (with rolling read support for v2). Its ledger is exactly three aggression lines × eight strategy IDs = 24 unique books. All state is paper-only. The VM validates idempotency, bounded arrays, timestamps, cost accounting, book identities, and governance fields before accepting a write.

The browser does not write this endpoint. The local deterministic engine is the intended producer; Tzeentch is a read adapter.

## Runtime configuration

| Variable | Owner | Rule |
|---|---|---|
| `DATABASE_URL` | VM only | PostgreSQL connection; never expose to browser, APK, arguments, or logs. |
| `BSS_CYBERMAP_BIND_HOST` | VM only | Defaults to `127.0.0.1`. |
| `BSS_CYBERMAP_PORT` | VM only | Defaults to `8080`; no NSG rule exposes it. |
| `BSS_CYBERMAP_READ_TOKEN` | Function + VM | Shared backend map-read secret. |
| `BSS_PAPER_STATE_TOKEN` | Function + VM + trusted producer | Dedicated paper-state secret. |
| `BACKEND_CYBERMAP_BASE_URL` | Functions | Must be HTTPS. |
| `BACKEND_PAPER_STATE_BASE_URL` | Functions | Must be HTTPS; defaults to the Cybermap backend URL when omitted. |

The GitHub Actions deployment workflow validates secret shape before invoking Bicep, then writes only required Function settings. Values are intentionally absent from repository docs and source.

## Infrastructure declared in source

- VM: Ubuntu 22.04, public static IP, restricted SSH, ACME HTTP on 80, and HTTPS gateway on 443.
- Application port: loopback-only Node API at 8080 behind Caddy.
- Database: PostgreSQL Flexible Server through a delegated subnet and private DNS zone.
- Migrations: `0001_cybermap_core.sql`, `0002_device_ingest_contract.sql`, `0003_paper_state.sql`, applied in order by the installer.
- Service hardening: systemd `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=full`, and `ProtectHome=true`.

The source tree alone does not verify that Caddy has a certificate, migrations have applied, the service has started, or a database is reachable.

## Verification

```bash
node --test tests/cybermap-schema.test.mjs \
  tests/cybermap-ingest-api.test.mjs \
  tests/cybermap-viewport-api.test.mjs \
  tests/cybermap-tiles-api.test.mjs \
  tests/paper-state-contract.test.mjs \
  tests/paper-state-proxy.test.mjs

(cd vm/cybermap-api && npm ci && npm test)
```

A production promotion requires, at minimum, a commit-pinned service artifact, a disposable PostGIS migration proof, authenticated device replay proof, authenticated map-read proof, and an operator-visible rollback receipt.
