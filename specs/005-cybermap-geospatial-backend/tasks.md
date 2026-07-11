# Cybermap Geospatial Backend P0 Tasks

**Input**: `docs/cybermap-geospatial-backend.md`, parent Kanban task handoffs, and repo/vault documentation state.

**Prerequisites**: P0.01, P0.02, P0.03, P0.045, P0.055, P0.05, P0.07, P0.09, P0.10a, P0.10b, P0.10c, P0.11, P0.125, and P0.13 are parent inputs to P0.16. P0.14 is now merged into the final integration candidate. P0.15 still needs final active-merge cleanup before completion. P0.17 is in remediation after a no-go final review.

## P0 Task Graph Checklist

- [x] **P0.00 / `t_acb2d921`** — refactor shared VNet/subnets for VM and private PostgreSQL.
  - State: done, merged/deployed through GitHub CI/CD.
  - Output: shared VNet, VM subnet, delegated PostgreSQL subnet, private DNS linkage, VM B1ms default.

- [x] **P0.01 / `t_32d37829`** — provision private PostgreSQL Flexible Server B1MS.
  - State: done, review-ready branch.
  - Output: private-access PostgreSQL B1MS, 32 GiB storage, 7-day backup, no public network access.

- [x] **P0.02 / `t_1c25043d`** — replace echo VM scaffold with Cybermap API gateway services.
  - State: done, review-approved branch.
  - Output: Node 20 `cybermap-api`, `cybermap-worker`, nginx HTTPS 443, PgBouncer placeholder, no public 8080 product ingress.

- [x] **P0.03 / `t_4284c399`** — add PostGIS migrations for observation ledger and Cybermap cells.
  - State: done, merged to `main`.
  - Output: core schema, PostGIS/pgcrypto, source/observation enums, append-only observation ledger, materialized cells.

- [x] **P0.04 / `t_bc36f36d`** — implement DB configuration, pooling, migrations, and readiness checks.
  - State: done, review-approved branch.
  - Output: environment-only DB config, low pool caps, migration runner, sanitized `/readyz`.

- [x] **P0.045 / `t_c92269bd`** — implement API auth, source registry scopes, and rate limits.
  - State: done, review-approved branch.
  - Output: hashed token registry, route/source scopes, structured auth decision logs, fail-closed `/api/v1/*`.

- [x] **P0.05 / `t_1c95370c`** — implement authenticated observation batch ingest with idempotency.
  - State: done, review-approved branch.
  - Output: protected observation ingest with idempotency and source-scope validation.

- [x] **P0.055 / `t_943a17b2`** — derive Cybermap entities and observation edges.
  - State: done, review-approved branch.
  - Output: entity derivation and `entity_observations` edge materialization.

- [x] **P0.06 / `t_09689772`** — materialize Cybermap cells from observations.
  - State: done, review-approved branch.
  - Output: cell materialization worker from observation/entity updates.

- [x] **P0.07 / `t_4029053a`** — implement viewport, cell, entity, and source catalog read APIs.
  - State: done, review-approved branch.
  - Output: Cybermap read API surface and safe projections.

- [x] **P0.08 / `t_1b55a42e`** — proxy SWA `/api` routes to VM Cybermap v1 API.
  - State: done, review-approved branch.
  - Output: Static Web App proxy path to backend Cybermap API.

- [x] **P0.09 / `t_58787291`** — make Godeye render backend Cybermap cells only.
  - State: done, review-approved branch.
  - Output: runtime map no longer seeds fake/demo overlays.

- [x] **P0.10a / `t_826f9422`** — add backend Wardriver payload contract and fixtures.
  - State: done, review-approved branch.
  - Output: backend Wardriver/RaID payload contract.

- [x] **P0.10b / `t_73a91990`** — implement Android Wardriver token storage and idempotent outbox sync.
  - State: done, review-approved branch.
  - Output: client token storage and retry/outbox behavior.

- [x] **P0.10c / `t_91aadb73`** — bridge RaID nearby context, session metadata, and operator sight indicator.
  - State: done, review-approved branch.
  - Output: field-view context bridge and operator sight metadata.

- [x] **P0.11 / `t_92549ef3`** — seed Greenfeed catalog and poller with Green-only gates.
  - State: done, review-approved branch.
  - Output: curated Greenfeed source catalog and polling path.

- [x] **P0.12 / `t_90dcba57`** — implement sensorium sessions and direct observation packets.
  - State: done, review-approved branch.
  - Output: `dream_suspension`, `raid_sight`, `greenfeed_jack_in`, direct observations, raw/privacy filters.

- [x] **P0.125 / `t_bf5ff92d`** — implement claim-validation Greenfeed lookup and direct-observation loop.
  - State: done, review-approved branch.
  - Output: claim footprint -> Greenfeed ranking -> direct observation -> Mosaic/Murmurs delta.

- [x] **P0.13 / `t_95689947`** — implement Mosaic/Murmurs memory sync endpoints.
  - State: done, review-approved branch.
  - Output: `GET /api/v1/memories?since=` and `POST /api/v1/memories`.

- [x] **P0.14 / `t_55c6e0ce`** — add security/privacy/source-class policy regression suite.
  - State: done, review-approved and merged into the final integration candidate.
  - Output: adversarial policy tests across auth/source gates, PII/raw-frame rejection, no demo runtime, and safe projections.

- [x] **P0.15 / `t_878202a4`** — add operations plan for backups, monitoring, PgBouncer, and cost controls.
  - State: done, review-approved branch; pending final active-merge cleanup in the fan-in branch.
  - Output: PgBouncer caps, backup/export plan, monitoring signals, partitioning, budget watch.

- [x] **P0.16 / `t_9bc9477c`** — convert backend design into spec-kit implementation docs and keep vault/repo in sync.
  - State: review-approved branch; restored into this final integration branch by `t_83b7e06e`.
  - Output: this `spec.md`, `plan.md`, `tasks.md`, repo docs links, vault mirror, docs regression test.

- [ ] **P0.17 / `t_46e22456`** — final adversarial coverage review before marking Cybermap backend complete.
  - State: no-go/remediation running.
  - Depends on: clean P0.15 merge, restored P0.16 artifacts, backend app-setting naming remediation, and final re-review.

## Repo documentation tasks

- [x] Create `specs/005-cybermap-geospatial-backend/spec.md` with user stories, FRs, key entities, API surface, P0 ledger, and task graph.
- [x] Create `specs/005-cybermap-geospatial-backend/plan.md` with implementation/documentation sync plan and verification commands.
- [x] Create `specs/005-cybermap-geospatial-backend/tasks.md` with the P0 graph checklist.
- [x] Update `docs/cybermap-geospatial-backend.md` with current-state boundary, spec-kit link, and P0 implementation ledger.
- [x] Update `README.md` with Cybermap spec-kit discoverability and repo layout corrections.
- [x] Update `docs/architecture.md`, `docs/azure-resources.md`, and `docs/vm-api.md` with links back to the spec-kit docs.
- [x] Add `tests/cybermap-doc-sync.test.mjs` to guard links, ledger entries, source gates, and current-state boundary.

## Vault synchronization tasks

- [x] Confirm `[[Blue Swallow Society - Documentation Index]]` links `[[Blue Swallow Society - Cybermap Geospatial Backend Design]]`.
- [x] Update `[[Blue Swallow Society - Cybermap Geospatial Backend Design]]` with repo spec path and current P0 status boundary.
- [x] Append the 2026-07-11 daily note with the spec sync event.

## Verification tasks

- [x] Run `node --test tests/cybermap-doc-sync.test.mjs`.
- [x] Run `node --test tests/*.test.mjs`.
- [x] Run `git diff --check`.
- [x] Scan the diff for conflict markers and likely committed secrets.
- [x] Commit the repo changes.
- [ ] Leave review-required Kanban handoff with commit, changed files, tests, and vault files touched.
