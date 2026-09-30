BEGIN;

-- Anonymous operator-created clusters may have no measured time or machine confidence yet.
-- Preserve existing values/defaults; permit explicit unknowns for the new projection.
ALTER TABLE cyber_entities ALTER COLUMN confidence DROP NOT NULL;
ALTER TABLE cyber_entities ALTER COLUMN first_seen_at DROP NOT NULL;
ALTER TABLE cyber_entities ALTER COLUMN last_seen_at DROP NOT NULL;

-- Existing cyber_entities IDs remain canonical. No existing data is imported or altered.
CREATE TABLE entity_workbench_state (
  entity_id uuid PRIMARY KEY REFERENCES cyber_entities(id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  operator_state jsonb NOT NULL,
  effective_device_ids uuid[] NOT NULL DEFAULT '{}',
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (cardinality(effective_device_ids) <= 100),
  CHECK (jsonb_typeof(operator_state) = 'object')
);
CREATE INDEX entity_workbench_devices_idx ON entity_workbench_state USING gin(effective_device_ids);
CREATE INDEX entity_workbench_updated_idx ON entity_workbench_state(updated_at, entity_id);

CREATE TABLE entity_hypotheses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id uuid NOT NULL REFERENCES entity_workbench_state(entity_id) ON DELETE RESTRICT,
  revision integer NOT NULL CHECK (revision > 0),
  version text NOT NULL CHECK (length(version) BETWEEN 1 AND 128),
  algorithm text NOT NULL CHECK (length(algorithm) BETWEEN 1 AND 200),
  device_ids uuid[] NOT NULL,
  evidence_ids uuid[] NOT NULL,
  confidence numeric(4,3) CHECK (confidence BETWEEN 0 AND 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(entity_id, version),
  UNIQUE(entity_id, revision),
  CHECK (cardinality(device_ids) <= 100 AND cardinality(evidence_ids) <= 200)
);
CREATE INDEX entity_hypotheses_latest_idx ON entity_hypotheses(entity_id, revision DESC);

CREATE TABLE entity_assertions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  actor_id text NOT NULL CHECK (length(actor_id) BETWEEN 1 AND 256),
  idempotency_key text NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 128),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  action text NOT NULL CHECK (action IN ('create','label','membership','reject','split','merge','undo')),
  reason text NOT NULL CHECK (length(reason) BETWEEN 1 AND 1000),
  evidence_ids uuid[] NOT NULL,
  affected_ids uuid[] NOT NULL,
  expected_revisions jsonb NOT NULL,
  before_state jsonb NOT NULL,
  after_state jsonb NOT NULL,
  compensates uuid REFERENCES entity_assertions(id) ON DELETE RESTRICT,
  receipt jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(actor_id, idempotency_key),
  CHECK (cardinality(affected_ids) BETWEEN 1 AND 2 AND cardinality(evidence_ids) <= 200),
  CHECK ((action = 'undo') = (compensates IS NOT NULL))
);
CREATE INDEX entity_assertions_affected_idx ON entity_assertions USING gin(affected_ids);
CREATE INDEX entity_assertions_time_idx ON entity_assertions(created_at DESC, id);

CREATE FUNCTION reject_entity_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'entity history is append-only; append a compensating assertion';
END;
$$;
CREATE TRIGGER entity_hypotheses_immutable BEFORE UPDATE OR DELETE ON entity_hypotheses
FOR EACH ROW EXECUTE FUNCTION reject_entity_history_mutation();
CREATE TRIGGER entity_assertions_immutable BEFORE UPDATE OR DELETE ON entity_assertions
FOR EACH ROW EXECUTE FUNCTION reject_entity_history_mutation();

INSERT INTO schema_migrations(version) VALUES ('0007_entity_workbench');
COMMIT;
