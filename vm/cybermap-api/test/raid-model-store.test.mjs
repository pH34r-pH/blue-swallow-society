import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { IngestError } from '../src/auth.mjs';
import { MemoryRaIDModelStore } from '../src/raid-model-store.mjs';
import { catalogRequest, release } from './raid-model-fixtures.mjs';

const credential = Object.freeze({
  device_id: 'wardriver-test-device',
  source_id: 'source-owned-device-1',
  source_class: 'owned_device',
  scopes: Object.freeze(['models:read', 'models:feedback:write']),
});

function feedback(overrides = {}) {
  return {
    schema_version: 'bss.raid.model_feedback.v1',
    feedback_id: 'feedback-20260729-0001',
    release_id: 'raid-general-20260729-0001',
    artifact_sha256: crypto.createHash('sha256').update('raid-model-artifact-v1').digest('hex'),
    verdict: 'bad',
    reason_codes: ['missed_target'],
    note: 'Missed the target.',
    app_version: '2.109.0',
    runtime_id: 'litert',
    runtime_version: '2.1.0',
    capture_reference: null,
    submitted_at: '2026-07-29T18:10:00.000Z',
    ...overrides,
  };
}

test('memory lifecycle store rejects a catalog release without retrievable artifact bytes', () => {
  const candidate = release();
  delete candidate.artifact_bytes;
  assert.throws(
    () => new MemoryRaIDModelStore({ releases: [candidate] }),
    /artifact bytes/i,
  );
});

test('memory lifecycle store excludes releases rejected by its configured trust verifier', async () => {
  const store = new MemoryRaIDModelStore({ releases: [release()], releaseVerifier: () => false });
  assert.deepEqual(await store.listCatalog({ compatibility: catalogRequest() }), []);
  await assert.rejects(
    store.getArtifact({ releaseId: 'raid-general-20260729-0001', compatibility: catalogRequest() }),
    (error) => error instanceof IngestError && error.code === 'model_release_not_available',
  );
});

test('memory lifecycle store fails closed when no release verifier is configured', async () => {
  const store = new MemoryRaIDModelStore({ releases: [release()] });
  assert.deepEqual(await store.listCatalog({ compatibility: catalogRequest() }), []);
});

test('memory lifecycle store returns only catalog-safe release metadata and exact eligible bytes', async () => {
  const model = release();
  const store = new MemoryRaIDModelStore({ releases: [model], releaseVerifier: () => true });

  const catalog = await store.listCatalog({ compatibility: catalogRequest() });
  assert.equal(catalog.length, 1);
  assert.equal(catalog[0].release_id, model.release_id);
  assert.equal('artifact_bytes' in catalog[0], false);

  const artifact = await store.getArtifact({ releaseId: model.release_id, compatibility: catalogRequest() });
  assert.deepEqual(artifact.bytes, model.artifact_bytes);
  assert.equal(artifact.artifact.sha256, model.artifact.sha256);
});

test('memory lifecycle store returns only bounded field revocation identifiers', async () => {
  const revoked = release({ revoked_at: '2026-07-29T19:00:00.000Z' });
  const store = new MemoryRaIDModelStore({ releases: [revoked] });
  assert.deepEqual(await store.listRevocations(), [revoked.release_id]);
});

test('memory lifecycle store records exact feedback replay and rejects changed idempotency content', async () => {
  const store = new MemoryRaIDModelStore({ releases: [release()], releaseVerifier: () => true });
  const first = await store.recordFeedback({ credential, feedback: feedback() });
  assert.equal(first.statusCode, 201);
  assert.equal(first.replayed, false);

  const replay = await store.recordFeedback({ credential, feedback: feedback() });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.receipt, first.receipt);

  await assert.rejects(
    store.recordFeedback({ credential, feedback: feedback({ note: 'Changed material under the same event ID.' }) }),
    (error) => error instanceof IngestError && error.code === 'idempotency_key_reused' && error.statusCode === 409,
  );
});

test('memory lifecycle store rejects feedback with an artifact digest other than the immutable release digest', async () => {
  const store = new MemoryRaIDModelStore({ releases: [release()], releaseVerifier: () => true });
  await assert.rejects(
    store.recordFeedback({ credential, feedback: feedback({ artifact_sha256: 'e'.repeat(64) }) }),
    (error) => error instanceof IngestError && error.code === 'model_artifact_mismatch' && error.statusCode === 422,
  );
});

test('memory lifecycle snapshot ordering matches durable eligible_at then example_id ordering', async () => {
  const now = () => new Date('2026-07-29T20:00:00.000Z');
  const store = new MemoryRaIDModelStore({
    now,
    reviewedExamples: [
      { example_id: 'capture-z', taxonomy_revision: 'raid-taxonomy-v1', rights_receipt: 'a'.repeat(64), dedupe_key: 'z', class_id: 'camera', hard_negative: true, eligible_at: '2026-07-29T18:00:00.000Z' },
      { example_id: 'capture-a', taxonomy_revision: 'raid-taxonomy-v1', rights_receipt: 'b'.repeat(64), dedupe_key: 'a', class_id: 'camera', hard_negative: false, eligible_at: '2026-07-29T18:01:00.000Z' },
    ],
  });
  const result = await store.claimTrainingJob({
    policy: { policy_id: 'ordering-policy-v1', minimum_examples: 2, minimum_hard_negatives: 1, replay_corpus_id: 'open-reviewed-v1' },
  });
  assert.deepEqual(result.snapshot.example_ids, ['capture-z', 'capture-a']);
});

test('memory lifecycle store atomically claims one immutable snapshot only after policy threshold is met', async () => {
  const now = () => new Date('2026-07-29T20:00:00.000Z');
  const store = new MemoryRaIDModelStore({
    now,
    releases: [release()],
    releaseVerifier: () => true,
    reviewedExamples: [
      { example_id: 'capture-a', taxonomy_revision: 'raid-taxonomy-v1', rights_receipt: 'a'.repeat(64), dedupe_key: 'a', class_id: 'camera', hard_negative: false, eligible_at: '2026-07-29T18:00:00.000Z' },
      { example_id: 'capture-b', taxonomy_revision: 'raid-taxonomy-v1', rights_receipt: 'b'.repeat(64), dedupe_key: 'b', class_id: 'camera', hard_negative: true, eligible_at: '2026-07-29T18:01:00.000Z' },
    ],
  });
  const policy = { policy_id: 'raid-policy-v1', minimum_examples: 2, minimum_hard_negatives: 1, replay_corpus_id: 'open-reviewed-v1' };

  const [left, right] = await Promise.all([
    store.claimTrainingJob({ policy, predecessorReleaseId: 'raid-general-20260729-0001' }),
    store.claimTrainingJob({ policy, predecessorReleaseId: 'raid-general-20260729-0001' }),
  ]);
  const claimed = [left, right].filter(Boolean);
  assert.equal(claimed.length, 1);
  assert.equal(claimed[0].job.state, 'queued');
  assert.deepEqual(claimed[0].snapshot.example_ids, ['capture-a', 'capture-b']);
  const dispatched = await store.recordTrainingJobEvent({
    jobId: claimed[0].job.job_id,
    state: 'claimed',
    receipt: { executor_receipt_sha256: 'd'.repeat(64) },
  });
  assert.equal(dispatched.state, 'claimed');
  assert.equal(dispatched.receipt.executor_receipt_sha256, 'd'.repeat(64));

  assert.equal(await store.claimTrainingJob({ policy, predecessorReleaseId: 'raid-general-20260729-0001' }), null);
});
