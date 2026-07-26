# Data Model and Contracts: Godeye Global Map

## Existing foundation

`0001_cybermap_core.sql` already defines `source_catalog`, append-only `observations`, and `cybermap_cells` at H3 resolutions 7, 9, and 11. The current `GET /api/v1/cybermap/viewport` returns raw nearby rows for a 25–5,000 m radius. This delta adds a **new aggregate read path**; it does not change that field contract.

## Migration delta

Create `vm/cybermap-api/db/migrations/0004_godeye_global_cells_and_sources.sql`.

1. Extend the `cybermap_cells.resolution` constraint from `(7, 9, 11)` to `(5, 7, 9, 11)`. Resolution 5 is the global overview aggregate; 7 is regional; 9 and 11 are local/detail.
2. Add the following non-secret policy fields to `source_catalog`:
   - `layer_id text UNIQUE`: stable operator layer identifier.
   - `display_order smallint`: stable visual ordering.
   - `terms_reviewed_at timestamptz`: null means source cannot be enabled for preload.
   - `attribution_text text`: displayable provider attribution.
   - `fresh_after_seconds integer`: maximum age for `fresh`.
   - `stale_after_seconds integer`: maximum age for `stale`; age above this is `error` when the last run failed, otherwise `very_stale`.
   - `global_layer boolean NOT NULL DEFAULT false`: source is eligible for the Global-mode picker only after all existing source-class/preload checks pass.
   - `normalizer_version text`: immutable adapter/contract identifier.
3. Add immutable `source_fetch_runs`:

```sql
CREATE TABLE source_fetch_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES source_catalog(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'empty', 'rate_limited', 'disabled', 'failed')),
  response_class text NOT NULL,
  fetched_count integer NOT NULL DEFAULT 0 CHECK (fetched_count >= 0),
  accepted_count integer NOT NULL DEFAULT 0 CHECK (accepted_count >= 0),
  duplicate_count integer NOT NULL DEFAULT 0 CHECK (duplicate_count >= 0),
  rejected_count integer NOT NULL DEFAULT 0 CHECK (rejected_count >= 0),
  next_retry_at timestamptz,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (completed_at >= started_at),
  CHECK (error_code IS NULL OR error_code ~ '^[a-z0-9_]{1,64}$')
);
CREATE INDEX source_fetch_runs_source_time_idx
  ON source_fetch_runs (source_id, completed_at DESC);

CREATE FUNCTION protect_source_fetch_runs()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'source fetch runs are immutable audit records';
END;
$$;
CREATE TRIGGER source_fetch_runs_no_update
  BEFORE UPDATE ON source_fetch_runs FOR EACH ROW EXECUTE FUNCTION protect_source_fetch_runs();
CREATE TRIGGER source_fetch_runs_no_delete
  BEFORE DELETE ON source_fetch_runs FOR EACH ROW EXECUTE FUNCTION protect_source_fetch_runs();
```

`response_class` and `error_code` are controlled labels such as `http_429`, `timeout`, `invalid_payload`, or `terms_unreviewed`. They must not contain upstream response bodies, credentials, URLs with secrets, or stack traces.

4. Seed only the three P0 catalog rows with `enabled=false` and `allowed_preload=false`. A documented provider terms review and adapter acceptance are required before either flag changes.

## Source policy invariants

A source can return cells only when all predicates are true:

```text
source.enabled
AND source.global_layer
AND source.terms_reviewed_at IS NOT NULL
AND source.allowed_preload
AND source.source_class IN ('green_public', 'green_owned', 'green_authorized')
AND source has a successful or explicitly empty materialization run
```

`green_authorized` additionally requires an active `authorized_scope_ref`. Grey, orange, and red sources are excluded before querying `cybermap_cells`; no client-provided layer value can override this rule.

## Global cell materialization

Each accepted `greenfeed_snapshot` observation stores its existing H3 7/9/11 fields. The worker derives the H3 5 parent and upserts all approved aggregate levels.

Each `cybermap_cells` row must contain:

- `source_classes`: contributing allowed classes only.
- `counts`: object keyed by stable `layer_id`; values are aggregate counts, never raw entity payloads.
- `layers`: object keyed by `layer_id`; each value contains `observation_count`, `entity_count`, `newest_observed_at`, `oldest_observed_at`, and bounded summary classifications.
- `freshness`: object keyed by `layer_id`; each value contains `state`, `last_success_at`, and `age_seconds`.
- `caveats`: deduplicated, displayable policy strings. Examples: `provider_data_delayed`, `public_report_not_local_observation`, `coverage_incomplete`.

The global endpoint chooses resolution: zoom 0–3 → H3 5; zoom 4–7 → H3 7; zoom 8–11 → H3 9; zoom 12–16 → H3 11. The implementation may return a coarser permitted resolution when the request would exceed 1,000 cells; it must report the selected resolution and `aggregation_applied=true`.

## Global viewport API

Add a new endpoint rather than changing the existing field route:

```text
SWA Function: POST /api/cybermap/global-viewport
VM API:       POST /api/v1/cybermap/global-viewport
```

The SWA function validates the existing operator session and forwards only a fixed BSS backend-read credential. The browser never receives the VM credential or a provider credential.

### Request: `bss.godeye.global_viewport.v1`

```json
{
  "schema_version": "bss.godeye.global_viewport.v1",
  "bbox": { "west": -180, "south": -85, "east": 180, "north": 85 },
  "zoom": 2,
  "layer_ids": ["usgs-earthquakes", "gdacs-alerts"],
  "since": "2026-07-21T00:00:00.000Z",
  "max_cells": 1000
}
```

Validation:

- `west < east`, `south < north`; antimeridian views are two requests.
- Longitude is within `[-180, 180]`; latitude is within `[-85, 85]`.
- `zoom` is an integer in `[0, 16]`.
- `layer_ids` is a non-empty unique array of enabled catalog `layer_id` values, maximum 12.
- `max_cells` is an integer in `[1, 1000]`; the server may enforce a smaller source-specific cap.
- `since` is optional ISO-8601 UTC and may not be older than the source retention window.

### Response: `bss.godeye.global_viewport.v1`

```json
{
  "ok": true,
  "schema_version": "bss.godeye.global_viewport.v1",
  "mode": "global",
  "generated_at": "2026-07-22T20:00:00.000Z",
  "bbox": { "west": -180, "south": -85, "east": 180, "north": 85 },
  "requested_zoom": 2,
  "selected_resolution": 5,
  "aggregation_applied": false,
  "cells": [
    {
      "h3_cell": "85283473fffffff",
      "resolution": 5,
      "centroid": { "lat": 37.35, "lon": -121.98 },
      "source_classes": ["green_public"],
      "observation_count": 12,
      "entity_count": 0,
      "first_seen_at": "2026-07-22T19:00:00.000Z",
      "last_seen_at": "2026-07-22T19:55:00.000Z",
      "layers": { "usgs-earthquakes": { "observation_count": 12 } },
      "freshness": { "usgs-earthquakes": { "state": "fresh", "age_seconds": 300 } },
      "caveats": ["public_report_not_local_observation"],
      "salience": 0.62
    }
  ],
  "source_health": [
    {
      "layer_id": "usgs-earthquakes",
      "display_name": "USGS earthquakes",
      "source_class": "green_public",
      "health": "fresh",
      "last_success_at": "2026-07-22T19:55:00.000Z",
      "next_retry_at": "2026-07-22T20:00:00.000Z",
      "terms_url": "https://earthquake.usgs.gov/",
      "attribution": "U.S. Geological Survey",
      "caveat_count": 1
    }
  ],
  "intelligence_gaps": []
}
```

`cells[*].centroid` is intentionally the only spatial detail in the response. The renderer constructs a visual cell geometry from its H3 index or receives server-generated boundaries in a later, separately reviewed renderer contract. It never receives the individual observation geometries for Global mode.

### Error contract

| HTTP | Error code | Condition |
|---:|---|---|
| 400 | `invalid_global_viewport` | invalid schema, bounds, zoom, `since`, or selected layer set |
| 401/403 | `forbidden` | missing or invalid operator/backend read credential |
| 413 | `viewport_too_large` | requested map density exceeds bounded cell policy |
| 429 | `read_rate_limited` | caller exceeds the bounded operator read budget |
| 503 | `global_viewport_unavailable` | database/read model unavailable |

All responses use `Cache-Control: no-store`. Source caching happens only in worker/materialization state.

## P0 source records

| layer_id | Provider | Class | Product shape | Planned fetch ceiling | Default state |
|---|---|---|---|---:|---|
| `usgs-earthquakes` | USGS Earthquake Hazards | `green_public` | point event → H3 aggregate | 5 min | disabled pending review |
| `gdacs-alerts` | GDACS | `green_public` | event/footprint → H3 aggregate | 15 min | disabled pending review |
| `nasa-eonet-events` | NASA EONET | `green_public` | event/category/footprint → H3 aggregate | 60 min | disabled pending review |

The planned ceilings are BSS operating policy, not a representation of provider SLAs. The adapter must preserve the actual provider timestamp and state the data-age caveat.
