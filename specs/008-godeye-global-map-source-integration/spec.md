# Feature Specification: Godeye Global Map + Source Integration

**Feature Branch**: `008-godeye-global-map-source-integration`
**Created**: 2026-07-22
**Status**: Approved for production deployment. `deflock-osm-alpr-reports` is enabled on the BSS VM by this package, with a bounded scheduled worker and an initial post-deploy run.
**Input**: User description: "Turn the World Monitor assessment into a specific Godeye spec delta and evaluate its datasource breadth and selection." Amended 2026-07-23: "We want to integrate the deflock map as part of Godeye view." Amended 2026-07-26: "Enable DeFlock and deploy the map; it is not gated."

## Current-State Delta

Godeye is an authenticated, GPS-centered, fixed-zoom OpenStreetMap tile view. `app/operator/main.js` renders a 100 m field radius and raw managed access-point markers. The VM currently exposes only token-gated `GET /api/v1/cybermap/viewport?lat=&lon=&radiusMeters=`; it returns nearby observation rows, not materialized global cells. The schema already reserves `source_catalog`, append-only `observations`, and `cybermap_cells` for the intended model.

This feature adds an operator-only global map mode. It must preserve the local field view as a separate product mode. It does not make Godeye a World Monitor fork or a general-purpose OSINT dashboard.

## Selected source: DeFlock/OSM public reports

`deflock-osm-alpr-reports` is the first implemented global-source adapter. It reads only the fixed, no-account DeFlock GeoJSON endpoint in a bounded worker and treats every source item as a **public report**, not a verified camera, live sighting, or Flock Safety record. The adapter persists H3 aggregate cells and source-run metadata only. It discards raw features, coordinates, OSM IDs, brands, operators, directions, and routing-related properties before durable storage.

The source is enabled by the BSS operator's explicit deployment direction. The catalog records the OpenStreetMap ODbL attribution and the enablement decision; the visible ledger reports the actual fresh, stale, error, disabled, or empty state. The adapter never calls the DeFlock avoidance-route API.

## User Scenarios & Testing *(mandatory)*

### User Story 1 — Inspect a separate global evidence panel without false precision (Priority: P1)

An authenticated operator opens Godeye and views a separately labelled Global panel alongside the retained Field map. The panel renders server-materialized cells for enabled green sources. Each cell reports its evidence class, freshness, and caveats without exposing raw device identifiers or implying local observation.

**Why this priority**: The current 100 m renderer cannot communicate public global context, while direct raw-observation rendering would make a global surface unsafe and slow.

**Independent Test**: Open the authenticated Godeye surface without granting location permission. The Field map stays dormant; the Global panel requests only the bounded aggregate endpoint and displays disabled, empty, stale, or error state.

**Acceptance Scenarios**:
1. **Given** an operator opens Godeye, **When** a materialized green source has fresh cells in the fixed Global panel viewport, **Then** Godeye renders aggregate cells and a source-health ledger without requesting browser geolocation.
2. **Given** an operator uses the Field map, **When** a current GPS fix is available, **Then** the existing 100 m nearby-observation flow remains available and does not consume the global cell endpoint.
3. **Given** no eligible global cell exists, **When** the aggregate request succeeds, **Then** Godeye renders an explicit empty/degraded state and never substitutes sample, simulated, or stale-as-live markers.

### User Story 2 — Select sources by evidence class and terms status (Priority: P1)

An operator can identify which layers are loaded, stale, disabled, or unavailable, and can distinguish public evidence from owned/local observations and from authorized enrichments.

**Why this priority**: World Monitor demonstrates broad useful source coverage, but breadth without source gates would collapse BSS provenance and privacy controls.

**Independent Test**: Create source catalog rows for green, authorized, and orange sources; materialize cells for each; request a global viewport; assert that only enabled/approved green layers preload and that rejected layers leave an audit-visible status.

**Acceptance Scenarios**:
1. **Given** a source is disabled, **When** Global mode loads, **Then** it is absent from the cells and appears as `disabled` with a non-secret reason. The DeFlock source is enabled by this package and does not use terms review as a runtime gate.
2. **Given** a source is `green_authorized`, **When** its authorization reference is valid and its global-preload flag is enabled, **Then** it can appear with an authorization/attribution caveat.
3. **Given** a grey, orange, or red source, **When** Global mode loads, **Then** the source cannot preload globally regardless of its cache contents.

### User Story 3 — Operate a degraded source fleet honestly (Priority: P2)

An operator can see each requested layer's last successful fetch, freshness state, failure count, and next retry time. Source failure does not cause a client fan-out or conceal the gap.

**Why this priority**: World Monitor's source-health model is valuable; it prevents a dense map from masquerading as complete intelligence.

**Independent Test**: Insert successful, stale, failed, and disabled source-run fixtures; request the viewport; assert deterministic `fresh`, `stale`, `error`, and `disabled` states and no request-time provider fetch.

**Acceptance Scenarios**:
1. **Given** a source exceeds its freshness ceiling, **When** its cells remain available, **Then** the response marks the layer `stale` and Godeye visually degrades it.
2. **Given** a worker records a failed provider fetch, **When** an operator opens Global mode, **Then** the response reports `error` with the last successful timestamp if one exists.
3. **Given** a provider is unavailable, **When** many operators view the map, **Then** the backend performs no provider request on behalf of those map reads.

### Edge Cases

- A viewport crossing the antimeridian is represented as two bounded requests; the client must not send a wrapped bounding box.
- A requested zoom/layer combination that would exceed the server cell cap returns a structured `viewport_too_large` response rather than truncating silently.
- A source can have data older than its cache TTL. The UI may show it only as stale context, never as current live sight.
- A worker may receive duplicate source events. It must use a deterministic source event key and append-only observation semantics.
- Missing provider credentials, unavailable terms, or a rate-limit response keep the source disabled; they do not enable a mock provider.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Godeye MUST retain the current `field` map and expose a separately labelled `global` aggregate panel on the authenticated Godeye surface. The Global panel MUST NOT request browser geolocation to render global cells.
- **FR-002**: The Field map MUST retain the existing token-gated local-radius observation workflow until a separately accepted Field-map replacement passes its tests.
- **FR-003**: The Global panel MUST read only from a token-gated BSS cell-viewport API. It MUST NOT fetch providers directly from the browser.
- **FR-004**: The global cell-viewport API MUST return materialized cells, per-source health, freshness, provenance summaries, caveats, and an explicit empty result. It MUST NOT return raw observation payloads or raw RF identifiers.
- **FR-005**: The API MUST reject invalid coordinates, wrapped bounding boxes, unknown layer IDs, non-integer zoom values, and requests above the documented cell limit with a stable error code.
- **FR-006**: Only enabled `green_public`, `green_owned`, and explicitly approved `green_authorized` catalog entries with `allowed_preload=true` MAY preload globally.
- **FR-007**: The first implemented global source MUST be `deflock-osm-alpr-reports`. Its adapter MUST use the fixed DeFlock GeoJSON HTTPS endpoint only in a bounded worker; it MUST preserve OpenStreetMap and DeFlock attribution, use no account or credential, and deploy with `enabled=true`, `allowed_preload=true`, and `terms_reviewed=true` as the recorded BSS operator enablement decision.
- **FR-008**: USGS, GDACS, NASA EONET, World Monitor-inspired cyber, network, aviation, maritime, conflict, news, market, economic, and infrastructure sources MUST remain disabled candidates until their individual provider terms, retention, attribution, rate limit, and BSS source class are approved.
- **FR-009**: Source acquisition MUST occur in bounded worker jobs. A viewport request MUST read materialized BSS data only and MUST NOT trigger provider fan-out.
- **FR-010**: Every global cell MUST expose the contributing source IDs/classes, newest and oldest evidence timestamps, source freshness state, salience, and human-readable caveats.
- **FR-011**: The source registry MUST persist an append-only fetch-run record with status, timestamps, HTTP/result classification, item counts, normalized/duplicate/rejected counts, and a redacted error category.
- **FR-012**: Godeye MUST display an operator-visible layer ledger containing layer name, source class, current health, last successful fetch, freshness age, attribution, and caveat count.
- **FR-013**: A global cell MUST aggregate evidence at the selected H3 resolution. `deflock-osm-alpr-reports` MUST materialize at resolutions 2, 4, and 5 only. It MUST NOT expose a BSSID, SSID, device identifier, person label, exact device track, raw camera frame, raw point coordinate, OSM identifier, brand, operator, direction, route, or location more precise than the approved global cell boundary.
- **FR-014**: Grey, orange, and red sources MUST remain globally unavailable even if data already exists in PostgreSQL. Local/owned or explicit authorized-scope gates remain required for their separate read paths.
- **FR-015**: All source credentials MUST remain worker/backend secrets. They MUST NOT appear in operator HTML, JavaScript, client configuration, map URLs, logs, fixtures, or source-health responses.
- **FR-016**: If a selected source is stale, failed, disabled, or empty, Godeye MUST make that state visible. It MUST NOT synthesize substitute data, hydrate demo fixtures, or label stale cells as fresh.
- **FR-017**: The source registry MUST preserve provider terms/attribution provenance separately from evidence provenance. The DeFlock catalog record MUST preserve its OpenStreetMap attribution and the BSS operator enablement decision.
- **FR-018**: The implementation MUST not copy World Monitor dashboard source. Any new renderer or dependency requires its own license and supply-chain review.
- **FR-019**: The source adapter layer MUST not bypass provider access controls, anti-bot measures, account boundaries, or rate limits. A blocked provider is a disabled source, not a browser-side workaround.
- **FR-020**: The global map remains an authenticated operator surface. It MUST NOT add a public map route, public source API, or anonymous provider proxy.
- **FR-021**: The DeFlock adapter MUST use a fixed allowlisted data URL and MUST NOT call `api.dontgetflocked.com`, accept origin/destination input, calculate a route, or expose avoidance guidance.
- **FR-022**: The DeFlock adapter MUST bound a source read to 45 seconds, 35 MiB compressed input, and 256 MiB decompressed output. It MUST discard the raw response after aggregate materialization and record only a redacted source-run outcome, ETag, and item-count metadata.
- **FR-023**: The VM deployment MUST install and enable a bounded DeFlock source service and timer. Deployment MUST start one source run after migrations complete. A source-fetch failure MUST record its bounded outcome without making a viewport request fetch the provider.

### Key Entities

- **SourceCatalogEntry**: Existing BSS source registry row extended with reviewed terms/attribution, layer policy, and source-health configuration.
- **DeflockReportedAggregate**: A `deflock-osm-alpr-reports` H3 count cell derived from public OSM-tagged ALPR reports. It has no point feature, OSM ID, device metadata, or routing field.
- **SourceFetchRun**: Immutable record of one bounded provider acquisition attempt.
- **GreenfeedObservation**: Normalized, append-only `greenfeed_snapshot` observation with deterministic provider event key and source evidence provenance.
- **CybermapCell**: Existing materialized H3 map product, extended to carry source-layer counts, freshness, and caveats at an approved resolution.
- **GlobalViewportRequestV1**: Operator viewport/layer request for aggregated cells.
- **GlobalViewportResponseV1**: Token-gated response containing bounded cell aggregates and source-health records.

## Success Criteria *(mandatory)*

- **SC-001**: A global viewport with up to 1,000 cells returns from the materialized database path in 1,000 ms or less at p95 under the defined B1MS-compatible test load; it performs zero outbound provider requests.
- **SC-002**: All enabled global layers have visible source class, provider attribution, terms URL, last-success time, freshness state, and caveat count in the operator UI.
- **SC-003**: Automated tests prove that grey/orange/red catalog entries and disabled/unreviewed sources produce zero globally preloaded cells.
- **SC-004**: Automated tests prove that production global responses contain no raw RF identifiers, raw location observations, sample markers, or fixture labels.
- **SC-005**: A simulated source failure changes only that layer to `error` or `stale`; the Global panel remains usable and exposes the intelligence gap.
- **SC-006**: The legacy field viewport contract remains token-gated and passes its existing regression test.

## Assumptions and Explicit Exclusions

- This is a BSS feature specification, not legal advice. A provider's public endpoint does not by itself approve ingestion, redistribution, persistence, or map display.
- Basemap licensing and renderer-package selection are implementation decisions gated by separate review; this specification does not approve a tile host or dependency.
- The Global panel is read-only. It does not probe hosts, control devices, make account writes, route autonomous actions, or expose a tracking interface.
- Prediction-market, social, RSS, and narrative data may remain inputs to Mosaic/Murmurs. They are not factual Godeye map layers by default.
- Aviation and maritime feeds are not P0. Exact live tracks require a provider-specific authorization, retention, attribution, and safety decision.
