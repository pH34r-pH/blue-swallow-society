import assert from 'node:assert/strict';
import test from 'node:test';

import { dispatchEligibleTraining } from '../src/raid-training-dispatch.mjs';

const policy = Object.freeze({
  policy_id: 'raid-general-v1',
  minimum_examples: 100,
  minimum_hard_negatives: 20,
  taxonomy_revision: 'raid-camera-v1',
  replay_corpus_id: 'general-replay-v1',
});

test('dispatches one claimed immutable job with a non-shell command and records an append-only event', async () => {
  const calls = [];
  const store = {
    async claimTrainingJob(input) { calls.push(['claim', input]); return { job_id: 'training-job-001', snapshot_id: 'snapshot-001' }; },
    async recordTrainingJobEvent(input) { calls.push(['event', input]); },
  };
  const result = await dispatchEligibleTraining({
    store, policy, command: ['python3', '/opt/raid/train.py'],
    runCommand: async input => { calls.push(['run', input]); return { exit_code: 0, receipt_sha256: 'a'.repeat(64) }; },
  });

  assert.deepEqual(result, { status: 'dispatched', job_id: 'training-job-001' });
  assert.deepEqual(calls[0], ['claim', { policy, predecessorReleaseId: null }]);
  assert.deepEqual(calls[1][1], { command: ['python3', '/opt/raid/train.py'], job: { job_id: 'training-job-001', snapshot_id: 'snapshot-001' } });
  assert.deepEqual(calls[2], ['event', { jobId: 'training-job-001', state: 'claimed', receipt: { executor_receipt_sha256: 'a'.repeat(64) } }]);
});

test('does not claim a job when the executor command is absent and remains silent below the threshold', async () => {
  let claimed = false;
  const store = { async claimTrainingJob() { claimed = true; return null; } };
  await assert.rejects(() => dispatchEligibleTraining({ store, policy, command: [] }), /executor command/);
  assert.equal(claimed, false);
  const result = await dispatchEligibleTraining({ store, policy, command: ['runner'], runCommand: async () => { throw new Error('must not run'); } });
  assert.deepEqual(result, { status: 'not_eligible' });
});
