BEGIN;

-- Add explicit materialization provenance to cybermap_cells for read API projections.
-- 0001 is already immutable for provisioned VM databases, so keep this additive.
ALTER TABLE cybermap_cells
  ADD COLUMN IF NOT EXISTS provenance jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS cybermap_cells_provenance_gin
  ON cybermap_cells USING gin (provenance jsonb_path_ops);

INSERT INTO schema_migrations (version) VALUES ('0003_cybermap_cells_provenance');

COMMIT;
