# Azure Resources Specification

## Overview
This document specifies the Azure infrastructure resources deployed for the Blue Swallow Society project using Bicep templates. The current target is a Cybermap-first stack: Azure Static Web Apps for the public frontend, a shared VM/PostgreSQL network, an Ubuntu VM API gateway, staged custom-domain wiring through Azure DNS, and optional Azure OpenAI.

## Resource Groups

### Primary Resource Group
- **Name**: `rg-blue-swallow` (created if not exists)
- **Purpose**: Contains all project resources
- **Location**: Parameterized (defaults to resource group location)
- **Scope**: Resource group level deployment

## Core Resources

### 1. Azure Static Web App
- **Type**: `Microsoft.Web/staticSites@2023-01-01`
- **Name**: `blue-swallow-swa` in the canonical parameter file
- **SKU**: Standard
- **Purpose**: Public Godeye/Tzeentch frontend and managed `/api/*` proxy surface.
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
  - Daily DevTestLab auto-shutdown for cost control.
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

### 4. PostgreSQL/PostGIS Target
The shared network already exports `postgresSubnetId`, `postgresPrivateDnsZoneId`, and `postgresPrivateDnsZoneName` for the datastore slice. PostgreSQL Flexible Server must use private VNet access only and must not create a second hidden VNet.

### 5. Optional Azure OpenAI Account
- **Condition**: Deployed only when `deployOpenAi = true`.
- **Type**: `Microsoft.CognitiveServices/accounts@2023-05-01`.
- **Kind**: OpenAI.
- **SKU**: S0.

## Parameters

| Parameter | Type | Default | Description |
|---|---|---|---|
| `location` | string | resource group location | Azure region for all resources. |
| `staticWebAppName` | string | required | Canonical SWA name. |
| `prefix` | string | `blue-swallow` | Resource name prefix for VM/networking. |
| `sshPublicKey` | secure string | required | SSH public key for VM admin user. |
| `allowedSourceIp` | string | `*` | CIDR allowed to reach SSH 22. Restrict before production. |
| `vmSize` | string | `Standard_B1ms` | Cybermap VM size. |
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
| `openAiDeployed` | bool | Whether Azure OpenAI was deployed. |
| `openAiEndpoint` | string | Azure OpenAI endpoint when deployed. |

## Deployment Dependencies
1. Resource group exists or is created.
2. Static Web App resource deploys.
3. Shared network module creates/updates the VNet, VM subnet, delegated PostgreSQL subnet, private DNS zone, and VNet link.
4. VM module consumes `appSubnetId` and provisions the Cybermap gateway host.
5. Future PostgreSQL module consumes the exported PostgreSQL subnet/private DNS IDs.
6. Optional OpenAI account deploys conditionally.
7. CI writes `CYBERMAP_BACKEND_BASE_URL`, `CYBERMAP_BACKEND_TOKEN`, and `BLUE_SWALLOW_PASSCODE_SHA256` into SWA app settings.
8. Custom domains are wired after SWA deployment using the existing Azure DNS zone for `blueswallow.co.in`.

## Configuration Files

### `infra/main.bicep`
Single resource-group entrypoint. It composes the SWA, shared network, VM API gateway, optional OpenAI module, and outputs used by CI.

### `infra/vm-echo-lab.bicep`
Historical filename retained for module continuity. Current behavior provisions the Cybermap API gateway host: NSG, public IP, NIC, VM, cloud-init, nginx HTTPS 443, Node 20 `cybermap-api`, Node 20 `cybermap-worker`, PgBouncer placeholder, and auto-shutdown.

### `infra/main.parameters.json`
- Environment-specific values for westus2, canonical `blue-swallow-swa`, `blue-swallow` prefix, `Standard_B1ms`, and disabled OpenAI by default.
- `allowedSourceIp` carries metadata warning against `'*'` in production and must be restricted before production.
- Legacy SWA resources deleted after cutover: `blue-swallow-society`, `wonderful-pond-0623ed81e`.
- Auto-shutdown defaults to `0200` Pacific Standard Time.

### `scripts/wireup-backend-url.sh`
Manual fallback helper for setting `CYBERMAP_BACKEND_BASE_URL` and `CYBERMAP_BACKEND_TOKEN` on the Static Web App. CI does this automatically from the Bicep output plus the `CYBERMAP_BACKEND_TOKEN` GitHub secret.

### `scripts/print-next-steps.sh`
- Post-deployment script summarizing operator next steps.
- Includes `az deployment group what-if` dry-run instructions.
- Reminds operators to set `allowedSourceIp` to their developer IP.
- Documents deployment idempotency: re-runs update without destroying state.
- Notes that the legacy SWA resources were deleted after cutover so only `blue-swallow-swa` remains connected to `blueswallow.co.in`.

## Production Considerations
1. Restrict `allowedSourceIp` to operator SSH ranges or replace direct SSH with Bastion/jumpbox.
2. Replace the bootstrap self-signed nginx certificate with managed cert automation or put the VM behind a managed TLS edge.
3. Inject API tokens and database settings from operator-controlled secret paths only.
4. Keep PostgreSQL private-only; browser clients never receive DB credentials.
5. Add Azure Monitor/Log Analytics after the service shape stabilizes.
6. Delete or disconnect legacy SWA resources after custom-domain cutover so only `blue-swallow-swa` owns `blueswallow.co.in`.

## Current State
The infrastructure now treats the VM as a rebuildable Cybermap API/worker gateway. Echo-era connectivity scaffolding is no longer product ingress; the target public API surface is HTTPS 443 with authenticated `/api/v1/*` routes.
