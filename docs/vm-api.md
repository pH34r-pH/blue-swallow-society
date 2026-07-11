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
| `/api/v1/*` | bearer/operator token required | scaffold | Denies unauthenticated requests by default; authenticated requests receive controlled `not_implemented` until product routes land. |

Planned `/api/v1/*` routes remain those in [`docs/cybermap-geospatial-backend.md`](./cybermap-geospatial-backend.md): observation batch ingest, Cybermap viewport/cell/entity reads, source catalog lookup, sensorium sessions, direct observations, and Mosaic/Murmurs memory sync.

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
| `CYBERMAP_EXPECTED_MIGRATION` | `0001_cybermap_core` | Migration version `/readyz` expects to see as the latest row in `schema_migrations`. |
| `CYBERMAP_MIGRATIONS_DIR` | `/opt/cybermap-api/db/migrations` | Optional override for the migration runner. |
| `CYBERMAP_DB_SSL` / `CYBERMAP_DB_SSLMODE` | unset | Set to `require` when connecting directly to Azure PostgreSQL instead of local PgBouncer. |
| `CYBERMAP_API_TOKEN`, `CYBERMAP_API_TOKENS`, `BLUE_SWALLOW_OPERATOR_TOKEN` | unset | Bearer/operator auth tokens for `/api/v1/*`; comma-separated tokens are supported in `CYBERMAP_API_TOKENS`. |

Missing `CYBERMAP_DATABASE_URL` does **not** crash-loop the API. `/readyz` returns HTTP 503 with `dependencies.postgres.status = "not_configured"` and a non-secret `missing` list. Driver errors are collapsed to `db_unavailable` so passwords, URLs, private hostnames, and raw connection strings never leave the process.

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

For P0 operations, keep this as the B1MS ceiling until load tests prove otherwise:

| Control | Value | Reason |
|---|---:|---|
| PgBouncer `max_client_conn` | `50` | Allows queued local API/worker clients without opening 50 server sessions. |
| PgBouncer `default_pool_size` | `5` | Caps normal PostgreSQL server connections per database/user pool. |
| PgBouncer `reserve_pool_size` | `2` | Small burst reserve without turning B1MS into a connection fan-out target. |
| App `CYBERMAP_DB_POOL_MAX` | `5` | Node pool hard cap; values above 5 are clamped. |
| B1MS active server connection tripwire | `15` warning / `20` review gate | Leaves headroom for admin sessions, migrations, and Azure internals. |

Inspect live settings without printing credentials:

```bash
sudo grep -E '^(pool_mode|max_client_conn|default_pool_size|reserve_pool_size)' /etc/pgbouncer/pgbouncer.ini
systemctl show cybermap-api cybermap-worker pgbouncer -p ActiveState -p SubState -p NRestarts --no-pager
```

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
- Runtime tokens and database URLs live in `/etc/cybermap-api.env` or an equivalent operator secret path, never in repo files.
- Request bodies are capped (default 1 MiB) before DB-backed routes exist.
- The API exposes a `rateLimitHook` seam so a later hardening task can enforce per-device/operator limits without rewriting handlers.

## Observability

- `cybermap-api` emits structured JSON logs with method, path, status, duration, and request ID.
- Incoming `X-Request-Id` is preserved; otherwise the API generates one and returns it in the response header.
- `cybermap-worker` emits structured JSON logs for startup, ticks, errors, and shutdown.
- `/readyz` returns migration state with `current`, `expected`, and `status`; it never returns connection strings or raw driver errors.
- Future ingest routes must log `event=ingest_rejected` with a bounded `reason` such as `schema`, `auth`, `rate_limit`, `source_gate`, or `idempotency` so rejection counts can be monitored without leaking payloads.
- Public Godeye must show an offline/degraded state when `/readyz` or the SWA proxy cannot reach the VM gateway; stale Cybermap cells must not be presented as live.

Concrete checks:

```bash
curl -fsS https://<vm-public-ip>/healthz --insecure
curl -fsS https://<vm-public-ip>/readyz --insecure || true
sudo journalctl -u cybermap-api -u cybermap-worker -o json --since '15 minutes ago' --no-pager
systemctl show cybermap-worker -p NRestarts -p ActiveState -p SubState --no-pager
```

Azure-side checks:

```bash
az vm get-instance-view --resource-group rg-blue-swallow --name blue-swallow-vm -o table
az monitor metrics list \
  --resource "/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/rg-blue-swallow/providers/Microsoft.DBforPostgreSQL/flexibleServers/blue-swallow-pg" \
  --metric active_connections,cpu_percent,memory_percent,storage_percent \
  --interval PT5M \
  --aggregation Average,Maximum \
  -o table
```

## Backup, rollover, and shutdown posture

- Managed PostgreSQL backups are the restore path of record: P0 uses 7-day point-in-time restore with geo-redundant backup disabled.
- Optional nightly logical exports to Blob should run from a root-owned systemd timer using `/etc/cybermap-backup.env`; credentials must come from the VM secret store or managed identity and must not be printed.
- Use `scripts/cybermap-logical-backup.sh` as the disabled-by-default command shape for `pg_dump` plus Blob upload.
- Partition or roll monthly observation tables once volume exceeds toy scale; create next-month partitions before month-end and reject writes if the current partition is missing.
- PostgreSQL storage auto-grow is disabled in the P0 Bicep. If enabled later, remember Azure PostgreSQL storage can grow but not shrink.
- VM auto-shutdown is acceptable for dev/private experiments. Public Godeye must either disable auto-shutdown or show an explicit offline/degraded UI state.

## Deployment configuration

- Bicep output: `backendApiBaseUrl` (`https://<vm-public-ip>`).
- SWA app setting: `BACKEND_API_BASE_URL`, used by future managed function proxy routes.
- VM secret file: `/etc/cybermap-api.env` for `CYBERMAP_DATABASE_URL`, auth tokens, and pool/readiness overrides.
- PgBouncer config: `/etc/pgbouncer/pgbouncer.ini` and `/etc/pgbouncer/userlist.txt`, both operator-managed for actual credentials.

## Echo retirement note

The previous echo service remains historical scaffolding only. Do not document or wire it as a production route, do not expose 8080, and do not add new frontend affordances that call the retired echo path.
