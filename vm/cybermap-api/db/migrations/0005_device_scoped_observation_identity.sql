BEGIN;

-- Wardriver external observation keys derive from a device-local row ID. Preserve
-- immutable legacy rows, but scope every provable/new identity to its producer.
ALTER TABLE observations
  ADD COLUMN producer_device_id text;

UPDATE observations AS observation
SET producer_device_id = batch.client_id
FROM sync_batches AS batch
WHERE observation.sync_batch_id = batch.id
  AND observation.source_id = batch.source_id
  AND observation.producer_device_id IS NULL
  AND observation.content_hash IS NOT NULL
  AND batch.client_id <> '';

ALTER TABLE observations
  DROP CONSTRAINT observations_source_id_external_observation_key_key,
  DROP CONSTRAINT observations_source_id_idempotency_key_key;

ALTER TABLE observations
  ADD CONSTRAINT observations_source_device_external_observation_key_key
    UNIQUE (source_id, producer_device_id, external_observation_key),
  ADD CONSTRAINT observations_source_device_idempotency_key_key
    UNIQUE (source_id, producer_device_id, idempotency_key);

CREATE INDEX observations_source_device_content_hash_idx
  ON observations (source_id, producer_device_id, content_hash)
  WHERE producer_device_id IS NOT NULL AND content_hash IS NOT NULL;

COMMENT ON COLUMN observations.producer_device_id IS
  'Authenticated producer device for a source-scoped external observation identity. NULL is legacy/unscoped and must fail closed when matched.';

INSERT INTO schema_migrations (version) VALUES ('0005_device_scoped_observation_identity');

COMMIT;
