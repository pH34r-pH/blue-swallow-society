# Cybermap Geospatial Backend

**Source baseline:** `6124e64f8cc4970657a6c060713f97c4f1eb4abd`, reviewed 2026-07-28.
**Scope:** implementation and declared infrastructure only. This document does not prove a live Azure deployment.

## Current boundary

Cybermap is a four-part vertical slice:

```text
Godeye browser
  -> same-origin Static Web App Function
  -> HTTPS VM gateway (Caddy)
  -> loopback Node Cybermap API
  -> private PostgreSQL/PostGIS

Wardriver device
  -> same-origin /api/cybermap/observations/batch
  -> same HTTPS VM gateway
  -> Node Cybermap API
  -> private PostgreSQL/PostGIS
```

The browser does not connect to PostgreSQL. The VM is the transport, contract, and persistence adapter; PostgreSQL/PostGIS is the durable store declared by `infra/main.bicep` and the checked-in migrations.

## Implemented source contracts

| Surface | Route | Auth boundary | Observable behavior |
|---|---|---|---|
| Godeye green summary | `GET /api/cybermap/tiles/{z}/{x}/{y}` | operator token at Function; Cybermap read token at VM | z0–z12 MVT only; no query parameters; no-store response |
| Godeye current context | `POST /api/operator-signals` | operator token at Function; Cybermap read token at VM | accepts bounded coordinates in the browser request body and returns the VM-owned redacted projection |
| Device ingest | `POST /api/cybermap/observations/batch` | device ingest token, device ID, and idempotency key | forwards a strict batch to the VM; no operator token is accepted as device authority |
| VM health | `GET /healthz`, `GET /readyz` | none | process liveness and database/migration readiness |
| VM persistence | `GET`/`PUT /api/v1/paper/state` | dedicated paper-state token | validates and stores the canonical paper-state contract |

The VM additionally implements `POST /api/v1/observations/batch`, `POST /api/v1/cybermap/viewport`, `POST /api/v1/cybermap/operator-signals`, and `GET /api/v1/cybermap/tiles/{z}/{x}/{y}`. `docs/vm-api.md` owns the exact VM contract.

## Godeye policy model

`app/operator/godeye-layers.mjs` defines two frozen client layer specifications:

- **Managed green cells:** MVT summary materializations only; source classes are `green_public`, `green_owned`, and `green_authorized`; safe fields are cell-level counts, salience, source-class summary, freshness, and caveat state.
- **Current authorized context:** transient POST viewport data; it can include the green classes plus `owned_device` and `local_observation`, but exposes only kind, source class, time, and distance to selection logic.

The tile Function rejects query parameters, caps tile zoom at 12, requires HTTPS upstream, and emits `application/vnd.mapbox-vector-tile` with `nosniff` and `no-store`. Empty green materialization is a valid empty tile. Source never seeds a demo RF map.

## Location handling: precise boundary

The browser-facing viewport endpoint rejects location in the browser URL and requires a POST body. This protects browser URL state and browser history.

The Function currently converts the validated `lat`, `lon`, radius, limit, optional age, and optional `now` fields into the **Function-to-VM HTTPS query string**. Therefore the body-only guarantee ends at the Function boundary. Treat that upstream URL as location-sensitive: do not enable request-URL logging on the Function, Caddy, VM, or observability path. A future privacy hardening should change the VM viewport contract to authenticated `POST` with a body.

## Infrastructure declared by source

`infra/main.bicep` composes Static Web Apps, the shared VNet, private PostgreSQL Flexible Server, and `infra/vm-echo-lab.bicep`.

- PostgreSQL is private-VNet only; no public database ingress is declared.
- The VM has public HTTP/HTTPS for ACME and the gateway, SSH restricted by `allowedSourceIp` (checked-in default is deny-by-default), and no NSG rule for port 8080.
- The VM custom extension installs Node 24, Caddy, the checked-in migrations, and `bss-cybermap-api`; the process binds loopback `127.0.0.1:8080` and Caddy is the HTTPS gateway.
- The install script fetches its source archive from the configurable `cybermapSourceTarballUrl`. Its Bicep default points to the mutable `main` branch; this is a deployment-integrity risk, not a release pin.

## Implemented persistence shape

Three ordered migrations exist under `vm/cybermap-api/db/migrations/`:

1. `0001_cybermap_core` — core Cybermap/PostGIS schema.
2. `0002_device_ingest_contract` — device ingest credentials, receipts, and batch contract.
3. `0003_paper_state` — canonical paper-state persistence.

The service has separate in-memory and PostgreSQL store adapters. In-memory storage is a test adapter; it is not a durable fallback. `src/main.mjs` requires `DATABASE_URL`, builds the PostgreSQL store, and fails rather than silently serving demo data.

## Not implemented in this repository

The following formerly described target APIs are not VM routes in the current source: cell detail, entity lookup, source catalog lookup, sensorium sessions, direct observations, and Mosaic/Murmurs memory sync. Do not document or integrate them as available endpoints.

There is also no proof in this repository that a deployed stack is healthy, that migrations ran against an Azure database, or that a Wardriver device completed an end-to-end ingest.

## Verification

```bash
node --test tests/*.test.mjs
(cd vm/cybermap-api && npm ci && npm test)
```

The 2026-07-28 source review ran the existing local VM dependency tree: 41 VM tests passed. Live readiness requires deployment-scoped receipts, not this result.
