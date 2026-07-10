# Implementation Plan: Azure Infrastructure Deployment

**Branch**: `003-azure-resources` | **Date**: 2026-05-23 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-azure-resources/spec.md`

**Note**: This template is filled in by the `__SPECKIT_COMMAND_PLAN__` command. See `.specify/templates/plan-template.md` for the execution workflow.

## Summary

Deploy all Azure infrastructure for the Blue Swallow Society using Bicep templates. The deployment provisions a Static Web App (Standard SKU), an Ubuntu 22.04 LTS VM with cloud-init Cybermap API gateway services, a Virtual Network (`10.40.0.0/16`), Public IP, NSG with least-privilege rules, an auto-shutdown schedule for cost control, and an optional Azure OpenAI account. All resources are parameterized for repeatable, one-click provisioning.

## Technical Context

**Language/Version**: Bicep (Azure IaC), Azure CLI 2.60+

**Primary Dependencies**: Azure Resource Manager, Bicep modules

**Storage**: Azure Static Web App managed storage; VM ephemeral OS disk

**Testing**: `az deployment group validate`, `what-if` deployments, post-deployment connectivity tests

**Target Platform**: Azure Cloud (single region, single subscription)

**Project Type**: Infrastructure-as-Code / DevOps

**Performance Goals**: Full deployment < 10 minutes; VM boot + cloud-init completion < 120 seconds

**Constraints**: SSH public key required; `allowedSourceIp` defaults to `*` for dev but must be restricted before production; SWA name must be globally unique; VM size default `Standard_B1s` and parameterized; all resources tagged with `project: blue-swallow-society`; OpenAI endpoint output surfaced when deployed

**Scale/Scope**: Single resource group, one VM, one SWA, optional OpenAI account

## Constitution Check

| Principle | Assessment | Notes |
|-----------|------------|-------|
| Security-First | PASS | NSG rules, SSH-key-only auth, parameter validation |
| Privacy/Anonymity | CONCERN | `allowedSourceIp` defaults to `*` in parameters; must be overridden in production |
| Defense in Depth | PASS | Network isolation via VNet; no public endpoints except SWA and restricted VM ports |
| Secure Defaults | PARTIAL | Default allowedSourceIp is `*` for ease of dev; documented risk and remediation |
| Continuous Monitoring | PARTIAL | No Log Analytics workspace deployed; Activity Logs enabled by default at subscription level |

**Action Required**: Add a production checklist item to restrict `allowedSourceIp` before go-live. Consider adding a Log Analytics workspace and NSG flow logs in a future iteration.

## Project Structure

### Documentation (this feature)

```text
specs/003-azure-resources/
├── spec.md              # Feature specification
├── plan.md              # This file
├── research.md          # Phase 0 output (Bicep patterns, Azure regions, quotas)
├── data-model.md        # N/A (infrastructure metadata only)
├── contracts/           # Phase 1 output (deployment output schema, parameter contracts)
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
infra/
├── main.bicep           # Main deployment orchestrator
├── main.parameters.json # Parameter values for dev deployment
├── vm-echo-lab.bicep    # VM + networking + auto-shutdown module
└── modules/
    └── openai.bicep     # Conditional OpenAI account module

scripts/
├── wireup-backend-url.sh  # Post-deployment SWA app-setting update
└── print-next-steps.sh    # Human-readable post-deployment instructions
```

**Structure Decision**: Modular Bicep layout. `main.bicep` is the entrypoint referencing `vm-echo-lab.bicep` and conditionally `modules/openai.bicep`. Parameters are externalized to `main.parameters.json` so secrets (SSH key) can be injected via pipeline variables rather than committed.

## Complexity Tracking

> No unjustified complexity. The decision to optionally deploy Azure OpenAI keeps the template flexible without forcing cost-bearing resources. Using Bicep modules rather than a monolithic file improves maintainability and aligns with best practices.
