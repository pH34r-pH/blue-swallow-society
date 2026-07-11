# Cybermap worker VM service

Node 20 background worker for Cybermap materialization jobs on the VM.

Implemented jobs:
- Greenfeed polling preloads the curated `green_public` / `green_owned` / `green_authorized` seed manifest in `greenfeeds/greenfeed-seed-catalog.json`, upserts terms/provenance/TTL metadata into `source_catalog`, fetches enabled feeds with a Cybermap User-Agent, and writes `greenfeed_snapshot` observations through the same authenticated ingest/materialization path used by direct observation batches.
- Cybermap cell materialization scans recently ingested app-computed `h3_7` / `h3_9` / `h3_11` observation cells, re-aggregates affected cells from the append-only `observations` ledger plus `entity_observations` / `cyber_entities`, and upserts `cybermap_cells` by `(h3_cell, resolution)`.

Runtime contract:
- Emits structured JSON logs.
- Uses `CYBERMAP_WORKER_POLL_INTERVAL_MS` (default 60s).
- Uses `CYBERMAP_GREENFEED_POLLING_ENABLED=true` to enable Greenfeed polling before affected-cell materialization; it is disabled by default so deployments opt in to external provider fetches.
- Greenfeed sources are limited to Green classes (`green_public`, `green_owned`, `green_authorized`), are globally preloadable only when `allowed_preload=true` and `persistent_jack_in_allowed=true`, preserve persisted operator disables/preload revocations across seed refreshes, and keep raw payload retention disabled unless a future operator-approved path explicitly changes that policy.
- Greenfeed external fetches use an abort timeout and response byte cap before JSON parsing so a slow or oversized curated feed cannot block worker materialization.
- Greenfeed snapshots propagate provider terms, cache TTL, freshness status, uptime status, caveats, and distance/angle/source-quality ranking hints into materialized cell summaries for claim-validation lookups.
- Uses `CYBERMAP_CELL_MATERIALIZATION_LOOKBACK_MS` and `CYBERMAP_CELL_MATERIALIZATION_LIMIT` to bound affected-cell scans; when a page hits the limit, the worker keeps the same `since`/`before` window and resumes from the returned cell cursor instead of advancing past unprocessed cells.
- Freezes `before` to the first tick timestamp during a paged sweep and advances the materialization watermark to a sliding lookback from that high-watermark, so late-visible rows with earlier `ingested_at` values are re-swept idempotently.
- Loads DB settings through the same sanitized `CYBERMAP_DATABASE_URL`/PgBouncer env contract as `cybermap-api`; if DB config is missing, the job logs `job_skipped` instead of crash-looping.
- Does not require a PostgreSQL H3 extension. Cell polygons are app-computed from the stored geohash-style cell IDs for P0 and passed to PostGIS as GeoJSON.
- Marks grey/orange/red exposure layers as gated and provenance-bearing; global preload projections can filter them unless the caller has matching authorized scope.

The worker handles `SIGTERM` for clean systemd shutdown.
