# Tasks: Cybermap VM API Gateway

**Input**: Design documents from `/specs/002-vm-api/`

**Prerequisites**: plan.md, spec.md

**Tests**: `node --test tests/*.test.mjs`, `az bicep build --file infra/main.bicep`, source inspection for service names and secrets.

**Organization**: Tasks are grouped by independently reviewable slices. This list supersedes the earlier VM echo checklist; echo/8080 entries are historical scaffold context only.

## Format: `[ID] [P?] Description`

- **[P]**: Can run in parallel
- Include exact file paths in descriptions

## Phase 1: Infrastructure Gateway Provisioning

**Purpose**: Replace the echo VM product path with Cybermap gateway cloud-init and ingress.

- [x] T001 Update `infra/vm-echo-lab.bicep` cloud-init to install Node 20, nginx, and PgBouncer.
- [x] T002 Update `infra/vm-echo-lab.bicep` to write `/opt/cybermap-api/server.mjs` and `/opt/cybermap-api/package.json`.
- [x] T003 Update `infra/vm-echo-lab.bicep` to write `/opt/cybermap-worker/worker.mjs` and `/opt/cybermap-worker/package.json`.
- [x] T004 Add `/etc/systemd/system/cybermap-api.service` with local bind env, restart policy, and systemd hardening.
- [x] T005 Add `/etc/systemd/system/cybermap-worker.service` with worker poll interval env, restart policy, and systemd hardening.
- [x] T006 Configure nginx HTTPS 443 proxying to `http://127.0.0.1:8000`.
- [x] T007 Remove public product ingress on 8080 from the NSG and keep HTTPS 443 as the product API ingress.
- [x] T008 Add PgBouncer placeholder config without committed DB credentials.

**Checkpoint**: Bicep/cloud-init provisions Cybermap gateway service names, not `echo-server.service`.

---

## Phase 2: Testable VM Service Scaffolds

**Purpose**: Keep the service behavior testable from repo source rather than only from inline cloud-init.

- [x] T009 Create `vm/cybermap-api/package.json` for the Node 20 API scaffold.
- [x] T010 Create `vm/cybermap-api/server.mjs` with `/healthz`, `/readyz`, auth-gated `/api/v1/*`, request IDs, structured logs, body limits, and a rate-limit hook.
- [x] T011 Create `vm/cybermap-api/README.md` documenting runtime env and secret-handling rules.
- [x] T012 Create `vm/cybermap-worker/package.json` for the Node worker scaffold.
- [x] T013 Create `vm/cybermap-worker/worker.mjs` with structured tick/shutdown logs and placeholder job names.
- [x] T014 Create `vm/cybermap-worker/README.md` documenting future polling/materialization responsibilities.

**Checkpoint**: Node tests can instantiate the API scaffold locally and verify security defaults.

---

## Phase 3: Documentation and Echo Retirement

**Purpose**: Human-facing docs should describe Cybermap gateway operations and mark echo as retired scaffold only.

- [x] T015 Update `docs/vm-api.md` to describe `cybermap-api`, `cybermap-worker`, `/healthz`, `/readyz`, PgBouncer placeholder, HTTPS 443, auth defaults, structured JSON logs, and request IDs.
- [x] T016 Update `docs/azure-resources.md` to describe VM gateway services and no public 8080 product ingress.
- [x] T017 Update `docs/vm-echo-wiring.md` to retire echo as scaffold-only history.
- [x] T018 Update `docs/static-web-app-functionality.md`, `README.md`, helper scripts, and workflow references away from `BACKEND_ECHO_BASE_URL` product assumptions.
- [x] T019 Remove the `api/echo` Azure Function scaffold from the product API path.

**Checkpoint**: Current docs present Cybermap API over HTTPS 443 as the target; echo/8080 is not a production route.

---

## Phase 4: Regression Coverage

**Purpose**: Lock the gateway contract so later tasks do not accidentally revive echo ingress or embed secrets.

- [x] T020 Add `tests/cybermap-vm-gateway.test.mjs` coverage for Bicep service names, no public 8080 product ingress, local-only API bind, PgBouncer placeholder, and docs drift.
- [x] T021 Add API behavior coverage for secret-free `/healthz`, placeholder `/readyz`, auth-gated `/api/v1/*`, body limits, and request IDs.
- [x] T022 Add scaffold coverage confirming `cybermap-api` and `cybermap-worker` contain hook points and no embedded DB secrets.

**Checkpoint**: Regression suite catches echo revival, route auth drift, and committed secret patterns.

---

## Phase 5: Verification and Handoff

**Purpose**: Prove the change compiles/tests and hand it to human review before merge/deploy.

- [x] T023 Run `node --test tests/*.test.mjs`.
- [x] T024 Run `az bicep build --file infra/main.bicep` when Azure CLI/Bicep is available.
- [x] T025 Inspect `infra/vm-echo-lab.bicep` and generated service definitions for `cybermap-api.service` / `cybermap-worker.service`, nginx HTTPS 443, PgBouncer placeholder, and absence of `echo-server.service` product wiring.
- [x] T026 Search gateway scaffold source for committed DB passwords, `PGPASSWORD`, concrete DB URLs, and private-key material.
- [ ] T027 Commit the worktree and block the Kanban card for human review.

## Notes

- The filename `infra/vm-echo-lab.bicep` remains for deployment continuity only; its contents now provision the Cybermap gateway.
- Database hostname/password injection, DB-backed readiness, and route implementation are intentionally deferred to the database connection task.
- Do not add new frontend affordances or CI settings that call the retired echo path.
