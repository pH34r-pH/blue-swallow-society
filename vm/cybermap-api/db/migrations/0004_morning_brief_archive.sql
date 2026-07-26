BEGIN;

CREATE TABLE IF NOT EXISTS morning_brief_runs (
  run_id text PRIMARY KEY CHECK (run_id ~ '^[a-z0-9][a-z0-9-]{2,120}$'),
  idempotency_key text NOT NULL CHECK (idempotency_key ~ '^[A-Za-z0-9._:~-]{1,200}$'),
  generated_at timestamptz NOT NULL,
  canonical_state_hash text NOT NULL CHECK (canonical_state_hash ~ '^[a-f0-9]{64}$'),
  package_sha256 text NOT NULL CHECK (package_sha256 ~ '^[a-f0-9]{64}$'),
  summary text NOT NULL CHECK (length(summary) <= 8000),
  artifact_count integer NOT NULL DEFAULT 0 CHECK (artifact_count >= 0 AND artifact_count <= 64),
  archived_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS morning_brief_artifacts (
  run_id text NOT NULL REFERENCES morning_brief_runs(run_id) ON DELETE RESTRICT,
  artifact_id text NOT NULL CHECK (artifact_id ~ '^[a-z0-9][a-z0-9-]{1,120}$'),
  media_type text NOT NULL CHECK (length(media_type) BETWEEN 3 AND 160),
  sha256 text NOT NULL CHECK (sha256 ~ '^[a-f0-9]{64}$'),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 8388608),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  PRIMARY KEY (run_id, artifact_id)
);

CREATE INDEX IF NOT EXISTS morning_brief_runs_generated_at_idx
  ON morning_brief_runs (generated_at DESC);

CREATE OR REPLACE FUNCTION morning_brief_artifact_count_sync() RETURNS trigger AS $$
BEGIN
  UPDATE morning_brief_runs
  SET artifact_count = (SELECT count(*) FROM morning_brief_artifacts WHERE run_id = COALESCE(NEW.run_id, OLD.run_id))
  WHERE run_id = COALESCE(NEW.run_id, OLD.run_id);
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS morning_brief_artifact_count_trigger ON morning_brief_artifacts;
CREATE CONSTRAINT TRIGGER morning_brief_artifact_count_trigger
AFTER INSERT OR DELETE ON morning_brief_artifacts
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION morning_brief_artifact_count_sync();

INSERT INTO schema_migrations (version)
VALUES ('0004_morning_brief_archive')
ON CONFLICT (version) DO NOTHING;

COMMIT;
