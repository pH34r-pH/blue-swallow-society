import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryObservationStore } from '../src/memory-store.mjs';
import { hashToken } from '../src/auth.mjs';
import { validBatch, validObservation, DEVICE_ID, INGEST_TOKEN } from './helpers.mjs';

const SOURCE_ID = 'source-owned-device-1';

function createStore() {
  return new MemoryObservationStore({
    credentials: [{
      device_id: DEVICE_ID,
      source_id: SOURCE_ID,
      source_class: 'owned_device',
      token_sha256: hashToken(INGEST_TOKEN),
      scopes: ['observations:write'],
      enabled: true,
    }],
    now: () => new Date('2026-09-06T20:00:00.000Z'),
    randomUuid: (() => {
      let index = 0;
      return () => `00000000-0000-4000-8000-${String(++index).padStart(12, '0')}`;
    })(),
  });
}

async function credentialFor(store) {
  return store.authenticate({
    deviceId: DEVICE_ID,
    token: INGEST_TOKEN,
    requiredScope: 'observations:write',
  });
}

function recoveryBatch(idempotencyKey) {
  return validBatch({
    idempotency_key: idempotencyKey,
    observations: [validObservation({
      external_observation_key: 'wardriver-observation:42',
    })],
  });
}

test('v1 recovery upload needs no progress object and stores a Wardriver row once', async () => {
  const store = createStore();
  const credential = await credentialFor(store);
  const batch = recoveryBatch('batch-00000000-0000-4000-8000-000000000042');

  assert.equal(batch.schema_version, 'bss.observation_batch.v1');
  assert.equal(Object.hasOwn(batch, 'progress'), false);

  const first = await store.applyBatch({ credential, batch });
  assert.equal(first.statusCode, 201);
  assert.equal(first.receipt.schema_version, 'bss.sync_receipt.v1');
  assert.equal(first.receipt.accepted_count, 1);
  assert.equal(first.receipt.duplicate_count, 0);
  assert.equal(Object.hasOwn(first.receipt, 'progress'), false);
});

test('same SQLite observation replayed under a new batch key is a duplicate', async () => {
  const store = createStore();
  const credential = await credentialFor(store);

  const first = await store.applyBatch({
    credential,
    batch: recoveryBatch('batch-00000000-0000-4000-8000-000000000042'),
  });
  const replayWithNewBatch = await store.applyBatch({
    credential,
    batch: recoveryBatch('batch-00000000-0000-4000-8000-000000000043'),
  });

  assert.equal(first.receipt.accepted_count, 1);
  assert.equal(replayWithNewBatch.statusCode, 201);
  assert.equal(replayWithNewBatch.replayed, false);
  assert.equal(replayWithNewBatch.receipt.accepted_count, 0);
  assert.equal(replayWithNewBatch.receipt.duplicate_count, 1);
});

test('exact batch retry returns the original receipt', async () => {
  const store = createStore();
  const credential = await credentialFor(store);
  const batch = recoveryBatch('batch-00000000-0000-4000-8000-000000000044');

  const first = await store.applyBatch({ credential, batch });
  const replay = await store.applyBatch({ credential, batch });

  assert.equal(first.statusCode, 201);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.receipt, first.receipt);
});
