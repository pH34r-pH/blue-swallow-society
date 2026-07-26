BEGIN;

ALTER TABLE source_catalog
  ADD COLUMN IF NOT EXISTS attribution text,
  ADD COLUMN IF NOT EXISTS terms_reviewed boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_success_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_failure_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_outcome text;

ALTER TABLE source_catalog
  ADD CONSTRAINT source_catalog_last_outcome_valid
  CHECK (last_outcome IS NULL OR last_outcome IN (
    'success', 'disabled', 'rate_limited', 'http_error', 'payload_too_large',
    'invalid_payload', 'network_error', 'timeout'
  ));

CREATE TABLE global_source_cells (
  source_id uuid NOT NULL REFERENCES source_catalog(id) ON DELETE RESTRICT,
  h3_cell text NOT NULL,
  resolution smallint NOT NULL CHECK (resolution IN (2, 4, 5)),
  centroid geometry(Point, 4326) NOT NULL,
  footprint geometry(Polygon, 4326) NOT NULL,
  evidence_class text NOT NULL CHECK (evidence_class = 'public_reported'),
  report_count integer NOT NULL CHECK (report_count > 0),
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL CHECK (last_seen_at >= first_seen_at),
  salience numeric(5,4) NOT NULL CHECK (salience >= 0 AND salience <= 1),
  caveats jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(caveats) = 'array'),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (source_id, h3_cell, resolution),
  CHECK (ST_SRID(centroid) = 4326),
  CHECK (ST_SRID(footprint) = 4326),
  CHECK (ST_IsValid(footprint))
);

COMMENT ON TABLE global_source_cells IS
  'Coarse source-scoped Godeye aggregates only. No raw GeoJSON feature, report point, brand, operator, direction, routing, or device field may be stored here.';

CREATE INDEX global_source_cells_footprint_gix
  ON global_source_cells USING gist (footprint);
CREATE INDEX global_source_cells_resolution_source_idx
  ON global_source_cells (resolution, source_id, report_count DESC);

CREATE TABLE source_fetch_runs (
  id bigserial PRIMARY KEY,
  source_id uuid NOT NULL REFERENCES source_catalog(id) ON DELETE RESTRICT,
  outcome text NOT NULL CHECK (outcome IN (
    'success', 'disabled', 'rate_limited', 'http_error', 'payload_too_large',
    'invalid_payload', 'network_error', 'timeout'
  )),
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL CHECK (completed_at >= started_at),
  http_status smallint CHECK (http_status IS NULL OR http_status BETWEEN 100 AND 599),
  etag text CHECK (etag IS NULL OR length(etag) <= 256),
  item_count integer NOT NULL DEFAULT 0 CHECK (item_count >= 0),
  normalized_count integer NOT NULL DEFAULT 0 CHECK (normalized_count >= 0),
  cell_count integer NOT NULL DEFAULT 0 CHECK (cell_count >= 0),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

COMMENT ON TABLE source_fetch_runs IS
  'Append-only, sanitized source-job receipt. It deliberately stores no upstream body, URL parameters, report rows, exception body, or source record identifiers.';

CREATE INDEX source_fetch_runs_source_started_idx
  ON source_fetch_runs (source_id, started_at DESC);

CREATE OR REPLACE FUNCTION reject_source_fetch_run_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'source_fetch_runs are append-only audit records';
END;
$$;

CREATE TRIGGER source_fetch_runs_append_only_update
BEFORE UPDATE ON source_fetch_runs
FOR EACH ROW EXECUTE FUNCTION reject_source_fetch_run_mutation();

CREATE TRIGGER source_fetch_runs_append_only_delete
BEFORE DELETE ON source_fetch_runs
FOR EACH ROW EXECUTE FUNCTION reject_source_fetch_run_mutation();

INSERT INTO source_catalog (
  source_class, source_key, name, provider, feed_url, terms_url, attribution,
  allowed_preload, retains_raw_payload, cache_ttl_seconds, enabled, terms_reviewed, provenance
) VALUES (
  'green_public',
  'deflock-osm-alpr-reports',
  'DeFlock public reported ALPR aggregates',
  'DeFlock delivery; OpenStreetMap/Overpass origin',
  'https://data.dontgetflocked.com/cameras.geojson.gz',
  'https://www.openstreetmap.org/copyright',
  '© OpenStreetMap contributors; data available under ODbL. DeFlock delivery reference.',
  true,
  false,
  86400,
  true,
  true,
  jsonb_build_object(
    'schema_version', 'bss.deflock_source_card.v1',
    'evidence_class', 'public_reported',
    'raw_payload_policy', 'streaming materialization only; do not persist',
    'routing_policy', 'not implemented',
    'production_enablement', 'operator approved and scheduled'
  )
)
ON CONFLICT (source_key) DO UPDATE
SET name = EXCLUDED.name,
    provider = EXCLUDED.provider,
    feed_url = EXCLUDED.feed_url,
    terms_url = EXCLUDED.terms_url,
    attribution = EXCLUDED.attribution,
    allowed_preload = true,
    retains_raw_payload = false,
    cache_ttl_seconds = EXCLUDED.cache_ttl_seconds,
    enabled = true,
    terms_reviewed = true,
    provenance = EXCLUDED.provenance,
    updated_at = clock_timestamp();

INSERT INTO schema_migrations (version)
VALUES ('0004_godeye_global_cells_and_sources')
ON CONFLICT (version) DO NOTHING;

COMMIT;
