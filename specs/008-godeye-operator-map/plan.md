# Implementation Plan: Godeye Policy-Bound Operator Map

**Branch**: `008-godeye-operator-map` | **Date**: 2026-07-26 | **Status**: Implemented and verified | **Spec**: [spec.md](./spec.md)

## Summary

Implement the five GeoLibre-derived enhancements as a small BSS-native vertical slice. Add a static Godeye layer registry, a green-only PostGIS cell MVT read path, a token-gated SWA proxy, a self-hosted MapLibre operator renderer, a provenance/health/timeline workbench, and an ephemeral analysis reducer. Preserve the POST current-location viewport path for local/device records and remove the generic endpoint control.

## Technical Context

**Languages/versions**: Browser ESM JavaScript; Azure Functions Node 22; VM Cybermap API Node 24; PostgreSQL/PostGIS.
**Primary dependencies**: Existing Node test runner, `pg`, PostGIS; pinned self-hosted MapLibre GL JS distribution.
**Storage**: Existing PostGIS `cybermap_cells` and observation ledger. Browser state is memory-only.
**Testing**: Root `node --test tests/*.test.mjs`; VM `npm test` in `vm/cybermap-api`; static shell/security tests; controlled rendered browser validation.
**Target**: Authenticated `/operator` shell only. The root/cover surface remains untouched.
**Performance boundary**: MVT summary tiles at z0–z12; existing viewport max 500 records; bounded 24-entry session timeline.
**Security boundary**: Same-origin BSS token flow; Function and VM enforcement; green-only cell tiles; no raw observation MVT, arbitrary endpoint, browser persistence, or client-side direct PostgreSQL.

## Constitution Check

| Principle | Assessment | Evidence / action |
|---|---|---|
| Private operator/public cover separation | PASS | Only private operator shell, Function APIs, and `/operator` static assets change. |
| Source/provenance policy | PASS with gate | Tile SQL permits only all-green cells; local/device detail remains POST viewport only. |
| Location/privacy minimization | PASS with gate | No `lat`, `lon`, bbox, center, zoom, or selected record ID in URL/persistence. |
| Self-hosted operational surface | PASS with gate | MapLibre distribution and license are vendored; no script/style CDN. |
| Defense in depth | PASS | Operator Function auth plus VM read token, no-store responses, input bounds, CSP. |
| ASD clarity | PASS | Contract fields and failure states are named in spec/tests. |
| Scope control | PASS | Desktop/Jetson importer, source onboarding, full history, and generic GIS capabilities remain excluded. |

## Architecture and interfaces

```text
operator MapLibre client
  ├─ static GodeyeLayerSpec registry
  ├─ GET /api/cybermap/tiles/{z}/{x}/{y}
  │    └─ Function operator-token gate
  │         └─ GET VM /api/v1/cybermap/tiles/{z}/{x}/{y}
  │              └─ PostGIS cybermap_cells, green-only MVT
  └─ POST /api/cybermap/viewport
       └─ existing exact current-fix detail path
            └─ session-only analysis/workbench
```

### Layer registry

Create `app/operator/godeye-layers.mjs` with a frozen registry. The initial entries are:

| ID | Transport | Source policy | Role |
|---|---|---|---|
| `green-cells` | MVT | all-green materialized cells, z0–z12 | global summary layer |
| `current-context` | GeoJSON from existing POST viewport | owned/local/current authorized context | transient current-fix overlay |

The registry validates visibility IDs, creates a non-sensitive layer-only URL value, defines safe selected-cell fields, and must not hold arbitrary URLs or executable settings.

### MVT contract

Function public route: `GET /api/cybermap/tiles/{z}/{x}/{y}`.

VM route: `GET /api/v1/cybermap/tiles/{z}/{x}/{y}`.

The Function validates z/x/y before outbound I/O, rejects any query, requires `requireOperatorToken`, forwards only the path to the HTTPS backend with `x-blue-swallow-cybermap-read-token`, and streams MVT bytes as `application/vnd.mapbox-vector-tile` with `Cache-Control: no-store`.

The VM validates z/x/y before store access, requires the existing backend read token, calls `queryVectorTile`, and sends only an MVT buffer. `PostgresObservationStore.queryVectorTile` uses `ST_TileEnvelope`, transforms `cybermap_cells.geom` into Web Mercator, requires `source_classes <@ allowed_green_source_classes` and nonempty source classes, and selects only the named summary-safe properties. `MemoryObservationStore` returns a valid empty tile buffer for HTTP contract tests.

### Map and workbench

Create `app/operator/godeye-map.mjs` as a lifecycle-controlled controller. It dynamically imports `/operator/vendor/maplibre-gl.mjs` and loads CSS once, initializes MapLibre with a BSS-owned OSM raster style, adds MVT and GeoJSON sources, attaches operator headers only for same-origin BSS tile requests, and clears source data on stop. It has no remote fallback.

`app/operator/godeye-session-analysis.mjs` remains pure and derives no more than 24 timeline entries, source class counts, freshness, and empty/error states. The main operator module supplies already-authorized data and clears it on logout/tab stop.

Replace the Godeye shell endpoint input with fixed route disclosure, layer controls, health/provenance/timeline cards, and a selected-cell panel. The current GPS UI remains but MapLibre owns map positioning/overlays.

### CSP and assets

Vendor the pinned MapLibre ESM/CSS/license in `app/operator/vendor/`. Record version/source/tarball integrity in `app/operator/vendor/MAPLIBRE-VENDOR.md`. Extend CSP only for self-hosted MapLibre worker creation and existing OSM raster network needs; no remote script/style permission is allowed.

## Project Structure

```text
specs/008-godeye-operator-map/
├── spec.md
├── plan.md
├── tests.md
└── tasks.md

app/
├── operator/
│   ├── godeye-layers.mjs                 # static layer policy + safe URL state
│   ├── godeye-map.mjs                    # MapLibre lifecycle/controller
│   ├── godeye-session-analysis.mjs       # pure bounded ephemeral analysis
│   ├── main.js                            # auth/session wiring and Godeye lifecycle
│   ├── styles.css                         # workbench/responsive styles
│   └── vendor/
│       ├── maplibre-gl.mjs
│       ├── maplibre-gl-shared.mjs
│       ├── maplibre-gl-worker.mjs
│       ├── maplibre-gl.css
│       ├── maplibre-gl-LICENSE.txt
│       └── MAPLIBRE-VENDOR.md
├── staticwebapp.config.json               # routes + narrowed CSP changes

api/
├── cybermap-tiles/
│   ├── function.json
│   └── index.js
└── _private/operator/shell.html

vm/cybermap-api/src/
├── server.mjs                              # route + validation + binary response
├── memory-store.mjs                        # empty MVT contract implementation
└── postgres-store.mjs                      # green-cell MVT query

tests/
├── godeye-layers.test.mjs
├── godeye-session-analysis.test.mjs
├── godeye-map-shell.test.mjs
├── cybermap-tiles-api.test.mjs
├── security-review.test.mjs                # update route/CSP checks
└── ui-shell.test.mjs                       # update private shell checks

vm/cybermap-api/test/
├── http.test.mjs
└── postgres-store.test.mjs
```

## Implementation sequence

1. Create the feature artifacts and reconcile them against current manual map, current viewport route, and VM stores.
2. Add RED tests for static registry/session analysis and tile Function/VM contract before production source.
3. Implement the pure registry and session-analysis modules; run focused tests GREEN.
4. Implement VM tile validation, binary response, memory contract, and Postgres MVT SQL; run VM HTTP/store tests GREEN.
5. Implement the Function tile proxy, route configuration, and security test updates; run Function tests GREEN.
6. Vendor MapLibre with provenance; add MapLibre controller, private shell/workbench, main lifecycle wiring, and responsive styles; run focused shell tests GREEN.
7. Run root suite, VM suite, diff/static scans, rendered responsive checks, and `graphify update .`.
8. Reconcile `tasks.md` completion state only from actual receipts. No deploy occurs unless separately requested.

## Failure behavior

- MapLibre load/WebGL failure: show a controlled operator map-unavailable state; do not fall back to a remote runtime or manually fabricate observation markers.
- Empty tile or viewport: show no-data/source-health state; never seed fixture/demo observations.
- Tile auth failure: preserve a controlled unavailable state and log no secret/token in client output.
- Invalid tile path/query: 400 before store/backend I/O.
- Logout/tab stop: abort/ignore stale fetches where practical, clear analysis and GeoJSON source, and do not persist map data.

## Verification strategy

Traceability is defined in [tests.md](./tests.md). The required progression is RED test receipt → minimum implementation → focused GREEN receipt → owning suite → root regression → static/diff/CSP review → responsive pixel/DOM verification. The final Graphify command is `graphify update .`; its output must be reported as code-graph refresh only if documentation semantic extraction is unavailable.