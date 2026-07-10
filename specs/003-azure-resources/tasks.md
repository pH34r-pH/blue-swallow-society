# Tasks: Azure Infrastructure Deployment

**Input**: Design documents from `/specs/003-azure-resources/`

**Prerequisites**: plan.md (required), spec.md (required for user stories)

**Tests**: `az deployment group validate`, `what-if`, post-deployment resource checks.

**Organization**: Tasks are grouped by user story to enable independent implementation and testing of each story.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel
- **[Story]**: User story tag (US1, US2, US3, US4)
- Include exact file paths in descriptions

## Path Conventions

- **Single project**: `infra/`, `scripts/` at repository root

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Directory structure and parameter scaffolding

- [x] T001 Verify `infra/` directory contains `main.bicep`, `vm-echo-lab.bicep`, `modules/openai.bicep`, and `main.parameters.json`
- [x] T002 Review `infra/main.parameters.json` for completeness and document the `allowedSourceIp=*` SSH exposure risk

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Parameter contracts and module interfaces MUST be complete before ANY user story can be implemented

**⚠️ CRITICAL**: No user story work can begin until this phase is complete

- [x] T003 Review all Bicep parameters in `infra/main.bicep` (location, prefix, sshPublicKey, allowedSourceIp, autoShutdownTime, autoShutdownTimeZone, deployOpenAi, vmSize)
- [x] T004 Review module references in `infra/main.bicep` for VM/networking and conditional OpenAI
- [x] T005 Review deployment outputs in `infra/main.bicep` (staticWebAppDefaultHostname, backendApiBaseUrl, vmPublicIp, openAiDeployed, openAiEndpoint)
- [x] T006 Update `infra/main.parameters.json` with an explicit warning to override `allowedSourceIp=*` before production
- [x] T007 Review `scripts/print-next-steps.sh` for accurate post-deployment instructions

**Checkpoint**: Foundation ready - Bicep files are syntactically valid and parameters are documented

---

## Phase 3: User Story 1 - One-Click Infrastructure Provisioning (Priority: P1) 🎯 MVP

**Goal**: Operators can deploy the complete stack with a single Bicep command

**Independent Test**: Run `az deployment group create` against a fresh resource group and verify all resources appear in Azure portal

### Tests for User Story 1

- [ ] T008 [P] [US1] `az deployment group create` completes without errors
- [ ] T009 [P] [US1] Deployment outputs include `staticWebAppDefaultHostname`, `backendApiBaseUrl`, and `vmPublicIp`
- [ ] T010 [P] [US1] Static Web App app settings include `BACKEND_API_BASE_URL` pointing to the VM HTTPS API gateway base URL

### Implementation for User Story 1

- [x] T011 [US1] Review `infra/main.bicep` resource group-scoped deployment with all resources in a single Azure region
- [x] T012 [US1] Review Static Web App resource in `infra/main.bicep` with Standard SKU
- [x] T013 [US1] Review Ubuntu 22.04 LTS VM resource in `infra/vm-echo-lab.bicep` with SSH-key-only authentication
- [x] T014 [US1] Review Virtual Network (`10.40.0.0/16`), Public IP, NSG, and NIC in `infra/vm-echo-lab.bicep`
- [x] T015 [US1] Verify `scripts/wireup-backend-url.sh` updates SWA app settings with `BACKEND_API_BASE_URL` from deployment outputs
- [x] T016 [US1] Verify `infra/main.bicep` output includes `staticWebAppDefaultHostname`

**Checkpoint**: User Story 1 is fully functional and independently testable

---

## Phase 4: User Story 2 - Secure Network Isolation (Priority: P2)

**Goal**: VM and services are protected by network isolation and strict inbound rules

**Independent Test**: Review NSG effective rules and attempt connections from allowed and denied source IPs

### Tests for User Story 2

- [ ] T017 [P] [US2] Azure portal review: NSG allows SSH 22 and HTTPS 443, with no public 8080 product rule
- [ ] T018 [P] [US2] nmap test: connection from unauthorized IP is dropped
- [ ] T019 [P] [US2] Azure portal review: VM OS profile shows `disablePasswordAuthentication: true`

### Implementation for User Story 2

- [x] T020 [US2] Review NSG in `infra/vm-echo-lab.bicep` with SSH 22 constrained by `allowedSourceIp`, HTTPS 443 as product ingress, and no public 8080 product rule
- [x] T021 [US2] Verify NSG default inbound policy is Deny (implicit) in `infra/vm-echo-lab.bicep`
- [x] T022 [US2] Verify `linuxConfiguration.disablePasswordAuthentication` is `true` in `infra/vm-echo-lab.bicep`
- [x] T023 [US2] Add parameter validation documentation in `infra/main.parameters.json` warning against `*` in production
- [x] T024 [US2] Add `scripts/print-next-steps.sh` reminder to restrict `allowedSourceIp` before production use

**Checkpoint**: User Stories 1 AND 2 both work independently

---

## Phase 5: User Story 3 - Cost-Controlled Experimentation (Priority: P2)

**Goal**: VM automatically shuts down daily to prevent unexpected charges

**Independent Test**: Verify DevTestLab schedule resource exists and observe VM state transition at scheduled time

### Tests for User Story 3

- [ ] T025 [P] [US3] Azure portal review: DevTestLab schedule resource exists with correct time and timezone
- [ ] T026 [P] [US3] Observation test: VM transitions to stopped (deallocated) at scheduled time
- [ ] T027 [P] [US3] Azure portal review: VM size is `Standard_B1s` when default parameter is used

### Implementation for User Story 3

- [x] T028 [US3] Review DevTestLab auto-shutdown schedule in `infra/vm-echo-lab.bicep` targeting the VM
- [x] T029 [US3] Verify `autoShutdownTime` and `autoShutdownTimeZone` are parameterized in `infra/main.bicep` and `infra/main.parameters.json`
- [x] T030 [US3] Verify `vmSize` is parameterized with default `Standard_B1s` in `infra/main.bicep`
- [x] T031 [US3] Verify `notificationSettings` is omitted or disabled to avoid API rejection in `infra/vm-echo-lab.bicep`

**Checkpoint**: User Story 3 is independently functional

---

## Phase 6: User Story 4 - Extensible AI Integration (Priority: P3)

**Goal**: Infrastructure supports optional Azure OpenAI deployment via boolean parameter

**Independent Test**: Deploy with `deployOpenAi=true` and verify OpenAI account creation and endpoint output

### Tests for User Story 4

- [ ] T032 [P] [US4] Deployment test with `deployOpenAi=true`: OpenAI account is created with kind `OpenAI` and SKU `S0`
- [ ] T033 [P] [US4] Deployment test with `deployOpenAi=false`: no OpenAI resources created, deployment succeeds
- [ ] T034 [P] [US4] Deployment outputs include `openAiEndpoint` and `openAiDeployed` when `deployOpenAi=true`

### Implementation for User Story 4

- [x] T035 [US4] Review conditional OpenAI account module in `infra/modules/openai.bicep`
- [x] T036 [US4] Verify `deployOpenAi` boolean parameter exists in `infra/main.bicep`
- [x] T037 [US4] Verify conditional module inclusion in `infra/main.bicep` using `if deployOpenAi`
- [x] T038 [US4] Verify OpenAI outputs (`endpoint` as `openAiEndpoint`, `openAiDeployed`) are present in `infra/main.bicep`
- [x] T039 [US4] Verify `infra/modules/openai.bicep` creates resource of kind `OpenAI` and SKU `S0`

**Checkpoint**: All user stories should now be independently functional

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements that affect multiple user stories

- [x] T040 [P] Documentation updates in `docs/azure-resources.md`
- [x] T041 [P] Refactor `infra/main.bicep` to ensure consistent resource naming based on `prefix` parameter
- [x] T042 [P] Add `az deployment group what-if` dry-run instructions to `scripts/print-next-steps.sh`
- [x] T043 [P] Security hardening: review and document the `allowedSourceIp=*` default risk
- [x] T044 [P] Add redeployment idempotency notes to `scripts/print-next-steps.sh`
- [x] T045 [P] Verify all resources are tagged with `project: blue-swallow-society` in Bicep for cost tracking
- [ ] T046 Run quickstart validation: full deployment from fresh resource group < 10 minutes

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies
- **Foundational (Phase 2)**: Depends on Setup; BLOCKS all user stories
- **User Stories (Phase 3–6)**: All depend on Foundational phase; can proceed sequentially or in parallel if staffed
- **Polish (Phase 7)**: Depends on all desired user stories

### User Story Dependencies

- **US1 (P1)**: No story dependencies; can start after Phase 2
- **US2 (P2)**: Builds on US1 resources; NSG and VM auth configured alongside VM provisioning
- **US3 (P2)**: Builds on US1 VM resource; auto-shutdown is an additional resource on the same VM
- **US4 (P3)**: Independent of US2/US3 except for shared `main.bicep` parameter surface

### Within Each User Story

- Parameters before resources
- Resources before outputs
- Validation before documentation

### Parallel Opportunities

- `infra/vm-echo-lab.bicep` and `infra/modules/openai.bicep` can be authored in parallel
- Parameter definitions and output definitions can be written in parallel
- US2 security rules and US3 cost-control schedule can be defined in parallel within the same VM module

---

## Notes

- [P] tasks = different files, no dependencies
- [Story] label maps task to specific user story for traceability
- Each user story should be independently completable and testable
- Verify tests fail before implementing
- Commit after each task or logical group
- Stop at any checkpoint to validate story independently
- Avoid: vague tasks, same file conflicts, cross-story dependencies that break independence
