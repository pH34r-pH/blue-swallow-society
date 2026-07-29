import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryObservationStore } from '../vm/cybermap-api/src/memory-store.mjs';
import { hashToken } from '../vm/cybermap-api/src/auth.mjs';
import { DEVICE_ID, INGEST_TOKEN, validBatch, validObservation } from '../vm/cybermap-api/test/helpers.mjs';
import { mergeWigleRecords } from '../api/_private/operator/assets/wigle.mjs';

const SOURCE_ID = 'source-owned-device-1';
const SECONDARY_DEVICE_ID = 'wardriver-secondary-device';
const SECONDARY_TOKEN = `${INGEST_TOKEN}:secondary`;

function credential(deviceId, token) {
  return {
    device_id: deviceId,
    source_id: SOURCE_ID,
    source_class: 'owned_device',
    token_sha256: hashToken(token),
    scopes: ['observations:write'],
    enabled: true,
  };
}

function bleBatch({ deviceId, idempotencyKey }) {
  return validBatch({
    device_id: deviceId,
    idempotency_key: idempotencyKey,
    observations: [validObservation({
      external_observation_key: 'scan-42:ble:1',
      kind: 'ble_device',
      payload: { manufacturer_data_hash: 'hmac-sha256:ble-device' },
    })],
  });
}

test('device-scoped observation identities remain distinct through the viewport/operator merge path', async () => {
  const store = new MemoryObservationStore({
    credentials: [credential(DEVICE_ID, INGEST_TOKEN), credential(SECONDARY_DEVICE_ID, SECONDARY_TOKEN)],
    now: () => new Date('2026-07-29T18:43:00.000Z'),
  });
  const primary = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });
  const secondary = await store.authenticate({ deviceId: SECONDARY_DEVICE_ID, token: SECONDARY_TOKEN, requiredScope: 'observations:write' });

  await store.applyBatch({
    credential: primary,
    batch: bleBatch({ deviceId: DEVICE_ID, idempotencyKey: 'batch-00000000-0000-4000-8000-000000000001' }),
  });
  await store.applyBatch({
    credential: secondary,
    batch: bleBatch({ deviceId: SECONDARY_DEVICE_ID, idempotencyKey: 'batch-00000000-0000-4000-8000-000000000002' }),
  });

  const viewport = await store.queryViewport({ lat: 47.6062, lon: -122.3321 });
  assert.equal(viewport.totalResults, 2);
  assert.equal(new Set(viewport.accessPoints.map((record) => record.id)).size, 2);
  assert.equal(mergeWigleRecords(viewport.accessPoints).length, 2);
});
