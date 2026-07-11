# Feature Specification: Cybermap Geospatial Backend P0

**Feature Branch**: `005-cybermap-geospatial-backend`

**Created**: 2026-07-11

**Status**: Current P0 integration specification and implementation ledger

**Input**: Convert the Cybermap geospatial backend design into spec-kit implementation docs, keep repo/vault documentation linked, and expose the actual P0 task graph instead of leaving the backend as an aspirational design note.

## Current-state boundary

This specification records the Cybermap P0 contract and the current Kanban-backed implementation state.

- **Main/deployed baseline**: `main` includes the shared Cybermap network refactor and core PostGIS migration work; production deployment still flows through GitHub CI/CD.
- **Final integration candidate**: `kanban/cybermap-final-adversarial-review` is the fan-in branch. This restoration branch adds the review-approved P0.16 spec-kit/doc-sync artifacts back to that candidate.
- **Review-approved implementation branches**: most P0 slices completed in dedicated Kanban worktrees/branches; not all review-approved slices or final-review remediation branches are present until the fan-in merge is clean.
- **Current open remediations**: P0.15 ops/cost controls need the active merge-conflict remediation to land cleanly; P0.17 final adversarial review is no-go until spec-kit/doc-sync artifacts, app-setting naming, and active merge cleanup are reviewed together.
- **Target state for a fresh implementer**: the final branch contains the Cybermap backend, P0.14 regression suite, P0.15 ops docs/scripts, this P0.16 spec surface, and executable doc-sync/full-suite verification.
- **No demo-runtime rule**: Cybermap production paths must not use fake/demo feed state. Fixtures are allowed under tests only.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Durable Cybermap source of truth (Priority: P1)

Operators need PostgreSQL/PostGIS to hold the authoritative Cybermap observation ledger, source catalog, entities, cell materializations, sensorium sessions, and memory sync records.

**Why this priority**: Godeye, RaID, Greenfeeds, and Mosaic/Murmurs all need one durable geospatial spine. The VM is replaceable; the database is not.

**Independent Test**: Apply the ordered migration set to PostgreSQL and verify the schema contains PostGIS, constrained source/observation enums, append-only observations, entity links, materialized cells, and memory tables.

**Acceptance Scenarios**:
1. **Given** the migration runner has DB credentials from environment/app settings, **When** it applies the Cybermap migrations, **Then** PostGIS and pgcrypto are enabled and the core Cybermap tables exist.
2. **Given** a spatial observation, **When** it is stored, **Then** it includes SRID 4326 geometry where possible plus app-computed cells such as `h3_7`, `h3_9`, and `h3_11`.
3. **Given** an observation from grey/orange/red enrichment, **When** it is inserted, **Then** it must reference a local observation, sensorium session, or authorized scope.

### User Story 2 - Replaceable VM API/worker layer (Priority: P1)

The VM must act as a rebuildable API gateway and small worker host, not as the durable database or raw-frame warehouse.

**Why this priority**: The budget target uses a small B1ms VM. It must be safe to rebuild from Bicep/cloud-init while PostgreSQL preserves state.

**Independent Test**: Inspect Bicep/cloud-init and service docs for `cybermap-api`, `cybermap-worker`, HTTPS 443 ingress, PgBouncer/low-pool DB handling, `/healthz`, `/readyz`, and absence of public product ingress on port 8080.

**Acceptance Scenarios**:
1. **Given** the VM has booted from the Cybermap gateway branch, **When** `/healthz` is called, **Then** it returns a secret-free health response without requiring DB connectivity.
2. **Given** DB settings are missing or invalid, **When** `/readyz` is called, **Then** it returns sanitized not-ready state instead of crashing or leaking connection strings.
3. **Given** the API is public, **When** `/api/v1/*` is called without a valid token, **Then** the request is rejected by default and structured auth logs omit token values and hashes.

### User Story 3 - Authenticated observation ingest and materialization (Priority: P1)

Wardriver/RaID and Greenfeed workers need authenticated, idempotent ingest that normalizes observations, derives entities/edges, and updates Cybermap cells.

**Why this priority**: The map is a materialized product. It must be built from provenance-marked evidence rather than UI-local overlays.

**Independent Test**: Submit valid/invalid observation batches with idempotency keys, source scopes, and source classes; verify accepted batches create observations, entity edges, cells, and receipts while rejected batches leave no partial materialization.

**Acceptance Scenarios**:
1. **Given** a Wardriver device token with `owned_device` scope, **When** it posts a batch with an idempotency key, **Then** the API accepts local/owned observations and returns a stable receipt.
2. **Given** the same idempotency key is retried by the same source, **When** the batch is posted again, **Then** the API returns the existing result without duplicating observations or cells.
3. **Given** a client attempts to self-assert source-class authority beyond its registered token scopes, **When** it posts a batch, **Then** the API rejects the source-class spoof.

### User Story 4 - Backend-backed Godeye and RaID views (Priority: P1)

Godeye and RaID need read APIs backed by Cybermap cells/entities and nearby context, with provenance and caveats visible to the UI.

**Why this priority**: The product boundary is the Cybermap backend. Godeye must stop depending on runtime demo overlays, and RaID must write local observation before receiving enriched nearby context.

**Independent Test**: Exercise viewport/cell/entity/source read APIs and the SWA proxy path; verify returned payloads include source class, freshness, caveats, and safe projections that exclude raw PII/raw frames.

**Acceptance Scenarios**:
1. **Given** Godeye requests a bbox/zoom, **When** cells exist, **Then** it receives backend Cybermap cells with layer counts, freshness, provenance, caveats, and sparse entity summaries.
2. **Given** RaID posts local field observations, **When** nearby context is requested, **Then** the response is scoped to current session metadata and registered source permissions.
3. **Given** no backend cells are available, **When** Godeye renders the map, **Then** it shows degraded/empty backend state rather than seeding fake map data.

### User Story 5 - Greenfeed, direct observation, and memory loop (Priority: P2)

Mosaic/Murmurs need to distinguish dream suspension, RaID sight, and Greenfeed jack-in while claim validation records what was actually visible and how it affected a claim.

**Why this priority**: The system must not pretend omniscience. Direct observation packets and memory events are the accountability layer for perception.

**Independent Test**: Run sensorium session, direct-observation, Greenfeed lookup, and memory sync tests for Green-only gate behavior, inconclusive no-source outcomes, caveats, and calibration/memory payloads.

**Acceptance Scenarios**:
1. **Given** a claim with location/time footprint, **When** a usable Green source exists, **Then** the API creates or reuses a `greenfeed_jack_in` session and records a caveated direct observation packet.
2. **Given** no usable Green source exists, **When** claim validation runs, **Then** the outcome is inconclusive with a no-source/stale/terms-blocked caveat instead of invented sight.
3. **Given** a direct observation packet is recorded, **When** memory sync runs, **Then** Mosaic/Murmurs receive effect-on-claim and caveat payloads without raw private visual details.

## Functional Requirements *(mandatory)*

- **FR-001**: Cybermap MUST use PostgreSQL/PostGIS as the durable source of truth; the VM MUST remain replaceable.
- **FR-002**: The schema MUST include `source_catalog`, `sensorium_sessions`, `observations`, `cyber_entities`, `entity_observations`, `cybermap_cells`, `mosaic_memories`, `murmur_memories`, and `sync_batches`.
- **FR-003**: Spatial rows MUST use PostGIS geometry with SRID 4326 where possible and app-computed H3/geohash cells for viewport aggregation.
- **FR-004**: P0 MUST NOT require a PostgreSQL H3 extension; H3/geohash cells are computed in app/worker code.
- **FR-005**: PostgreSQL MUST use private VNet access, private DNS, no public ingress, and B1MS-appropriate connection caps.
- **FR-006**: VM public product ingress MUST be HTTPS 443; port 8080 echo is scaffold-only and must not be presented as the product API.
- **FR-007**: `/healthz` MUST be unauthenticated, DB-independent, and secret-free.
- **FR-008**: `/readyz` MUST report sanitized DB/config/migration state and fail closed when required settings are missing.
- **FR-009**: `/api/v1/*` routes MUST require auth by default; only explicitly non-secret health/readiness endpoints may be unauthenticated.
- **FR-010**: Tokens MUST be stored as hashes only; logs, docs, tests, and responses must not include plaintext tokens, DB credentials, or connection strings.
- **FR-011**: Auth MUST bind clients to route scopes, source IDs/classes, and client types such as `wardriver_device`, `swa_proxy`, `jetson`, `greenfeed_worker`, and operator/admin.
- **FR-012**: Observation ingest MUST require idempotency and source-scope validation and reject source-class spoofing.
- **FR-013**: Entity derivation MUST link observations to stable Cybermap entities through `entity_observations` rather than duplicating identity logic in UI code.
- **FR-014**: Cell materialization MUST update `cybermap_cells` from observations/entities and return provenance, freshness, source-class counts, salience/confidence, and caveats.
- **FR-015**: Godeye MUST render backend Cybermap cells/entities only; runtime demo/fake feeds are forbidden outside test fixtures.
- **FR-016**: RaID MUST write owned/local observations before receiving enriched nearby context.
- **FR-017**: Green public/owned/authorized feeds MAY preload; grey/orange/red enrichment MUST require a local/owned observation or explicit authorized scope.
- **FR-018**: Sensorium sessions MUST use canonical states `dream_suspension`, `raid_sight`, and `greenfeed_jack_in`.
- **FR-019**: Direct observations MUST include `location_basis`, `source_ref`, `claim_ref`, `confidence`, `caveats`, `effect_on_claim`, and retention/redaction policy.
- **FR-020**: Raw frames and raw PII MUST NOT be retained or published by default; raw retention must require explicit operator capture.
- **FR-021**: Memory sync MUST support `GET /api/v1/memories?since=` and `POST /api/v1/memories` for distilled Mosaic/Murmurs events with provenance.
- **FR-022**: Claim-validation Greenfeed lookup MUST return caveated direct-observation results and inconclusive no-source/stale/terms-blocked outcomes without inventing sight.
- **FR-023**: Operations docs MUST include PgBouncer/app pool caps, backups/exports, monitoring signals, partition/rollover guidance, cost watch, and public-Godeye degraded/offline behavior.
- **FR-024**: Repo docs, spec-kit files, and the vault note MUST link to one another so future workers do not fork the doctrine.

## Key Entities *(include if feature involves data)*

- **SourceCatalog**: Registry of Greenfeeds, owned devices, local observation streams, service adapters, and authorized enrichment sources. Owns source class, terms, cache TTL, geometry/footprint, provenance, and preload eligibility.
- **SensoriumSession**: A time-bounded perception context (`dream_suspension`, `raid_sight`, `greenfeed_jack_in`) with source, location basis, scope, retention policy, and metadata.
- **Observation**: Immutable evidence packet with source, source class, kind, observed/ingested time, geometry/cells, confidence, retention class, payload, provenance, and idempotency keys.
- **CyberEntity**: Stable product object such as a network, device, feed, place, claim, event, or cluster derived from observations.
- **EntityObservation**: Weighted edge connecting observations to CyberEntities with relationship/provenance.
- **CybermapCell**: Materialized viewport unit keyed by app-computed cell/resolution with layer summaries, counts, salience, freshness, and caveats.
- **MemoryEvent**: Distilled Mosaic/Murmurs event stored in `mosaic_memories` or `murmur_memories` with salience, retention, payload, and provenance.
- **SyncBatch**: Idempotent receipt for device/backend ingest and memory sync operations.
- **DirectObservationPacket**: Claim-linked observation record with visible/not-visible summary, confidence, caveats, evidence links, and effect-on-claim.
- **ClaimValidationResult**: Greenfeed/direct-observation orchestration output that records source selection, rejection caveats, inconclusive status, memory deltas, and calibration updates.

## API Surface

| Endpoint | Status in P0 graph | Purpose |
|---|---|---|
| `GET /healthz` | P0.02/P0.04 | VM/API health, no DB dependency and no secrets |
| `GET /readyz` | P0.04 | DB connectivity/config/migration state with sanitized failures |
| `POST /api/v1/observations/batch` | P0.05 | Authenticated, idempotent Wardriver/RaID/Greenfeed batch ingest |
| `GET /api/v1/cybermap/viewport?bbox=&zoom=&layers=&since=` | P0.07/P0.09 | Backend Cybermap viewport for Godeye |
| `GET /api/v1/cybermap/cells/{h3Cell}` | P0.07 | Cell detail/provenance drilldown |
| `GET /api/v1/entities/{id}` | P0.055/P0.07 | Entity summary and observation links |
| `GET /api/v1/sources?bbox=&class=` | P0.07/P0.11 | Source catalog / Greenfeed lookup |
| `POST /api/v1/sensorium/sessions` | P0.12 | Start/end dream, RaID sight, or Greenfeed jack-in session |
| `POST /api/v1/direct-observations` | P0.12/P0.125 | Claim-linked direct observation packet |
| `POST /api/v1/claim-validation/greenfeeds` | P0.125 | Claim footprint -> Greenfeed lookup -> direct observation/memory delta |
| `GET /api/v1/memories?since=` | P0.13 | Mosaic/Murmurs memory sync pull |
| `POST /api/v1/memories` | P0.13 | Distilled Mosaic/Murmurs memory writeback |

## P0 Implementation Ledger

| Slice | Task | Current board state | Repo integration note |
|---|---|---|---|
| P0.00 | `t_acb2d921` shared VNet/subnets for VM and private PostgreSQL | done | Merged/deployed on `main`; live Azure verified shared network and private DNS linkage. |
| P0.01 | `t_32d37829` private PostgreSQL Flexible Server B1MS | done | Review-ready branch; private access only, B1MS, 32 GiB, 7-day backup. |
| P0.02 | `t_1c25043d` replace echo VM scaffold with Cybermap API gateway services | done | Review-approved branch; Node 20 gateway, nginx 443, PgBouncer placeholder, no public 8080 product ingress. |
| P0.03 | `t_4284c399` PostGIS migrations for observation ledger/cells | done | Merged to `main`; core schema and regression tests present. |
| P0.04 | `t_bc36f36d` DB config, pooling, migrations, readiness | done | Review-approved branch; env-only DB settings, low pool, migration runner, sanitized `/readyz`. |
| P0.045 | `t_c92269bd` API auth, source registry scopes, rate limits | done | Review-approved branch; hashed tokens, route/source scopes, structured auth decisions. |
| P0.05 | `t_1c95370c` authenticated observation batch ingest with idempotency | done | Review-approved branch; protected ingest contract. |
| P0.055 | `t_943a17b2` derive Cybermap entities and observation edges | done | Review-approved branch; observation-to-entity materialization edge layer. |
| P0.06 | `t_09689772` materialize Cybermap cells from observations | done | Review-approved branch; cells generated from observation/entity updates. |
| P0.07 | `t_4029053a` viewport, cell, entity, and source catalog read APIs | done | Review-approved branch; read APIs and safe projections. |
| P0.08 | `t_1b55a42e` proxy SWA `/api` routes to VM Cybermap v1 API | done | Review-approved branch; SWA proxy path for backend API. |
| P0.09 | `t_58787291` make Godeye render backend Cybermap cells only | done | Review-approved branch; no runtime demo map overlays. |
| P0.10a | `t_826f9422` backend Wardriver payload contract and fixtures | done | Review-approved branch; RaID/Wardriver backend sync contract. |
| P0.10b | `t_73a91990` Android Wardriver token storage and idempotent outbox sync | done | Review-approved branch; Android client token/outbox work. |
| P0.10c | `t_91aadb73` RaID nearby context, session metadata, operator sight indicator | done | Review-approved branch; field view bridges backend nearby context. |
| P0.11 | `t_92549ef3` Greenfeed catalog and poller with Green-only gates | done | Review-approved branch; curated Green source catalog/poller. |
| P0.12 | `t_90dcba57` sensorium sessions and direct observation packets | done | Review-approved branch; canonical sensorium states and privacy filters. |
| P0.125 | `t_bf5ff92d` claim-validation Greenfeed lookup/direct-observation loop | done | Review-approved branch; caveated claim validation + memory delta loop. |
| P0.13 | `t_95689947` Mosaic/Murmurs memory sync endpoints | done | Review-approved branch; memory pull/writeback contract. |
| P0.14 | `t_55c6e0ce` security/privacy/source-class policy regression suite | done | Review-approved and merged into the final integration candidate. |
| P0.15 | `t_878202a4` operations plan for backups, monitoring, PgBouncer, cost controls | pending final merge cleanup | Review-approved branch; active merge remediation must land before completion. |
| P0.16 | `t_9bc9477c` spec-kit docs and vault/repo sync | done/restored here | Review-approved branch; `t_83b7e06e` restores these artifacts into the final candidate. |
| P0.17 | `t_46e22456` final adversarial coverage review | no-go/remediation running | Fan-in review found active merge, doc-sync, and app-setting naming blockers. |

## Task Graph

```text
P0.00 -> P0.01
P0.00 -> P0.02
P0.02 + P0.03 -> P0.04
P0.04 -> P0.045
P0.04 + P0.045 -> P0.05
P0.05 -> P0.055
P0.05 + P0.055 -> P0.06
P0.045 + P0.055 + P0.06 -> P0.07
P0.045 + P0.07 -> P0.08 -> P0.09
P0.05 + P0.07 -> P0.10a -> P0.10b
P0.10b + P0.12 -> P0.10c
P0.05 + P0.06 -> P0.11
P0.04 + P0.045 -> P0.12
P0.07 + P0.11 + P0.12 -> P0.125
P0.04 + P0.045 + P0.125 -> P0.13
P0.045 + P0.055 + P0.05 + P0.07 + P0.09 + P0.10a + P0.10b + P0.10c + P0.11 + P0.125 + P0.12 -> P0.14
P0.01 + P0.02 + P0.04 -> P0.15
P0.01 + P0.02 + P0.03 + P0.045 + P0.055 + P0.05 + P0.07 + P0.09 + P0.10a + P0.10b + P0.10c + P0.11 + P0.125 + P0.13 -> P0.16
P0.14 + P0.15 + P0.16 -> P0.17
```

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Full docs/spec sync test suite passes with no stale Cybermap spec links or missing P0 ledger entries.
- **SC-002**: Core schema tests verify PostGIS geometry, app-computed H3 cells, source-class gates, retention defaults, and append-only ledger tables.
- **SC-003**: API tests verify authenticated ingest, read APIs, sensorium/direct observations, claim validation, and memory sync without token/secret leakage.
- **SC-004**: UI/proxy tests verify Godeye uses backend Cybermap cells and does not seed runtime demo map state.
- **SC-005**: Infrastructure checks verify Bicep builds, PostgreSQL private access, VM B1ms default, no public Postgres ingress, and no product 8080 path once gateway branches merge.
- **SC-006**: Operations docs include concrete PgBouncer caps, backup/export shape, monitoring signals, cost watch, partition guidance, and degraded public-Godeye behavior.

## Assumptions

- Operators keep final Azure deploys on GitHub CI/CD; local `az` is used for inspect/cleanup/what-if, not ad-hoc production mutation.
- The Blue Swallow Wardriver/RaID Android work lands from its own repository and is referenced here only through backend contracts and payload fixtures.
- Greenfeed seed data is curated public/owned/authorized data; operator-configurable external feeds require separate review before broad crawling or redirect-following behavior changes.
- P0 completion requires P0.17 adversarial review to pass after the active ops merge cleanup, spec-kit/doc-sync restoration, and backend app-setting naming remediation are reviewed together.
