import test from 'node:test';
import assert from 'node:assert/strict';

import { createCybermapApiServer } from '../src/server.mjs';
import { MemoryObservationStore } from '../src/memory-store.mjs';
import { hashToken } from '../src/auth.mjs';
import { DEVICE_ID, INGEST_TOKEN, ingestHeaders, validBatch, validObservation, withServer } from './helpers.mjs';

function makeServer() {
  const store = new MemoryObservationStore({
    credentials: [{
      device_id: DEVICE_ID,
      source_id: 'source-owned-device-1',
      source_class: 'owned_device',
      token_sha256: hashToken(INGEST_TOKEN),
      scopes: ['observations:write'],
      enabled: true,
    }],
    now: () => new Date('2026-07-11T18:43:00.000Z'),
    randomUuid: () => '00000000-0000-4000-8000-000000000001',
  });
  return { store, server: createCybermapApiServer({ store, now: () => Date.parse('2026-07-11T18:43:00.000Z') }) };
}

class SlowApplyStore extends MemoryObservationStore {
  async applyBatch(args) {
    await new Promise((resolve) => setTimeout(resolve, 75));
    return super.applyBatch(args);
  }
}

test('health and readiness expose no credential material', async () => {
  const { server } = makeServer();
  await withServer(server, async (baseUrl) => {
    const health = await fetch(`${baseUrl}/healthz`);
    assert.equal(health.status, 200);
    assert.deepEqual(await health.json(), { ok: true, service: 'bss-cybermap-api' });

    const ready = await fetch(`${baseUrl}/readyz`);
    assert.equal(ready.status, 200);
    assert.deepEqual(await ready.json(), { ok: true, database: 'ready', migrations: 'ready' });
  });
});

test('requires ingest authentication and matching header/body identities', async () => {
  const { server } = makeServer();
  await withServer(server, async (baseUrl) => {
    const batch = validBatch();
    const anonymous = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(batch),
    });
    assert.equal(anonymous.status, 403);
    assert.deepEqual(await anonymous.json(), { ok: false, error: 'forbidden' });

    const mismatch = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: ingestHeaders(batch, { 'idempotency-key': 'different-key' }),
      body: JSON.stringify(batch),
    });
    assert.equal(mismatch.status, 400);
    assert.equal((await mismatch.json()).error, 'idempotency_key_mismatch');

    const unsafe = validBatch({ observations: [validObservation({ payload: { raw_frame: 'forbidden' } })] });
    const invalidCredential = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: ingestHeaders(unsafe, { 'x-blue-swallow-ingest-token': 'invalid-token-value' }),
      body: JSON.stringify(unsafe),
    });
    assert.equal(invalidCredential.status, 403);
    assert.deepEqual(await invalidCredential.json(), { ok: false, error: 'forbidden' });
  });
});

test('accepts one authenticated batch and marks exact replay without creating duplicates', async () => {
  const { server, store } = makeServer();
  await withServer(server, async (baseUrl) => {
    const batch = validBatch();
    const first = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: ingestHeaders(batch),
      body: JSON.stringify(batch),
    });
    assert.equal(first.status, 201);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    assert.equal(first.headers.get('idempotent-replayed'), 'false');
    const firstReceipt = await first.json();
    assert.equal(firstReceipt.accepted_count, 1);

    const replay = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: ingestHeaders(batch),
      body: JSON.stringify(batch),
    });
    assert.equal(replay.status, 200);
    assert.equal(replay.headers.get('idempotent-replayed'), 'true');
    assert.deepEqual(await replay.json(), firstReceipt);
    assert.equal(store.observationCount(), 1);
  });
});

test('returns conflict for changed payload under the same batch or observation key', async () => {
  const { server } = makeServer();
  await withServer(server, async (baseUrl) => {
    const firstBatch = validBatch();
    await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: ingestHeaders(firstBatch), body: JSON.stringify(firstBatch),
    });

    const reusedBatch = validBatch({ observations: [validObservation({ confidence: 0.3 })] });
    const batchConflict = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: ingestHeaders(reusedBatch), body: JSON.stringify(reusedBatch),
    });
    assert.equal(batchConflict.status, 409);
    assert.equal((await batchConflict.json()).error, 'idempotency_key_reused');

    const reusedObservation = validBatch({
      idempotency_key: 'batch-00000000-0000-4000-8000-000000000002',
      observations: [validObservation({ confidence: 0.3 })],
    });
    const observationConflict = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: ingestHeaders(reusedObservation), body: JSON.stringify(reusedObservation),
    });
    assert.equal(observationConflict.status, 409);
    assert.equal((await observationConflict.json()).error, 'observation_key_reused');
  });
});

test('rejects unsupported content types and oversized bodies while accepting passive observation payloads', async () => {
  const { server } = makeServer();
  await withServer(server, async (baseUrl) => {
    const batch = validBatch();
    const unsupported = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: ingestHeaders(batch, { 'content-type': 'text/plain' }), body: JSON.stringify(batch),
    });
    assert.equal(unsupported.status, 415);

    const passive = validBatch({ observations: [validObservation({ payload: { bssid: '00:11:22:33:44:55', ssid: 'Public Broadcast Name', raw_frame: 'base64:management' } })] });
    const passiveResponse = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST', headers: ingestHeaders(passive), body: JSON.stringify(passive),
    });
    assert.equal(passiveResponse.status, 201);

    const oversizedBody = JSON.stringify({ padding: 'x'.repeat(1_048_577) });
    const oversized = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: {
        ...ingestHeaders(batch),
        'content-length': String(Buffer.byteLength(oversizedBody)),
      },
      body: oversizedBody,
    });
    assert.equal(oversized.status, 413);
  });
});

test('bounds authenticated ingest execution before a slow store can pin a request', async () => {
  const store = new SlowApplyStore({
    credentials: [{
      device_id: DEVICE_ID,
      source_id: 'source-owned-device-1',
      source_class: 'owned_device',
      token_sha256: hashToken(INGEST_TOKEN),
      scopes: ['observations:write'],
      enabled: true,
    }],
    now: () => new Date('2026-07-11T18:43:00.000Z'),
    randomUuid: () => '00000000-0000-4000-8000-000000000001',
  });
  const server = createCybermapApiServer({
    store,
    now: () => Date.parse('2026-07-11T18:43:00.000Z'),
    ingestDeadlineMs: 10,
  });

  await withServer(server, async (baseUrl) => {
    const batch = validBatch();
    const response = await fetch(`${baseUrl}/api/v1/observations/batch`, {
      method: 'POST',
      headers: ingestHeaders(batch),
      body: JSON.stringify(batch),
    });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).error, 'ingest_deadline_exceeded');
  });
});

test('serves token-gated Cybermap viewport reads from ingested real observations only', async () => {
  const previousReadToken = process.env.BSS_CYBERMAP_READ_TOKEN;
  process.env.BSS_CYBERMAP_READ_TOKEN = 'test-cybermap-read-token-32-byte-minimum';
  try {
    const { server } = makeServer();
    await withServer(server, async (baseUrl) => {
      const batch = validBatch({
        observations: [
          validObservation({
            payload: {
              bssid_hmac: 'hmac-sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
              ssid_hmac: 'hmac-sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
              rssi_dbm: -67,
              frequency_mhz: 2412,
              passive_only: true,
            },
          }),
        ],
      });
      await fetch(`${baseUrl}/api/v1/observations/batch`, {
        method: 'POST',
        headers: ingestHeaders(batch),
        body: JSON.stringify(batch),
      });

      const anonymous = await fetch(`${baseUrl}/api/v1/cybermap/viewport?lat=47.6062&lon=-122.3321`);
      assert.equal(anonymous.status, 403);

      const response = await fetch(`${baseUrl}/api/v1/cybermap/viewport?lat=47.6062&lon=-122.3321&radiusMeters=100&limit=10`, {
        headers: { 'x-blue-swallow-cybermap-read-token': process.env.BSS_CYBERMAP_READ_TOKEN },
      });
      assert.equal(response.status, 200);
      const body = await response.json();
      assert.equal(body.ok, true);
      assert.equal(body.source, 'cybermap-postgis');
      assert.equal(body.mode, 'viewport');
      assert.equal(body.live, true);
      assert.equal(body.totalResults, 1);
      assert.equal(body.accessPoints[0].ssid, 'hmac-sha256:fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210');
      assert.ok(body.accessPoints[0].distanceMeters <= 100);
    });
  } finally {
    if (previousReadToken === undefined) delete process.env.BSS_CYBERMAP_READ_TOKEN;
    else process.env.BSS_CYBERMAP_READ_TOKEN = previousReadToken;
  }
});

test('stores and serves one token-gated canonical autonomous paper state idempotently', async () => {
  const previousToken = process.env.BSS_PAPER_STATE_TOKEN;
  process.env.BSS_PAPER_STATE_TOKEN = 'test-paper-state-token-32-byte-minimum';
  const state = {
    schema_version: 'bss.paper_state.v1',
    generated_at: '2026-07-11T18:43:00.000Z',
    paper_only: true,
    autonomous_execution: true,
    ledger: {
      schema_version: 3,
      paper_only: true,
      books: ['prediction_markets', 'crypto', 'equity_watch', 'local_event_watch', 'ai_cyber_watch'].map((book_id) => ({
        book_id,
        starting_balance: 2000,
        cash_balance: 1000,
        positions: [{ instrument_ref: `${book_id}:seed`, quantity: 1, mark_price: 1000 }],
      })),
    },
    paper_books: [],
    paper_action_candidates: [],
  };
  try {
    const { server } = makeServer();
    await withServer(server, async (baseUrl) => {
      const anonymous = await fetch(`${baseUrl}/api/v1/paper/state`);
      assert.equal(anonymous.status, 403);

      const headers = {
        'content-type': 'application/json',
        'x-blue-swallow-paper-state-token': process.env.BSS_PAPER_STATE_TOKEN,
        'idempotency-key': 'paper-tick-2026-07-11T18:43:00Z',
      };
      const first = await fetch(`${baseUrl}/api/v1/paper/state`, {
        method: 'PUT', headers, body: JSON.stringify(state),
      });
      assert.equal(first.status, 201);
      assert.equal(first.headers.get('idempotent-replayed'), 'false');

      const replay = await fetch(`${baseUrl}/api/v1/paper/state`, {
        method: 'PUT', headers, body: JSON.stringify(state),
      });
      assert.equal(replay.status, 200);
      assert.equal(replay.headers.get('idempotent-replayed'), 'true');

      const conflict = await fetch(`${baseUrl}/api/v1/paper/state`, {
        method: 'PUT', headers, body: JSON.stringify({ ...state, generated_at: '2026-07-11T18:44:00.000Z' }),
      });
      assert.equal(conflict.status, 409);
      assert.equal((await conflict.json()).error, 'idempotency_key_reused');

      const read = await fetch(`${baseUrl}/api/v1/paper/state`, {
        headers: { 'x-blue-swallow-paper-state-token': process.env.BSS_PAPER_STATE_TOKEN },
      });
      assert.equal(read.status, 200);
      const body = await read.json();
      assert.equal(body.source, 'mosaic-murmurs-paper-engine');
      assert.deepEqual(body.state, state);
    });
  } finally {
    if (previousToken === undefined) delete process.env.BSS_PAPER_STATE_TOKEN;
    else process.env.BSS_PAPER_STATE_TOKEN = previousToken;
  }
});

test('keeps legacy echo probe alive on the Cybermap API port during migration', async () => {
  const { server } = makeServer();
  await withServer(server, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/echo?msg=hello%20black%20ice`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), {
      ok: true,
      echo: 'hello black ice',
      path: '/echo',
      query: { msg: ['hello black ice'] },
    });
  });
});
