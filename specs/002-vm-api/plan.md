# Implementation Plan: Cybermap VM API Gateway

**Branch**: `002-vm-api` | **Date**: 2026-07-10 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-vm-api/spec.md`

> Legacy note: this plan supersedes the earlier VM echo draft. Echo/8080 material is historical scaffold context only; the product path is Cybermap API over HTTPS 443.

## Summary

Provision the Blue Swallow Society VM as a rebuildable Cybermap API gateway host. The VM runs a Node 20 `cybermap-api` process on `127.0.0.1:8000`, nginx on HTTPS 443 as the public product ingress, a `cybermap-worker` systemd scaffold, and PgBouncer placeholder config for later private PostgreSQL wiring. Health is DB-independent, readiness is an explicit placeholder, and `/api/v1/*` fails closed behind runtime token configuration.

## Technical Context

**Language/Version**: Node.js 20 for VM API and worker; Bicep for Azure infrastructure; nginx for reverse proxy

**Primary Dependencies**: Node stdlib HTTP server, systemd, nginx, PgBouncer, Azure VM cloud-init

**Storage**: None in this task. PostgreSQL/PostGIS and DB-backed readiness land in the follow-on DB connection task.

**Testing**: `node --test tests/*.test.mjs`; `az bicep build --file infra/main.bicep`; source inspection for cloud-init/systemd units and secret-free placeholders

**Target Platform**: Azure Ubuntu 22.04 VM inside the shared app subnet; product ingress on public HTTPS 443

**Project Type**: infrastructure + VM service scaffold

**Performance Goals**: Health/readiness respond quickly without DB dependency; API body limit defaults to 1 MiB; PgBouncer placeholder caps future DB connection pressure

**Constraints**: No committed database credentials or connection strings; `/api/v1/*` auth required by default; public 8080 is not a product ingress; local service binds to `127.0.0.1:8000`

**Scale/Scope**: Single low-cost VM gateway (`Standard_B1ms` default) with API and worker scaffolds; no DB query implementation in this task

## Constitution Check

| Principle | Assessment | Notes |
|-----------|------------|-------|
| Security-First | PASS | HTTPS 443 ingress, auth gate for `/api/v1/*`, body-size limits, no public 8080 product path |
| Privacy/Anonymity | PASS | Health/readiness avoid DB details and secrets; logs are structured operational events |
| Defense in Depth | PASS | NSG + nginx + local-only API bind + systemd hardening + auth fail-closed behavior |
| Secure Defaults | PASS | Runtime secrets only through environment files; PgBouncer config is placeholder-only |
| Continuous Monitoring | PARTIAL | Structured JSON logs exist; shipping/retention is a later ops task |

**Action Required**: Later tasks must inject DB/API secrets through operator-controlled secret paths and add log shipping/alerting if productionized.

## Project Structure

### Documentation (this feature)

```text
specs/002-vm-api/
├── spec.md
├── plan.md
└── tasks.md
```

### Source Code (repository root)

```text
infra/
├── main.bicep
└── vm-echo-lab.bicep        # Retained filename; now provisions Cybermap gateway services

vm/
├── cybermap-api/
│   ├── package.json
│   ├── server.mjs
│   └── README.md
└── cybermap-worker/
    ├── package.json
    ├── worker.mjs
    └── README.md

docs/
├── vm-api.md
├── azure-resources.md
├── vm-echo-wiring.md        # Historical scaffold note, not production path
└── static-web-app-functionality.md

tests/
└── cybermap-vm-gateway.test.mjs
```

**Structure Decision**: Keep the existing `infra/vm-echo-lab.bicep` filename for deployment continuity, but make the cloud-init payload and docs explicitly Cybermap-oriented. Service source also lives under `vm/` so it is testable outside Bicep inline cloud-init.

## Complexity Tracking

The VM remains a second compute tier, but it is now justified as the Cybermap gateway boundary rather than an echo lab. The added nginx/systemd/PgBouncer scaffolding is accepted because it makes the host rebuildable, DB-connection-aware, and safer to expose over HTTPS while later tasks fill in PostgreSQL-backed routes.
