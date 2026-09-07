import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { validateObservationBatch } from '../src/contracts.mjs';
import { MemoryObservationStore } from '../src/memory-store.mjs';
import { hashToken } from '../src/auth.mjs';

const fixtureUrl = new URL('./fixtures/wardriver-observation-batch-v1.json', import.meta.url);
const DEVICE_ID = 'wardriver-test-device';
const INGEST_TOKEN = 'test-ingest-token-32-bytes-minimum-value';

async function loadFixture() {
  return JSON.parse(await readFile(fixtureUrl, 'utf8'));
}

function credential() {
  return Object.freeze({
    device_id: DEVICE_ID,
    source_id: 'wardriver-owned-device',
    source_class: 'owned_device',
    token_sha256: hashToken(INGEST_TOKEN),
    scopes: ['observations:write'],
    enabled: true,
  });
}

test('Wardriver golden v1 batch is accepted without progress state', async () => {
  const raw = await loadFixture();
  assert.equal(raw.schema_version, 'bss.observation_batch.v1');
  assert.equal(Object.hasOwn(raw, 'progress'), false);

  const batch = validateObservationBatch(raw, { now: Date.parse('2026-09-07T00:00:00Z') });
  assert.equal(batch.observations.length, 1);
  assert.equal(batch.observations[0].external_observation_key, 'wardriver-observation:42');
});

test('Wardriver golden observation is replay-safe across a fresh batch key', async () => {
  const raw = await loadFixture();
  const first = validateObservationBatch(raw, { now: Date.parse('2026-09-07T00:00:00Z') });
  const store = new MemoryObservationStore({ credentials: [credential()] });
  const auth = await store.authenticate({
    deviceId: DEVICE_ID,
    token: INGEST_TOKEN,
    requiredScope: 'observations:write',
  });

  const applied = await store.applyBatch({ credential: auth, batch: first });
  assert.equal(applied.statusCode, 201);
  assert.equal(applied.receipt.accepted_count, 1);
  assert.equal(applied.receipt.duplicate_count, 0);

  const replayRaw = structuredClone(raw);
  replayRaw.idempotency_key = 'batch-00000000-0000-4000-8000-000000000043';
  const replay = validateObservationBatch(replayRaw, { now: Date.parse('2026-09-07T00:00:00Z') });
  const duplicate = await store.applyBatch({ credential: auth, batch: replay });

  assert.equal(duplicate.statusCode, 201);
  assert.equal(duplicate.receipt.accepted_count, 0);
  assert.equal(duplicate.receipt.duplicate_count, 1);
});
