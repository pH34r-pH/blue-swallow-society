BEGIN;

-- RaID lifecycle records are provenance evidence. A later correction creates a
-- new record (for example a revocation or review), rather than changing history.
CREATE TABLE raid_dataset_snapshots (
  snapshot_id text PRIMARY KEY,
  policy_id text NOT NULL,
  taxonomy_revision text NOT NULL,
  replay_corpus_id text NOT NULL,
  example_ids jsonb NOT NULL,
  example_receipt_sha256 text NOT NULL,
  snapshot_manifest jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (snapshot_id <> ''),
  CHECK (policy_id <> ''),
  CHECK (taxonomy_revision <> ''),
  CHECK (replay_corpus_id <> ''),
  CHECK (jsonb_typeof(example_ids) = 'array'),
  CHECK (example_receipt_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (jsonb_typeof(snapshot_manifest) = 'object')
);

CREATE TABLE raid_reviewed_training_examples (
  example_id text PRIMARY KEY,
  taxonomy_revision text NOT NULL,
  rights_receipt_sha256 text NOT NULL,
  dedupe_key text NOT NULL,
  class_id text NOT NULL,
  hard_negative boolean NOT NULL,
  eligible_at timestamptz NOT NULL,
  review_receipt jsonb NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (example_id <> ''),
  CHECK (taxonomy_revision <> ''),
  CHECK (rights_receipt_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (dedupe_key <> ''),
  CHECK (class_id <> ''),
  CHECK (jsonb_typeof(review_receipt) = 'object'),
  UNIQUE (dedupe_key)
);

CREATE INDEX raid_reviewed_training_examples_eligible_idx
  ON raid_reviewed_training_examples (eligible_at, example_id);

CREATE TABLE raid_dataset_snapshot_examples (
  snapshot_id text NOT NULL REFERENCES raid_dataset_snapshots(snapshot_id) ON DELETE RESTRICT,
  example_id text NOT NULL REFERENCES raid_reviewed_training_examples(example_id) ON DELETE RESTRICT,
  PRIMARY KEY (snapshot_id, example_id),
  UNIQUE (example_id)
);

CREATE TABLE raid_training_jobs (
  job_id text PRIMARY KEY,
  snapshot_id text NOT NULL UNIQUE REFERENCES raid_dataset_snapshots(snapshot_id) ON DELETE RESTRICT,
  policy_id text NOT NULL,
  predecessor_release_id text,
  job_manifest jsonb NOT NULL,
  queued_at timestamptz NOT NULL DEFAULT now(),
  CHECK (job_id <> ''),
  CHECK (policy_id <> ''),
  CHECK (jsonb_typeof(job_manifest) = 'object')
);

CREATE TABLE raid_training_job_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id text NOT NULL REFERENCES raid_training_jobs(job_id) ON DELETE RESTRICT,
  event_type text NOT NULL CHECK (event_type IN ('queued', 'claimed', 'completed', 'failed', 'evaluation_recorded')),
  receipt jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(receipt) = 'object')
);

CREATE INDEX raid_training_job_events_job_recorded_idx
  ON raid_training_job_events (job_id, recorded_at DESC, id DESC);

CREATE FUNCTION raid_semver_at_or_below(candidate text, current_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE
    WHEN candidate ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
      AND current_value ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
    THEN string_to_array(candidate, '.')::integer[] <= string_to_array(current_value, '.')::integer[]
    ELSE false
  END;
$$;

CREATE FUNCTION raid_semver_at_or_above(candidate text, current_value text)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
STRICT
AS $$
  SELECT CASE
    WHEN candidate ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
      AND current_value ~ '^[0-9]+\.[0-9]+\.[0-9]+$'
    THEN string_to_array(candidate, '.')::integer[] >= string_to_array(current_value, '.')::integer[]
    ELSE false
  END;
$$;

CREATE TABLE raid_model_releases (
  release_id text PRIMARY KEY,
  model_id text NOT NULL,
  channel text NOT NULL CHECK (channel IN ('field', 'stable')),
  state text NOT NULL CHECK (state IN ('trained', 'evaluation_passed', 'awaiting_approval', 'approved', 'published')),
  manifest_sha256 text NOT NULL,
  artifact_sha256 text NOT NULL,
  artifact_size_bytes bigint NOT NULL CHECK (artifact_size_bytes > 0),
  release_manifest jsonb NOT NULL,
  approved_at timestamptz NOT NULL,
  published_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (release_id <> ''),
  CHECK (model_id <> ''),
  CHECK (manifest_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (jsonb_typeof(release_manifest) = 'object'),
  UNIQUE (model_id, manifest_sha256)
);

ALTER TABLE raid_training_jobs
  ADD CONSTRAINT raid_training_jobs_predecessor_release_fk
  FOREIGN KEY (predecessor_release_id) REFERENCES raid_model_releases(release_id) ON DELETE RESTRICT;

CREATE INDEX raid_model_releases_catalog_idx
  ON raid_model_releases (channel, published_at DESC, release_id DESC);

CREATE TABLE raid_model_artifacts (
  release_id text PRIMARY KEY REFERENCES raid_model_releases(release_id) ON DELETE RESTRICT,
  artifact_bytes bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE raid_model_release_revocations (
  release_id text PRIMARY KEY REFERENCES raid_model_releases(release_id) ON DELETE RESTRICT,
  reason_code text NOT NULL,
  receipt jsonb NOT NULL,
  revoked_at timestamptz NOT NULL DEFAULT now(),
  CHECK (reason_code <> ''),
  CHECK (jsonb_typeof(receipt) = 'object')
);

CREATE TABLE raid_model_feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_id uuid NOT NULL REFERENCES source_catalog(id) ON DELETE RESTRICT,
  device_id text NOT NULL,
  feedback_id text NOT NULL,
  release_id text NOT NULL REFERENCES raid_model_releases(release_id) ON DELETE RESTRICT,
  artifact_sha256 text NOT NULL,
  payload_hash text NOT NULL,
  feedback jsonb NOT NULL,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK (device_id <> ''),
  CHECK (feedback_id <> ''),
  CHECK (artifact_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  CHECK (jsonb_typeof(feedback) = 'object'),
  UNIQUE (source_id, device_id, feedback_id)
);

CREATE INDEX raid_model_feedback_release_recorded_idx
  ON raid_model_feedback (release_id, recorded_at DESC, id DESC);

CREATE TABLE raid_model_feedback_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_id uuid NOT NULL REFERENCES raid_model_feedback(id) ON DELETE RESTRICT,
  review_outcome text NOT NULL CHECK (review_outcome IN ('training_example', 'hard_negative', 'evaluation_case', 'excluded')),
  receipt jsonb NOT NULL,
  reviewed_at timestamptz NOT NULL DEFAULT now(),
  CHECK (jsonb_typeof(receipt) = 'object')
);

CREATE OR REPLACE FUNCTION reject_raid_model_lifecycle_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'RaID model lifecycle records are append-only';
END;
$$;

CREATE TRIGGER raid_dataset_snapshots_append_only_update
BEFORE UPDATE ON raid_dataset_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_dataset_snapshots_append_only_delete
BEFORE DELETE ON raid_dataset_snapshots
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_reviewed_training_examples_append_only_update
BEFORE UPDATE ON raid_reviewed_training_examples
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_reviewed_training_examples_append_only_delete
BEFORE DELETE ON raid_reviewed_training_examples
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_dataset_snapshot_examples_append_only_update
BEFORE UPDATE ON raid_dataset_snapshot_examples
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_dataset_snapshot_examples_append_only_delete
BEFORE DELETE ON raid_dataset_snapshot_examples
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_training_jobs_append_only_update
BEFORE UPDATE ON raid_training_jobs
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_training_jobs_append_only_delete
BEFORE DELETE ON raid_training_jobs
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_training_job_events_append_only_update
BEFORE UPDATE ON raid_training_job_events
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_training_job_events_append_only_delete
BEFORE DELETE ON raid_training_job_events
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_model_releases_append_only_update
BEFORE UPDATE ON raid_model_releases
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_model_releases_append_only_delete
BEFORE DELETE ON raid_model_releases
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_model_artifacts_append_only_update
BEFORE UPDATE ON raid_model_artifacts
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_model_artifacts_append_only_delete
BEFORE DELETE ON raid_model_artifacts
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_model_release_revocations_append_only_update
BEFORE UPDATE ON raid_model_release_revocations
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_model_release_revocations_append_only_delete
BEFORE DELETE ON raid_model_release_revocations
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_model_feedback_append_only_update
BEFORE UPDATE ON raid_model_feedback
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_model_feedback_append_only_delete
BEFORE DELETE ON raid_model_feedback
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_model_feedback_reviews_append_only_update
BEFORE UPDATE ON raid_model_feedback_reviews
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();
CREATE TRIGGER raid_model_feedback_reviews_append_only_delete
BEFORE DELETE ON raid_model_feedback_reviews
FOR EACH ROW EXECUTE FUNCTION reject_raid_model_lifecycle_mutation();

INSERT INTO schema_migrations (version) VALUES ('0006_raid_model_lifecycle');

COMMIT;
