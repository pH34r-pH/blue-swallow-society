BEGIN;

-- V2 receipts let an authenticated Wardriver client settle an exact staged
-- batch after loss/replay without claiming a client-selected high-water mark.
-- `observations` remains untouched and append-only. A changed V2 identity is
-- recorded only as a first-writer-wins receipt count; it never mutates ledger
-- content.
ALTER TABLE sync_batches
  ADD COLUMN preserved_conflict_count integer NOT NULL DEFAULT 0;

ALTER TABLE sync_batches
  DROP CONSTRAINT sync_batches_receipt_counts_nonnegative,
  DROP CONSTRAINT sync_batches_applied_receipt_complete;

ALTER TABLE sync_batches
  ADD CONSTRAINT sync_batches_receipt_counts_nonnegative
  CHECK (
    accepted_count >= 0
    AND rejected_count >= 0
    AND duplicate_count >= 0
    AND preserved_conflict_count >= 0
  ),
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
      AND jsonb_typeof(receipt -> 'accepted_count') = 'number'
      AND jsonb_typeof(receipt -> 'rejected_count') = 'number'
      AND jsonb_typeof(receipt -> 'duplicate_count') = 'number'
      AND jsonb_typeof(receipt -> 'validation_errors') = 'array'
      AND jsonb_array_length(receipt -> 'validation_errors') = 0
      AND receipt ->> 'server_batch_id' = id::text
      AND receipt ->> 'idempotency_key' = idempotency_key
      AND receipt ->> 'status' = status
      AND (receipt ->> 'server_clock')::timestamptz = completed_at
      AND (receipt ->> 'accepted_count')::integer = accepted_count
      AND (receipt ->> 'rejected_count')::integer = rejected_count
      AND (receipt ->> 'duplicate_count')::integer = duplicate_count
      AND (
        (
          receipt ->> 'schema_version' = 'bss.sync_receipt.v1'
          AND preserved_conflict_count = 0
          AND accepted_count + rejected_count + duplicate_count = observation_count
        )
        OR (
          receipt ->> 'schema_version' = 'bss.sync_receipt.v2'
          AND receipt ?& ARRAY['preserved_conflict_count', 'progress']
          AND jsonb_typeof(receipt -> 'preserved_conflict_count') = 'number'
          AND jsonb_typeof(receipt -> 'progress') = 'object'
          AND (receipt -> 'progress') ?& ARRAY['schema_version', 'acknowledged_through']
          AND receipt -> 'progress' ->> 'schema_version' = 'bss.wardriver_progress.v1'
          AND receipt -> 'progress' ->> 'acknowledged_through' ~ '^[1-9][0-9]{0,18}$'
          AND (receipt ->> 'preserved_conflict_count')::integer = preserved_conflict_count
          AND accepted_count + rejected_count + duplicate_count + preserved_conflict_count = observation_count
        )
      )
    )
  );

COMMENT ON COLUMN sync_batches.preserved_conflict_count IS
  'V2 first-writer-wins no-op count. It is receipt-bound and never authorizes an observation mutation.';

INSERT INTO schema_migrations (version) VALUES ('0006_best_effort_observation_progress');

COMMIT;
