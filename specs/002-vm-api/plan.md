# Implementation Plan: VM Echo API

**Branch**: `002-vm-api` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-vm-api/spec.md`

**Note**: This template is filled in by the `__SPECKIT_COMMAND_PLAN__` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Deploy a simple Python echo service on an Ubuntu 22.04 LTS VM and expose it through the Azure Static Web App at `/api/echo` via an Azure Function proxy layer. The service validates end-to-end connectivity from the SWA frontend through the Function proxy to the VM, with automated provisioning via cloud-init, systemd service management, and NSG-based network hardening.

## Technical Context

**Language/Version**: Python 3.10 (VM service), Node.js 18 (Azure Function proxy)

**Primary Dependencies**: Python `http.server` (stdlib), Azure Functions v4 (Node.js), systemd

**Storage**: None (stateless echo service)

**Testing**: curl/manual HTTP tests, nmap for port scanning, Azure portal validation for NSG rules

**Target Platform**: Azure VM (Ubuntu 22.04 LTS) + Azure Static Web App + Azure Functions

**Project Type**: web-service (backend API + proxy)

**Performance Goals**: Echo round-trip < 2s under normal conditions; proxy timeout enforced at 5s

**Constraints**: Backend IP must be injected into SWA app settings post-deployment; NSG restricts ports 22 and 8080 to `allowedSourceIp`; no TLS on VM (terminated at SWA)

**Scale/Scope**: Single VM (`Standard_B1s`), single-threaded echo service, low-traffic experimentation

## Constitution Check

| Principle | Assessment | Notes |
|-----------|------------|-------|
| Security-First | PASS | NSG hardening, SSH-key-only auth, input reflection is JSON-escaped |
| Privacy/Anonymity | PASS | Echo service logs no PII; no user tracking in proxy |
| Defense in Depth | PASS | Network-level (NSG) + application-level (404 on unknown paths) + proxy timeout |
| Secure Defaults | PASS | VM allows inbound only from specified IP; password auth disabled |
| Continuous Monitoring | PARTIAL | No logging agent on VM yet; Azure Activity Logs capture NSG changes |

**Action Required**: Add application-level access logging to the echo service and proxy for security event visibility.

## Project Structure

### Documentation (this feature)

```text
specs/002-vm-api/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output (cloud-init, systemd, Azure Function proxy patterns)
├── data-model.md        # N/A (stateless service)
├── contracts/           # Phase 1 output (EchoRequest, EchoResponse, ProxyResponse schemas)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
api/
└── echo/
    ├── function.json    # Azure Function binding
    └── index.js         # Proxy implementation with timeout + error handling

infra/
└── vm-echo-lab.bicep  # VM, VNet, NSG, Public IP, NIC provisioning

scripts/
└── wireup-backend-url.sh  # Post-deployment SWA app-setting update
```

**Structure Decision**: The echo service code lives as a cloud-init inline script inside `vm-echo-lab.bicep` (or as a separate file referenced by the template). The Azure Function proxy lives in `api/echo/`. This separation keeps infrastructure-as-code in `infra/` and compute in `api/`.

## Complexity Tracking

> The choice to host the echo service on a VM rather than inside Azure Functions directly introduces a second compute tier. This is justified because: (1) the society needs a persistent Linux environment for experimentation beyond serverless limits, and (2) the VM enables future services (agents, models) that require long-running processes.
