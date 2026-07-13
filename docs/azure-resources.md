# Azure Resources Specification

## Overview

This document specifies the Azure infrastructure resources deployed for the Blue Swallow Society project using Bicep templates. The current Cybermap-first stack is: Azure Static Web Apps for the public frontend, Azure Functions as the managed `/api/*` proxy surface, a shared VM/PostgreSQL VNet, an Ubuntu VM API gateway on HTTPS 443, PgBouncer on the VM, private Azure Database for PostgreSQL Flexible Server B1MS + PostGIS, staged custom-domain wiring through Azure DNS, and optional Azure OpenAI.

## Resource Groups

### Primary Resource Group
- **Name**: `rg-blue-swallow` (created if not exists)
- **Purpose**: Contains all project resources
- **Location**: Parameterized (defaults to resource group location; `westus2` in `infra/main.parameters.json`)
- **Scope**: Resource group level deployment

## Core Resources

### 1. Azure Static Web App
- **Type**: `Microsoft.Web/staticSites@2023-01-01`
- **Name**: `blue-swallow-swa` in the canonical parameter file
- **SKU**: Standard
- **Purpose**: Public Godeye/Tzeentch frontend and managed `/api/*` proxy surface.
- **Runtime settings set by CI**:
  - `BACKEND_API_BASE_URL` from the `backendApiBaseUrl` Bicep output.
  - `BLUE_SWALLOW_PASSCODE_SHA256` from GitHub Actions env; compute hashes with `printf %s`, not `echo`.
- **Outputs**:
  - `staticWebAppDefaultHostname`
  - `staticWebAppResourceId`

### 2. Shared Cybermap Network
- **Module**: `modules/network.bicep`
- **Purpose**: Owns the backend VNet at the composition layer so the VM/API gateway and private PostgreSQL use one reachable topology.
- **Virtual Network**: `${prefix}-vm-vnet`, address space `10.40.0.0/16`.
- **Subnets**:
  - `default`: `10.40.0.0/24` for the VM/API gateway NIC.
  - `postgres-subnet`: `10.40.1.0/28`, delegated to `Microsoft.DBforPostgreSQL/flexibleServers`.
- **Private DNS**: `${prefix}.postgres.database.azure.com`, linked to the shared VNet with registration disabled.

### 3. Cybermap VM API Gateway
- **Module**: `vm-echo-lab.bicep` (historical filename; current contents provision the Cybermap gateway).
- **Virtual Machine**:
  - Ubuntu Server 22.04 LTS Gen2.
  - `Standard_B1ms` by default; `Standard_B1s` only for explicit API-only/lab overrides.
  - SSH key authentication only.
  - Daily DevTestLab auto-shutdown for dev cost control.
- **Network Security Group**:
  - SSH 22 from `allowedSourceIp`.
  - Public **HTTPS 443** for the product API gateway.
  - No public 8080 product ingress.
- **Cloud-init services**:
  - `nginx` on HTTPS 443, reverse proxying to `http://127.0.0.1:8000`.
  - `cybermap-api.service`, Node 20 service on **localhost:8000**.
  - `cybermap-worker.service`, Node 20 worker scaffold for Greenfeed polling and Cybermap materialization.
  - `PgBouncer` installed with a placeholder config on `127.0.0.1:6432` for low PostgreSQL connection counts.
- **API guardrails**:
  - `/healthz` is secret-free and does not require DB connectivity.
  - `/readyz` checks DB configuration, PostgreSQL connectivity, and `schema_migrations` version; missing DB settings return sanitized HTTP 503 readiness failure.
  - `/api/v1/*` requires auth by default.
  - Structured JSON logs include a request ID; body-size limits and rate-limit hook points are present.

### 4. Private PostgreSQL Flexible Server
- **Module**: `modules/postgres-flexible.bicep`
- **Purpose**: Durable Cybermap/PostGIS datastore reachable only from the backend VNet.
- **Type**: `Microsoft.DBforPostgreSQL/flexibleServers@2024-08-01`
- **SKU**: Burstable `Standard_B1ms` (`B1MS` cost baseline)
- **Version**: PostgreSQL 16, with `POSTGIS` and `PGCRYPTO` allowed through the `azure.extensions` server parameter for checked-in migrations.
- **Storage**: 32 GiB initial storage, `autoGrow: Disabled` for the P0 cost baseline.
- **Backups**: 7-day point-in-time retention, geo-redundant backup disabled.
- **Network**:
  - Delegated subnet: `postgres-subnet` (`10.40.1.0/28`) from the shared network module.
  - Private DNS zone: `${prefix}.postgres.database.azure.com`, linked to `${prefix}-vm-vnet`.
  - Public network access: disabled. No firewall rule or public PostgreSQL ingress is deployed.
- **Database**: `cybermap` by default, UTF-8 + `en_US.utf8` collation.
- **Safe outputs**:
  - server name
  - host name (`<server>.postgres.database.azure.com`)
  - port (`5432`)
  - database name
  - administrator login
- **Secret handling**: `postgresAdministratorPassword` is a secure Bicep parameter passed from a local secret or GitHub `POSTGRES_ADMIN_PASSWORD`; it is not stored in `main.parameters.json` and is not output.

### 5. Optional Azure OpenAI Account
- **Condition**: Deployed only when `deployOpenAi = true`.
- **Type**: `Microsoft.CognitiveServices/accounts@2023-05-01`.
- **Kind**: OpenAI.
- **SKU**: S0.
- **Outputs**:
  - `openAiEndpoint` when deployed.

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `location` | string | resource group location | Azure region for all resources. |
| `staticWebAppName` | string | required | Canonical SWA name. |
| `prefix` | string | `blue-swallow` | Resource name prefix for VM/networking. |
| `sshPublicKey` | secure string | required | SSH public key for VM admin user. |
| `allowedSourceIp` | string | `*` | CIDR allowed to reach SSH 22. Restrict before production. |
| `vmSize` | string | `Standard_B1ms` | Cybermap VM size. |
| `postgresServerName` | string | `${prefix}-pg` when empty | PostgreSQL Flexible Server name; `main.parameters.json` pins `blue-swallow-pg`. |
| `postgresDatabaseName` | string | `cybermap` | Cybermap application database created on the Flexible Server. |
| `postgresAdministratorLogin` | string | `cybermapadmin` | Password-auth administrator login; password is never output. |
| `postgresAdministratorPassword` | secure string | required | PostgreSQL administrator password passed from local secret/GitHub `POSTGRES_ADMIN_PASSWORD`; never commit or output. |
| `postgresVersion` | string | `16` | PostgreSQL major version suitable for PostGIS. |
| `deployOpenAi` | bool | `false` | Whether to deploy optional Azure OpenAI. |
| `autoShutdownTime` | string | `0200` | Daily VM shutdown time. |
| `autoShutdownTimeZone` | string | `Pacific Standard Time` | Time zone for the shutdown schedule. |

## Outputs

| Output Name | Type | Description |
|---|---|---|
| `staticWebAppDefaultHostname` | string | Deployed Static Web App default hostname. |
| `staticWebAppResourceId` | string | Static Web App ARM resource ID. |
| `backendApiBaseUrl` | string | HTTPS base URL for the VM API gateway. |
| `vmPublicIp` | string | Public IP address of the VM. |
| `vnetId` | string | Shared backend VNet ARM ID. |
| `appSubnetId` | string | Shared VM/API gateway subnet ARM ID. |
| `postgresSubnetId` | string | Delegated PostgreSQL Flexible Server subnet ARM ID. |
| `postgresPrivateDnsZoneId` | string | PostgreSQL private DNS zone ARM ID. |
| `postgresPrivateDnsZoneName` | string | PostgreSQL private DNS zone name. |
| `postgresPrivateDnsZoneVirtualNetworkLinkId` | string | Private DNS zone link ARM ID. |
| `postgresServerName` | string | PostgreSQL Flexible Server resource name. |
| `postgresHostName` | string | PostgreSQL FQDN for VM app settings (`<server>.postgres.database.azure.com`). |
| `postgresPort` | int | PostgreSQL TCP port (`5432`). |
| `postgresDatabaseName` | string | Cybermap application database name. |
| `postgresAdministratorLogin` | string | PostgreSQL administrator username; password is not output. |
| `openAiDeployed` | bool | Whether Azure OpenAI was deployed. |
| `openAiEndpoint` | string | Azure OpenAI endpoint when deployed. |

## Deployment Dependencies
1. Resource group exists or is created.
2. Static Web App resource deploys.
3. Shared network module creates/updates the VNet, VM subnet, delegated PostgreSQL subnet, private DNS zone, and VNet link.
4. PostgreSQL Flexible Server module consumes `postgresSubnetId` and `postgresPrivateDnsZoneId` from the shared network module.
5. VM module consumes `appSubnetId` and provisions the Cybermap gateway host.
6. Optional OpenAI account deploys conditionally.
7. CI writes `CYBERMAP_BACKEND_BASE_URL`, `CYBERMAP_BACKEND_TOKEN`, and `BLUE_SWALLOW_PASSCODE_SHA256` into SWA app settings.
8. Custom domains are wired after SWA deployment using the existing Azure DNS zone for `blueswallow.co.in`.

## Configuration Files

### `infra/main.bicep`
Single resource-group entrypoint. It composes the SWA, shared network, private PostgreSQL Flexible Server, VM API gateway, optional OpenAI module, and safe outputs used by CI.

### `infra/vm-echo-lab.bicep`
Historical filename retained for module continuity. Current behavior provisions the Cybermap API gateway host: NSG, public IP, NIC, VM, cloud-init, nginx HTTPS 443, Node 20 `cybermap-api`, Node 20 `cybermap-worker`, PgBouncer placeholder, and auto-shutdown.

### `infra/modules/postgres-flexible.bicep`
- Encapsulates private Azure Database for PostgreSQL Flexible Server.
- Deploys burstable `Standard_B1ms` compute with PostgreSQL 16, 32 GiB storage, and 7-day backup retention.
- Consumes `postgresSubnetId` and `postgresPrivateDnsZoneId` from `modules/network.bicep`.
- Sets `publicNetworkAccess` to `Disabled` and creates no public firewall rule.
- Creates the `cybermap` database and enables Azure-side allow-listing for `POSTGIS`/`PGCRYPTO` migrations.
- Outputs only non-secret connection values: host, port, database name, server name, and administrator login.

### `infra/main.parameters.json`
- Environment-specific values for westus2, canonical `blue-swallow-swa`, `blue-swallow` prefix, `Standard_B1ms`, private PostgreSQL defaults, and disabled OpenAI by default.
- `allowedSourceIp` carries metadata warning against `'*'` in production and must be restricted before production.
- Includes non-secret PostgreSQL defaults (`blue-swallow-pg`, `cybermap`, `cybermapadmin`, version `16`).
- Excludes `postgresAdministratorPassword`; pass it through `--parameters postgresAdministratorPassword=...` or GitHub `POSTGRES_ADMIN_PASSWORD`.
- Auto-shutdown defaults to `0200` Pacific Standard Time.

### `scripts/wireup-backend-url.sh`
Manual fallback helper for setting `CYBERMAP_BACKEND_BASE_URL` and `CYBERMAP_BACKEND_TOKEN` on the Static Web App. CI does this automatically from the Bicep output plus the `CYBERMAP_BACKEND_TOKEN` GitHub secret.

### `scripts/print-next-steps.sh`
- Post-deployment script summarizing operator next steps.
- Includes `az deployment group what-if` dry-run instructions with secure `sshPublicKey` and `postgresAdministratorPassword` parameters.
- Reminds operators to set `allowedSourceIp` to their developer IP.
- Documents deployment idempotency: re-runs update without destroying state.
- Notes that the legacy SWA resources were deleted after cutover so only `blue-swallow-swa` remains connected to `blueswallow.co.in`.

## Cybermap Operations Plan

The B1ms VM + PostgreSQL B1MS architecture is intentionally low cost, but it must make failures visible instead of pretending the map is omniscient.

### PgBouncer and application pool limits

Run the API through PgBouncer whenever PostgreSQL is enabled. B1MS is small; assume the server must remain below roughly 20 active backend sessions for the whole app until load testing proves otherwise.

Concrete P0 values:

```ini
[pgbouncer]
listen_addr = 127.0.0.1
listen_port = 6432
pool_mode = transaction
max_client_conn = 50
default_pool_size = 5
reserve_pool_size = 2
```

- `CYBERMAP_DATABASE_URL` should normally target PgBouncer: `127.0.0.1:6432`.
- `CYBERMAP_DB_POOL_MAX=5` is the Node `pg` pool cap and values above 5 are clamped by app code.
- Keep PgBouncer `default_pool_size = 5`; do not raise it casually on B1MS.
- Treat `max_client_conn = 50` as queued client capacity, not permission to open 50 server connections.
- Keep a **server connection cap suitable for B1MS**: 5 default server connections plus 2 reserve per database/user pool, with an operator tripwire at 15 active PostgreSQL backends and a hard review before 20.

Inspection commands:

```bash
# VM-local, no secrets printed
sudo systemctl status pgbouncer --no-pager
sudo grep -E '^(pool_mode|max_client_conn|default_pool_size|reserve_pool_size)' /etc/pgbouncer/pgbouncer.ini
sudo systemctl status cybermap-api cybermap-worker --no-pager

# Azure-side server metadata and metrics
az postgres flexible-server show \
  --resource-group rg-blue-swallow \
  --name blue-swallow-pg \
  --query '{sku:sku.name,version:version,storage:storage,backup:backup,network:network.publicNetworkAccess}' \
  -o json
az monitor metrics list \
  --resource "/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/rg-blue-swallow/providers/Microsoft.DBforPostgreSQL/flexibleServers/blue-swallow-pg" \
  --metric active_connections,cpu_percent,memory_percent,storage_percent \
  --interval PT5M \
  --aggregation Average,Maximum \
  -o table
```

Azure portal: PostgreSQL Flexible Server `blue-swallow-pg` → Monitoring → Metrics (`active_connections`, `cpu_percent`, `memory_percent`, `storage_percent`).

### Backup and export plan

Managed backups are the restore path of record:

- Keep Flexible Server point-in-time restore enabled with 7-day retention for P0.
- Geo-redundant backup remains disabled for the low-cost baseline.
- Test restore before public launch by restoring to a temporary server, applying migrations, checking `/readyz`, then deleting the temporary server.

Inspect managed backup settings:

```bash
az postgres flexible-server show \
  --resource-group rg-blue-swallow \
  --name blue-swallow-pg \
  --query '{backup:backup,storage:storage,sku:sku.name}' \
  -o json
```

Optional nightly logical export to Blob is defense-in-depth and operator-driven. It is disabled by default because it requires DB and Blob credentials. Shape:

```bash
# One-shot export on the VM; env comes from /etc/cybermap-backup.env and is not echoed.
sudo install -m 0600 -o root -g root /dev/null /etc/cybermap-backup.env
sudoedit /etc/cybermap-backup.env
sudo /usr/local/bin/cybermap-logical-backup.sh
```

`/etc/cybermap-backup.env` should define non-printed values such as `CYBERMAP_BACKUP_DATABASE_URL`, `CYBERMAP_BACKUP_STORAGE_ACCOUNT`, `CYBERMAP_BACKUP_CONTAINER`, and either managed identity auth or a secret from the VM's local secret store. Do not commit this file and do not pass credentials on the command line.

Timer shape:

```ini
# /etc/systemd/system/cybermap-logical-backup.service
[Unit]
Description=Blue Swallow Cybermap nightly logical backup

[Service]
Type=oneshot
EnvironmentFile=/etc/cybermap-backup.env
ExecStart=/usr/local/bin/cybermap-logical-backup.sh
```

```ini
# /etc/systemd/system/cybermap-logical-backup.timer
[Unit]
Description=Run Cybermap logical backup nightly

[Timer]
OnCalendar=*-*-* 03:17:00
Persistent=true
RandomizedDelaySec=15m

[Install]
WantedBy=timers.target
```

Verification commands:

```bash
sudo systemctl list-timers cybermap-logical-backup.timer --no-pager
sudo journalctl -u cybermap-logical-backup.service -n 50 --no-pager
az storage blob list \
  --account-name "$CYBERMAP_BACKUP_STORAGE_ACCOUNT" \
  --container-name "$CYBERMAP_BACKUP_CONTAINER" \
  --prefix cybermap/ \
  --query '[].{name:name,bytes:properties.contentLength,lastModified:properties.lastModified}' \
  -o table
```

### Monitoring and logging plan

Minimum P0 observability must be implemented as structured logs and explicit counters, not only ad-hoc SSH checks.

Required events/counters:

| Signal | Producer | Concrete shape | Alert/tripwire |
|---|---|---|---|
| API readiness | `/readyz`, `cybermap-api` logs | JSON status with DB connectivity and migration state; log `event=readyz status=<ready|not_configured|unavailable>` | Public Godeye should mark Cybermap degraded after two failed readiness checks. |
| DB connectivity | `/readyz`, PostgreSQL metrics | `dependencies.postgres.status`, Azure `active_connections`, `cpu_percent`, `memory_percent`, `storage_percent` | Page/operator alert if `/readyz` fails for 5 minutes during public service. |
| Worker failures | `cybermap-worker` structured JSON logs + systemd restart count | Log `event=worker_tick`, `event=worker_error`, `event=worker_shutdown`; inspect `NRestarts` | Alert if restart count increases repeatedly or no successful tick in 10 minutes. |
| Ingest rejection count | future `POST /api/v1/observations/batch` | Log `event=ingest_rejected reason=<schema|auth|rate_limit|source_gate|idempotency>` and increment counter | Alert on rate-limit/auth spikes; display partial/degraded data freshness in UI. |
| Degraded Godeye state | API proxy/frontend | SWA/API proxy returns explicit degraded JSON when VM readiness fails; frontend shows offline/degraded banner | VM auto-shutdown is not acceptable for public Godeye unless this banner is visible. |

VM-local commands:

```bash
curl -fsS https://<vm-public-ip>/healthz --insecure
curl -fsS https://<vm-public-ip>/readyz --insecure || true
sudo journalctl -u cybermap-api -u cybermap-worker -o json --since '15 minutes ago' --no-pager
systemctl show cybermap-worker -p NRestarts -p ActiveState -p SubState
```

Azure commands:

```bash
az vm get-instance-view \
  --resource-group rg-blue-swallow \
  --name blue-swallow-vm \
  --query 'instanceView.statuses[].{code:code,message:message,time:time}' \
  -o table
az staticwebapp appsettings list \
  --name blue-swallow-swa \
  --resource-group rg-blue-swallow \
  --query 'properties | keys(@)' \
  -o json
az monitor metrics list \
  --resource "/subscriptions/$AZURE_SUBSCRIPTION_ID/resourceGroups/rg-blue-swallow/providers/Microsoft.Compute/virtualMachines/blue-swallow-vm" \
  --metric 'Percentage CPU,Available Memory Bytes' \
  --interval PT5M \
  --aggregation Average,Maximum \
  -o table
```

Azure portal: VM → Monitoring → Metrics, VM → Boot diagnostics, PostgreSQL → Metrics, Static Web App → Configuration, Resource Group → Activity log, Cost Management → Cost analysis/Budgets.

### VM auto-shutdown decision

- **Development / private experiments**: auto-shutdown at `0200` Pacific is acceptable and keeps the VM compute baseline honest.
- **Public Godeye / field demos**: auto-shutdown is not acceptable unless the frontend and API proxy explicitly show Cybermap offline/degraded state and avoid presenting stale cells as live omniscience.
- If public Godeye becomes continuous, disable the DevTestLab schedule or use a maintenance window with visible UI state.

Inspect and update the schedule:

```bash
az resource show \
  --resource-group rg-blue-swallow \
  --resource-type Microsoft.DevTestLab/schedules \
  --name shutdown-computevm-blue-swallow-vm \
  --query '{status:properties.status,time:properties.dailyRecurrence.time,timeZone:properties.timeZoneId,target:properties.targetResourceId}' \
  -o json

# Disable only when public Godeye needs continuous uptime.
az resource update \
  --resource-group rg-blue-swallow \
  --resource-type Microsoft.DevTestLab/schedules \
  --name shutdown-computevm-blue-swallow-vm \
  --set properties.status=Disabled
```

### Storage and partition rollover

Azure PostgreSQL storage can grow but not shrink. The P0 template keeps `autoGrow: Disabled` and a 32 GiB starting point to prevent silent cost drift. If storage pressure forces an increase, treat it as permanent budget movement unless the server is rebuilt/restored into a smaller allocation.

Monthly rollover once observations exceed toy scale:

1. Keep `observations` append-only and promote it to monthly range partitions, e.g. `observations_2026_07` by `observed_at`.
2. Create the next month partition at least seven days before month-end.
3. Keep indexes local to each partition for `geom`, `observed_at`, `h3_9`, `(kind, source_class)`, and `payload` GIN where needed.
4. Add a worker/admin check that rejects writes if the current month partition is missing rather than falling into a default unbounded table.
5. Archive or detach old partitions only after backup/export verification and product retention review.

Inspection commands:

```sql
-- psql from the VM through PgBouncer/direct private DB, with credentials from secret env only.
SELECT inhrelid::regclass AS partition
FROM pg_inherits
WHERE inhparent = 'observations'::regclass
ORDER BY 1;

SELECT schemaname, relname, n_live_tup, n_dead_tup
FROM pg_stat_user_tables
WHERE relname LIKE 'observations%'
ORDER BY relname;
```

### Budget watch checklist

Baseline from `docs/cybermap-geospatial-backend.md`:

- VM `Standard_B1s`: about $7.59/month at 730h.
- VM `Standard_B1ms`: about $15.11/month at 730h.
- PostgreSQL Flexible Server `B1MS`: about $12.41/month at 730h.
- PostgreSQL 32 GiB storage: about $3.68/month.
- PostgreSQL 7 GiB LRS backup: about $0.67/month.
- Working target for VM B1ms + PG B1MS + 32 GiB storage + 7 GiB backup: about $31.87/month before public IP, bandwidth, Blob export storage, tax, and any Azure OpenAI usage.

Weekly/monthly checks:

1. Cost Management → Cost analysis: filter `rg-blue-swallow`; group by service name and meter.
2. Cost Management → Budgets: set alert near the low-cost target plus a small public IP/bandwidth buffer.
3. Confirm VM size remains `Standard_B1ms` unless deliberately dropped to `Standard_B1s` for API-only/lab mode.
4. Confirm PostgreSQL SKU remains burstable `Standard_B1ms`.
5. Confirm PostgreSQL storage remains 32 GiB unless an explicit irreversible storage increase was approved.
6. Confirm backup storage is near expected size; logical exports to Blob should have lifecycle rules or manual pruning.
7. Confirm Azure OpenAI remains disabled unless a task explicitly enables it.
8. Watch public IP and bandwidth charges once field devices or public Godeye traffic starts.

Commands:

```bash
az vm show \
  --resource-group rg-blue-swallow \
  --name blue-swallow-vm \
  --query '{size:hardwareProfile.vmSize,location:location}' \
  -o json
az postgres flexible-server show \
  --resource-group rg-blue-swallow \
  --name blue-swallow-pg \
  --query '{sku:sku.name,storage:storage.storageSizeGb,backup:backup.backupRetentionDays,geoBackup:backup.geoRedundantBackup}' \
  -o json
az consumption usage list \
  --start-date "$(date -u +%Y-%m-01)" \
  --end-date "$(date -u +%Y-%m-%d)" \
  --query "[?contains(instanceName, 'blue-swallow') || contains(resourceGroup, 'rg-blue-swallow')].{date:date,pretaxCost:pretaxCost,meter:meterDetails.meterName,resource:instanceName}" \
  -o table
```

## Production Considerations
1. Restrict `allowedSourceIp` to operator SSH ranges or replace direct SSH with Bastion/jumpbox.
2. Replace the bootstrap self-signed nginx certificate with managed cert automation or put the VM behind a managed TLS edge.
3. Inject API tokens and database settings from operator-controlled secret paths only.
4. Keep PostgreSQL private-only; browser clients never receive DB credentials.
5. Wire Azure Monitor / Log Analytics before public Godeye runs continuously; until then, use systemd journals, `/readyz`, and Azure metrics as explicit checks.
6. Delete or disconnect legacy SWA resources after custom-domain cutover so only `blue-swallow-swa` owns `blueswallow.co.in`.
7. Run `az deployment group what-if` before every infrastructure change and stop if Azure predicts VM, NIC, VNet, PostgreSQL replacement, new public PostgreSQL ingress, or resource deletion.

## Current State
The infrastructure as defined in the Bicep templates:
- Creates a functional development/experimentation environment.
- Provides isolation through explicit shared networking, NSG rules, and a delegated private PostgreSQL subnet.
- Includes PostgreSQL private DNS zone linkage reachable from the VM/API subnet.
- Deploys private PostgreSQL Flexible Server `blue-swallow-pg` on burstable B1MS compute with PostgreSQL 16, 32 GiB storage, `autoGrow: Disabled`, and 7-day backups.
- Keeps PostgreSQL public network access disabled; VM reaches the database through VNet/private DNS only.
- Includes automated service startup via cloud-init.
- Implements basic cost controls through auto-shutdown.
- Defaults the Cybermap VM to Standard_B1ms while preserving an explicit B1s override path.
- Supports optional AI capabilities through OpenAI integration.
- Is parameterized for reuse across environments.
- Exports only non-secret connection information for frontend configuration and downstream PostgreSQL private networking.

Full backend design: [`docs/cybermap-geospatial-backend.md`](./cybermap-geospatial-backend.md).
