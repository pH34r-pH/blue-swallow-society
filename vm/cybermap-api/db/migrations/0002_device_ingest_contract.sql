BEGIN;

CREATE TABLE device_ingest_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id text NOT NULL,
  source_id uuid NOT NULL REFERENCES source_catalog(id) ON DELETE RESTRICT,
  token_sha256 text NOT NULL UNIQUE,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  enabled boolean NOT NULL DEFAULT true,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CHECK (device_id <> ''),
  CHECK (token_sha256 ~ '^[a-f0-9]{64}$'),
  CHECK (expires_at IS NULL OR expires_at > created_at)
);

CREATE INDEX device_ingest_credentials_device_enabled_idx
  ON device_ingest_credentials (device_id, enabled);
CREATE INDEX device_ingest_credentials_source_idx
  ON device_ingest_credentials (source_id, created_at DESC);
CREATE INDEX device_ingest_credentials_scopes_gin
  ON device_ingest_credentials USING gin (scopes);

ALTER TABLE sensorium_sessions
  ADD CONSTRAINT sensorium_sessions_id_source_unique UNIQUE (id, source_id);

ALTER TABLE sync_batches
  ADD COLUMN accepted_count integer NOT NULL DEFAULT 0,
  ADD COLUMN rejected_count integer NOT NULL DEFAULT 0,
  ADD COLUMN duplicate_count integer NOT NULL DEFAULT 0,
  ADD COLUMN response_status smallint,
  ADD COLUMN receipt jsonb,
  ADD CONSTRAINT sync_batches_id_source_unique UNIQUE (id, source_id),
  ADD CONSTRAINT sync_batches_session_source_fk
  FOREIGN KEY (session_id, source_id)
  REFERENCES sensorium_sessions (id, source_id)
  ON DELETE RESTRICT;

ALTER TABLE sync_batches
  ADD CONSTRAINT sync_batches_receipt_counts_nonnegative
  CHECK (accepted_count >= 0 AND rejected_count >= 0 AND duplicate_count >= 0),
  ADD CONSTRAINT sync_batches_response_status_range
  CHECK (response_status IS NULL OR response_status BETWEEN 100 AND 599),
  ADD CONSTRAINT sync_batches_payload_hash_shape
  CHECK (payload_hash IS NULL OR payload_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT sync_batches_applied_receipt_complete
  CHECK (
    status NOT IN ('applied', 'duplicate', 'rejected', 'failed')
    OR (
      completed_at IS NOT NULL
      AND payload_hash IS NOT NULL
      AND response_status IS NOT NULL
      AND receipt IS NOT NULL
      AND jsonb_typeof(receipt) = 'object'
      AND receipt ?& ARRAY[
        'schema_version', 'server_batch_id', 'idempotency_key', 'status',
        'accepted_count', 'rejected_count', 'duplicate_count',
        'validation_errors', 'server_clock'
      ]
      AND receipt ->> 'schema_version' = 'bss.sync_receipt.v1'
      AND jsonb_typeof(receipt -> 'accepted_count') = 'number'
      AND jsonb_typeof(receipt -> 'rejected_count') = 'number'
      AND jsonb_typeof(receipt -> 'duplicate_count') = 'number'
      AND jsonb_typeof(receipt -> 'validation_errors') = 'array'
      AND receipt ->> 'server_batch_id' = id::text
      AND receipt ->> 'idempotency_key' = idempotency_key
      AND receipt ->> 'status' = status
      AND (receipt ->> 'server_clock')::timestamptz = completed_at
      AND (receipt ->> 'accepted_count')::integer = accepted_count
      AND (receipt ->> 'rejected_count')::integer = rejected_count
      AND (receipt ->> 'duplicate_count')::integer = duplicate_count
      AND accepted_count + rejected_count + duplicate_count = observation_count
    )
  );

ALTER TABLE observations
  ADD COLUMN sync_batch_id uuid,
  ADD COLUMN content_hash text;

ALTER TABLE observations
  ADD CONSTRAINT observations_content_hash_shape
  CHECK (content_hash IS NULL OR content_hash ~ '^[a-f0-9]{64}$'),
  ADD CONSTRAINT observations_session_source_fk
  FOREIGN KEY (session_id, source_id)
  REFERENCES sensorium_sessions (id, source_id)
  ON DELETE RESTRICT,
  ADD CONSTRAINT observations_sync_batch_source_fk
  FOREIGN KEY (sync_batch_id, source_id)
  REFERENCES sync_batches (id, source_id)
  ON DELETE RESTRICT;

CREATE INDEX observations_sync_batch_idx
  ON observations (sync_batch_id, ingested_at ASC);
CREATE INDEX observations_source_content_hash_idx
  ON observations (source_id, content_hash)
  WHERE content_hash IS NOT NULL;

CREATE OR REPLACE FUNCTION protect_finalized_sync_batch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'sync batches are durable audit records';
  END IF;
  IF OLD.status IN ('applied', 'duplicate', 'rejected', 'failed') THEN
    RAISE EXCEPTION 'finalized sync batches are immutable';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER sync_batches_finalized_update_guard
BEFORE UPDATE ON sync_batches
FOR EACH ROW EXECUTE FUNCTION protect_finalized_sync_batch();

CREATE TRIGGER sync_batches_delete_guard
BEFORE DELETE ON sync_batches
FOR EACH ROW EXECUTE FUNCTION protect_finalized_sync_batch();

INSERT INTO schema_migrations (version) VALUES ('0002_device_ingest_contract');

COMMIT;
