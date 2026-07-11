# Feature Specification: Blue Swallow Society Cybermap API Gateway

**Feature Branch**: `002-vm-api`

**Created**: 2026-05-23

**Status**: Superseded echo scaffold; active target is the Cybermap API gateway as of 2026-07-10

**Input**: User description: "Replace the temporary VM echo lab with a rebuildable Cybermap API gateway host for the geospatial backend."

> Legacy note: this spec directory began as the VM echo API draft. Any old `/api/echo`, `echo-server.service`, `/opt/echo`, or public port `8080` acceptance text is retired scaffold context only. The product API target is HTTPS 443 on the VM, reverse-proxied to `cybermap-api` on `127.0.0.1:8000`.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Operator Health and Readiness (Priority: P1)

Operators can verify VM process health without PostgreSQL credentials, and can verify DB readiness once operator-managed PostgreSQL/PgBouncer settings are injected.

**Why this priority**: First-boot diagnostics must separate liveness from DB readiness, fail closed when DB config is absent, and avoid leaking connection strings or driver details.

**Independent Test**: `GET https://<vm-ip>/healthz` returns HTTP 200 with service metadata; `GET https://<vm-ip>/readyz` returns sanitized HTTP 503 with `not_configured` when DB settings are absent and reports PostgreSQL connectivity plus latest `schema_migrations` version when configured.

**Acceptance Scenarios**:
1. **Given** the VM has completed cloud-init, **When** an operator requests `/healthz`, **Then** `cybermap-api` returns HTTP 200 JSON and does not include database hostnames, passwords, tokens, or connection strings.
2. **Given** PostgreSQL/PgBouncer credentials have not been injected yet, **When** an operator requests `/readyz`, **Then** the API returns sanitized HTTP 503 readiness JSON with `dependencies.postgres.status = "not_configured"` and no secrets.
3. **Given** a request carries `X-Request-Id`, **When** the service responds, **Then** the same request ID is returned in the response headers and structured logs.

### User Story 2 - Protected Cybermap API Surface (Priority: P1)

Cybermap endpoints under `/api/v1/*` fail closed until explicit runtime authentication is configured.

**Why this priority**: The VM may have public HTTPS ingress; protected routes must not become anonymous by accident.

**Independent Test**: An unauthenticated request to `/api/v1/cybermap/viewport` returns 401, while a request with a configured bearer/operator token reaches the scaffolded handler and returns a non-secret 501 placeholder.

**Acceptance Scenarios**:
1. **Given** no bearer/operator token is present, **When** a client requests `/api/v1/*`, **Then** the API returns HTTP 401.
2. **Given** a bearer/operator token is present but no runtime token allowlist is configured, **When** a client requests `/api/v1/*`, **Then** the API returns HTTP 503 `auth_not_configured`.
3. **Given** a request body exceeds the configured limit, **When** the request reaches `/api/v1/*`, **Then** the API returns HTTP 413 before future DB work is invoked.

### User Story 3 - Rebuildable VM Gateway Provisioning (Priority: P2)

The VM is rebuilt by Bicep/cloud-init into a Cybermap gateway host with API, worker, reverse proxy, and PgBouncer placeholders.

**Why this priority**: The gateway must be reproducible from repo state and must not depend on manual VM drift.

**Independent Test**: `az bicep build --file infra/main.bicep` succeeds, and inspecting `infra/vm-echo-lab.bicep` shows systemd units named `cybermap-api.service` and `cybermap-worker.service`, nginx HTTPS 443 ingress, and PgBouncer placeholder config without committed credentials.

**Acceptance Scenarios**:
1. **Given** a fresh VM deployment, **When** cloud-init completes, **Then** `cybermap-api.service`, `cybermap-worker.service`, and `nginx` are enabled.
2. **Given** the NSG is provisioned, **When** product ingress is inspected, **Then** public HTTPS 443 is allowed and public product ingress on 8080 is absent.
3. **Given** PgBouncer is installed, **When** its committed config is inspected, **Then** it contains only low-connection-count placeholders and no database passwords or connection strings.

### Edge Cases

- PostgreSQL is unavailable or unconfigured during first boot: `/healthz` still succeeds; `/readyz` reports sanitized `not_configured` or `unavailable` readiness without secrets.
- SWA platform headers overwrite `Authorization`: the API accepts an explicit operator-token header in addition to bearer auth.
- Large payloads reach the VM before full route implementation: body-size limits reject them before future DB work.
- VM deployment happens before public DNS/custom domain cutover: the default HTTPS-on-IP gateway remains testable.
- Old echo paths are requested: they are not product routes and must not be documented or exposed as live acceptance targets.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The VM MUST run a Node 20 `cybermap-api` service bound to `127.0.0.1:8000`.
- **FR-002**: nginx or equivalent reverse proxy MUST terminate/proxy product ingress on HTTPS 443 to `cybermap-api`.
- **FR-003**: `/healthz` MUST return secret-free process health and MUST NOT require DB connectivity.
- **FR-004**: `/readyz` MUST check DB configuration, PostgreSQL connectivity, and the expected migration version, and MUST fail closed with sanitized JSON when unavailable.
- **FR-005**: `/api/v1/*` MUST require authentication by default and fail closed when token configuration is absent.
- **FR-006**: The API MUST emit structured JSON logs with request IDs and response statuses.
- **FR-007**: The API MUST enforce request body-size limits and expose a rate-limit hook point for later hardening.
- **FR-008**: Cloud-init MUST install PgBouncer and write placeholder low-connection-count config without committed secrets.
- **FR-009**: Cloud-init MUST install and enable `cybermap-api.service` and `cybermap-worker.service` systemd units.
- **FR-010**: Public product ingress MUST avoid port 8080; legacy echo service artifacts are scaffold-only history.

### Key Entities *(include if feature involves data)*

- **CybermapApiService**: Node 20 HTTP service that owns health/readiness and protected `/api/v1/*` scaffolds.
- **CybermapWorkerService**: Node worker scaffold for later feed polling and cell materialization jobs.
- **GatewayProxy**: nginx/Caddy-style local reverse proxy exposing HTTPS 443 and forwarding to localhost.
- **PgBouncerPlaceholder**: Credential-free pooling config completed at runtime by operator secret injection.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: `node --test tests/*.test.mjs` passes.
- **SC-002**: `az bicep build --file infra/main.bicep` succeeds where Azure CLI/Bicep is available.
- **SC-003**: Source inspection finds `cybermap-api.service` and `cybermap-worker.service` in cloud-init/systemd, with no `echo-server.service` product unit.
- **SC-004**: Source inspection finds HTTPS 443 product ingress and no public 8080 product ingress.
- **SC-005**: Source inspection finds no committed DB passwords, `PGPASSWORD`, or concrete PostgreSQL connection strings in gateway scaffolds.

## Assumptions

- The VM uses Ubuntu 22.04 LTS and can install Node 20 during cloud-init.
- Database hostnames, passwords, and API tokens are injected later through operator-controlled runtime environment files or Azure settings.
- Private PostgreSQL credential injection remains operator-managed; DB-backed readiness logic is implemented by the API gateway.
- Domain binding/custom-domain cutover may lag behind VM gateway deployment; the VM default HTTPS endpoint remains a validation target.
