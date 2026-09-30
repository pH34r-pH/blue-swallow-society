BEGIN;
-- Public context only. No links to personal observation/entity records.
CREATE TABLE world_orbit_source (
  source_key text PRIMARY KEY CHECK (source_key = 'celestrak-iss-v1'),
  attempted_at timestamptz,
  attempt_id uuid,
  stopped boolean NOT NULL DEFAULT false,
  failure_code text,
  http_status integer,
  fetched_at timestamptz,
  payload_hash text CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  elements jsonb CHECK (elements IS NULL OR (jsonb_typeof(elements)='array' AND jsonb_array_length(elements)=1)),
  CHECK (NOT stopped OR attempt_id IS NOT NULL)
);
INSERT INTO world_orbit_source(source_key) VALUES ('celestrak-iss-v1');
CREATE TABLE world_orbit_resets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  failed_attempt_id uuid NOT NULL UNIQUE,
  attempted_at timestamptz NOT NULL,
  cached_payload_hash text,
  actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 256),
  review_reason text NOT NULL CHECK (length(review_reason) BETWEEN 10 AND 1000),
  failure_code text NOT NULL,
  http_status integer,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp()
);
INSERT INTO schema_migrations(version) VALUES ('0008_world_selected_orbits');
COMMIT;
