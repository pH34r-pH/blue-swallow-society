# Azure Resources Specification

## Overview
This document specifies the Azure infrastructure resources deployed for the Blue Swallow Society project using Bicep templates. The architecture includes Azure Static Web Apps, custom-domain wiring through Azure DNS, Ubuntu VM with echo service, networking components, and optional Azure OpenAI integration.

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

### 2. Virtual Machine Echo Lab
- **Module**: `vm-echo-lab.bicep`
- **Components**:
  - **Virtual Network**: Isolated VNet with 10.40.0.0/16 address space
  - **Public IP**: Standard SKU static IP for VM accessibility
  - **Network Security Group**: 
    - SSH access (port 22) from `allowedSourceIp` CIDR
    - Echo service access (port 8080) from `allowedSourceIp` CIDR
    - Default deny all other inbound traffic
  - **Network Interface**: Connects VM to VNet with NSG and public IP
  - **Virtual Machine**:
    - **Image**: Canonical Ubuntu Server 22.04 LTS Gen2
    - **Size**: Standard_B1s (burstable, low-cost for experimentation)
    - **Authentication**: SSH key only (password disabled)
    - **Custom Data**: Cloud-init configuration for echo service setup
    - **Admin User**: `azureuser` (configurable)
  - **Auto-Shutdown Schedule**: 
    - **Type**: Microsoft.DevTestLab/schedules@2018-09-15
    - **Time**: 02:00 daily (configurable)
    - **Time Zone**: Pacific Standard Time (configurable)
    - **Purpose**: Cost control for non-production experimentation

### 3. Cloud-Init Configuration
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

### 4. Optional Azure OpenAI Account
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
| `openAiDeployed` | bool | Whether Azure OpenAI was deployed |

## Deployment Dependencies
1. Resource group must exist or be created
2. Static Web App deployed first (provides hostname for API configuration)
3. VM infrastructure deployed in parallel:
   - VNet → Public IP → NSG → NIC → VM
   - Auto-shutdown schedule deployed alongside VM
4. Optional OpenAI account deployed conditionally
5. Static Web App updated with `BACKEND_ECHO_BASE_URL` app setting from VM output
6. Custom domains wired after the SWA deployment using the existing Azure DNS zone:
   - apex `blueswallow.co.in`
   - `www.blueswallow.co.in`
   - Azure DNS stages apex A alias + `www` CNAME before public delegation; final SWA custom-domain binding requires registrar-side registration/delegation to `ns1-09.azure-dns.com`, `ns2-09.azure-dns.net`, `ns3-09.azure-dns.org`, and `ns4-09.azure-dns.info`.

## Configuration Files

### main.bicep
- **Scope**: resourceGroup
- **Primary deployment template**
- Orchestrates all resources and modules
- Defines all parameters and outputs
- Links static web app to VM echo service via app setting

### custom-domains.bicep / custom-domains-dns.bicep
- Import the existing Static Web App and Azure DNS zone with `existing` resource declarations
- Create only the custom-domain bindings and DNS record sets
- The DNS zone itself is not recreated by the stack

### main.parameters.json
- **Environment-specific values**
- Includes `_comments` parameter documenting validation rules
- `allowedSourceIp` carries metadata warning against `'*'` in production
- Currently configured for:
  - Location: westus2
  - Static web app name: blue-swallow-swa
  - Legacy SWA resources to delete after cutover: blue-swallow-society, wonderful-pond-0623ed81e
  - Prefix: blue-swallow
  - Allowed source IP: * (open — must be restricted before production)
  - OpenAI deployment: false
  - Auto-shutdown: 0200 Pacific Standard Time

### scripts/print-next-steps.sh
- Post-deployment script summarizing operator next steps
- Includes `az deployment group what-if` dry-run instructions
- Reminds operators to set `allowedSourceIp` to their developer IP
- Documents deployment idempotency (re-runs update without destroying state)
- Reminds operators to delete the legacy SWA resources after cutover so only `blue-swallow-swa` remains connected to `blueswallow.co.in`

### vm-echo-lab.bicep
- **Encapsulates VM and networking**
- Reusable module for echo lab infrastructure
- Handles cloud-init configuration and service setup

### modules/openai.bicep
- **Simple OpenAI account deployment**
- Conditionally referenced from main.bicep

## Implementation Notes

### Resource Naming
- Uses prefix parameter for consistent naming:
  - VM: `${prefix}-vm`
  - VNet: `${prefix}-vm-vnet`
  - Public IP: `${prefix}-vm-pip`
  - NSG: `${prefix}-vm-nsg`
  - NIC: `${prefix}-vm-nic`
  - Auto-shutdown schedule: `shutdown-computevm-${prefix}-vm`

### Cost Optimization
- **VM Size**: B1s series chosen for low baseline cost with burst capability
- **Auto-shutdown**: Daily schedule prevents overnight/weekend running
- **Storage**: Standard_LRS managed disk (cost-effective for OS)
- **Public IP**: Standard SKU (required for static IP, but basic would suffice if dynamic IP acceptable)

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
- Provides isolation through networking and NSG rules
- Includes automated service startup via cloud-init
- Implements basic cost controls through auto-shutdown
- Supports optional AI capabilities through OpenAI integration
- Is parameterized for reuse across environments
- Exports necessary connection information for frontend configuration
