import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryObservationStore } from '../src/memory-store.mjs';
import { hashToken } from '../src/auth.mjs';
import { validBatch, validObservation, DEVICE_ID, INGEST_TOKEN } from './helpers.mjs';

function createStore() {
  return new MemoryObservationStore({
    credentials: [{
      device_id: DEVICE_ID,
      source_id: 'source-owned-device-1',
      source_class: 'owned_device',
      token_sha256: hashToken(INGEST_TOKEN),
      scopes: ['observations:write'],
      enabled: true,
    }],
    now: () => new Date('2026-07-11T18:43:00.000Z'),
    randomUuid: (() => {
      let index = 0;
      return () => `00000000-0000-4000-8000-${String(++index).padStart(12, '0')}`;
    })(),
  });
}

test('authenticates an enrolled device without retaining the raw token', async () => {
  const store = createStore();
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });
  assert.equal(credential.source_id, 'source-owned-device-1');
  assert.equal(JSON.stringify(store).includes(INGEST_TOKEN), false);
  await assert.rejects(
    store.authenticate({ deviceId: DEVICE_ID, token: 'wrong-token-value', requiredScope: 'observations:write' }),
    (error) => error.code === 'forbidden',
  );
});

test('returns only bounded catalog-approved aggregate global cells from memory materialization', async () => {
  const store = new MemoryObservationStore({
    globalSources: [
      {
        layer_id: 'usgs-earthquakes',
        source_class: 'green_public',
        enabled: true,
        global_layer: true,
        terms_reviewed_at: '2026-07-22T00:00:00.000Z',
        allowed_preload: true,
      },
      {
        layer_id: 'orange-exposure',
        source_class: 'orange_exposure',
        enabled: true,
        global_layer: true,
        terms_reviewed_at: '2026-07-22T00:00:00.000Z',
        allowed_preload: true,
      },
      {
        layer_id: 'disabled-greenfeed',
        source_class: 'green_public',
        enabled: false,
        global_layer: true,
        terms_reviewed_at: '2026-07-22T00:00:00.000Z',
        allowed_preload: true,
      },
    ],
    globalCells: [
      {
        h3_cell: '872830828ffffff',
        resolution: 7,
        centroid: { lat: 47.61, lon: -122.33 },
        source_classes: ['green_public'],
        observation_count: 12,
        entity_count: 0,
        first_seen_at: '2026-07-22T19:00:00.000Z',
        last_seen_at: '2026-07-22T19:55:00.000Z',
        layers: { 'usgs-earthquakes': { observation_count: 12 } },
        freshness: { 'usgs-earthquakes': { state: 'fresh', age_seconds: 300 } },
        caveats: ['public_report_not_local_observation'],
        salience: 0.9,
        payload: { bssid: '00:11:22:33:44:55' },
      },
      {
        h3_cell: '872830829ffffff',
        resolution: 7,
        centroid: { lat: 47.62, lon: -122.34 },
        source_classes: ['green_public'],
        observation_count: 4,
        entity_count: 0,
        first_seen_at: '2026-07-22T19:00:00.000Z',
        last_seen_at: '2026-07-22T19:50:00.000Z',
        layers: { 'usgs-earthquakes': { observation_count: 4 } },
        freshness: { 'usgs-earthquakes': { state: 'fresh', age_seconds: 600 } },
        caveats: [],
        salience: 0.2,
      },
      {
        h3_cell: '87283082affffff',
        resolution: 7,
        centroid: { lat: 47.61, lon: -122.33 },
        source_classes: ['orange_exposure'],
        observation_count: 99,
        entity_count: 0,
        first_seen_at: '2026-07-22T19:00:00.000Z',
        last_seen_at: '2026-07-22T19:59:00.000Z',
        layers: { 'orange-exposure': { observation_count: 99 } },
        freshness: { 'orange-exposure': { state: 'fresh', age_seconds: 60 } },
        caveats: [],
        salience: 1,
      },
      {
        h3_cell: '87283082bffffff',
        resolution: 7,
        centroid: { lat: 46.61, lon: -122.33 },
        source_classes: ['green_public'],
        observation_count: 4,
        entity_count: 0,
        first_seen_at: '2026-07-22T19:00:00.000Z',
        last_seen_at: '2026-07-22T19:50:00.000Z',
        layers: { 'usgs-earthquakes': { observation_count: 4 } },
        freshness: { 'usgs-earthquakes': { state: 'fresh', age_seconds: 600 } },
        caveats: [],
        salience: 0.8,
      },
    ],
    now: () => new Date('2026-07-22T20:00:00.000Z'),
  });

  const response = await store.queryGlobalViewport({
    bbox: { west: -123, south: 47, east: -122, north: 48 },
    zoom: 7,
    layer_ids: ['usgs-earthquakes', 'orange-exposure', 'disabled-greenfeed'],
    since: '2026-07-21T00:00:00.000Z',
    max_cells: 1,
  });

  assert.equal(response.selected_resolution, 7);
  assert.equal(response.aggregation_applied, false);
  assert.equal(response.cells.length, 1);
  assert.deepEqual(response.cells[0], {
    h3_cell: '872830828ffffff',
    resolution: 7,
    centroid: { lat: 47.61, lon: -122.33 },
    source_classes: ['green_public'],
    observation_count: 12,
    entity_count: 0,
    first_seen_at: '2026-07-22T19:00:00.000Z',
    last_seen_at: '2026-07-22T19:55:00.000Z',
    layers: { 'usgs-earthquakes': { observation_count: 12 } },
    freshness: { 'usgs-earthquakes': { state: 'fresh', age_seconds: 300 } },
    caveats: ['public_report_not_local_observation'],
    salience: 0.9,
  });
  assert.equal('payload' in response.cells[0], false);
});

test('applies a batch once and replays the identical stored receipt', async () => {
  const store = createStore();
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });
  const batch = validBatch();

  const first = await store.applyBatch({ credential, batch });
  const replay = await store.applyBatch({ credential, batch: structuredClone(batch) });

  assert.equal(first.replayed, false);
  assert.equal(first.statusCode, 201);
  assert.equal(first.receipt.status, 'applied');
  assert.equal(first.receipt.accepted_count, 1);
  assert.equal(replay.replayed, true);
  assert.equal(replay.statusCode, 200);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(store.observationCount(), 1);
  assert.equal(store.batchCount(), 1);
});

test('rejects reuse of a batch key with changed content', async () => {
  const store = createStore();
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });
  const first = validBatch();
  await store.applyBatch({ credential, batch: first });

  const changed = validBatch({ observations: [validObservation({ confidence: 0.4 })] });
  await assert.rejects(
    store.applyBatch({ credential, batch: changed }),
    (error) => error.code === 'idempotency_key_reused',
  );
  assert.equal(store.observationCount(), 1);
});

test('observation idempotency includes persisted batch semantics', async () => {
  const store = createStore();
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });
  await store.applyBatch({ credential, batch: validBatch() });

  await assert.rejects(
    store.applyBatch({
      credential,
      batch: validBatch({
        idempotency_key: 'batch-00000000-0000-4000-8000-000000000003',
        retention_class: 'summary_only',
      }),
    }),
    (error) => error.code === 'observation_key_reused',
  );
});

test('paper snapshots replay only exact key/payload pairs and reject older or equal-time changed state', async () => {
  const store = createStore();
  const firstState = {
    generated_at: '2026-07-11T18:43:00.000Z',
    paper_only: true,
    sequence: 1,
  };
  const first = await store.putPaperState({ idempotencyKey: 'paper-key-1', state: firstState });
  const replay = await store.putPaperState({ idempotencyKey: 'paper-key-1', state: structuredClone(firstState) });
  assert.equal(first.statusCode, 201);
  assert.equal(first.replayed, false);
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.replayed, true);

  await assert.rejects(
    store.putPaperState({
      idempotencyKey: 'paper-key-older',
      state: { ...firstState, generated_at: '2026-07-11T18:42:59.999Z' },
    }),
    (error) => error.code === 'stale_paper_state' && error.statusCode === 409,
  );
  await assert.rejects(
    store.putPaperState({
      idempotencyKey: 'paper-key-equal-changed',
      state: { ...firstState, sequence: 2 },
    }),
    (error) => error.code === 'paper_state_conflict' && error.statusCode === 409,
  );
  assert.deepEqual((await store.getPaperState()).state, firstState);
});

test('counts an exact observation replay under a new batch and rejects changed-content key reuse', async () => {
  const store = createStore();
  const credential = await store.authenticate({ deviceId: DEVICE_ID, token: INGEST_TOKEN, requiredScope: 'observations:write' });
  await store.applyBatch({ credential, batch: validBatch() });

  const duplicate = await store.applyBatch({ credential, batch: validBatch({ idempotency_key: 'batch-00000000-0000-4000-8000-000000000002' }) });
  assert.equal(duplicate.receipt.accepted_count, 0);
  assert.equal(duplicate.receipt.duplicate_count, 1);
  assert.equal(store.observationCount(), 1);

  await assert.rejects(
    store.applyBatch({
      credential,
      batch: validBatch({
        idempotency_key: 'batch-00000000-0000-4000-8000-000000000003',
        observations: [validObservation({ confidence: 0.2 })],
      }),
    }),
    (error) => error.code === 'observation_key_reused',
  );
  assert.equal(store.batchCount(), 2);
});
