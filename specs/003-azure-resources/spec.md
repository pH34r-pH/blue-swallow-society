# Feature Specification: Blue Swallow Society Azure Infrastructure Deployment

**Feature Branch**: `003-azure-resources`

**Created**: 2026-05-23

**Status**: Draft (updated for Cybermap API gateway target as of 2026-07-10)

**Input**: User description: "Deploy all Azure infrastructure for the Blue Swallow Society using Bicep templates, including a Static Web App, Ubuntu VM with Cybermap API gateway services, networking, NSG rules, auto-shutdown schedule, and optional Azure OpenAI account"

## User Scenarios & Testing *(mandatory)*

### User Story 1 - One-Click Infrastructure Provisioning (Priority: P1)

Operators must be able to deploy the complete Blue Swallow Society infrastructure stack using a single Bicep deployment command with parameterized configuration.

**Why this priority**: Reliable, repeatable infrastructure deployment is the foundation for all other features; manual resource creation is error-prone and non-reproducible.

**Independent Test**: Can be fully tested by running `az deployment group create` against a fresh resource group and verifying all expected resources appear in the Azure portal within minutes.

**Acceptance Scenarios**:
1. **Given** a fresh resource group and valid parameters file, **When** the operator runs the Bicep deployment, **Then** all resources (Static Web App, VM, VNet, Public IP, NSG, NIC, auto-shutdown schedule) are created successfully
2. **Given** the deployment completes, **When** the operator inspects resource outputs, **Then** `staticWebAppDefaultHostname`, `backendApiBaseUrl`, and `vmPublicIp` are returned with correct values
3. **Given** the deployment completes, **When** the operator checks the Static Web App app settings, **Then** `BACKEND_API_BASE_URL` is configured with the VM's HTTPS API gateway base URL

### User Story 2 - Secure Network Isolation (Priority: P2)

The VM and its services must be protected by network isolation, with inbound traffic limited to SSH and HTTPS Cybermap API gateway access.

**Why this priority**: The VM hosts backend services and may be used for experimentation; unrestricted public access violates the project's security-first constitution and anonymity principles.

**Independent Test**: Can be fully tested by reviewing the NSG effective security rules and attempting connections from allowed and denied source IPs.

**Acceptance Scenarios**:
1. **Given** the Bicep deployment specifies `allowedSourceIp` as a specific `/32` range, **When** the NSG is provisioned, **Then** SSH 22 is constrained to that CIDR, HTTPS 443 is the product API ingress, and no public 8080 product rule exists
2. **Given** the NSG is active, **When** a connection attempt originates from a source IP outside the allowed CIDR, **Then** the connection is dropped at the network layer
3. **Given** the VM is provisioned, **When** inspected for authentication configuration, **Then** password authentication is disabled and only SSH key-based authentication is permitted

### User Story 3 - Cost-Controlled Experimentation (Priority: P2)

The infrastructure must automatically shut down the VM on a configurable daily schedule to prevent unexpected compute charges during non-working hours.

**Why this priority**: The Blue Swallow Society operates on a limited Azure credits budget; always-on VMs consume credits unnecessarily and jeopardize the project's financial sustainability.

**Independent Test**: Can be fully tested by verifying the auto-shutdown schedule resource exists with the expected time and timezone, and observing the VM state transition at the scheduled time.

**Acceptance Scenarios**:
1. **Given** the Bicep deployment specifies `autoShutdownTime` as `0200` and `autoShutdownTimeZone` as `Pacific Standard Time`, **When** the deployment completes, **Then** a DevTestLab schedule resource exists targeting the VM with those exact settings
2. **Given** the auto-shutdown schedule is configured, **When** the scheduled time occurs, **Then** the VM automatically transitions to a stopped (deallocated) state
3. **Given** the VM size is parameterized, **When** the operator requests `Standard_B1s`, **Then** the VM is provisioned with burst-capable, low-cost compute suitable for experimentation

### User Story 4 - Extensible AI Integration (Priority: P3)

The infrastructure template must support optional Azure OpenAI deployment so that future AI experimentation can be enabled by setting a single boolean parameter.

**Why this priority**: The society's roadmap includes AI agent experimentation; provisioning the OpenAI account alongside core infrastructure avoids manual one-off deployments later.

**Independent Test**: Can be fully tested by deploying with `deployOpenAi=true` and verifying the cognitive services account is created and its endpoint is returned in deployment outputs.

**Acceptance Scenarios**:
1. **Given** the operator sets `deployOpenAi=true` in the parameters file, **When** the Bicep deployment runs, **Then** an Azure OpenAI account of kind `OpenAI` and SKU `S0` is created in the same resource group
2. **Given** the operator sets `deployOpenAi=false`, **When** the Bicep deployment runs, **Then** no OpenAI resources are created and the deployment proceeds normally
3. **Given** the OpenAI account is deployed, **When** the deployment outputs are inspected, **Then** the `endpoint` and `openAiDeployed` values are correctly populated

## Edge Cases

- What happens when the resource group does not exist before deployment?
- How does the deployment behave if the requested static web app name is already taken globally?
- What happens if the SSH public key parameter is malformed or missing?
- How does the system handle a redeployment where the VM already exists?
- What happens if `allowedSourceIp` is set to `*` in a production-like environment?

## Requirements *(mandatory)*

### Functional Requirements
- **FR-001**: The Bicep template MUST create a resource group-scoped deployment with all resources in a single Azure region
- **FR-002**: The Bicep template MUST create an Azure Static Web App with Standard SKU
- **FR-003**: The Bicep template MUST create a Ubuntu 22.04 LTS VM with SSH-key-only authentication
- **FR-004**: The Bicep template MUST create a Virtual Network (`10.40.0.0/16`), Public IP, NSG, and NIC for the VM
- **FR-005**: The NSG MUST allow SSH 22 from the parameterized `allowedSourceIp` CIDR, allow HTTPS 443 for product API ingress, and avoid public 8080 product ingress
- **FR-006**: The VM MUST be configured via cloud-init to install and start `cybermap-api.service`, `cybermap-worker.service`, nginx, and PgBouncer placeholders
- **FR-007**: The Bicep template MUST create a DevTestLab auto-shutdown schedule for the VM with parameterized time and timezone
- **FR-008**: The Bicep template MUST conditionally deploy an Azure OpenAI account when `deployOpenAi=true`
- **FR-009**: The Static Web App MUST be updated with the `BACKEND_API_BASE_URL` app setting pointing to the VM's HTTPS API gateway base URL
- **FR-010**: All parameterizable values (location, names, prefix, SSH key, allowed IP, shutdown time) MUST be exposed as Bicep parameters

### Key Entities *(include if feature involves data)*
- **ResourceGroup**: The Azure container for all project resources (`rg-blue-swallow`)
- **StaticWebApp**: The managed frontend hosting surface with custom domain and API linkage support
- **VirtualMachine**: The Ubuntu compute instance running the Cybermap API gateway services, parameterized by size and auth
- **VirtualNetwork**: The isolated network (`10.40.0.0/16`) containing the VM subnet
- **NetworkSecurityGroup**: The inbound traffic filter enforcing least-privilege access to VM ports
- **AutoShutdownSchedule**: The cost-control mechanism that deallocates the VM daily at a specified time
- **OpenAiAccount**: The optional cognitive services resource for future AI experimentation

## Success Criteria *(mandatory)*

### Measurable Outcomes
- **SC-001**: A complete deployment from a fresh resource group finishes successfully in under 10 minutes
- **SC-002**: All resources are created with consistent naming based on the `prefix` parameter
- **SC-003**: The VM Cybermap API gateway exposes secret-free `/healthz` over the `backendApiBaseUrl` HTTPS endpoint after deployment
- **SC-004**: The VM deallocates on schedule daily, reducing compute costs by at least 60% versus always-on operation
- **SC-005**: Redeployment to an existing resource group completes without resource recreation when parameters are unchanged

## Assumptions
- The operator has Azure CLI access with permissions to create resources in the target subscription
- The target resource group exists or will be created before running the Bicep deployment
- The SSH public key provided is valid and the operator retains the corresponding private key
- The Static Web App name is globally unique within Azure
- The `allowedSourceIp` default of `*` is acceptable for initial experimentation but will be restricted before production use
- Azure quota is available for the requested VM size (`Standard_B1s`) in the target region
- Cloud-init executes successfully on first boot without requiring custom image preparation

