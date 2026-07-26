# Feature Specification: Godeye Policy-Bound Operator Map

**Feature Branch**: `008-godeye-operator-map`
**Created**: 2026-07-26
**Status**: Implemented and verified
**Input**: User description: "Take the five observed GeoLibre enhancements, convert them to a comprehensive Cybermap spec delta, update spec-plan-test-task artifacts, and implement through that pattern."

## Scope delta

This feature replaces Godeye's hand-built raster-tile map with a direct BSS MapLibre operator map. It implements five related enhancements without adopting or forking GeoLibre:

1. a declarative, policy-bound layer registry;
2. summary MVT rendering with bounded current-context details;
3. a source-health/provenance/timeline workbench;
4. a self-hosted MapLibre runtime; and
5. an in-memory local-analysis foundation.

The current BSS PostGIS ledger, source-class controls, SWA Function boundary, VM gateway, operator-token flow, and POST-body current viewport read remain authoritative.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Inspect policy-approved layers (Priority: P1)

An authenticated operator can inspect a fixed set of BSS-approved map layers and can enable or disable only those layers.

**Why this priority**: A layer list is the operator-visible expression of BSS source policy. It must precede richer map behavior.

**Independent Test**: Run the registry and shell tests. They must show only reviewed layer IDs, green-only MVT source classes, fixed same-origin paths, and no editable endpoint/source control.

**Acceptance Scenarios**:

1. **Given** an authenticated operator opens Godeye, **When** the map workbench loads, **Then** it shows the BSS layer registry with health, source-class, zoom, legend, and visibility state.
2. **Given** an operator enables or disables a layer, **When** the choice changes, **Then** the map state changes and at most the non-sensitive layer ID is reflected in the URL.
3. **Given** an operator attempts to configure a remote URL, plugin, project, or arbitrary data source, **When** they inspect the Godeye controls, **Then** no such control or client route exists.

### User Story 2 - Render safe materialized cells (Priority: P1)

An authenticated operator can see green materialized Cybermap cells as a vector layer, while exact current-location context stays in the existing bounded POST viewport flow.

**Why this priority**: It provides scalable rendering without making raw observation data a map transport format.

**Independent Test**: Invoke the Function and VM routes with fake stores. Confirm authentication, tile bounds, response media type, green-only SQL contract, and absence of raw observation properties.

**Acceptance Scenarios**:

1. **Given** a valid operator and backend read token, **When** the client requests a valid z/x/y tile at zoom 0–12, **Then** it receives an MVT response containing only summary-safe materialized-cell properties.
2. **Given** a missing or invalid operator/read token, **When** a tile is requested, **Then** the request fails before store access.
3. **Given** a tile path has invalid coordinates, an unsupported zoom, or an unexpected query parameter, **When** it is requested, **Then** the route returns a controlled client error and does not query PostGIS.
4. **Given** a current GPS fix, **When** Godeye needs nearby owned/local observations, **Then** it uses the existing POST `/api/cybermap/viewport` body contract, not the MVT route.

### User Story 3 - Work an evidence-oriented map surface (Priority: P1)

An authenticated operator can use the MapLibre map and workbench to understand layer health, selected-cell summary/provenance, and the current authorized observation timeline.

**Why this priority**: The useful part of a map is operational interpretation, not raw geography.

**Independent Test**: Run static/shell and pure analysis tests; render the operator surface at mobile, tablet, and desktop viewports with a controlled current-location fixture.

**Acceptance Scenarios**:

1. **Given** Godeye opens, **When** MapLibre initializes, **Then** it loads only self-hosted runtime assets and the configured OSM basemap; it does not load GeoLibre, a plugin, a project, or a script CDN.
2. **Given** a current viewport response, **When** it contains authorized observations, **Then** the map shows the bounded overlay and the workbench reports count, source class, freshness, and a short timeline.
3. **Given** an operator selects a green cell, **When** the map feature is selected, **Then** the workbench shows only summary/provenance status fields available in that MVT feature.
4. **Given** a narrow viewport, **When** Godeye renders at 390×844, **Then** map and workbench remain legible with no horizontal page overflow or hidden required control.

### User Story 4 - Keep analyst state local and ephemeral (Priority: P2)

An authenticated operator's current-session analysis is derived locally from already-authorized data and is discarded when the operator session ends.

**Why this priority**: It establishes an offline/local analysis seam without laundering browser persistence or generic local imports into the operator surface.

**Independent Test**: Exercise the pure session-analysis reducer and static runtime tests. Confirm bounded inputs/outputs, explicit clear behavior, and no browser persistence or upload API.

**Acceptance Scenarios**:

1. **Given** a current viewport response, **When** the local analysis reducer receives it, **Then** it derives only count, source-class summary, newest timestamp, and bounded timeline entries.
2. **Given** the operator locks the console or Godeye stops, **When** cleanup runs, **Then** the reducer/map data is cleared and no data is retained in localStorage, IndexedDB, Cache Storage, or a saved project.
3. **Given** a future desktop/Jetson analysis lane is considered, **When** this web feature runs, **Then** it does not expose a file picker, arbitrary URL input, or direct device database connection.

### Edge Cases

- MapLibre runtime or WebGL initialization fails after the operator shell has loaded.
- The map receives an authenticated empty MVT response or a current viewport with no observations.
- A tile request has a valid integer shape but an x/y value outside the selected zoom range.
- A `cybermap_cells` row contains a non-green source class alongside a green class.
- A malformed viewport record lacks source class or timestamp.
- The operator logs out while a tile or viewport fetch is in flight.
- The map renders at a narrow mobile viewport or after a resize.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: The operator client MUST define the Godeye layers in a static BSS-owned registry. Each entry MUST declare its ID, title, source class/policy, transport, zoom bounds, legend/status treatment, default visibility, and safe selection fields.
- **FR-002**: The registry MUST NOT define remote URL, plugin, project, arbitrary file, direct SQL/PostGIS, collaboration, or AI provider inputs.
- **FR-003**: The operator shell MUST replace the manual raster-grid renderer with a self-hosted, pinned MapLibre runtime and same-origin assets.
- **FR-004**: The MVT route MUST be `GET /api/cybermap/tiles/{z}/{x}/{y}` and MUST require a passcode-issued operator token at the Function plus the existing VM Cybermap read token at the VM.
- **FR-005**: The MVT route MUST accept only integer z/x/y values for zoom 0–12, reject query parameters, and return a controlled 400 without store access for invalid input.
- **FR-006**: MVT output MUST be derived from `cybermap_cells`, include only green source classes (`green_public`, `green_owned`, `green_authorized`), and expose only summary-safe fields: cell ID, resolution, counts, salience, source-class summary, freshness, and caveat status.
- **FR-007**: A cell containing any non-green source class MUST be excluded from MVT output.
- **FR-008**: Exact current-location observations MUST continue to use `POST /api/cybermap/viewport` with latitude/longitude in the request body. The map MUST NOT send latitude, longitude, bbox, or selected observation IDs in a URL.
- **FR-009**: The Godeye workbench MUST show layer visibility, source health/freshness, selected-cell summary/provenance, and a bounded current-session timeline.
- **FR-010**: Godeye MUST remove its editable Cybermap endpoint input and MUST use fixed same-origin BSS routes only.
- **FR-011**: The client MAY persist only a selected approved layer ID in the URL. It MUST NOT persist location, center, zoom, observation, cell, source payload, or session analysis data in the URL or browser storage.
- **FR-012**: The session-analysis module MUST accept only already-authorized viewport records, derive bounded summary/timeline state in memory, and expose an explicit clear operation.
- **FR-013**: The MapLibre runtime, stylesheet, and license/provenance files MUST be committed under the operator static tree. No runtime script/style CDN is permitted.
- **FR-014**: Tile and viewport responses MUST retain `Cache-Control: no-store`. The map feature MUST not add localStorage, IndexedDB, Cache Storage, or automatic uploads.

### Key Entities

- **GodeyeLayerSpec**: Static policy and rendering declaration for an operator map layer.
- **CybermapCellTile**: Summary-only MVT feature derived from a green-only `cybermap_cells` materialization.
- **ViewportContext**: Existing, token-gated POST response containing current-location observation summaries.
- **GodeyeSessionAnalysis**: In-memory derivative of a viewport context: counts, source-class summary, newest timestamp, and timeline.
- **SelectedCellSummary**: Summary/provenance-safe MVT fields currently selected by the operator.

## Success Criteria *(mandatory)*

- **SC-001**: Focused registry, Function, VM HTTP/store, shell/security, and session-analysis tests pass and cover FR-001–FR-014 with no unexplained gap.
- **SC-002**: An unauthenticated tile request returns 403; invalid z/x/y or a tile query string returns 400; no invalid request invokes the store query.
- **SC-003**: A valid tile response has MVT media type, `no-store`, and contains no observation payload/identifier columns in the SQL projection or exposed feature contract.
- **SC-004**: The operator bundle references only self-hosted MapLibre assets and same-origin BSS map routes; tests find no editable Godeye endpoint, external script/style CDN, localStorage, IndexedDB, Cache Storage, or generic source import.
- **SC-005**: At 390×844, 768×1024, and 1440×900, a rendered Godeye surface has no horizontal document overflow, exposes every required workbench control, and remains visually legible.
- **SC-006**: Logout/tab cleanup clears in-memory Godeye analysis and map feature data; rerendering with an empty context shows no fabricated observations.

## Assumptions

- The existing OSM basemap is an approved external raster dependency for the authenticated operator client; its existing tile-domain policy remains explicit in CSP.
- PostGIS `ST_AsMVT` and `ST_TileEnvelope` are available through the installed PostGIS version.
- The `cybermap_cells` materialization may initially be empty; an empty valid MVT response is correct behavior.
- The self-hosted MapLibre version and its license are pinned at implementation time from the official npm package, with its integrity metadata recorded locally.
- A full desktop/Jetson data-import lane requires a later proposal and is not made available by this web feature.