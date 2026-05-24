# Tasks: VM Echo API

**Input**: Design documents from `/specs/002-vm-api/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: curl integration tests, nmap port scans, Azure portal validation.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel
- **[Story]**: User story tag (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `api/`, `infra/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Directory structure and Azure Function scaffolding

- [x] T001 Verify `api/echo/function.json` exists with correct HTTP trigger binding
- [x] T002 Verify `api/echo/index.js` exists with proxy skeleton

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Core echo service script and proxy skeleton MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Verify `infra/vm-echo-lab.bicep` cloud-init section creates `/opt/echo/echo_server.py` with correct handler
- [x] T004 Verify `infra/vm-echo-lab.bicep` systemd service definition at `/etc/systemd/system/echo-server.service` includes `Restart=always` and `RestartSec=3`
- [x] T005 Verify `api/echo/index.js` proxy reads `BACKEND_ECHO_BASE_URL` from environment variables
- [x] T006 Verify `api/echo/index.js` includes `AbortController` timeout setup (5s)
- [x] T007 Verify `api/echo/index.js` returns JSON error response when `BACKEND_ECHO_BASE_URL` is missing

**Checkpoint**: Foundation ready - Bicep cloud-init is syntactically valid, proxy skeleton handles env var and timeout

---

## Phase 3: User Story 1 - Echo Message Round-Trip (Priority: P1) 🎯 MVP

**Goal**: Users can send a message through the SWA API and receive it echoed back from the VM

**Independent Test**: `curl "https://<swa-host>/api/echo?msg=hello"` returns JSON containing `"echo": "hello"`

### Tests for User Story 1

- [ ] T008 [P] [US1] curl test: `GET /api/echo?msg=hello` returns 200 with echo field
- [ ] T009 [P] [US1] curl test: URL-encoded special characters echoed accurately
- [ ] T010 [P] [US1] curl test: missing `msg` parameter returns empty echo without error

### Implementation for User Story 1

- [x] T011 [US1] Verify query parameter parsing (`msg`) in `api/echo/index.js`
- [x] T012 [US1] Verify backend request forwarding to `${BACKEND_ECHO_BASE_URL}/echo?msg={message}` in `api/echo/index.js`
- [x] T013 [US1] Verify `api/echo/index.js` forwards response (status, headers, body) back to client
- [x] T014 [US1] Verify `echo_server.py` `GET /echo` handler returns JSON with `ok`, `echo`, `host`, `path`, `query`
- [x] T015 [US1] Verify `echo_server.py` returns correct `Content-Type: application/json` header

**Checkpoint**: User Story 1 is fully functional and independently testable

---

## Phase 4: User Story 2 - Proxy Resilience and Error Handling (Priority: P2)

**Goal**: Azure Function proxy gracefully handles backend failures and misconfiguration

**Independent Test**: Remove `BACKEND_ECHO_BASE_URL`, stop VM service, send invalid path; verify controlled JSON errors

### Tests for User Story 2

- [ ] T016 [P] [US2] curl test: missing `BACKEND_ECHO_BASE_URL` returns 500 JSON with `error: "Missing BACKEND_ECHO_BASE_URL"`
- [ ] T017 [P] [US2] curl test: stopped VM service returns 502 within 5 seconds
- [ ] T018 [P] [US2] curl test: unreachable VM returns 502 with controlled error message

### Implementation for User Story 2

- [x] T019 [US2] Verify `BACKEND_ECHO_BASE_URL` validation and 500 response in `api/echo/index.js`
- [x] T020 [US2] Verify `fetch` error catch block returning HTTP 502 with JSON error body in `api/echo/index.js`
- [x] T021 [US2] Verify `AbortController` aborts hung requests at exactly 5 seconds in `api/echo/index.js`
- [x] T022 [US2] Verify `echo_server.py` returns 404 for unknown paths with generic JSON error
- [x] T023 [US2] Verify `echo_server.py` does not leak file system information in error responses

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Automated VM Service Provisioning (Priority: P2)

**Goal**: Echo service is automatically installed, enabled, and started on VM boot via cloud-init

**Independent Test**: Deploy VM via Bicep, wait 120s, verify `curl http://<vm-ip>:8080/echo?msg=test` responds

### Tests for User Story 3

- [ ] T024 [P] [US3] Post-deployment test: `systemctl is-active echo-server.service` returns `active`
- [ ] T025 [P] [US3] Post-deployment test: VM reboot restarts echo service automatically
- [ ] T026 [P] [US3] Post-deployment test: simulated process crash triggers restart within 5 seconds

### Implementation for User Story 3

- [x] T027 [US3] Verify `cloud-init` in `infra/vm-echo-lab.bicep` creates `/opt/echo/` directory and writes `echo_server.py`
- [x] T028 [US3] Verify `cloud-init` in `infra/vm-echo-lab.bicep` writes `/etc/systemd/system/echo-server.service` with `Restart=always` and `RestartSec=3`
- [x] T029 [US3] Verify `cloud-init` in `infra/vm-echo-lab.bicep` runs `systemctl daemon-reload`, `enable`, and `start`
- [x] T030 [US3] Ensure `echo_server.py` binds to `0.0.0.0:8080` (not localhost) so it is reachable via NIC

**Checkpoint**: User Story 3 is independently functional

---

## Phase 6: User Story 4 - Backend Security Hardening (Priority: P3)

**Goal**: VM echo service and network path restrict unauthorized access

**Independent Test**: nmap scan from unauthorized IP confirms ports 22 and 8080 are filtered/dropped

### Tests for User Story 4

- [ ] T031 [P] [US4] nmap test: unauthorized IP sees no open ports on VM public IP
- [ ] T032 [P] [US4] curl test: request to non-`/echo` path returns 404 generic JSON
- [ ] T033 [P] [US4] Security test: inject `<script>` into `msg`, verify JSON response encodes it safely

### Implementation for User Story 4

- [x] T034 [US4] Verify NSG in `infra/vm-echo-lab.bicep` restricts ports 22 and 8080 to `allowedSourceIp` CIDR
- [x] T035 [US4] Verify `infra/vm-echo-lab.bicep` disables password authentication via `linuxConfiguration.disablePasswordAuthentication: true`
- [x] T036 [US4] Verify `echo_server.py` returns 404 for all non-`/echo` paths with generic error
- [x] T037 [US4] Verify `echo_server.py` reflects input through JSON `json.dumps()` (safe encoding, no HTML rendering)
- [x] T038 [US4] Verify `Content-Length` header is present in `echo_server.py` responses

**Checkpoint**: All user stories should now be independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T039 [P] Documentation updates in `docs/vm-api.md` and `docs/vm-echo-wiring.md`
- [x] T040 [P] Code cleanup: consistent error message format across proxy and echo service
- [x] T041 [P] Add logging to `api/echo/index.js` for security events (failed backend connections)
- [x] T042 [P] Security hardening: review `infra/vm-echo-lab.bicep` NSG rule priorities
- [x] T043 [P] Add `scripts/wireup-backend-url.sh` automation to populate `BACKEND_ECHO_BASE_URL` after deployment
- [ ] T044 Run quickstart validation: full end-to-end echo round-trip against deployed infrastructure

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup; BLOCKS all user stories
- **User Stories (Phase 3–6)**: All depend on Foundational phase; can proceed sequentially or in parallel if staffed
- **Polish (Phase 7)**: Depends on all desired user stories

### User Story Dependencies

- **US1 (P1)**: No story dependencies; can start after Phase 2
- **US2 (P2)**: Builds on US1 proxy; can start once proxy skeleton exists
- **US3 (P2)**: Infrastructure-dependent; requires Bicep and cloud-init to be finalized
- **US4 (P3)**: Depends on US3 infrastructure being deployed; validates network-level controls

### Within Each User Story

- Service code before proxy code before deployment
- Error handling after happy-path implementation
- Security tests after hardening implementation

### Parallel Opportunities

- `echo_server.py` and `api/echo/index.js` can be developed in parallel
- NSG rules and VM OS configuration can be authored in parallel in Bicep
- US2 error handling and US3 cloud-init can be reviewed in parallel

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
