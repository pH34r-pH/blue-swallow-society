# VM API Gateway Specification

## Overview
The Blue Swallow Society VM is now the **Cybermap API gateway** host, not a product echo path. The gateway is rebuilt by Bicep/cloud-init and should remain replaceable: durable Cybermap state lives in Azure Database for PostgreSQL Flexible Server with PostGIS.

Target request flow:

```text
Browser / Wardriver / Jetson
  -> HTTPS 443 on the VM gateway or SWA /api/* proxy
  -> nginx reverse proxy
  -> cybermap-api on localhost:8000
  -> PgBouncer on localhost:6432 (placeholder until DB wiring lands)
  -> Azure PostgreSQL Flexible Server (future DB task)
```

## Runtime services

| Service | Location | Purpose |
|---|---|---|
| `nginx` | `/etc/nginx/sites-available/cybermap-api` | Terminates HTTPS 443 and proxies requests to `127.0.0.1:8000`. |
| `cybermap-api.service` | `/opt/cybermap-api/server.mjs` | Node 20 API gateway scaffold. |
| `cybermap-worker.service` | `/opt/cybermap-worker/worker.mjs` | Node 20 background worker scaffold for Greenfeed polling and cell materialization. |
| `pgbouncer` | `/etc/pgbouncer/pgbouncer.ini` | Installed with a placeholder low-connection-count config; credentials/DB host are injected only in the DB connection task. |

The Bicep module file is still named `infra/vm-echo-lab.bicep` for continuity, but its cloud-init now provisions Cybermap gateway services. The old echo lab is retired as a production path and 8080 is not the long-term public API surface.

## Endpoints

| Endpoint | Auth | Status in this slice | Notes |
|---|---|---|---|
| `GET /healthz` | none | implemented | Secret-free process health. Does not check PostgreSQL and does not expose dependency state. |
| `GET /readyz` | none | placeholder | Returns `pending-db-task` until PgBouncer/PostgreSQL connectivity and migration checks land. |
| `/api/v1/*` | bearer/operator token required | placeholder | Denies unauthenticated requests by default; authenticated requests receive a controlled `not_implemented` response until product routes land. |

Planned `/api/v1/*` routes remain those in [`docs/cybermap-geospatial-backend.md`](./cybermap-geospatial-backend.md): observation batch ingest, Cybermap viewport/cell/entity reads, source catalog lookup, sensorium sessions, direct observations, and Mosaic/Murmurs memory sync.

## Security posture

- Public product ingress is **HTTPS 443** only.
- The Node service listens on **localhost:8000** and is not exposed directly by the NSG.
- `/healthz` and `/readyz` are the only unauthenticated routes; `/api/v1/*` requires auth by default.
- Runtime tokens live in `/etc/cybermap-api.env` or an equivalent operator secret path, never in repo files.
- Request bodies are capped (default 1 MiB) before DB-backed routes exist.
- The API exposes a `rateLimitHook` seam so a later hardening task can enforce per-device/operator limits without rewriting handlers.

## Observability

- `cybermap-api` emits structured JSON logs with method, path, status, duration, and request ID.
- Incoming `X-Request-Id` is preserved; otherwise the API generates one and returns it in the response header.
- `cybermap-worker` emits structured JSON logs for startup, ticks, and shutdown.

## Deployment configuration

- Bicep output: `backendApiBaseUrl` (`https://<vm-public-ip>`).
- SWA app setting: `BACKEND_API_BASE_URL`, used by future managed function proxy routes.
- PgBouncer placeholder listens on `127.0.0.1:6432`; DB host, username, and auth file content are intentionally absent until the DB connection task.

## Echo retirement note

The previous echo service remains historical scaffolding only. Do not document or wire it as a production route, do not expose 8080, and do not add new frontend affordances that call the retired echo path.
