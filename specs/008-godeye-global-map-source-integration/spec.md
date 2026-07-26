# Feature Specification: Godeye Global Map Source Integration

**Feature Branch**: `kanban/godeye-global-map-source-integration`
**Created**: 2026-07-22
**Reconciled**: 2026-07-25
**Status**: Implemented as an operator-only, materialized-data capability. The three provider adapters remain fixture-only and disabled. Live provider enablement is out of scope until its source-specific gates pass.
**Input**: Add a provenance-first Global Godeye mode and evaluate the initial USGS, GDACS, and NASA EONET source candidates.

## Current State

Godeye retains its GPS-centered 100 m Field map. This feature adds a separately labelled Global panel that reads bounded H3 aggregate cells from BSS infrastructure. It does not turn Godeye into a browser-direct intelligence dashboard.

The implementation contains three normalizers: `usgs-earthquakes`, `gdacs-alerts`, and `nasa-eonet-events`. Each is a fixture-only adapter. `runGreenfeedWorker` is dependency-injected and has no scheduler, provider fetch implementation, or read-path integration. No browser or Global viewport request contacts a provider.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Inspect Global evidence without false precision (Priority: P1)

An authenticated operator opens Godeye and can inspect a Global panel independently of the retained Field map. The panel reads aggregate cells and source-health records only.

**Why this priority**: A global context view is useful only if it preserves the local Field product and does not expose raw observations or create client-side provider fan-out.

**Independent Test**: Run the Global viewport contract, store, VM HTTP, SWA proxy, and operator UI tests with fixture data.

**Acceptance Scenarios**:

1. **Given** a Global aggregate response with approved cells, **When** an operator opens Global mode, **Then** the renderer displays aggregate evidence and source health without requesting browser geolocation.
2. **Given** an operator opens Field mode, **When** a GPS fix is available, **Then** the existing 100 m local viewport flow remains independent of the Global endpoint.
3. **Given** no eligible materialized cells exist, **When** the Global request succeeds, **Then** the UI displays an explicit empty or disabled state and never substitutes sample markers.

### User Story 2 — Enforce source eligibility and provenance (Priority: P1)

An operator can distinguish source class, attribution, freshness, caveats, and disabled status. Only policy-approved materialized sources may appear in Global cells.

**Why this priority**: Provider breadth without a durable eligibility gate would erase the BSS provenance and privacy boundary.

**Independent Test**: Seed green, authorized, and excluded source fixtures; query the aggregate viewport; assert that only eligible green layers return.

**Acceptance Scenarios**:

1. **Given** a source is disabled or lacks a terms-review timestamp, **When** Global mode reads the ledger, **Then** it reports `disabled` and returns no preloaded cells.
2. **Given** an enabled, `allowed_preload=true`, reviewed green source, **When** it has materialized cells, **Then** the bounded viewport can return aggregate fields with attribution and caveats.
3. **Given** a grey, orange, or red source, **When** Global mode loads, **Then** it cannot globally preload regardless of cached rows.

### User Story 3 — Keep provider operations explicitly bounded (Priority: P2)

A future reviewed source run records an immutable result and does not make Global map reads fetch the provider.

**Why this priority**: Provider failure, rate limiting, or policy uncertainty must be visible rather than hidden behind client retries.

**Independent Test**: Exercise the injected worker with successful, empty, rate-limited, malformed, timeout, disabled, and terms-unreviewed fixtures.

**Acceptance Scenarios**:

1. **Given** a provider returns rate limit or transport failure, **When** the worker records the outcome, **Then** it emits a bounded retry time and redacted error class without seeding data.
2. **Given** provider terms are unreviewed, **When** the worker is invoked, **Then** it records `disabled` before any fetch.
3. **Given** many operators read the Global panel, **When** the materialized response is served, **Then** the read path makes zero provider requests.

### Edge Cases

- Antimeridian-wrapped bounds, unsupported zooms, unknown layer IDs, and requests above the cell budget fail with stable contract errors.
- A response with raw observation fields is rejected rather than passed through to the renderer.
- A stale, failed, empty, or disabled layer remains visible as an intelligence gap; it is not relabelled as live.
- Duplicate provider event identities materialize deterministically and preserve append-only source-run evidence.
- Missing provider credentials, unavailable terms, or a provider access denial keep the source disabled. They do not justify a browser-side workaround.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Godeye MUST retain Field mode and expose a separately labelled Global aggregate panel on the authenticated operator surface.
- **FR-002**: Global mode MUST render without browser geolocation and MUST NOT replace the existing 100 m Field viewport flow.
- **FR-003**: Global mode MUST use only the same-origin token-gated `POST /api/cybermap/global-viewport` BSS proxy.
- **FR-004**: The VM Global viewport API MUST return bounded materialized aggregate cells, source health, freshness, provenance, caveats, and explicit empty state; it MUST NOT return raw observations or RF identifiers.
- **FR-005**: The request contract MUST reject invalid coordinates, antimeridian-wrapped bounds, unsupported zoom, unknown layers, and requests exceeding the cell limit.
- **FR-006**: A global layer MAY preload only when it is enabled, `allowed_preload=true`, has a non-null `terms_reviewed_at`, is marked global, and has an allowed source class.
- **FR-007**: `usgs-earthquakes`, `gdacs-alerts`, and `nasa-eonet-events` MUST remain disabled and `allowed_preload=false` until each source independently passes the live-enable tasks in `tasks.md`.
- **FR-008**: The three initial adapters MUST normalize only source-owned fixtures in this release. They MUST contain no transport implementation, scheduler, credential, or runtime fallback surface.
- **FR-009**: Source acquisition MUST occur only through a bounded backend worker. A Global viewport read MUST use materialized BSS data and MUST NOT fan out to providers.
- **FR-010**: Source runs MUST record immutable timestamps, outcome, response class, counts, retry time, and redacted error code.
- **FR-011**: Materialization MUST aggregate snapshots at H3 resolutions 5, 7, 9, and 11 and MUST omit raw provider records from Global responses.
- **FR-012**: Global cells and the operator ledger MUST preserve layer ID, source class, attribution, freshness, and caveats.
- **FR-013**: Grey, orange, and red sources MUST remain globally unavailable even if database rows exist.
- **FR-014**: Provider credentials, if a later provider contract requires them, MUST remain backend-only and MUST NOT be shipped in operator HTML, JavaScript, fixtures, logs, or source-health responses.
- **FR-015**: The Global map MUST remain an authenticated operator surface. This feature MUST NOT add a public provider proxy or public Global-map API.
- **FR-016**: A disabled, empty, stale, or failed source MUST be presented explicitly. The product MUST NOT use demo or fallback provider data.

### Key Entities

- **GlobalViewportRequestV1**: A bounded operator request for aggregate cells and selected layer IDs.
- **GlobalViewportResponseV1**: A token-gated response containing aggregate cells and per-layer health only.
- **SourceCatalogEntry**: A durable source-policy row with source class, enablement, preload, terms-review, attribution, freshness, and global-layer fields.
- **GreenfeedSnapshot**: A normalized provider event used only to produce BSS observations and aggregate cells.
- **SourceFetchRun**: An immutable record of one bounded worker attempt.
- **CybermapCell**: A materialized H3 aggregate product, not a raw provider point or track.

## Source Candidates and Enablement State

| Layer | Code state | Current policy state | Live transport/scheduler | Account state |
|---|---|---|---|---|
| `usgs-earthquakes` | Fixture normalizer implemented | `enabled=false`, `allowed_preload=false`; static review timestamp present | Not implemented | No account or credential configured |
| `gdacs-alerts` | Fixture normalizer implemented | `enabled=false`, `allowed_preload=false`; `terms_reviewed_at=null` | Not implemented | No account or credential configured |
| `nasa-eonet-events` | Fixture normalizer implemented | `enabled=false`, `allowed_preload=false`; `terms_reviewed_at=null` | Not implemented | No account or credential configured |

## Success Criteria *(mandatory)*

- **SC-001**: The current repository suite passes with the Global UI/API tests included and no test failure.
- **SC-002**: The VM unit suite passes its Global contract, store, worker, materializer, and adapter tests; a missing protected PostGIS URL is a named skip, not a pass for migration proof.
- **SC-003**: Automated tests prove that disabled, unreviewed, and excluded source rows produce no globally preloaded aggregate cells.
- **SC-004**: Automated tests prove that Global responses contain no raw observation fields or provider payload fallback.
- **SC-005**: Automated tests prove that P0 adapters remain fixture-only and the worker performs no fetch when a source is disabled or terms-unreviewed.
- **SC-006**: Live enablement occurs only after a source-specific policy review, bounded transport/scheduler implementation, disposable-PostGIS receipt, and operator acceptance receipt.

## Assumptions and Explicit Exclusions

- This document is not legal advice. A provider endpoint responding anonymously does not approve ingestion, persistence, redistribution, or display.
- Provider account, API-key, rate-limit, retention, attribution, and redistribution obligations are not assumed from fixture normalizers. They must be captured in a source-specific approval record before live enablement.
- No current source is an operational live feed. The implementation does not prove source availability, provider authorization, or a production scheduler.
- The Global panel is read-only. It does not control devices, probe hosts, calculate routes, or expose a tracking interface.
- World Monitor source, styling, assets, and provider credentials are excluded.
