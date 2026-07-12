BEGIN;

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

COMMENT ON TYPE source_class IS
  'Canonical source-class mapping: public_greenfeed -> green_public; owned_greenfeed -> green_owned; authorized_greenfeed -> green_authorized. Green classes may preload; grey/orange/red require local or explicitly authorized trigger metadata.';

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

CREATE TYPE cyber_retention_class AS ENUM (
  'summary_only',
  'hash_only',
  'operator_artifact',
  'raw_frame_explicit',
  'pii_explicit',
  'full_fidelity'
);

COMMENT ON TYPE cyber_retention_class IS
  'full_fidelity preserves passively observed RF identifiers, names, and management-frame metadata for authenticated cross-reference; summary/hash modes remain available for derived products.';

CREATE TYPE cyber_entity_kind AS ENUM (
  'network',
  'device',
  'place',
  'feed',
  'claim',
  'event',
  'cluster',
  'memory'
);

CREATE TYPE memory_channel AS ENUM (
  'mosaic',
  'murmur'
);

CREATE TABLE source_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_class source_class NOT NULL,
  source_key text NOT NULL,
  name text NOT NULL,
  provider text,
  feed_url text,
  terms_url text,
  authorized_scope_ref text,
  allowed_preload boolean NOT NULL DEFAULT false,
  retains_raw_payload boolean NOT NULL DEFAULT false,
  cache_ttl_seconds integer NOT NULL DEFAULT 300,
  geom geometry(Point, 4326),
  footprint geometry(Geometry, 4326),
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT true,
  last_checked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key),
  UNIQUE (id, source_class),
  CHECK (cache_ttl_seconds >= 0),
  CHECK (source_class in ('green_public', 'green_owned', 'green_authorized') OR allowed_preload = false),
  CHECK (source_class NOT IN ('grey_enrichment', 'orange_exposure', 'red_restricted') OR authorized_scope_ref IS NOT NULL),
  CHECK (retains_raw_payload = false OR authorized_scope_ref IS NOT NULL)
);

COMMENT ON TABLE source_catalog IS
  'Catalog of public, owned, local, and authorized Cybermap sources. public_greenfeed is stored canonically as green_public.';

CREATE INDEX source_catalog_geom_gix ON source_catalog USING gist (geom);
CREATE INDEX source_catalog_footprint_gix ON source_catalog USING gist (footprint);
CREATE INDEX source_catalog_class_enabled_idx ON source_catalog (source_class, enabled, allowed_preload);
CREATE INDEX source_catalog_provenance_gin ON source_catalog USING gin (provenance jsonb_path_ops);

CREATE TABLE sensorium_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid REFERENCES source_catalog(id),
  session_kind text NOT NULL,
  operator_subject_ref text,
  device_ref text,
  client_id text,
  authorized_scope_ref text,
  started_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  geom geometry(Point, 4326),
  h3_7 text,
  h3_9 text,
  h3_11 text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (session_kind IN ('dream_suspension', 'raid_sight', 'greenfeed_jack_in', 'direct_observation', 'worker_materialization')),
  CHECK (ended_at IS NULL OR ended_at >= started_at),
  CHECK (geom IS NULL OR (h3_7 IS NOT NULL AND h3_9 IS NOT NULL AND h3_11 IS NOT NULL))
);

CREATE INDEX sensorium_sessions_geom_gix ON sensorium_sessions USING gist (geom);
CREATE INDEX sensorium_sessions_h3_9_time_idx ON sensorium_sessions (h3_9, started_at DESC);
CREATE INDEX sensorium_sessions_source_time_idx ON sensorium_sessions (source_id, started_at DESC);
CREATE INDEX sensorium_sessions_provenance_gin ON sensorium_sessions USING gin (provenance jsonb_path_ops);

CREATE TABLE observations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL,
  source_class source_class NOT NULL,
  session_id uuid REFERENCES sensorium_sessions(id),
  trigger_observation_id uuid REFERENCES observations(id),
  authorized_scope_ref text,
  kind observation_kind NOT NULL,
  external_observation_key text,
  idempotency_key text,
  observed_at timestamptz NOT NULL,
  ingested_at timestamptz NOT NULL DEFAULT now(),
  geom geometry(Geometry, 4326),
  h3_7 text,
  h3_9 text,
  h3_11 text,
  confidence numeric(4,3) NOT NULL DEFAULT 1.000,
  pii_status text NOT NULL DEFAULT 'redacted',
  retention_class cyber_retention_class NOT NULL DEFAULT 'summary_only',
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (source_id, source_class) REFERENCES source_catalog(id, source_class),
  UNIQUE (source_id, external_observation_key),
  UNIQUE (source_id, idempotency_key),
  CHECK (observed_at <= ingested_at + interval '5 minutes'),
  CHECK (geom IS NULL OR (h3_7 IS NOT NULL AND h3_9 IS NOT NULL AND h3_11 IS NOT NULL)),
  CHECK (confidence >= 0 AND confidence <= 1),
  CHECK (pii_status IN ('none', 'redacted', 'hashed', 'observed', 'operator_explicit')),
  CHECK (
    source_class not in ('grey_enrichment', 'orange_exposure', 'red_restricted')
    OR trigger_observation_id is not null
    OR session_id is not null
    OR authorized_scope_ref is not null
  )
);

COMMENT ON TABLE observations IS
  'Append-only normalized evidence ledger. App code computes h3_7/h3_9/h3_11; PostgreSQL stores PostGIS geometry and source-specific JSONB summaries.';

CREATE INDEX observations_geom_gix ON observations USING gist (geom);
CREATE INDEX observations_observed_at_idx ON observations (observed_at DESC);
CREATE INDEX observations_ingested_at_idx ON observations (ingested_at DESC);
CREATE INDEX observations_h3_7_time_idx ON observations (h3_7, observed_at DESC);
CREATE INDEX observations_h3_9_time_idx ON observations (h3_9, observed_at DESC);
CREATE INDEX observations_h3_11_time_idx ON observations (h3_11, observed_at DESC);
CREATE INDEX observations_kind_source_idx ON observations (kind, source_class, observed_at DESC);
CREATE INDEX observations_source_class_time_idx ON observations (source_class, observed_at DESC);
CREATE INDEX observations_payload_gin ON observations USING gin (payload jsonb_path_ops);
CREATE INDEX observations_provenance_gin ON observations USING gin (provenance jsonb_path_ops);

CREATE TABLE cyber_entities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_kind cyber_entity_kind NOT NULL,
  stable_key text NOT NULL,
  display_name text NOT NULL,
  source_class source_class NOT NULL,
  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  centroid geometry(Point, 4326),
  footprint geometry(Geometry, 4326),
  h3_7 text,
  h3_9 text,
  h3_11 text,
  confidence numeric(4,3) NOT NULL DEFAULT 1.000,
  labels text[] NOT NULL DEFAULT ARRAY[]::text[],
  properties jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stable_key),
  CHECK (last_seen_at >= first_seen_at),
  CHECK (centroid IS NULL OR (h3_7 IS NOT NULL AND h3_9 IS NOT NULL AND h3_11 IS NOT NULL)),
  CHECK (confidence >= 0 AND confidence <= 1)
);

CREATE INDEX cyber_entities_centroid_gix ON cyber_entities USING gist (centroid);
CREATE INDEX cyber_entities_footprint_gix ON cyber_entities USING gist (footprint);
CREATE INDEX cyber_entities_kind_idx ON cyber_entities (entity_kind, source_class);
CREATE INDEX cyber_entities_h3_9_idx ON cyber_entities (h3_9, last_seen_at DESC);
CREATE INDEX cyber_entities_properties_gin ON cyber_entities USING gin (properties jsonb_path_ops);
CREATE INDEX cyber_entities_provenance_gin ON cyber_entities USING gin (provenance jsonb_path_ops);

CREATE TABLE entity_observations (
  entity_id uuid NOT NULL REFERENCES cyber_entities(id) ON DELETE CASCADE,
  observation_id uuid NOT NULL REFERENCES observations(id) ON DELETE RESTRICT,
  relationship text NOT NULL,
  source_class source_class NOT NULL,
  weight numeric(4,3) NOT NULL DEFAULT 1.000,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, observation_id, relationship),
  CHECK (relationship IN ('observed_as', 'supports', 'contradicts', 'located_near', 'derived_from', 'summarizes')),
  CHECK (weight >= 0 AND weight <= 1)
);

CREATE INDEX entity_observations_observation_idx ON entity_observations (observation_id, relationship);
CREATE INDEX entity_observations_source_idx ON entity_observations (source_class, created_at DESC);
CREATE INDEX entity_observations_provenance_gin ON entity_observations USING gin (provenance jsonb_path_ops);

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
  PRIMARY KEY (h3_cell, resolution),
  CHECK (resolution IN (7, 9, 11)),
  CHECK (observation_count >= 0),
  CHECK (entity_count >= 0),
  CHECK (salience >= 0),
  CHECK (last_seen_at IS NULL OR first_seen_at IS NULL OR last_seen_at >= first_seen_at)
);

CREATE INDEX cybermap_cells_geom_gix ON cybermap_cells USING gist (geom);
CREATE INDEX cybermap_cells_resolution_updated_idx ON cybermap_cells (resolution, updated_at DESC);
CREATE INDEX cybermap_cells_source_classes_gin ON cybermap_cells USING gin (source_classes);
CREATE INDEX cybermap_cells_layers_gin ON cybermap_cells USING gin (layers jsonb_path_ops);
CREATE INDEX cybermap_cells_counts_gin ON cybermap_cells USING gin (counts jsonb_path_ops);

CREATE TABLE mosaic_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_channel memory_channel NOT NULL DEFAULT 'mosaic',
  memory_key text NOT NULL,
  observation_id uuid REFERENCES observations(id) ON DELETE SET NULL,
  entity_id uuid REFERENCES cyber_entities(id) ON DELETE SET NULL,
  source_id uuid REFERENCES source_catalog(id),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  geom geometry(Point, 4326),
  h3_7 text,
  h3_9 text,
  h3_11 text,
  summary text NOT NULL,
  salience numeric(5,3) NOT NULL DEFAULT 0,
  confidence numeric(4,3) NOT NULL DEFAULT 1.000,
  retention_class cyber_retention_class NOT NULL DEFAULT 'summary_only',
  raw_payload_ref text,
  operator_approved_raw_ref text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (memory_key),
  CHECK (memory_channel = 'mosaic'),
  CHECK (geom IS NULL OR (h3_7 IS NOT NULL AND h3_9 IS NOT NULL AND h3_11 IS NOT NULL)),
  CHECK (salience >= 0),
  CHECK (confidence >= 0 AND confidence <= 1),
  CHECK (retention_class NOT IN ('raw_frame_explicit', 'pii_explicit') OR (raw_payload_ref IS NOT NULL AND operator_approved_raw_ref IS NOT NULL)),
  CHECK (NOT (payload ?| ARRAY['raw_frame', 'raw_frames', 'face_image', 'license_plate_image', 'raw_pii']))
);

CREATE INDEX mosaic_memories_geom_gix ON mosaic_memories USING gist (geom);
CREATE INDEX mosaic_memories_h3_9_time_idx ON mosaic_memories (h3_9, occurred_at DESC);
CREATE INDEX mosaic_memories_source_time_idx ON mosaic_memories (source_id, occurred_at DESC);
CREATE INDEX mosaic_memories_payload_gin ON mosaic_memories USING gin (payload jsonb_path_ops);
CREATE INDEX mosaic_memories_provenance_gin ON mosaic_memories USING gin (provenance jsonb_path_ops);

CREATE TABLE murmur_memories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  memory_channel memory_channel NOT NULL DEFAULT 'murmur',
  memory_key text NOT NULL,
  observation_id uuid REFERENCES observations(id) ON DELETE SET NULL,
  entity_id uuid REFERENCES cyber_entities(id) ON DELETE SET NULL,
  source_id uuid REFERENCES source_catalog(id),
  occurred_at timestamptz NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  geom geometry(Point, 4326),
  h3_7 text,
  h3_9 text,
  h3_11 text,
  summary text NOT NULL,
  salience numeric(5,3) NOT NULL DEFAULT 0,
  confidence numeric(4,3) NOT NULL DEFAULT 1.000,
  retention_class cyber_retention_class NOT NULL DEFAULT 'summary_only',
  raw_payload_ref text,
  operator_approved_raw_ref text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (memory_key),
  CHECK (memory_channel = 'murmur'),
  CHECK (geom IS NULL OR (h3_7 IS NOT NULL AND h3_9 IS NOT NULL AND h3_11 IS NOT NULL)),
  CHECK (salience >= 0),
  CHECK (confidence >= 0 AND confidence <= 1),
  CHECK (retention_class NOT IN ('raw_frame_explicit', 'pii_explicit') OR (raw_payload_ref IS NOT NULL AND operator_approved_raw_ref IS NOT NULL)),
  CHECK (NOT (payload ?| ARRAY['raw_frame', 'raw_frames', 'face_image', 'license_plate_image', 'raw_pii']))
);

CREATE INDEX murmur_memories_geom_gix ON murmur_memories USING gist (geom);
CREATE INDEX murmur_memories_h3_9_time_idx ON murmur_memories (h3_9, occurred_at DESC);
CREATE INDEX murmur_memories_source_time_idx ON murmur_memories (source_id, occurred_at DESC);
CREATE INDEX murmur_memories_payload_gin ON murmur_memories USING gin (payload jsonb_path_ops);
CREATE INDEX murmur_memories_provenance_gin ON murmur_memories USING gin (provenance jsonb_path_ops);

CREATE TABLE sync_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES source_catalog(id),
  session_id uuid REFERENCES sensorium_sessions(id),
  client_id text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'received',
  received_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  observation_count integer NOT NULL DEFAULT 0,
  payload_hash text,
  error text,
  request_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  provenance jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (source_id, client_id, idempotency_key),
  CHECK (status IN ('received', 'applied', 'duplicate', 'rejected', 'failed')),
  CHECK (completed_at IS NULL OR completed_at >= received_at),
  CHECK (observation_count >= 0)
);

CREATE INDEX sync_batches_source_received_idx ON sync_batches (source_id, received_at DESC);
CREATE INDEX sync_batches_client_idx ON sync_batches (client_id, received_at DESC);
CREATE INDEX sync_batches_status_idx ON sync_batches (status, received_at DESC);
CREATE INDEX sync_batches_metadata_gin ON sync_batches USING gin (request_metadata jsonb_path_ops);
CREATE INDEX sync_batches_provenance_gin ON sync_batches USING gin (provenance jsonb_path_ops);

CREATE OR REPLACE FUNCTION reject_observation_ledger_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'observations are append-only; insert a correcting observation instead';
END;
$$;

CREATE TRIGGER observations_append_only_update
BEFORE UPDATE ON observations
FOR EACH ROW EXECUTE FUNCTION reject_observation_ledger_mutation();

CREATE TRIGGER observations_append_only_delete
BEFORE DELETE ON observations
FOR EACH ROW EXECUTE FUNCTION reject_observation_ledger_mutation();

CREATE TABLE schema_migrations (
  version text PRIMARY KEY,
  applied_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO schema_migrations (version) VALUES ('0001_cybermap_core');

COMMIT;
