BEGIN;

CREATE TABLE IF NOT EXISTS paper_state_updates (
  id bigserial PRIMARY KEY,
  idempotency_key text NOT NULL UNIQUE CHECK (length(idempotency_key) BETWEEN 1 AND 200),
  payload_hash text NOT NULL CHECK (payload_hash ~ '^[a-f0-9]{64}$'),
  generated_at timestamptz NOT NULL,
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  applied_at timestamptz NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE IF NOT EXISTS paper_state_current (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton = true),
  update_id bigint NOT NULL UNIQUE REFERENCES paper_state_updates(id) ON DELETE RESTRICT,
  idempotency_key text NOT NULL,
  generated_at timestamptz NOT NULL,
  state jsonb NOT NULL CHECK (jsonb_typeof(state) = 'object'),
  updated_at timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS paper_state_updates_generated_at_idx
  ON paper_state_updates (generated_at DESC);

INSERT INTO schema_migrations (version)
VALUES ('0003_paper_state')
ON CONFLICT (version) DO NOTHING;

COMMIT;
