import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { IngestError } from '../src/auth.mjs';
import { PostgresRaIDModelStore } from '../src/raid-model-store.mjs';
import { release } from './raid-model-fixtures.mjs';

class FeedbackClient {
  constructor(releaseRecord, { hasArtifact = true } = {}) {
    this.releaseRecord = releaseRecord;
    this.hasArtifact = hasArtifact;
    this.calls = [];
    this.released = false;
  }

  async query(sql, values = []) {
    this.calls.push({ sql, values });
    if (/^BEGIN$/i.test(sql) || /^COMMIT$/i.test(sql) || /^ROLLBACK$/i.test(sql)
        || /SET LOCAL/i.test(sql) || /pg_advisory_xact_lock/i.test(sql)) return { rows: [] };
    if (/FROM raid_model_releases/i.test(sql)) {
      assert.match(sql, /JOIN raid_model_artifacts AS artifact/i);
      assert.match(sql, /octet_length\(artifact\.artifact_bytes\) = release\.artifact_size_bytes/i);
      assert.match(sql, /encode\(digest\(artifact\.artifact_bytes, 'sha256'\), 'hex'\) = release\.artifact_sha256/i);
      return { rows: this.hasArtifact ? [{ release: withoutArtifactBytes(this.releaseRecord) }] : [] };
    }
    if (/FROM raid_model_feedback/i.test(sql)) return { rows: [] };
    if (/INSERT INTO raid_model_feedback/i.test(sql)) {
      return { rows: [{ feedback_receipt_id: '00000000-0000-4000-8000-000000000001', recorded_at: '2026-07-29T18:11:00.000Z' }] };
    }
    throw new Error(`unexpected SQL: ${sql}`);
  }

  release() { this.released = true; }
}

class FeedbackPool {
  constructor(releaseRecord, options) { this.client = new FeedbackClient(releaseRecord, options); }
  async connect() { return this.client; }
  async query() { throw new Error('feedback must use its transaction client'); }
}

function withoutArtifactBytes(value) { const { artifact_bytes: _bytes, ...metadata } = value; return metadata; }
function feedback() {
  return {
    schema_version: 'bss.raid.model_feedback.v1', feedback_id: 'feedback-20260729-0001',
    release_id: 'raid-general-20260729-0001', artifact_sha256: crypto.createHash('sha256').update('raid-model-artifact-v1').digest('hex'),
    verdict: 'bad', reason_codes: ['missed_target'], note: 'Missed target.', app_version: '2.109.0',
    runtime_id: 'litert', runtime_version: '2.1.0', capture_reference: null, submitted_at: '2026-07-29T18:10:00.000Z',
  };
}

function trustedStore(pool) {
  return new PostgresRaIDModelStore({ pool, randomUuid: () => 'unused', releaseVerifier: () => true });
}

test('Postgres feedback serializes the first idempotency write and requires a digest-matching backing artifact', async () => {
  const pool = new FeedbackPool(release());
  const result = await trustedStore(pool).recordFeedback({
    credential: { source_id: 'source-owned-device-1', device_id: 'wardriver-test-device' }, feedback: feedback(),
  });
  assert.equal(result.statusCode, 201);
  const lock = pool.client.calls.find((call) => /pg_advisory_xact_lock/i.test(call.sql));
  assert.ok(lock);
  assert.match(lock.values[0], /source-owned-device-1\u0000wardriver-test-device\u0000feedback-20260729-0001/);
  assert.ok(pool.client.calls.findIndex((call) => /pg_advisory_xact_lock/i.test(call.sql))
    < pool.client.calls.findIndex((call) => /FROM raid_model_feedback/i.test(call.sql)));
  assert.equal(pool.client.released, true);
});

test('Postgres feedback rejects a release with no immutable backing artifact', async () => {
  const pool = new FeedbackPool(release(), { hasArtifact: false });
  await assert.rejects(
    trustedStore(pool).recordFeedback({
      credential: { source_id: 'source-owned-device-1', device_id: 'wardriver-test-device' }, feedback: feedback(),
    }),
    (error) => error instanceof IngestError && error.code === 'model_release_not_available' && error.statusCode === 404,
  );
  assert.ok(pool.client.calls.some((call) => /^ROLLBACK$/i.test(call.sql)));
  assert.equal(pool.client.released, true);
});
