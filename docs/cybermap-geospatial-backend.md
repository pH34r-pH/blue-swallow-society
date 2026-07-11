# Cybermap Geospatial Backend Design

**Status:** P0 backend design, spec-kit implementation surface, and Kanban implementation ledger
**Date:** 2026-07-10; synchronized 2026-07-11
**Scope:** Blue Swallow Society Cybermap, Godeye, RaID, Greenfeeds, Mosaic/Murmurs memory

**Spec-kit surface:** [`specs/005-cybermap-geospatial-backend/`](../specs/005-cybermap-geospatial-backend/)

## Current-state boundary

This document describes the Cybermap backend contract and the P0 implementation graph. It is not a claim that every completed Kanban branch is already merged into this worktree.

- **Main/deployed baseline in this branch:** shared Cybermap networking (P0.00) and core PostGIS migration work (P0.03) are present on `main`; production deployment remains GitHub CI/CD-managed.
- **Final integration candidate:** `kanban/cybermap-final-adversarial-review` is the fan-in branch; this restoration branch restores the review-approved P0.16 spec-kit/doc-sync artifacts.
- **Review-approved implementation branches:** P0 slices are tracked by Kanban handoffs and dedicated branches/worktrees; not all review-approved slices or final-review remediation branches are present until the fan-in merge is clean.
- **Open gates:** P0.15 active merge cleanup and backend app-setting naming drift are sibling remediations; P0.17 remains no-go until those and this P0.16 restoration are re-reviewed together.
- **No demo-runtime rule:** production Cybermap paths must not seed fake/demo map/feed data; fixtures belong under tests only.

## Decision

Treat **Cybermap/geospatial state as the first-class product**, not an appendage of the Static Web App or echo lab.

The target Azure shape is:

```text
Blue Swallow Wardriver / RaID
  -> authenticated ingest over HTTPS or Tailscale
  -> VM API gateway on Standard_B1s or Standard_B1ms
  -> Azure Database for PostgreSQL Flexible Server B1MS
       - PostGIS for geometry
       - app-computed H3/geohash cells for map materialization
       - JSONB payloads for source-specific observation details

Browser / Godeye
  -> Azure Static Web App
  -> /api/* managed function proxy
  -> VM API gateway
  -> Cybermap viewport/cell/entity endpoints

Jetson / Mosaic / Murmurs
  -> pulls memories, observation summaries, and Cybermap deltas
  -> writes distilled memory/events back through authenticated VM API
```

The VM is the **thin API/worker layer**. PostgreSQL is the durable source of truth. Cybermap views are materialized from append-only observations and source catalogs.

## Cost baseline

Queried from Azure Retail Prices API for `westus2` on 2026-07-10:

| Resource | Retail unit | Monthly at 730h |
|---|---:|---:|
| VM `Standard_B1s` Linux compute | $0.0104/hour | $7.59 |
| VM `Standard_B1ms` Linux compute | $0.0207/hour | $15.11 |
| PostgreSQL Flexible Server `B1MS` compute | $0.0170/hour | $12.41 |
| PostgreSQL storage | $0.115/GB-month | 32 GB = $3.68 |
| PostgreSQL backup LRS | $0.095/GB-month | 7 GB = $0.67 |

Working monthly target:

- **B1s + PG B1MS compute:** about **$20/month**, before storage/IP/bandwidth.
- **B1ms + PG B1MS compute:** about **$27.52/month**, before storage/IP/bandwidth.
- **B1ms + PG B1MS + 32 GB storage + 7 GB backup:** about **$31.87/month**, before public IP/bandwidth/tax.

Recommendation: start with **VM B1ms + PostgreSQL Flexible Server B1MS**. Drop to B1s only if the VM is strictly API proxy with no Greenfeed polling, tiling, or batch workers.

## Azure resource shape

```text
rg-blue-swallow
├── blue-swallow-swa                    # public frontend
├── blue-swallow-vnet 10.40.0.0/16
│   ├── default 10.40.0.0/24            # existing VM/API subnet
│   └── postgres-subnet 10.40.1.0/28    # delegated to PostgreSQL Flexible Server
├── blue-swallow-vm                     # B1ms preferred
│   ├── caddy/nginx :443                # TLS + reverse proxy
│   ├── cybermap-api localhost:8000     # FastAPI/Node service
│   ├── cybermap-worker                 # feed polling/materialization jobs
│   └── pgbouncer localhost:6432        # low connection count into B1MS
├── blue-swallow-pg                     # Azure PostgreSQL Flexible Server B1MS
│   ├── private VNet access only
│   ├── PostGIS enabled
│   ├── 32 GB initial storage
│   └── 7-day backup retention
└── private DNS zone for PostgreSQL flexible server
```

Network rules:

1. PostgreSQL has **no public ingress**. VM reaches it through the VNet/private DNS path.
2. Browser never talks to PostgreSQL.
3. Static Web App functions call only the VM API gateway.
4. Wardriver/RaID calls the VM API through either:
   - Tailscale/private operator mesh, preferred for field devices; or
   - public HTTPS with per-device token, rate limit, and idempotency keys.
5. Port 8080 echo is scaffold-only. The target public API is HTTPS 443 on the VM gateway.

## VM responsibility boundary

The VM should stay boring:

- terminate HTTPS or sit behind Caddy/nginx
- authenticate API/device tokens
- validate and normalize payloads
- batch insert into PostgreSQL
- run small materialization/feed jobs
- expose viewport/cell/entity APIs
- emit structured logs and health checks

The VM should **not** become the durable database, map tile store of record, or raw-frame warehouse. If it dies, rebuild it from Bicep/cloud-init and reconnect to PostgreSQL.

## PostgreSQL/PostGIS data doctrine

Use an **append-only observation ledger** plus **derived Cybermap products**.

```text
source_catalog       # Greenfeeds, owned feeds, adapters, device sources
sensorium_sessions   # dream_suspension / raid_sight / greenfeed_jack_in sessions
observations         # immutable normalized evidence packets
cyber_entities       # networks, places, devices, feeds, claims, events, clusters
entity_observations  # edges from observations to entities
cybermap_cells       # materialized map cells for viewport rendering
mosaic_memories      # distilled Mosaic/Wintermute memory events
murmur_memories      # distilled Murmurs/Neuromancer perception events
sync_batches         # idempotent device/backend ingest receipts
```

Core rules:

- Every spatial row gets `geom geometry(Point|Polygon, 4326)` where possible.
- Every observation stores app-computed H3/geohash cells at several resolutions, e.g. `h3_7`, `h3_9`, `h3_11`.
- Source-specific payloads live in `jsonb`; normalized query fields are promoted to columns.
- Wardriver/RaID payloads are versioned at the batch boundary. P0.10a locks `contract_version = "bss.wardriver.batch.v1"` with fixture `tests/fixtures/wardriver-raid-batch-v1.json`; breaking changes require a new literal and fixture.
- Raw frames are not retained by default. Store visual summaries, operator-explicit captures, hashes, and provenance links instead.
- Orange/grey/red exposure layers cannot preload globally; they require local/owned observation or explicit authorized scope.
- Green public/owned/authorized feeds can preload and can be queried globally, subject to source terms and cache TTL.

## Minimal schema sketch

```sql
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TYPE source_class AS ENUM (
  'green_public',
  'green_owned',
  'green_authorized',
  'owned_device',
  'local_observation',
  'grey_enrichment',
  'orange_exposure',
  'red_restricted'
);

CREATE TYPE observation_kind AS ENUM (
  'wifi_ap',
  'ble_device',
  'cell_signal',
  'visual_summary',
  'greenfeed_snapshot',
  'claim_anchor',
  'memory_event',
  'derived_cell'
);

CREATE TABLE source_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_class source_class NOT NULL,
  name text NOT NULL,
  provider text,
  url text,
  terms_url text,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  geom geometry(Point, 4326),
  footprint geometry(Polygon, 4326),
  enabled boolean NOT NULL DEFAULT true,
  cache_ttl_seconds integer NOT NULL DEFAULT 300,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX source_catalog_geom_gix ON source_catalog USING gist (geom);
CREATE INDEX source_catalog_class_idx ON source_catalog (source_class, enabled);

CREATE TABLE observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES source_catalog(id),
  source_class source_class NOT NULL,
  kind observation_kind NOT NULL,
  observed_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  geom geometry(Point, 4326),
  h3_7 text,
  h3_9 text,
  h3_11 text,
  confidence numeric(4,3) CHECK (confidence >= 0 AND confidence <= 1),
  pii_status text NOT NULL DEFAULT 'redacted',
  retention_class text NOT NULL DEFAULT 'summary_only',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  idempotency_key text UNIQUE
);

CREATE INDEX observations_geom_gix ON observations USING gist (geom);
CREATE INDEX observations_time_idx ON observations (observed_at DESC);
CREATE INDEX observations_cell_idx ON observations (h3_9, observed_at DESC);
CREATE INDEX observations_kind_idx ON observations (kind, source_class);
CREATE INDEX observations_payload_gin ON observations USING gin (payload);

CREATE TABLE cyber_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_kind cyber_entity_kind NOT NULL,
  stable_key text NOT NULL UNIQUE,
  display_name text NOT NULL,
  source_class source_class NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  centroid geometry(Point, 4326),
  h3_7 text,
  h3_9 text,
  h3_11 text,
  confidence numeric(4,3) NOT NULL DEFAULT 1.000,
  labels text[] NOT NULL DEFAULT ARRAY[]::text[],
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE entity_observations (
  entity_id uuid NOT NULL REFERENCES cyber_entities(id) ON DELETE CASCADE,
  observation_id uuid NOT NULL REFERENCES observations(id) ON DELETE RESTRICT,
  relationship text NOT NULL,
  source_class source_class NOT NULL,
  weight numeric(4,3) NOT NULL DEFAULT 1.000,
  confidence numeric(4,3) NOT NULL DEFAULT 1.000,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  source_observation_refs jsonb NOT NULL DEFAULT '[]'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, observation_id, relationship)
);

CREATE TABLE cybermap_cells (
  h3_cell text NOT NULL,
  resolution smallint NOT NULL,
  geom geometry(Polygon, 4326) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz,
  last_seen_at timestamptz,
  source_classes source_class[] NOT NULL DEFAULT ARRAY[]::source_class[],
  observation_count integer NOT NULL DEFAULT 0,
  entity_count integer NOT NULL DEFAULT 0,
  layers jsonb NOT NULL DEFAULT '{}'::jsonb,
  counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  freshness jsonb NOT NULL DEFAULT '{}'::jsonb,
  caveats jsonb NOT NULL DEFAULT '[]'::jsonb,
  salience numeric(5,3) NOT NULL DEFAULT 0,
  PRIMARY KEY (h3_cell, resolution)
);
```

H3/geohash cells are intentionally app-computed. Do not require a PostgreSQL H3 extension for P0. PostGIS stores geometry; the app/worker computes grid IDs and cell polygons for fast viewport fetches and map aggregation.

Entity materialization is synchronous with accepted observation ingest for recognizable non-PII products:

- `wifi_ap` observations derive `network` entities keyed by hashed BSSID/network identifiers.
- `ble_device` observations derive `device` entities keyed by hashed device identifiers or coarse device class.
- `greenfeed_snapshot` observations derive `feed` source entities and preserve green preload/source-class gates.
- `claim_anchor` observations derive `claim` and/or `event` anchors.
- Mapped place/source payloads can derive `place` or `feed` entities when the payload is not a private-person, face, license-plate, or private-residence product entity.
- `entity_observations` carries relationship, confidence/weight, first/last seen, explicit source observation refs, and provenance including source class plus local/owned trigger metadata for grey/orange/red exposure entities.

## Wardriver/RaID v1 sync contract

The backend contract for native Blue Swallow Wardriver and RaID sight summaries is `bss.wardriver.batch.v1`. Android P0.10b should treat [`tests/fixtures/wardriver-raid-batch-v1.json`](../tests/fixtures/wardriver-raid-batch-v1.json) as the executable contract fixture.

Shape summary:

- HTTP: `POST /api/v1/observations/batch` with bearer auth, JSON body, and a batch-level `Idempotency-Key`.
- Token authority: `wardriver_device` registry record with `observations:write`, exact `source_id`, and `source_class: owned_device`; local clients cannot spoof Green/exposure/restricted classes in the body.
- Batch metadata: `contract_version`, `session_id`, optional reported `client_id`, `context` for GPS/heading/speed/map/RaID state, and provenance including adapter contract/version plus source/session refs.
- Observation metadata: per-item `external_observation_key`, `idempotency_key`, `kind`, `observed_at`, `lat`, `lon`, `confidence`, `pii_status`, `retention_class`, `payload`, and provenance.
- Enhanced WiGLE/Wi-Fi payloads use `kind: wifi_ap`, hashed SSID/BSSID, radio/signal fields, GPS/heading echoes, optional hash-only raw frame references, and `raw_frame_present: false` by default.
- RaID sight summaries use `kind: visual_summary` with redacted `raid_sight_summary`/`map_context` only. Raw frames, face/plate images, or raw PII are not accepted by default and require the explicit raw-retention gate if the operator intentionally preserves an artifact.

Compatibility doctrine:

- `bss.wardriver.batch.v1` is additive-only. New optional payload keys may appear under existing objects if existing v1 consumers can ignore them safely.
- Changes to required fields, authority semantics, idempotency partitioning, raw-frame defaults, or response receipt shape require a new `contract_version` and a new fixture.
- Sync receipts partition idempotency by authenticated token registry identity, `source_id`, and the batch `Idempotency-Key`; the body `client_id` is reported metadata only.
- Backend rejects unsupported contract literals with `unsupported_contract_version`, context over 4 KiB with `context_too_large`, raw/PII context keys with `unsafe_context`, and raw frame payload defaults with `unsafe_payload`.

## Cybermap materialization loop

```text
Ingest observation batch
  -> validate token and source class
  -> normalize geom/time/source/provenance
  -> compute h3_7/h3_9/h3_11 in app
  -> insert immutable observations
  -> upsert entity edges if recognizable
  -> worker scans affected h3_7/h3_9/h3_11 cells by recent ingested_at
  -> worker re-aggregates each affected cell from observations + entity_observations + cyber_entities
  -> worker upserts cybermap_cells by (h3_cell, resolution)
  -> emit sync receipt
```

`cybermap_cells.layers` keeps source classes visible to Godeye:

- `green_preload`: Green public/owned/authorized feeds; `global_preload=true`.
- `local_owned`: owned device or local observations; viewport context, not public global preload.
- `exposure_enrichment`: grey/orange/red enrichment; `gated=true`, `global_preload=false`, `provenance_bearing=true`, with `gated_by_source_class` carrying authorized scopes, trigger observation IDs, and session IDs.

Materialization is idempotent: the worker recomputes the full affected cell summary from append-only observations and entity-backed edges, then replaces the existing `(h3_cell, resolution)` row via upsert. Reruns do not increment counters.

Viewport read path:

```text
Godeye requests bbox + zoom + layers
  -> API maps zoom to H3 resolution
  -> query cybermap_cells intersecting bbox
  -> attach sparse entity summaries for selected cells
  -> return provenance + freshness + caveats
```

RaID read path:

```text
Wardriver posts foreground observations
  -> API ingests owned/local rows
  -> Wardriver requests /api/v1/cybermap/nearby with current GPS/heading/map zoom
  -> API returns nearby materialized cells within bounded radius and source authority
  -> RaID overlays only local live sight + accumulated Cybermap context
```

## API endpoints

P0 endpoints:

| Endpoint | Purpose |
|---|---|
| `GET /healthz` | VM/API health, no secrets |
| `GET /readyz` | DB connectivity and migration state |
| `POST /api/v1/observations/batch` | Wardriver/RaID/Greenfeed batch ingest with idempotency |
| `GET /api/v1/cybermap/viewport?bbox=&zoom=&layers=&since=` | Godeye map viewport query |
| `GET /api/v1/cybermap/nearby?lat=&lon=&radius_m=&heading_deg=&zoom=&source_class=&layers=` | Wardriver/RaID current-position context query; returns `bss.cybermap.nearby.v1` without raw payload columns |
| `GET /api/v1/cybermap/cells/{h3Cell}` | Cell detail/provenance drilldown |
| `GET /api/v1/entities/{id}` | Entity summary and observation links |
| `GET /api/v1/sources?bbox=&class=` | Greenfeed/source catalog lookup |
| `POST /api/v1/sensorium/sessions` | Start/end RaID or Greenfeed session record |
| `POST /api/v1/direct-observations` | Claim-linked direct observation packets from RaID or Greenfeeds |
| `POST /api/v1/claim-validation/greenfeeds` | Claim footprint -> Greenfeed lookup -> direct observation packet + caveated memory delta |
| `GET /api/v1/memories?since=` | Pull distilled Mosaic/Murmurs memory events |
| `POST /api/v1/memories` | Distilled Mosaic/Murmurs memory writeback |


P0 should not expose arbitrary SQL-ish filtering. Keep query shapes product-specific and cacheable.

## Security and privacy gates

- Use per-device Wardriver tokens stored in Android Keystore.
- Send `contract_version: "bss.wardriver.batch.v1"` from native Wardriver clients and update the executable fixture before changing the contract.
- Use separate service tokens for SWA function proxy, Jetson, and worker jobs.
- Require `Idempotency-Key` for ingest batches.
- Reject payloads that try to label private people, faces, plates, or private residences as product entities.
- Keep raw visual data out of PostgreSQL unless the operator explicitly captures a review artifact.
- Distinguish `observed local/owned` from `public preload`; do not allow public exposure datasets to masquerade as direct local observation.
- Every returned Cybermap cell includes `source_classes`, `freshness`, and `caveats` so the UI can avoid false omniscience.

## Operations

- Run migrations with a checked-in migration tool, not ad-hoc psql edits.
- Put PgBouncer on the VM; cap app DB connections aggressively for B1MS.
- Partition or roll monthly observation tables once volume exceeds toy scale.
- Nightly logical backup/export to Blob is still useful even with managed backups.
- Keep PostgreSQL auto-grow deliberate: Azure storage can grow, but it cannot shrink.
- For dev, VM auto-shutdown is acceptable; for public Godeye, disable VM auto-shutdown or present a clear degraded/offline state.

## P0 implementation ledger

The detailed spec-kit implementation ledger lives in [`specs/005-cybermap-geospatial-backend/spec.md`](../specs/005-cybermap-geospatial-backend/spec.md). Current slice summary:

| Slice | State | Purpose |
|---|---|---|
| P0.00 | done, merged/deployed | Shared VNet/subnets for VM and private PostgreSQL. |
| P0.01 | done, review-ready branch | Private PostgreSQL Flexible Server B1MS. |
| P0.02 | done, review-approved branch | Cybermap API gateway/worker services replacing echo product scaffold. |
| P0.03 | done, merged | PostGIS migrations for observation ledger and Cybermap cells. |
| P0.04 | done, review-approved branch | DB configuration, pooling, migrations, readiness checks. |
| P0.045 | done, review-approved branch | API auth, source registry scopes, rate limits. |
| P0.05 | done, review-approved branch | Authenticated observation batch ingest with idempotency. |
| P0.055 | done, review-approved branch | Entity derivation and observation edges. |
| P0.06 | done, review-approved branch | Cybermap cell materialization. |
| P0.07 | done, review-approved branch | Viewport, cell, entity, source catalog read APIs. |
| P0.08 | done, review-approved branch | SWA `/api` proxy to VM Cybermap v1 API. |
| P0.09 | done, review-approved branch | Godeye renders backend Cybermap cells only. |
| P0.10a/b/c | done, review-approved branches | Wardriver payload contract, Android token/outbox sync, RaID nearby context. |
| P0.11 | done, review-approved branch | Greenfeed catalog and poller with Green-only gates. |
| P0.12 | done, review-approved branch | Sensorium sessions and direct observation packets. |
| P0.125 | done, review-approved branch | Claim-validation Greenfeed lookup and direct-observation loop. |
| P0.13 | done, review-approved branch | Mosaic/Murmurs memory sync endpoints. |
| P0.14 | done, review-approved/merged into final integration candidate | Security/privacy/source-class regression suite. |
| P0.15 | pending final merge | Operations plan for backups, monitoring, PgBouncer, cost controls. |
| P0.16 | done, review-approved/merged into this branch | Spec-kit docs and vault/repo sync. |
| P0.17 | running | Final adversarial fan-in review and remediation. |

## Task graph

```text
P0.00 -> P0.01, P0.02
P0.02 + P0.03 -> P0.04 -> P0.045 -> P0.05 -> P0.055 -> P0.06
P0.045 + P0.055 + P0.06 -> P0.07 -> P0.08 -> P0.09
P0.05 + P0.07 -> P0.10a -> P0.10b
P0.10b + P0.12 -> P0.10c
P0.05 + P0.06 -> P0.11
P0.04 + P0.045 -> P0.12
P0.07 + P0.11 + P0.12 -> P0.125
P0.04 + P0.045 + P0.125 -> P0.13
P0.045/P0.055/P0.05/P0.07/P0.09/P0.10a/P0.10b/P0.10c/P0.11/P0.12/P0.125 -> P0.14
P0.01 + P0.02 + P0.04 -> P0.15
P0.01/P0.02/P0.03/P0.045/P0.055/P0.05/P0.07/P0.09/P0.10a/P0.10b/P0.10c/P0.11/P0.125/P0.13 -> P0.16
P0.14 + P0.15 + P0.16 -> P0.17
```

## Acceptance criteria

- PostgreSQL is the durable Cybermap source of truth; VM is replaceable.
- PostGIS geometry and app-computed H3/geohash cells exist for every spatial observation.
- Godeye renders only backend Cybermap cells/entities, not demo overlays.
- RaID writes owned/local observations before receiving enriched nearby Cybermap context.
- Wardriver/RaID contract fixture covers enhanced WiGLE observations, RaID sight summaries, GPS/heading/map context, source/session refs, idempotency, and raw-frame defaults.
- Greenfeed preload is allowed only for Green/public-owned-authorized sources.
- Grey/orange/red enrichment is locally/owned-triggered and provenance-marked.
- Every map cell exposes source class, freshness, confidence/salience, and caveats.
- Raw frames and raw PII MUST NOT be retained or published by default.
