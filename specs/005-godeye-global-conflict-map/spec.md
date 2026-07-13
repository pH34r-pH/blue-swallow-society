# Feature Specification: Godeye Global Conflict Map

**Feature Branch**: `kanban/godeye-p0-contract`
**Created**: 2026-07-13
**Status**: Draft

**Input**: User description: "Specify web-only Godeye with explicit `cybermap` and `conflicts` hosted views, preserve Wardriver/RaID as the RF field surface, and make global conflict context strategic, provenance-rich, source-gated, delayed/coarsened, and non-omniscient."

## Scope

This feature defines the implementation contract for the authenticated hosted Godeye map. It migrates the current fixed-zoom Cybermap prototype to a shared MapLibre foundation and introduces a strategic `conflicts` view shell. It does not implement or register a conflict adapter, add a conflict endpoint, enable a conflict source, add browser RF/camera capture, or reproduce Wardriver/RaID in the web client.

The detailed architecture, state machine, source classes, URL policy, responsive behavior, and safety gates are normative in [`docs/godeye-web-architecture.md`](../../docs/godeye-web-architecture.md).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Hosted Cybermap Without Browser Capture (Priority: P1)

An authenticated operator can use Godeye's `cybermap` view to inspect managed Cybermap observations while RF scanning, local sensor capture, camera use, and RaID remain in the Wardriver Android app.

**Why this priority**: The current local Cybermap viewer must survive the map migration without creating a false or unsafe browser-side field client.

**Independent Test**: Open `/operator?tab=godeye&view=cybermap`, opt into browser location, and verify the map reads the token-gated Cybermap viewport API, shows only permitted managed observations, and exposes no RF scan or camera control.

**Acceptance Scenarios**:

1. **Given** a valid operator session and no location permission, **When** Godeye opens without a `view`, **Then** `cybermap` is selected and shows “Choose a place or enable location” without prompting automatically.
2. **Given** location permission and a successful viewport response, **When** the response contains permitted observations, **Then** location, accuracy, observations, freshness, provenance, and caveats render from backend data.
3. **Given** a browser with camera, Wi-Fi, Bluetooth, or cellular capabilities, **When** the operator uses hosted Godeye, **Then** the feature does not request camera access, scan RF, start RaID, or contact a phone loopback bridge.
4. **Given** a runtime source outage, **When** no current backend response exists, **Then** the view shows unavailable/stale state and never seeds demo observations.

---

### User Story 2 - Explicit View Switching and Deep Links (Priority: P1)

An operator can switch between `cybermap` and `conflicts` with pointer, keyboard, or mobile controls, copy a safe deep link, and use browser Back/Forward without losing each view's independent state.

**Why this priority**: Two semantically different map products must be explicit and navigable rather than mixed into one layer pile.

**Independent Test**: Open each canonical deep link, switch with the ARIA tablist and mobile header swipe, use Back/Forward, and verify the selected view, safe URL state, focus, and per-view map state restore correctly.

**Acceptance Scenarios**:

1. **Given** `/operator?tab=godeye&view=conflicts`, **When** the operator shell boots, **Then** the top-level Godeye tab and nested `conflicts` view are selected.
2. **Given** the nested view switch has focus, **When** the operator presses Left/Right/Home/End, **Then** selection and roving `tabindex` follow the documented keyboard contract.
3. **Given** a mobile viewport, **When** the operator taps or swipes the view-switch strip, **Then** the next view activates; swiping the map itself continues to pan the map and never switches views.
4. **Given** different layer/viewport/time state in each view, **When** the operator switches views or uses Back/Forward, **Then** each state restores without importing cross-view layer ids.
5. **Given** Cybermap is following the operator's location, **When** URL state updates, **Then** exact current coordinates, heading, RF identifiers, source URLs, and credentials remain absent from the address bar and history.

---

### User Story 3 - Strategic Conflict Picture With Fail-Closed Sources (Priority: P1)

An operator can enter the `conflicts` view and understand which strategic data classes are available, disabled, stale, or policy-blocked without the product pretending to have a live battlefield picture.

**Why this priority**: The conflict view is high-risk if “public” data is treated as permission, if fast signals are presented as verified events, or if source outages are hidden.

**Independent Test**: Open the P0 `conflicts` view and verify the strategic world basemap loads, descriptive source candidates show named missing gates, the runtime registry contains no conflict adapter callable or endpoint descriptor, and no conflict request, event/force geometry, or synthetic fallback occurs.

**Acceptance Scenarios**:

1. **Given** P0 with no conflict adapter implementation or endpoint, **When** `conflicts` loads, **Then** the world basemap and source-gate panel render while conflict data remains unavailable rather than empty or live.
2. **Given** a candidate source lacks any normalized-contract, license, source-health, delay, coarsening, or safety decision, **When** the layer registry evaluates its descriptive metadata, **Then** it reports every missing gate and no adapter can be resolved or fetched.
3. **Given** a media or sensor signal source later passes its gates, **When** it renders, **Then** it uses a distinct Murmurs signal class and cannot assert an attack, actor, casualty count, or target by itself.
4. **Given** a source is stale or unhealthy, **When** cached records are still policy-permitted, **Then** the view labels them with `last verified`, source health, and caveats and does not call them live.
5. **Given** a source corrects or retracts a record, **When** the read model refreshes, **Then** supersession/retraction is visible and stale exports are invalidated where possible.

---

### User Story 4 - Strategic-First Zoom and Safe Detail (Priority: P1)

An operator can move from a world overview toward country/regional context while detail is bounded by zoom, license, precision, delay/coarsening, and safety policy.

**Why this priority**: Zoom must not turn Godeye into an active-force or tactical targeting surface.

**Independent Test**: Feed the view model gated strategic objects, clusters, events, assessments, and prohibited active-force fixtures, then verify the zoom matrix and server policy hide or generalize detail as required.

**Acceptance Scenarios**:

1. **Given** zoom 0-4, **When** conflict data is available, **Then** only strategic conflict objects, generalized extents, trends, classification, summaries, and assessment times render.
2. **Given** zoom 5-7, **When** an event set passes every gate, **Then** only server-generated clusters and generalized assessment geometry render.
3. **Given** zoom 8 or higher, **When** an individual event lacks license, precision, delay/coarsening, or safety approval, **Then** it remains generalized or hidden regardless of zoom.
4. **Given** exact current troop, convoy, artillery, air-defence, military-flight, military-ship, or individual combatant data, **When** any conflict view is requested, **Then** the policy excludes it regardless of zoom or public availability elsewhere.
5. **Given** conflicting assessment geometries, **When** both are permitted, **Then** they remain separate attributed layers and are never silently averaged.

---

### User Story 5 - Inspect Provenance, Time, and Uncertainty (Priority: P2)

An operator can select a permitted feature and distinguish what was reported, assessed, detected, retrieved, revised, and last verified.

**Why this priority**: Inspectability is the defense against false certainty and the seam between Mosaic's structured record and Murmurs' rapid perception.

**Independent Test**: Select representative Cybermap, strategic conflict, assessment, event, sensor, media, and humanitarian fixtures and verify the inspector exposes the fields appropriate to each class without collapsing dimensions.

**Acceptance Scenarios**:

1. **Given** a conflict record, **When** it is selected, **Then** the inspector keeps occurred, published, retrieved, effective, and superseded times separate.
2. **Given** low-precision geometry, **When** it renders, **Then** uncertainty appears as a radius/area/generalized geometry rather than a false exact point.
3. **Given** verification evidence, **When** it renders, **Then** occurrence, geolocation, time, actor, classification, and magnitude confidence remain separate dimensions.
4. **Given** a Cybermap feature, **When** it renders beside conflict context, **Then** access risk remains separate from event type, verification, severity, precision, and freshness.
5. **Given** color-blind or screen-reader use, **When** state is communicated, **Then** text/icon/pattern alternatives identify every semantic dimension and the current map has a textual summary.

### Edge Cases

- A deep link contains an unknown view, layer id, non-finite zoom, reversed time range, or a feature id from the other view.
- A Cybermap deep link attempts to include precise `lat`/`lon`, local RF/device identifiers, endpoint overrides, or credentials.
- The operator switches views while a slow request is in flight and the old response arrives after the new view renders.
- MapLibre code or the basemap style fails while view controls and source-health UI are still available.
- Location permission is denied, revoked, or returns a stale/high-uncertainty fix.
- The viewport query succeeds with zero records, filters hide all records, or policy hides all detail; each needs different copy.
- One source fails while another succeeds; the entire view must not collapse to one generic error.
- Cached data becomes older than the adapter's stale threshold while the operator is viewing it.
- A source license changes, health is unknown, or safety policy is missing after data was cached.
- An assessment has no `effective_at`, an event has conflicting source times, or a retraction points to a cached record.
- A feature's precision is worse than the current zoom suggests, or safety coarsening is stricter than epistemic uncertainty.
- Mobile swipe starts on the map, drawer, inspector, or timeline rather than on the view-switch strip.
- Browser Back/Forward restores a view after logout or token expiry.
- Two providers use the same color or provider-native type but different semantics.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: Hosted Godeye MUST expose exactly two nested views named `cybermap` and `conflicts`.
- **FR-002**: `cybermap` MUST be the default when `view` is missing or invalid; invalid URL state MUST be discarded rather than executed.
- **FR-003**: Canonical deep links MUST use `/operator?tab=godeye&view=<cybermap|conflicts>` and the allowlisted query contract in `docs/godeye-web-architecture.md`.
- **FR-004**: View switching MUST support pointer/tap, an ARIA tablist keyboard contract, mobile tap, and mobile header-strip swipe without stealing map gestures.
- **FR-005**: Browser Back/Forward MUST restore the active view and safe per-view state; view switches MUST push one history entry and in-view changes MUST replace/debounce history.
- **FR-006**: Each view MUST retain independent viewport, layers, selection, time, loading, error, and source-health state for the current operator session.
- **FR-007**: Logout or auth failure MUST abort requests, stop polling/geolocation, clear sensitive view state, and return through the existing operator-gate behavior.
- **FR-008**: Hosted Godeye MUST NOT scan RF, use the camera, start RaID, capture raw frames, probe private cameras, or contact a device loopback bridge.
- **FR-009**: The Wardriver Android app MUST remain the RF/cell/BLE capture, camera, local sensor, and RaID field work surface.
- **FR-010**: Cybermap reads MUST remain token-gated, same-origin browser requests; precise local coordinates MUST be sent in POST bodies and not URL query parameters.
- **FR-011**: `cybermap` MUST preserve the current location, accuracy, managed observation, freshness, provenance, caveat, and empty/error behavior before the manual renderer is removed.
- **FR-012**: Runtime Godeye MUST NOT seed or fall back to demo, synthetic, or fabricated map/feed data; fixtures MAY exist under tests only.
- **FR-013**: Cybermap source classes MUST retain the existing `green_public`, `green_owned`, `green_authorized`, `owned_device`, `local_observation`, `grey_enrichment`, `orange_exposure`, and `red_restricted` meanings and unlock rules.
- **FR-014**: Access risk MUST remain separate from conflict event type, strategic severity, verification status, geometry precision, and freshness in data and presentation.
- **FR-015**: Conflict records MUST use separate `strategic_conflict`, `assessment`, `event`, `sensor_signal`, `media_signal`, and `humanitarian_impact` classes and MUST NOT be adapted into the Cybermap `accessPoints` response.
- **FR-016**: Conflict sources MUST default to disabled and MUST NOT be fetched or rendered until normalized-contract, license, source-health, delay, coarsening, and safety gates all pass.
- **FR-017**: Unknown license posture or unknown safety policy MUST fail closed; public website availability MUST NOT be treated as reuse permission.
- **FR-018**: World zoom MUST show strategic conflict objects rather than individual events; country/regional zoom MAY show generalized assessments and event clusters only after all gates pass.
- **FR-019**: Individual event detail MUST be gated by zoom, license, source health, precision, delay/coarsening, safety, and record class; zoom alone MUST NOT authorize detail.
- **FR-020**: Exact current active-force positions, inferred routes/targets, and tactical interception/targeting products MUST be excluded regardless of zoom or public availability.
- **FR-021**: Murmurs media/sensor signals MUST use distinct visual semantics and MUST NOT assert attacks, actors, casualty counts, or targets by themselves.
- **FR-022**: Conflict features MUST preserve occurred, published, retrieved, effective, and superseded clocks without conflation.
- **FR-023**: Conflict verification MUST preserve occurrence, geolocation, time, actor, classification, and magnitude dimensions; a single confidence scalar is insufficient.
- **FR-024**: Low-precision or safety-coarsened geometry MUST render as radius/area/generalized geometry rather than a false exact point.
- **FR-025**: Any follow-on conflict read model or export MUST propagate retractions and supersession visibly to cached state, inspectors, and exported artifacts where technically possible.
- **FR-026**: Initial loading, refreshing, zero-result empty, filtered empty, policy unavailable, stale/degraded, partial error, view error, and auth error MUST be distinct states.
- **FR-027**: Refreshes MUST retain the last policy-permitted verified rendering with `last verified` labeling until an atomic replacement succeeds; stale content MUST NOT be labeled live.
- **FR-028**: Product language MUST use `reported`, `assessed`, `detected`, `retrieved`, `effective at`, and `last verified` and MUST NOT imply omniscience or infer safety from absence.
- **FR-029**: A single self-hosted MapLibre instance MUST back both views; layer ids MUST be namespaced by view and reconciled atomically on switch.
- **FR-030**: The public root MUST remain unchanged and silent about operator/Godeye/Cybermap/Wardriver surfaces; all map APIs MUST retain server-side token validation.
- **FR-031**: Desktop MUST support left layers/center map/right inspector; tablet MUST collapse auxiliary panels; mobile MUST use a sticky view switch with bottom-sheet layers/inspector/timeline.
- **FR-032**: Every semantic state MUST have non-color text/icon/pattern support, keyboard reachability, reduced-motion behavior, and a screen-reader map summary.
- **FR-033**: P0 MUST NOT add an export control; any follow-on screenshot/export MUST include visible layers, time range, source attribution, `AS OF`, uncertainty, and coarsening context and MUST exclude records whose license/safety policy forbids redistribution.
- **FR-034**: Any follow-on country/world data path MUST use bounded bbox/vector-tile reads with server-side clustering/generalization and MUST NOT ship the full global corpus to the browser.
- **FR-035**: Hosted Godeye MUST remain semantically read-only: it MUST NOT mutate Cybermap/conflict records or emit browser map telemetry. The authenticated Cybermap viewport POST MAY carry a bounded read query body only.

### Non-Functional Requirements

- **NFR-001**: Map/view state parsing MUST be deterministic, side-effect free, allowlist-based, and covered by Node unit tests.
- **NFR-002**: Source/layer gate evaluation MUST be shared by fetch and render decisions so a disabled source cannot be fetched and merely hidden client-side.
- **NFR-003**: Hidden views MUST stop polling/render loops and stale async responses MUST be generation-invalidated.
- **NFR-004**: Map and source errors MUST not expose credentials, private endpoints, exact local positions, raw upstream payloads, or stack traces.
- **NFR-005**: Runtime map scripts/styles MUST be self-hosted under the existing CSP; dependency version and license MUST be pinned and auditable.
- **NFR-006**: The feature MUST pass the repository Python and Node test suites and add focused tests for view state, policy gates, responsive semantics, auth, and no-capture/no-demo invariants.
- **NFR-007**: Every Godeye-reachable API MUST retain documented authentication, bounds, sanitized logging/errors, and rate/abuse controls; exact map request bodies, backend URLs, and credentials MUST NOT be logged.

### Key Entities

- **GodeyeViewState**: active view, safe camera/region state, selected layers, time range, selected URL-safe feature, lifecycle state, request generation, and last successful refresh.
- **GodeyeViewDefinition**: stable view id, default camera/region, layer namespace, allowed URL keys, controls, and source-capability ids. P0 conflict definitions contain no adapter callable or endpoint descriptor.
- **LayerDefinition**: stable namespaced id, view, record/source class, source, attribution, min/max zoom, default visibility, legend, freshness policy, health, license, delay, coarsening, safety, and export policy.
- **SourceHealth**: source id, cadence/SLA, last success/failure, coverage gaps, stale threshold, and healthy/degraded/offline/unknown state.
- **ConflictClaim**: versioned strategic/event/assessment/signal/impact record with geometry precision, four clocks, taxonomy, actors, verification dimensions, source links, safety, license, and revision.
- **SafetyPolicy**: audience, region, record/asset class, `not_before`, minimum precision, zoom/detail ceiling, coarsening reason, and visibility result.
- **FeatureSelection**: current feature id, inspector state, source/provenance bundle, and whether the id is safe to serialize/export.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: All supported direct-link/default/history test cases select exactly one of `cybermap` or `conflicts`; invalid input resolves to `cybermap` with no unhandled exception.
- **SC-002**: Automated tests prove zero browser camera/RF/loopback capture paths and zero runtime demo conflict/Cybermap seed paths are introduced.
- **SC-003**: All six source gates are required by one gate evaluator; a fixture missing any one gate fails closed, and the P0 runtime registry contains zero conflict adapter callables/endpoints and performs zero conflict fetches.
- **SC-004**: Zoom-policy tests prove 100% of active-force fixtures are excluded at every tested zoom and individual events are hidden whenever any required detail gate fails.
- **SC-005**: Keyboard tests cover Left/Right/Home/End/Enter/Space and mobile interaction tests prove map-canvas swipes do not switch views.
- **SC-006**: State tests cover loading, refreshing, no-query empty, zero-result empty, filtered empty, unavailable, stale/degraded, partial error, view error, and auth error with distinct labels/actions.
- **SC-007**: URL tests prove credentials, source URLs, operator GPS/heading, SSIDs/BSSIDs, local device/source ids, and cross-view layer ids cannot be serialized.
- **SC-008**: MapLibre Cybermap parity tests pass before the manual raster renderer is removed.
- **SC-009**: At 320 px, 768 px, 1024 px, and 1440 px widths, view controls remain reachable, map is not obscured by default, and auxiliary panels follow the documented responsive contract.
- **SC-010**: Existing operator, Cybermap, and security behavior has zero detected regressions after implementation, measured by all repository Python and Node tests passing.
- **SC-011**: Browser/network inspection and automated spies observe zero Godeye mutation or telemetry requests; only the authenticated Cybermap viewport read-query POST is permitted.

## Assumptions

- The authenticated operator shell, passcode split, server-issued operator token, same-origin API pattern, and public-root silence remain unchanged.
- `/api/cybermap/viewport` and the VM `/api/v1/cybermap/viewport` remain the bounded local RF read path during P0 migration.
- MapLibre GL JS 5.24.0 is the initial pinned implementation target; runtime assets are self-hosted and its license is retained.
- A compliant production basemap provider or self-hosted tile service is selected before global production traffic; public OpenStreetMap tiles are prototype-only.
- Conflict adapters, endpoint descriptors, databases, and `/api/godeye/*` routes are deferred until the six source gates and a versioned normalized contract exist in a separately approved feature.
- UCDP, ACLED, GDELT, NASA FIRMS, Liveuamap, Eyes on Russia, DeepStateMap, ISW/CTP, CFR, CrisisWatch, and War WATCH are research candidates/references, not approved runtime integrations.

## Out of Scope

- Browser camera, AR, Wi-Fi/BLE/cell capture, active probing, Wardriver session control, or replacement of the RaID app.
- Enabling or ingesting any conflict source in P0.
- Exact active-force, military-flight, military-ship, convoy, artillery, or individual combatant tracking.
- Automated tactical inference, target generation, or casualty/actor assertion from media/sensor correlations.
- Public unauthenticated Godeye or public conflict-map export.
- Any screenshot/export UI in P0; only the future redistribution/safety contract is defined here.
- Real-time aviation/maritime layers before separate licensing and operational-safety review.
