import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertProofDatabaseCounts,
  normalizeProofDatabaseCounts,
  parseProofDatabaseCounts,
} from '../local-proof/proof-count-contract.mjs';

function proofCounts({ desktopSourceCount = 1, credentialCount = 1, syncBatchCount = 0, observationCount = 0 } = {}) {
  return {
    desktop_source_count: desktopSourceCount,
    desktop_credential_count: credentialCount,
    sync_batch_count: syncBatchCount,
    observation_count: observationCount,
  };
}

test('local proof database count contract is closed and exact', () => {
  const empty = normalizeProofDatabaseCounts(proofCounts());
  assert.deepEqual(empty, proofCounts());
  assert.deepEqual(parseProofDatabaseCounts('{"desktop_source_count":1,"desktop_credential_count":1,"sync_batch_count":1,"observation_count":1}\n'),
    proofCounts({ syncBatchCount: 1, observationCount: 1 }));

  assert.doesNotThrow(() => assertProofDatabaseCounts(empty, {
    desktopSourceCount: 1,
    credentialCount: 1,
    syncBatchCount: 0,
    observationCount: 0,
    phase: 'preflight',
  }));
  assert.doesNotThrow(() => assertProofDatabaseCounts(proofCounts({ syncBatchCount: 1, observationCount: 1 }), {
    desktopSourceCount: 1,
    credentialCount: 1,
    syncBatchCount: 1,
    observationCount: 1,
    phase: 'post-replay',
  }));

  assert.throws(() => normalizeProofDatabaseCounts({ ...proofCounts(), extra: true }));
  assert.throws(() => assertProofDatabaseCounts(proofCounts({ desktopSourceCount: 2 }), {
    desktopSourceCount: 1,
    credentialCount: 1,
    syncBatchCount: 0,
    observationCount: 0,
    phase: 'preflight',
  }));
  assert.throws(() => normalizeProofDatabaseCounts({ ...proofCounts(), sync_batch_count: -1 }));
  assert.throws(() => parseProofDatabaseCounts('not-json'));
  assert.throws(() => assertProofDatabaseCounts(proofCounts({ syncBatchCount: 2, observationCount: 1 }), {
    desktopSourceCount: 1,
    credentialCount: 1,
    syncBatchCount: 1,
    observationCount: 1,
    phase: 'post-replay',
  }));
});
