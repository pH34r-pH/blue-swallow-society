BEGIN;

ALTER TABLE cybermap_cells
  DROP CONSTRAINT cybermap_cells_resolution_check,
  ADD CONSTRAINT cybermap_cells_resolution_check
    CHECK (resolution IN (5, 7, 9, 11));

ALTER TABLE source_catalog
  ADD COLUMN layer_id text,
  ADD COLUMN display_order smallint,
  ADD COLUMN terms_reviewed_at timestamptz,
  ADD COLUMN attribution_text text,
  ADD COLUMN fresh_after_seconds integer,
  ADD COLUMN stale_after_seconds integer,
  ADD COLUMN global_layer boolean NOT NULL DEFAULT false,
  ADD COLUMN normalizer_version text,
  ADD CONSTRAINT source_catalog_layer_id_unique UNIQUE (layer_id),
  ADD CONSTRAINT source_catalog_layer_id_shape
    CHECK (layer_id IS NULL OR layer_id ~ '^[a-z0-9][a-z0-9-]{0,63}$'),
  ADD CONSTRAINT source_catalog_display_order_nonnegative
    CHECK (display_order IS NULL OR display_order >= 0),
  ADD CONSTRAINT source_catalog_terms_preload_reviewed
    CHECK (terms_reviewed_at IS NOT NULL OR NOT (enabled AND allowed_preload)),
  ADD CONSTRAINT source_catalog_green_authorized_scope
    CHECK (source_class <> 'green_authorized' OR authorized_scope_ref IS NOT NULL),
  ADD CONSTRAINT source_catalog_attribution_text_nonblank
    CHECK (attribution_text IS NULL OR btrim(attribution_text) <> ''),
  ADD CONSTRAINT source_catalog_freshness_window
    CHECK (
      (fresh_after_seconds IS NULL AND stale_after_seconds IS NULL)
      OR (
        fresh_after_seconds IS NOT NULL
        AND stale_after_seconds IS NOT NULL
        AND fresh_after_seconds >= 0
        AND stale_after_seconds >= fresh_after_seconds
      )
    ),
  ADD CONSTRAINT source_catalog_normalizer_version_nonblank
    CHECK (normalizer_version IS NULL OR btrim(normalizer_version) <> '');

CREATE INDEX source_catalog_global_layer_idx
  ON source_catalog (global_layer, enabled, allowed_preload, display_order);

CREATE TABLE source_fetch_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES source_catalog(id) ON DELETE RESTRICT,
  started_at timestamptz NOT NULL,
  completed_at timestamptz NOT NULL,
  outcome text NOT NULL CHECK (outcome IN ('success', 'empty', 'rate_limited', 'disabled', 'failed')),
  response_class text NOT NULL CHECK (response_class ~ '^[a-z0-9_]{1,64}$'),
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
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'source fetch runs are immutable audit records';
END;
$$;

CREATE TRIGGER source_fetch_runs_no_update
BEFORE UPDATE ON source_fetch_runs
FOR EACH ROW EXECUTE FUNCTION protect_source_fetch_runs();

CREATE TRIGGER source_fetch_runs_no_delete
BEFORE DELETE ON source_fetch_runs
FOR EACH ROW EXECUTE FUNCTION protect_source_fetch_runs();

INSERT INTO source_catalog (
  source_class,
  source_key,
  name,
  provider,
  allowed_preload,
  enabled,
  layer_id,
  display_order,
  global_layer
) VALUES
  ('green_public', 'usgs-earthquakes', 'USGS Earthquake Hazards', 'USGS Earthquake Hazards', false, false, 'usgs-earthquakes', 10, true),
  ('green_public', 'gdacs-alerts', 'GDACS Alerts', 'GDACS', false, false, 'gdacs-alerts', 20, true),
  ('green_public', 'nasa-eonet-events', 'NASA EONET Events', 'NASA EONET', false, false, 'nasa-eonet-events', 30, true);

INSERT INTO schema_migrations (version)
VALUES ('0004_godeye_global_cells_and_sources');

COMMIT;
