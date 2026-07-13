# Godeye Web Architecture and View Contract

**Status:** P0 implementation contract
**Date:** 2026-07-13
**Scope:** authenticated web Godeye, managed Cybermap observations, and the strategic global conflict picture

## Decision

Godeye is a web-only, semantically read-only map surface inside the authenticated operator shell. It has exactly two hosted views:

- `cybermap`: managed RF/cyber observations and derived Cybermap context;
- `conflicts`: a strategic global conflict picture. P0 contains descriptive source-candidate metadata but no conflict adapter implementation, callable, endpoint descriptor, or conflict-data fetch path. A follow-on adapter remains prohibited until its source passes the contract, license, health, delay/coarsening, and safety gates in this document.

The Blue Swallow Wardriver Android app remains the RF capture, local sensor, camera, and RaID work surface. Godeye does not scan Wi-Fi/BLE/cell, ingest browser camera frames, recreate RaID, contact a phone loopback bridge, mutate Cybermap/conflict records, or emit browser map telemetry. The authenticated `POST /api/cybermap/viewport` call is a bounded read query whose body protects precise coordinates from URL/history leakage; it is not a write operation.

The two views share a MapLibre map host and navigation shell, but not a merged ontology. Cybermap access-risk colors describe source legality and action risk. Conflict type, severity, verification, and freshness are separate fields and visual channels.

## Sources of truth

This contract translates these existing decisions into an implementation boundary:

- [`docs/architecture.md`](./architecture.md)
- [`docs/cybermap-geospatial-backend.md`](./cybermap-geospatial-backend.md)
- [`docs/wardriver-raid-backend-repair-plan.md`](./wardriver-raid-backend-repair-plan.md)
- [`docs/mosaic-and-murmurs-autonomous-paper-engine.md`](./mosaic-and-murmurs-autonomous-paper-engine.md)
- `Work/Blue Swallow Society/Documentation/Blue Swallow Society - Godeye Global Conflict Map Research.md` in the project vault

The paper-engine doctrine contributes one operational rule: missing, stale, or policy-blocked source data blocks the affected layer. The runtime never manufactures a replacement observation, event, assessment, or “live” state.

## Current-state baseline

The current operator shell has one top-level Godeye tab. `app/operator/main.js` renders fixed-zoom OpenStreetMap raster tiles at zoom 15, centers on the browser geolocation fix, reads `/api/cybermap/viewport`, and renders Wi-Fi-shaped `accessPoints` within 100 metres. The current API is a token-gated same-origin `POST`; precise coordinates are accepted only in the request body and are rejected in URL query parameters.

This is the Cybermap prototype to preserve during migration, not the architecture for conflict data. The current point/radius response has a 5 km maximum and 500-row limit. World and country conflict reads require separate bbox/vector-tile contracts and never reuse `accessPoints`.

## Threat model and privacy impact

P0 handles an operator's optional precise location, authenticated map state, managed RF/cyber observations, and descriptive conflict-source policy metadata. It adds no persistent browser store, conflict corpus, conflict adapter, browser capture path, or public map endpoint.

| Threat / privacy risk | P0 control | Required verification |
|---|---|---|
| Exact operator location leaks through URL, history, logs, analytics, or error text | Cybermap coordinates exist only in memory and the authenticated POST body; URL parsing rejects them; browser telemetry is prohibited; server logs use bounded event classes without request bodies or backend URLs | URL/privacy tests, log-spy tests, manual history/network/error inspection |
| Stale async response crosses views or operator sessions | Per-view request generations, abort on switch/logout, and atomic replacement of the last policy-permitted result | Reducer/controller stale-response tests and logout smoke |
| Disabled source is fetched and hidden only in the client | P0 has no conflict adapter callable or endpoint descriptor; future fetch and render decisions share a fail-closed gate enforced server-side as well as in the read model | Registry shape tests, zero conflict-network-request smoke, follow-on server-policy tests |
| Public availability is mistaken for reuse permission | Unknown license/export/cache posture fails closed; source candidates remain metadata only | Gate-matrix and license decision review |
| Zoom or recombination reveals tactical/active-force detail | Strategic zoom ceiling, server coarsening, unconditional active-force exclusion, and no signal-to-event promotion | Table-driven policy tests at every zoom and manual render inspection |
| Retraction, outage, or stale cache appears current | Separate clocks, source-health state, generation replacement, `last verified`, and visible revision status | Lifecycle/inspector tests |
| Dependency or basemap compromise bypasses CSP/supply-chain controls | Exact MapLibre pin, committed lock, self-hosted assets/license, self-only CSP, asset identity check, dependency/SAST scan | Reproducible vendor check, CSP/security test, dependency audit |
| Operator gate is bypassed or abused | Existing server token validation remains mandatory; Godeye-reachable APIs require bounded input, sanitized failures, and documented rate/abuse controls | Auth/bounds/rate-limit tests and authenticated DAST/manual abuse smoke |

Privacy impact is minimized by explicit location consent, no automatic geolocation prompt, no raw browser capture, no localStorage map state, no exact location in URL/history/logs, no new analytics identity, and teardown on logout/session expiry. The existing custom operator-token flow is inherited rather than expanded; its alignment with the constitution's OAuth/OIDC requirement remains a platform governance gate and is not silently waived by this feature.

## Hosted surface and URL contract

The canonical entry point remains `/operator`. The public root remains silent and must not link to or name Godeye, Cybermap, Wardriver, RaID, operator routes, or private artifacts.

Canonical deep links:

```text
/operator?tab=godeye&view=cybermap
/operator?tab=godeye&view=cybermap&region=pnw&z=8&layers=cybermap.cells
/operator?tab=godeye&view=conflicts&region=global&z=2&layers=conflicts.registry
/operator?tab=godeye&view=conflicts&region=ukraine&from=2026-06-01T00:00:00Z&to=2026-07-01T00:00:00Z
```

Allowed query keys:

| Key | Contract |
|---|---|
| `tab` | Must be `godeye` for this surface. Other values use the existing top-level tab contract. |
| `view` | `cybermap` or `conflicts`; missing or invalid values normalize to `cybermap`. |
| `region` | Stable, allowlisted preset id such as `global`, `ukraine`, `iran-middle-east`, or a policy-approved Cybermap region. |
| `z` | Finite map zoom clamped to the active view's allowed range. |
| `layers` | Comma-separated stable layer ids from the active view registry. Unknown, disabled, or cross-view ids are discarded. |
| `from`, `to`, `at` | RFC 3339 conflict time range or assessment effective time. Ignored by layers that do not support time. |
| `feature` | Stable, URL-safe strategic/conflict id only. Local RF identifiers, SSIDs, BSSIDs, device ids, private source ids, and active-force ids are never serialized. |
| `bearing`, `pitch` | Optional finite display orientation clamped to the active view policy; both default to zero. |

`lat` and `lon` are not allowed URL keys in P0 for either view. Authentication data, credentials, endpoint overrides, raw source URLs, operator GPS, device heading, local observation ids, and arbitrary search text never enter the URL. Cybermap geolocation-follow state remains in memory. An explicit future “share state” action may serialize a policy-coarsened region or opaque server-side share handle; it must never copy an exact live field position by default.

History behavior:

- Entering Godeye or switching `cybermap`/`conflicts` calls `history.pushState` once.
- Map, layer, and time changes call `history.replaceState` after validation and a short debounce; they do not flood browser history.
- `popstate` restores the selected view and validated state without creating a new entry.
- Each view retains independent in-memory viewport, layers, selection, and time state for the operator session.
- Signing out destroys both view states and all in-flight requests.

## View model

| Property | `cybermap` | `conflicts` |
|---|---|---|
| Purpose | Managed RF/cyber observations and derived Cybermap context | Strategic conflict orientation, assessments, delayed/generalized event context, and provenance |
| P0 availability | Enabled | Shell enabled; source candidates are descriptive metadata only, with no conflict adapter/fetch path |
| Default view | Yes | No |
| Default viewport | Valid deep link, then current in-memory state, else a neutral map with “Choose a place or enable location” | `region=global`, 2D north-up world view |
| Default layers | Basemap, operator location only after consent, permitted Cybermap cells/observations | Basemap and disabled-source status; strategic registry only after its gate passes |
| Existing read path | `POST /api/cybermap/viewport` -> `GET /api/v1/cybermap/viewport` | None in P0; no `/api/godeye/*` contract or route is authorized |
| Detail model | Source class, observed/last seen, freshness, confidence radius, retention, provenance, caveats | Record class, provider-native type, verification dimensions, four clocks, geometry precision, safety policy, license, revisions |
| Capture | None | None |

## State machine

Each view has one of these top-level states:

```text
idle -> hydrating -> loading -> ready
                      |          |
                      |          +-> refreshing -> ready | stale | error
                      +-> empty
                      +-> unavailable
                      +-> error
```

Transitions:

| Trigger | Required behavior |
|---|---|
| Authenticated operator opens `/operator?tab=godeye` | Validate URL, normalize `view` to `cybermap`, initialize the shared map host, then load only Cybermap registry/health/data. |
| Operator switches view | Persist current in-memory state, abort or generation-invalidate obsolete requests, activate the next view, update URL, then load only that view's registry/health/data. |
| Operator uses Back/Forward | Restore URL-selected view and safe state without pushing history or leaking state between registries. |
| Map move or filter change | Mark the view `refreshing`, debounce the request, retain last verified rendering with a visible `as of`/stale state, then atomically replace it on success. |
| Source becomes unhealthy | Stop new fetches for that source; preserve only policy-permitted cached data with `last verified` and stale/outage labeling. Never synthesize a feed. |
| Auth returns 401/403 | Clear sensitive view state, stop timers, and return to the public gate through the existing logout/session-expiry behavior. |
| View is hidden | Stop its polling and rendering loop; preserve only bounded in-memory state. |
| Logout | Abort all requests, stop geolocation watch, clear selections and per-view caches, remove operator session, redirect to `/`. |

Asynchronous responses carry a view generation/request id. A response from a previous view, viewport, or filter generation is discarded rather than rendered into the current state.

## Loading, empty, unavailable, and error states

These states are not interchangeable:

| State | Product meaning | Required UI |
|---|---|---|
| Initial loading | Map code, style, registry, or first viewport is loading | Keep navigation usable; show bounded skeleton/progress and the source being requested. |
| Refreshing | Last verified data exists while a newer request is in flight | Keep old features visible, label them `last verified <time>`, and show non-blocking progress. |
| Empty: no location/region | No safe query can be made yet | `cybermap`: “Choose a place or enable location.” Never auto-request permission. |
| Empty: valid zero result | Query succeeded and returned no permitted records | Say “No observations reported for this area and time,” with active filters and source coverage. Do not say the area is safe or conflict-free. |
| Empty: filtered | Data exists outside active filters | Show active filters and a clear-filters action. |
| Unavailable: policy gate | A source or detail level is intentionally disabled | Name the failed/absent gate: contract, license, health, delay/coarsening, safety, zoom, or precision. |
| Degraded/stale | Cached data is permitted but the source is late or unhealthy | Keep it visually subordinate with `last verified`, outage, and caveat text. |
| Partial error | One source failed while others succeeded | Keep healthy layers; isolate the error to the failed source row and source-health panel. |
| View error | Basemap/registry/core request failed | Preserve the shell, show retry, status code class, and last successful refresh without raw internals or credentials. |

Product copy uses `reported`, `assessed`, `detected`, `retrieved`, `effective at`, and `last verified`. It does not use `omniscient`, unqualified `live`, “confirmed” without an explicit verification basis, or “no conflict” for an empty result.

## Interaction and responsive contract

The view switch is an ARIA `tablist` with two tabs and roving `tabindex`:

- `ArrowLeft`/`ArrowRight` select the previous/next view;
- `Home` selects `cybermap`; `End` selects `conflicts`;
- `Enter`/`Space` activates a focused tab if manual activation is used;
- focus remains on the selected view tab after keyboard switching;
- map shortcuts are inactive while focus is in an input, dialog, layer drawer, or inspector.

Responsive layout:

| Width/mode | Layout |
|---|---|
| Desktop >= 1024 px | Left layer drawer, center map, right inspector; timeline bottom-docked; two-view switch above the map. |
| Tablet 640-1023 px | Full-width map with collapsible layer and inspector drawers; only one auxiliary panel open at a time. |
| Mobile < 640 px | Full-bleed map below a sticky 44 px-minimum two-view segmented control; layers and inspector are bottom sheets; timeline is a compact bottom sheet. |

Mobile supports tap and horizontal swipe on the view-switch/header strip. Swipe never activates on the map canvas, layer controls, timeline, or inspector because those surfaces already own pan/drag gestures. Reduced-motion mode disables animated view transitions and timeline autoplay. Safe-area insets and 44 px minimum targets are mandatory.

## Component architecture

```text
api/_private/operator/shell.html
  -> Godeye shell + accessible view switch + map/panel containers
app/operator/main.js
  -> top-level operator tab lifecycle and session teardown
app/operator/godeye-state.mjs
  -> URL parsing/serialization, view reducer, request generations, history adapter
app/operator/godeye-map.mjs
  -> one MapLibre host, view camera policy, layer reconciliation, selection
app/operator/godeye-sources.mjs
  -> namespaced layer registry and gate evaluation
app/operator/styles.css
  -> desktop drawers, tablet collapse, mobile bottom sheets, state/accessibility styles
```

One MapLibre instance survives view switches. Switching views removes the previous registry's sources/layers and reconciles the next registry atomically. Layer ids are namespaced (`cybermap.*`, `conflicts.*`) so data and style channels cannot collide.

The current manual tile renderer remains available behind a temporary rollback flag until Cybermap parity tests pass, then is removed. Runtime assets are self-hosted under the existing CSP; no third-party script/style CDN is introduced. Basemap provider/attribution is separately licensed and the public `tile.openstreetmap.org` service is not treated as an unlimited production backend.

## Cybermap source classes

These existing `source_class` values keep their current meaning:

| Class | Hosted behavior |
|---|---|
| `green_public` | May preload/read when source terms, provenance, and TTL permit. |
| `green_owned` | May preload/read for owned infrastructure. |
| `green_authorized` | May read within explicit authorization scope. |
| `owned_device` | May render for the authenticated operator under retention/redaction policy. |
| `local_observation` | May render after controlled Wardriver/RaID ingest; never inferred from browser scanning. |
| `grey_enrichment` | Hidden unless an owned/local trigger or explicit authorized scope unlocks it. |
| `orange_exposure` | Hidden unless an owned/local trigger or explicit authorized scope unlocks it. |
| `red_restricted` | Hidden by default; requires an explicit separately reviewed policy and is never globally preloaded. |

These are access/collection-risk classes. They do not encode conflict category, strategic severity, verification, or freshness.

## Conflict record and source classes

Conflict records remain parallel to Cybermap observations and merge only in a read model. They use these record classes:

- `strategic_conflict`: conflict registry, parties, scope, trend, legal classification, latest assessment time;
- `assessment`: analyst-effective lines/polygons for control, contestation, occupation, impact, or status;
- `event`: a reported occurrence with time/place/type uncertainty;
- `sensor_signal`: machine-observed physical signal such as a thermal anomaly;
- `media_signal`: machine-extracted narrative/attention signal;
- `humanitarian_impact`: civilian or infrastructure impact record kept logically separate from military events.

Source-role classes are taxonomy-only in P0; none names or configures an adapter callable or data endpoint:

| Source role | Product lane | Examples from research | P0 state |
|---|---|---|---|
| `curated_record` | Mosaic | UCDP Candidate; ACLED only after terms review | Metadata only; no adapter |
| `analyst_assessment` | Mosaic | ISW/CTP or licensed analyst geometry | Metadata only; no adapter |
| `reported_event` | Transitional evidence | Licensed rapid event feeds | Metadata only; no adapter |
| `sensor_signal` | Murmurs/context | NASA FIRMS | Metadata only; no adapter |
| `media_signal` | Murmurs | GDELT | Metadata only; no adapter |
| `strategic_reference` | External context/link | CFR, CrisisWatch, War WATCH, Liveuamap references | Link-only after review; no scraped geometry |

No source adapter may be implemented or registered until all six gates pass and the evidence is committed with the follow-on feature:

1. **Normalized contract:** versioned schema covers record class, geometry basis/precision, four clocks, provider-native taxonomy, verification dimensions, provenance, revision, license, health, and safety fields.
2. **License:** display, caching, attribution, export, and redistribution posture are explicit; unknown is a failing state.
3. **Source health:** latency SLA/cadence, last success, last failure, coverage gaps, and stale threshold exist.
4. **Delay:** region/source-specific `not_before` policy is enforced before materialization and response.
5. **Coarsening:** minimum spatial precision and zoom generalization are enforced server-side; the client is not trusted to hide exact data.
6. **Safety:** policy allows the record class, region, actor/asset type, audience, and requested detail level.

A degraded source may show previously cached records only when license, delay, coarsening, and safety still permit them; the UI marks the layer stale and does not call it live.

## Strategic zoom and tactical boundary

Zoom is an upper bound on detail, not permission by itself:

| Zoom | Allowed conflict representation |
|---|---|
| 0-4 | Strategic conflict objects, generalized extents, trend, classification, narrative summary, and latest assessment time. No individual event or force points. |
| 5-7 | Generalized assessment geometry and server-generated event clusters when license, delay, coarsening, and safety pass. |
| 8-10 | Individual reported/corroborated/curated events may appear only when every gate passes and geometry precision supports the display. |
| 11+ | No automatic increase beyond source/policy precision. Exact detail remains coarsened or hidden when required. |

The following are excluded from hosted Godeye conflict layers regardless of zoom or public availability elsewhere:

- exact current troop, convoy, artillery, air-defence, military-flight, military-ship, or individual combatant positions;
- inferred routes, destinations, targets, firing positions, or vulnerable windows;
- automated fusion that turns media, thermal, RF, aviation, or maritime signals into an asserted strike, actor, casualty count, or target;
- real-time recombination designed to support tactical interception or targeting.

Permitted strategic context includes conflict extents and trends, delayed/generalized events, timestamped analyst assessments, humanitarian aggregates, weather/environment context, and clearly distinct Murmurs signals after their gates pass. Public aviation or maritime context remains deferred until a separate license and operational-safety review and must be delayed/aggregated.

## Provenance, time, uncertainty, and revisions

Every conflict feature exposes four separate clocks when applicable:

- `occurred_start` / `occurred_end`;
- `published_at`;
- `retrieved_at`;
- `effective_at` / `superseded_at` for assessments.

Verification is multidimensional: occurrence, geolocation, time, actor, classification, magnitude, and basis. Low-precision geometry renders as a radius, area, administrative region, or generalized geometry, not a false exact point. Safety coarsening is stored separately from epistemic uncertainty.

Claims are not overwritten into a single row. Revisions can supersede, dispute, or retract prior claims. Retractions propagate to cached read models and exports. Static assessment geometry always displays `AS OF <effective time>`.

## Visual semantics

The layer registry assigns independent visual channels:

- Cybermap `access_risk`: existing color family plus text/icon label;
- conflict `event_type`: icon/shape;
- `verification_status`: border/dash/pattern and text;
- `severity`: bounded size/weight scale only when methodology exists;
- `freshness`: opacity/badge plus `last verified` text;
- `geometry_precision`: uncertainty radius/fill/hatching;
- Murmurs signals: separate palette and symbol family from events and assessments.

No state relies on color alone. Legends name the field they encode. Two conflicting assessment geometries remain separate source layers and are never silently averaged.

## API boundary

P0 keeps the existing local Cybermap read:

```text
POST /api/cybermap/viewport
  body: { lat, lon, radiusMeters, maxAgeMs, limit }
  auth: operator bearer/header token
  cache: no-store
```

The SWA Function may translate this to the VM's token-gated `GET /api/v1/cybermap/viewport`. Precise local coordinates remain in the POST body and must not be logged or placed in browser URLs.

No `/api/godeye/*` route or conflict-read contract is authorized in P0. A follow-on source feature must define a versioned contract only after the six gates pass. Any eventual country/world read must use bounded bbox/vector-tile responses, server-side clustering/generalization, bounded pagination, explicit source-health metadata, authenticated abuse controls, and sanitized errors. It must never send a full global corpus to the browser or adapt conflict records into the Cybermap `accessPoints` response.

## Accessibility and future export gate

- Map controls have text alternatives and keyboard reachability.
- A screen-reader summary reports active view, viewport/region, visible layer count, last verified time, and selected feature summary.
- Selection is possible from an ordered result list without pointer precision.
- Timeline has play/pause, previous/next, reduced-motion behavior, and explicit occurred/published/retrieved/effective labels.
- P0 does not introduce a screenshot/export control. Any follow-on export must include visible layers, time range, `AS OF`, source attribution, uncertainty legend, and safety-coarsening notice.
- Any follow-on export must exclude records whose license or safety policy disallows redistribution and must invalidate superseded/retracted artifacts where technically possible.

## Acceptance contract

The architecture is implemented only when all of these are true:

- `cybermap` and `conflicts` are explicit, accessible, deep-linkable views; `cybermap` is the safe default.
- Wardriver/RaID remains the only RF/camera field capture surface; hosted Godeye contains no browser capture path.
- MapLibre reproduces current Cybermap location, accuracy, observation, provenance, and no-data behavior before the manual renderer is removed.
- The P0 conflict registry contains no adapter callable or endpoint descriptor and performs zero conflict-data requests; a follow-on adapter cannot render without all six gate decisions.
- World zoom is strategic-first, and active-force/tactical tracking is excluded regardless of zoom.
- Loading, refreshing, empty, filtered, unavailable, stale, partial-error, auth-error, and view-error states are distinguishable.
- URL/history state restores views without serializing precise local field positions, credentials, or local RF identifiers.
- Access risk, conflict category, verification, severity, precision, and freshness remain separate data and visual dimensions.
- Empty or stale data never implies safety, absence of conflict, or current omniscience.
