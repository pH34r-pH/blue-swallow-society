# Azure Resources Specification

## Overview
This document specifies the Azure infrastructure resources deployed for the Blue Swallow Society project using Bicep templates. The architecture includes Azure Static Web Apps, custom-domain wiring through Azure DNS, explicit shared VNet topology for the VM/API gateway and private PostgreSQL, Ubuntu VM with echo/API scaffold, networking components, and optional Azure OpenAI integration.

## Resource Groups

### Primary Resource Group
- **Name**: `rg-blue-swallow` (created if not exists)
- **Purpose**: Contains all project resources
- **Location**: Parameterized (defaults to resource group location)
- **Scope**: Resource group level deployment

## Core Resources

### 1. Azure Static Web App
- **Type**: `Microsoft.Web/staticSites@2023-01-01`
- **SKU**: Standard (enables custom domains, staging slots, linked APIs)
- **Properties**: Minimal (relies on linked APIs and app settings)
- **Outputs**: 
  - `defaultHostname`: Static web app URL
  - `resourceId`: Static web app ARM resource ID (used by the apex alias record)

### 2. Shared Cybermap Network
- **Module**: `modules/network.bicep`
- **Purpose**: Owns the backend VNet at the composition layer so the VM/API gateway and private PostgreSQL use one reachable topology.
- **Virtual Network**:
  - **Name**: `${prefix}-vm-vnet` (kept for continuity with the existing lab VNet)
  - **Address space**: `10.40.0.0/16`
- **Subnets**:
  - `default`: `10.40.0.0/24` for the VM/API gateway NIC. The shared network module keeps this existing lab subnet name so repeat deployments do not move the VM NIC.
  - `postgres-subnet`: `10.40.1.0/28`, delegated to `Microsoft.DBforPostgreSQL/flexibleServers`
- **Private DNS**:
  - Zone: `${prefix}.postgres.database.azure.com` (Azure private-access zones must end with `.postgres.database.azure.com` and must not equal the server name)
  - VNet link: `${prefix}-vm-vnet-postgres-link`, registration disabled
- **Outputs for PostgreSQL module wiring**:
  - `appSubnetId`
  - `postgresSubnetId`
  - `postgresPrivateDnsZoneId`
  - `postgresPrivateDnsZoneName`
  - `postgresPrivateDnsZoneVirtualNetworkLinkId`

### 3. Virtual Machine Echo/API Gateway Lab
- **Module**: `vm-echo-lab.bicep`
- **Components**:
  - **Network Security Group**:
    - SSH access (port 22) from `allowedSourceIp` CIDR
    - Echo scaffold access (port 8080) from `allowedSourceIp` CIDR until the Cybermap API gateway task moves product ingress to HTTPS/443
    - Default deny all other inbound traffic
  - **Network Interface**: Connects VM to the shared `default` app subnet with NSG and public IP
  - **Virtual Machine**:
    - **Image**: Canonical Ubuntu Server 22.04 LTS Gen2
    - **Size**: Standard_B1ms by default for Cybermap headroom; API-only/lab deployments may explicitly override to Standard_B1s
    - **Authentication**: SSH key only (password disabled)
    - **Custom Data**: Cloud-init configuration for echo service setup
    - **Admin User**: `azureuser` (configurable)
  - **Auto-Shutdown Schedule**:
    - **Type**: Microsoft.DevTestLab/schedules@2018-09-15
    - **Time**: 02:00 daily (configurable)
    - **Time Zone**: Pacific Standard Time (configurable)
    - **Purpose**: Cost control for non-production experimentation

### 4. Cloud-Init Configuration
The VM uses cloud-init to automatically configure the echo service:
- **Package Updates**: Runs `package_update: true` on first boot
- **Echo Server Python Script**:
  - **Location**: `/opt/echo/echo_server.py`
  - **Permissions**: 0755 (executable)
  - **Functionality**: Simple HTTP server on port 8080
    - Endpoint: `/echo?msg={message}`
    - Response: JSON with `ok`, `echo` (original message), `host`, `path`, `query`
    - Error handling: 404 for non-/echo paths
  - **Dependencies**: Uses Python standard library only (`http.server`, `json`, `socket`)
- **Systemd Service**:
  - **File**: `/etc/systemd/system/echo-server.service`
  - **Description**: Simple Echo Server
  - **Type**: simple
  - **ExecStart**: `/usr/bin/python3 /opt/echo/echo_server.py`
  - **Restart**: always with 3-second delay
  - **WantedBy**: multi-user.target
- **Startup Commands**:
  - Creates `/opt/echo` directory
  - Reloads systemd daemon
  - Enables and starts echo-server.service

### 5. Optional Azure OpenAI Account
- **Condition**: Deployed only when `deployOpenAi = true`
- **Type**: `Microsoft.CognitiveServices/accounts@2023-05-01`
- **Kind**: OpenAI
- **SKU**: S0 (standard)
- **Outputs**: 
  - `endpoint`: OpenAI service endpoint URL

## Parameters

### Configuration Parameters
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `location` | string | resourceGroup().location | Azure region for all resources |
| `staticWebAppName` | string | (required) | Unique name for Static Web App |
| `prefix` | string | 'blue-swallow' | Resource name prefix for VM/networking |
| `sshPublicKey` | string (secure) | (required) | SSH public key for VM admin user |
| `allowedSourceIp` | string | '*' | CIDR for SSH/echo access (use specific IP/32 for security) |
| `vmSize` | string | 'Standard_B1ms' | VM size for Cybermap; override to Standard_B1s only for explicit API-only/lab deployments |
| `deployOpenAi` | bool | false | Whether to deploy Azure OpenAI account |
| `autoShutdownTime` | string | '0200' | Daily VM shutdown time (HHmm format) |
| `autoShutdownTimeZone` | string | 'Pacific Standard Time' | Time zone for auto-shutdown schedule |

### Security Considerations
- **SSH Access**: Restricted to `allowedSourceIp` CIDR (default '*' is open - **not recommended for production**)
- **Echo Service**: Similarly restricted to `allowedSourceIp` CIDR on port 8080
- **Authentication**: SSH key-based only (no password authentication)
- **Network Isolation**: VM in private VNet with NSG controlling inbound traffic
- **Public IP**: Standard SKU static IP (can be replaced with private link in future)

## Outputs

### Exported Values
| Output Name | Type | Description |
|-------------|------|-------------|
| `staticWebAppDefaultHostname` | string | URL of the deployed Static Web App |
| `staticWebAppResourceId` | string | ARM resource ID of the deployed Static Web App |
| `backendEchoBaseUrl` | string | HTTP URL of the VM echo service (http://`<public-ip>`:8080) |
| `vmPublicIp` | string | Public IP address of the VM |
| `vnetId` | string | Shared backend VNet ARM ID |
| `appSubnetId` | string | Shared VM/API gateway subnet ARM ID |
| `postgresSubnetId` | string | Delegated PostgreSQL Flexible Server subnet ARM ID |
| `postgresPrivateDnsZoneId` | string | PostgreSQL private DNS zone ARM ID |
| `postgresPrivateDnsZoneName` | string | PostgreSQL private DNS zone name |
| `postgresPrivateDnsZoneVirtualNetworkLinkId` | string | Private DNS zone link ARM ID for the shared VNet |
| `openAiDeployed` | bool | Whether Azure OpenAI was deployed |

## Deployment Dependencies
1. Resource group must exist or be created
2. Static Web App deployed first (provides hostname for API configuration)
3. Shared network module creates or updates:
   - VNet `${prefix}-vm-vnet` with `10.40.0.0/16`
   - `default` (`10.40.0.0/24`) for the VM/API gateway
   - `postgres-subnet` (`10.40.1.0/28`) delegated to PostgreSQL Flexible Server
   - PostgreSQL private DNS zone and VNet link
4. VM infrastructure consumes `appSubnetId` from the shared network module:
   - Public IP → NSG → NIC → VM
   - Auto-shutdown schedule deployed alongside VM
5. PostgreSQL Flexible Server module (added by the datastore slice) must consume `postgresSubnetId` and `postgresPrivateDnsZoneId`/`postgresPrivateDnsZoneName` from the shared network module; it must not create a hidden second VNet.
6. Optional OpenAI account deployed conditionally
7. Static Web App updated with `BACKEND_ECHO_BASE_URL` app setting from VM output
8. Custom domains wired after the SWA deployment using the existing Azure DNS zone:
   - apex `blueswallow.co.in`
   - `www.blueswallow.co.in`
   - Azure DNS stages apex A alias + `www` CNAME before public delegation; final SWA custom-domain binding requires registrar-side registration/delegation to `ns1-09.azure-dns.com`, `ns2-09.azure-dns.net`, `ns3-09.azure-dns.org`, and `ns4-09.azure-dns.info`.

## Configuration Files

### main.bicep
- **Scope**: resourceGroup
- **Primary deployment template**
- Orchestrates SWA, shared network, VM, optional OpenAI, and downstream PostgreSQL module inputs
- Defines all parameters and outputs
- Exports shared-network IDs so the PostgreSQL module consumes the same VNet/subnets instead of creating hidden networking

### custom-domains.bicep / custom-domains-dns.bicep
- Import the existing Static Web App and Azure DNS zone with `existing` resource declarations
- Create only the custom-domain bindings and DNS record sets
- The DNS zone itself is not recreated by the stack

### main.parameters.json
- **Environment-specific values**
- `allowedSourceIp` carries metadata warning against `'*'` in production
- Currently configured for:
  - Location: westus2
  - Static web app name: blue-swallow-swa
  - Legacy SWA resources to delete after cutover: blue-swallow-society, wonderful-pond-0623ed81e
  - Prefix: blue-swallow
  - Allowed source IP: * (open — must be restricted before production)
  - VM size: Standard_B1ms (override to Standard_B1s only for explicit API-only/lab deployments)
  - OpenAI deployment: false
  - Auto-shutdown: 0200 Pacific Standard Time

### scripts/print-next-steps.sh
- Post-deployment script summarizing operator next steps
- Includes `az deployment group what-if` dry-run instructions
- Reminds operators to set `allowedSourceIp` to their developer IP
- Documents deployment idempotency (re-runs update without destroying state)
- Reminds operators to delete the legacy SWA resources after cutover so only `blue-swallow-swa` remains connected to `blueswallow.co.in`

### modules/network.bicep
- **Encapsulates shared Cybermap network topology**
- Creates/updates `${prefix}-vm-vnet`, the existing VM/API `default` subnet, delegated `postgres-subnet`, PostgreSQL private DNS zone, and VNet link
- Outputs subnet and DNS IDs consumed by the VM and PostgreSQL modules

### vm-echo-lab.bicep
- **Encapsulates VM, public IP, NSG, NIC, cloud-init, and auto-shutdown**
- Consumes `appSubnetId` from the shared network module; it does not create a private VNet internally
- Reusable module for the current echo scaffold and later Cybermap API gateway host
- Handles cloud-init configuration and service setup

### modules/openai.bicep
- **Simple OpenAI account deployment**
- Conditionally referenced from main.bicep

## Implementation Notes

### Resource Naming
- Uses prefix parameter for consistent naming:
  - VM: `${prefix}-vm`
  - VNet: `${prefix}-vm-vnet`
  - App subnet: `default` (`10.40.0.0/24`)
  - PostgreSQL subnet: `postgres-subnet` (`10.40.1.0/28`, delegated)
  - PostgreSQL private DNS zone: `${prefix}.postgres.database.azure.com`
  - PostgreSQL private DNS VNet link: `${prefix}-vm-vnet-postgres-link`
  - Public IP: `${prefix}-vm-pip`
  - NSG: `${prefix}-vm-nsg`
  - NIC: `${prefix}-vm-nic`
  - Auto-shutdown schedule: `shutdown-computevm-${prefix}-vm`

### Cost Optimization
- **VM Size**: Standard_B1ms is the Cybermap default for API gateway + future DB client headroom; use Standard_B1s only for explicit API-only/lab overrides
- **Auto-shutdown**: Daily schedule prevents overnight/weekend running
- **Storage**: Standard_LRS managed disk (cost-effective for OS)
- **Public IP**: Standard SKU (required for static IP, but basic would suffice if dynamic IP acceptable)

### Idempotency and migration notes
- The shared network module keeps the existing lab VNet name `${prefix}-vm-vnet` to avoid introducing a second VNet.
- New and existing deployments keep the VM/API subnet named `default` and add `postgres-subnet` alongside it. Run `az deployment group what-if` before apply and do not proceed if Azure predicts VM replacement or a NIC subnet move.
- PostgreSQL Flexible Server must be added to `postgres-subnet` with private DNS only. Public PostgreSQL ingress is out of policy.

### Production Considerations
For production hardening, consider:
1. Replace `allowedSourceIp: '*'` with specific IP ranges (discover via `curl -s https://ipinfo.io/ip`)
2. Run `az deployment group what-if` before every deployment to preview changes
3. Implement private endpoints/VNet integration for Static Web App
4. Use Azure Bastion or jumpbox for SSH access instead of direct public IP
5. Consider Azure Firewall for additional network protection
6. Implement monitoring and logging (Azure Monitor, Log Analytics)
7. Add backup strategy for VM data
8. Consider scaling options (VM scale set, app service plan) if needed

## Target Cybermap Geospatial Backend

The next infrastructure target makes Cybermap/PostGIS the first-class backend instead of treating the VM as an echo lab.

### Target resources

- **VM API gateway**: `Standard_B1ms` preferred, `Standard_B1s` acceptable only if the VM runs API proxy duties without feed workers/materialization load.
- **Azure Database for PostgreSQL Flexible Server**: burstable `B1MS`, private VNet access, 32 GB initial storage, 7-day backup retention.
- **VNet layout**:
  - existing `default` subnet for the VM/API gateway, preserving the live NIC placement.
  - `postgres-subnet` delegated to `Microsoft.DBforPostgreSQL/flexibleServers`.
  - private DNS zone for PostgreSQL flexible server name resolution.
- **VM services**:
  - HTTPS reverse proxy on 443.
  - `cybermap-api` on localhost.
  - `cybermap-worker` for Greenfeed polling and cell materialization.
  - PgBouncer to keep PostgreSQL B1MS connection counts low.

### Target security posture

- PostgreSQL has no public ingress; only the VM reaches it through the VNet/private DNS path.
- Browser calls go through Static Web App/API proxy to the VM; browsers never receive database credentials.
- Wardriver/RaID uses per-device tokens and idempotent ingest batches.
- Port 8080 echo is scaffold-only and should be retired once `/api/v1/*` Cybermap endpoints are live.

Full design: [`docs/cybermap-geospatial-backend.md`](./cybermap-geospatial-backend.md).

## Current State
The infrastructure as defined in the Bicep templates:
- Creates a functional development/experimentation environment
- Provides isolation through explicit shared networking, NSG rules, and a delegated private PostgreSQL subnet
- Includes PostgreSQL private DNS zone linkage reachable from the VM/API subnet
- Includes automated service startup via cloud-init
- Implements basic cost controls through auto-shutdown
- Defaults the Cybermap VM to Standard_B1ms while preserving an explicit B1s override path
- Supports optional AI capabilities through OpenAI integration
- Is parameterized for reuse across environments
- Exports necessary connection information for frontend configuration and downstream PostgreSQL private networking
