BEGIN;

-- Wardriver external observation keys derive from a device-local row ID. New
-- immutable observations store the authenticated device directly. Old
-- append-only evidence is never updated: only provenance that can be proven
-- from a finalized immutable batch receives a separate immutable scope record.
ALTER TABLE observations
  ADD COLUMN producer_device_id text;

-- The old API process can still be serving while this transaction acquires the
-- table lock. Enforce scope for every *new* batch-linked row without scanning or
-- rewriting historical evidence; a failed old-process write rolls back with no
-- receipt rather than creating fresh ambiguous legacy data.
ALTER TABLE observations
  ADD CONSTRAINT observations_sync_batch_producer_device_required
    CHECK (sync_batch_id IS NULL OR producer_device_id IS NOT NULL) NOT VALID;

CREATE TABLE observation_identity_scopes (
  observation_id uuid PRIMARY KEY REFERENCES observations(id) ON DELETE RESTRICT,
  source_id uuid NOT NULL REFERENCES source_catalog(id) ON DELETE RESTRICT,
  producer_device_id text NOT NULL,
  external_observation_key text NOT NULL,
  scoped_at timestamptz NOT NULL DEFAULT now(),
  CHECK (producer_device_id <> ''),
  UNIQUE (source_id, producer_device_id, external_observation_key)
);

COMMENT ON TABLE observation_identity_scopes IS
  'Append-only legacy identity scope records. A row exists only when immutable batch ownership and a valid observation content hash prove the producer device.';

CREATE OR REPLACE FUNCTION reject_observation_identity_scope_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'observation identity scopes are append-only reconciliation records';
END;
$$;

CREATE TRIGGER observation_identity_scopes_append_only_update
BEFORE UPDATE ON observation_identity_scopes
FOR EACH ROW EXECUTE FUNCTION reject_observation_identity_scope_mutation();

CREATE TRIGGER observation_identity_scopes_append_only_delete
BEFORE DELETE ON observation_identity_scopes
FOR EACH ROW EXECUTE FUNCTION reject_observation_identity_scope_mutation();

INSERT INTO observation_identity_scopes (
  observation_id,
  source_id,
  producer_device_id,
  external_observation_key
)
SELECT
  observation.id,
  observation.source_id,
  batch.client_id,
  observation.external_observation_key
FROM observations AS observation
JOIN sync_batches AS batch
  ON batch.id = observation.sync_batch_id
 AND batch.source_id = observation.source_id
WHERE observation.producer_device_id IS NULL
  AND observation.external_observation_key IS NOT NULL
  AND observation.content_hash ~ '^[a-f0-9]{64}$'
  AND batch.client_id <> ''
  AND batch.status = 'applied'
  AND batch.receipt IS NOT NULL;

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

CREATE INDEX observation_identity_scopes_source_device_key_idx
  ON observation_identity_scopes (source_id, producer_device_id, external_observation_key);

COMMENT ON COLUMN observations.producer_device_id IS
  'Authenticated producer device for new source-scoped observation identities. NULL rows are legacy and require a separate immutable scope record before duplicate comparison.';

INSERT INTO schema_migrations (version) VALUES ('0005_device_scoped_observation_identity');

COMMIT;
