import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

function makeContext() {
  return {
    log: {
      error() {},
      warn() {},
      info() {},
    },
  };
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function invokeRoute(req, env = {}, fetchImpl = global.fetch) {
  const route = require('../api/cybermap-observations-batch/index.js');
  const previousEnv = {};
  for (const [key, value] of Object.entries(env)) {
    previousEnv[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }

  const originalFetch = global.fetch;
  global.fetch = fetchImpl;

  try {
    const context = makeContext();
    await route(context, req);
    return context.res;
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) restoreEnv(key, value);
  }
}

test('cybermap observation batch proxy requires enrolled-device headers before backend I/O', async () => {
  let fetchCalled = false;
  const response = await invokeRoute(
    { method: 'POST', body: { schema_version: 'bss.observation_batch.v1' }, headers: {} },
    { BACKEND_CYBERMAP_BASE_URL: 'https://backend.local' },
    async () => {
      fetchCalled = true;
      throw new Error('should not call backend');
    },
  );

  assert.equal(fetchCalled, false);
  assert.equal(response.status, 401);
  assert.equal(response.body.ok, false);
  assert.match(response.body.message, /x-blue-swallow-ingest-token/i);
});

test('cybermap observation batch proxy forwards only the Wardriver ingest contract to the backend', async () => {
  const fetchCalls = [];
  const batch = {
    schema_version: 'bss.observation_batch.v1',
    idempotency_key: 'batch-00000000-0000-4000-8000-000000000001',
    device_id: 'wardriver-primary',
    observations: [{ external_observation_key: 'ap-1' }],
  };
  const receipt = {
    schema_version: 'bss.sync_receipt.v1',
    idempotency_key: batch.idempotency_key,
    status: 'applied',
    accepted_count: 1,
    rejected_count: 0,
    duplicate_count: 0,
    validation_errors: [],
    server_batch_id: '30000000-0000-4000-8000-000000000001',
    server_clock: '2026-07-12T19:45:00.000Z',
  };

  const response = await invokeRoute(
    {
      method: 'POST',
      body: batch,
      headers: {
        'X-Blue-Swallow-Ingest-Token': 'ingest-token-redacted',
        'X-Blue-Swallow-Device-Id': 'wardriver-primary',
        'Idempotency-Key': batch.idempotency_key,
        Authorization: 'Bearer operator-token-should-not-forward',
      },
    },
    { BACKEND_CYBERMAP_BASE_URL: 'https://backend.local/root/' },
    async (url, options) => {
      fetchCalls.push({ url: String(url), options });
      return {
        ok: true,
        status: 201,
        headers: { get: (name) => name.toLowerCase() === 'idempotent-replayed' ? 'false' : null },
        text: async () => JSON.stringify(receipt),
      };
    },
  );

  assert.equal(response.status, 201);
  assert.deepEqual(response.body, receipt);
  assert.equal(response.headers['idempotent-replayed'], 'false');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://backend.local/root/api/v1/observations/batch');
  assert.equal(fetchCalls[0].options.method, 'POST');
  assert.equal(fetchCalls[0].options.headers['x-blue-swallow-ingest-token'], 'ingest-token-redacted');
  assert.equal(fetchCalls[0].options.headers['x-blue-swallow-device-id'], 'wardriver-primary');
  assert.equal(fetchCalls[0].options.headers['idempotency-key'], batch.idempotency_key);
  assert.equal('authorization' in fetchCalls[0].options.headers, false);
  assert.equal(fetchCalls[0].options.body, JSON.stringify(batch));
});
