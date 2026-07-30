import assert from 'node:assert/strict';
import test from 'node:test';

import { IngestError } from '../src/auth.mjs';
import { PostgresRaIDModelStore } from '../src/raid-model-store.mjs';

const FIXED_NOW = new Date('2026-07-29T12:00:00.000Z');
const HEX = 'a'.repeat(64);

class ScriptedClient {
  constructor(steps) {
    this.steps = [...steps];
    this.released = false;
  }

  async query(sql, values = []) {
    const step = this.steps.shift();
    assert.ok(step, `unexpected SQL: ${sql}`);
    assert.match(String(sql).replace(/\s+/g, ' ').trim(), step.sql);
    step.check?.(values, sql);
    return { rows: step.rows ?? [], rowCount: step.rows?.length ?? 0 };
  }

  release() {
    this.released = true;
    assert.equal(this.steps.length, 0, 'all transaction operations must be consumed');
  }
}

class TrainingPool {
  constructor(steps) {
    this.client = new ScriptedClient(steps);
  }

  async query() {
    throw new Error('claim must use one transaction client');
  }

  async connect() {
    return this.client;
  }
}

class EventPool {
  constructor(rows = [{ state: 'claimed', recorded_at: FIXED_NOW }]) {
    this.rows = rows;
    this.calls = [];
  }

  async query(sql, values = []) {
    this.calls.push({ sql, values });
    return { rows: this.rows, rowCount: this.rows.length };
  }

  async connect() {
    throw new Error('training event must use the pool query method');
  }
}

const examples = [
  reviewedExample({ example_id: 'example-001', hard_negative: true, class_id: 'person' }),
  reviewedExample({ example_id: 'example-002', hard_negative: false, class_id: 'vehicle' }),
];

test('Postgres lifecycle atomically claims only eligible reviewed examples into one immutable snapshot and queued job', async () => {
  const pool = new TrainingPool([
    { sql: /^BEGIN$/i },
    { sql: /SET LOCAL lock_timeout/i },
    { sql: /pg_advisory_xact_lock/i },
    { sql: /FROM raid_reviewed_training_examples[\s\S]*FOR UPDATE SKIP LOCKED/i, rows: examples },
    {
      sql: /INSERT INTO raid_dataset_snapshots/i,
      check(values) {
        assert.match(values[0], /^snapshot-/);
        assert.equal(values[1], 'weekly-reviewed-v1');
        assert.equal(values[2], 'raid-camera-v1');
        assert.deepEqual(JSON.parse(values[4]), ['example-001', 'example-002']);
      },
    },
    {
      sql: /INSERT INTO raid_dataset_snapshot_examples/i,
      check(values) {
        assert.match(values[0], /^snapshot-/);
        assert.deepEqual(JSON.parse(values[1]), ['example-001', 'example-002']);
      },
    },
    {
      sql: /INSERT INTO raid_training_jobs/i,
      check(values) {
        assert.match(values[0], /^training-job-/);
        assert.match(values[1], /^snapshot-/);
      },
    },
    { sql: /INSERT INTO raid_training_job_events \(job_id, event_type, receipt\)/i },
    { sql: /^COMMIT$/i },
  ]);
  const store = new PostgresRaIDModelStore({
    pool,
    now: () => FIXED_NOW,
    randomUuid: () => '00000000-0000-4000-8000-000000000001',
  });

  const result = await store.claimTrainingJob({
    policy: {
      policy_id: 'weekly-reviewed-v1',
      minimum_examples: 2,
      minimum_hard_negatives: 1,
      replay_corpus_id: 'open-general-replay-v1',
    },
  });

  assert.equal(result.snapshot.example_ids.length, 2);
  assert.equal(result.snapshot.taxonomy_revision, 'raid-camera-v1');
  assert.equal(result.job.state, 'queued');
  assert.equal(pool.client.released, true);
});

test('Postgres training-event persistence uses the migration event_type and receipt columns only', async () => {
  const pool = new EventPool();
  const store = new PostgresRaIDModelStore({ pool });

  const event = await store.recordTrainingJobEvent({
    jobId: 'training-job-001',
    state: 'claimed',
    receipt: { executor_receipt_sha256: HEX },
  });

  assert.equal(event.state, 'claimed');
  assert.deepEqual(event.receipt, { executor_receipt_sha256: HEX });
  assert.equal(pool.calls.length, 1);
  assert.match(pool.calls[0].sql, /INSERT INTO raid_training_job_events \(job_id, event_type, receipt\)/i);
  assert.match(pool.calls[0].sql, /RETURNING event_type AS state, recorded_at/i);
  assert.doesNotMatch(pool.calls[0].sql, /\bstate\b\s*,\s*event_receipt/i);
  assert.deepEqual(pool.calls[0].values, ['training-job-001', 'claimed', JSON.stringify({ executor_receipt_sha256: HEX })]);
});

test('Postgres training-event persistence rejects states not representable by the migration', async () => {
  const store = new PostgresRaIDModelStore({ pool: new EventPool() });
  await assert.rejects(
    store.recordTrainingJobEvent({ jobId: 'training-job-001', state: 'dispatched', receipt: { executor_receipt_sha256: HEX } }),
    (error) => error instanceof IngestError && error.code === 'invalid_training_event',
  );
});

function reviewedExample(overrides = {}) {
  return {
    example_id: 'example-000',
    taxonomy_revision: 'raid-camera-v1',
    rights_receipt_sha256: HEX,
    dedupe_key: 'capture-packet-000',
    class_id: 'person',
    hard_negative: false,
    eligible_at: new Date('2026-07-29T11:00:00.000Z'),
    ...overrides,
  };
}
