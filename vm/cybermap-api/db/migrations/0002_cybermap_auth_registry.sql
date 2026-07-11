BEGIN;

-- Cybermap API authentication and source-authority registry.
-- Additive migration: keep 0001 immutable for databases that already recorded it.

CREATE TYPE cybermap_client_type AS ENUM (
  'wardriver_device',
  'swa_proxy',
  'jetson',
  'greenfeed_worker',
  'operator_admin'
);

COMMENT ON TYPE cybermap_client_type IS
  'Client class attached to a hashed API token. Clients inherit source authority from api_token_source_scopes, never from request payload source_class claims.';

CREATE TABLE api_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id text NOT NULL UNIQUE,
  token_hash text NOT NULL UNIQUE,
  client_type cybermap_client_type NOT NULL,
  subject_ref text,
  scopes text[] NOT NULL DEFAULT ARRAY[]::text[],
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  revoked_at timestamptz,
  rotated_from_token_id uuid REFERENCES api_tokens(id),
  CHECK (token_hash ~ '^sha256:[0-9a-f]{64}$'),
  CHECK (expires_at IS NULL OR expires_at > created_at),
  CHECK (revoked_at IS NULL OR revoked_at >= created_at)
);

COMMENT ON TABLE api_tokens IS
  'API token registry. Store sha256 token hashes only; plaintext device, SWA, Jetson, worker, and operator tokens are never persisted.';

CREATE INDEX api_tokens_client_active_idx ON api_tokens (client_type, active, expires_at);
CREATE INDEX api_tokens_scopes_gin ON api_tokens USING gin (scopes);

CREATE TABLE api_token_source_scopes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_id uuid NOT NULL REFERENCES api_tokens(id) ON DELETE CASCADE,
  source_id uuid,
  source_class source_class NOT NULL,
  scope text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (scope IN ('cybermap:read', 'sources:read', 'sources:write', 'observations:write', 'memory:write', '*')),
  FOREIGN KEY (source_id, source_class) REFERENCES source_catalog(id, source_class),
  UNIQUE (token_id, source_id, source_class, scope)
);

COMMENT ON TABLE api_token_source_scopes IS
  'Per-token source authority. API middleware treats request source_class fields as claims to verify against this registry, not as authority.';

CREATE INDEX api_token_source_scopes_token_idx ON api_token_source_scopes (token_id, source_class, scope);
CREATE INDEX api_token_source_scopes_source_idx ON api_token_source_scopes (source_id, source_class);

INSERT INTO schema_migrations (version) VALUES ('0002_cybermap_auth_registry');

COMMIT;
