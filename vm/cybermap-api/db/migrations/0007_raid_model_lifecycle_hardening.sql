BEGIN;

-- A release manifest is not catalog-eligible unless the immutable bytes have the
-- exact declared size and SHA-256. Keep this at the write boundary and retain a
-- read-side check in the store for rows that predate this migration.
CREATE OR REPLACE FUNCTION validate_raid_model_artifact()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  expected_size bigint;
  expected_sha256 text;
BEGIN
  SELECT artifact_size_bytes, artifact_sha256
    INTO expected_size, expected_sha256
    FROM raid_model_releases
   WHERE release_id = NEW.release_id
   FOR KEY SHARE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'RaID model artifact references an unknown release';
  END IF;

  IF octet_length(NEW.artifact_bytes) <> expected_size
      OR encode(digest(NEW.artifact_bytes, 'sha256'), 'hex') <> expected_sha256 THEN
    RAISE EXCEPTION 'RaID model artifact does not match immutable release evidence';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER raid_model_artifacts_validate_before_insert
BEFORE INSERT ON raid_model_artifacts
FOR EACH ROW EXECUTE FUNCTION validate_raid_model_artifact();

INSERT INTO schema_migrations (version) VALUES ('0007_raid_model_lifecycle_hardening');

COMMIT;
