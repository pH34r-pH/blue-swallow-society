import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createOperatorToken } = require('../api/_lib/operator-auth');

const TEST_OPERATOR_DIGEST = '0'.repeat(64);
const TEST_SIGNING_KEY = 'deflock-global-route-token-signing-key-32-bytes';

function withOperatorEnv(env = {}) {
  return {
    ...env,
    BLUE_SWALLOW_PASSCODE_SHA256: TEST_OPERATOR_DIGEST,
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: TEST_SIGNING_KEY,
  };
}

function makeOperatorHeaders() {
  const priorDigest = process.env.BLUE_SWALLOW_PASSCODE_SHA256;
  const priorKey = process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY;
  process.env.BLUE_SWALLOW_PASSCODE_SHA256 = TEST_OPERATOR_DIGEST;
  process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = TEST_SIGNING_KEY;
  try {
    return { Authorization: `Bearer ${createOperatorToken({ ttlMs: 60_000 }).token}` };
  } finally {
    restoreEnv('BLUE_SWALLOW_PASSCODE_SHA256', priorDigest);
    restoreEnv('BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY', priorKey);
  }
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function invoke(req, env = {}, fetchImpl = global.fetch) {
  const route = require('../api/cybermap-global-viewport/index.js');
  const prior = {};
  for (const [key, value] of Object.entries(env)) {
    prior[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const originalFetch = global.fetch;
  global.fetch = fetchImpl;
  try {
    const context = { log: { error() {} } };
    await route(context, req);
    return context.res;
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(prior)) restoreEnv(key, value);
  }
}

const request = {
  schema_version: 'bss.global_viewport_request.v1',
  bbox: { west: -125, south: 24, east: -66, north: 50 },
  zoom: 4,
  layer_ids: ['deflock-osm-alpr-reports'],
};

test('global Cybermap proxy requires an operator token and rejects coordinate query strings', async () => {
  const anonymous = await invoke({ body: request }, withOperatorEnv({
    BACKEND_CYBERMAP_BASE_URL: 'https://backend.local', BSS_CYBERMAP_READ_TOKEN: 'read-token-value-32-byte-minimum',
  }));
  assert.equal(anonymous.status, 403);

  const queried = await invoke({ headers: makeOperatorHeaders(), query: { lat: '47.6062' }, body: request }, withOperatorEnv({
    BACKEND_CYBERMAP_BASE_URL: 'https://backend.local', BSS_CYBERMAP_READ_TOKEN: 'read-token-value-32-byte-minimum',
  }));
  assert.equal(queried.status, 400);
  assert.match(queried.body.message, /query string/i);
});

test('global Cybermap proxy POSTs only bounded aggregate requests to the VM backend', async () => {
  const calls = [];
  const backendPayload = {
    schema_version: 'bss.global_viewport_response.v1', ok: true, mode: 'global', cells: [],
    sources: [{ source_id: 'deflock-osm-alpr-reports', status: 'disabled' }],
  };
  const response = await invoke({ headers: makeOperatorHeaders(), body: request }, withOperatorEnv({
    BACKEND_CYBERMAP_BASE_URL: 'https://backend.local/root/', BSS_CYBERMAP_READ_TOKEN: 'read-token-value-32-byte-minimum',
  }), async (url, options) => {
    calls.push({ url: String(url), options });
    return { ok: true, status: 200, text: async () => JSON.stringify(backendPayload) };
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, backendPayload);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://backend.local/root/api/v1/cybermap/global-viewport');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers['x-blue-swallow-cybermap-read-token'], 'read-token-value-32-byte-minimum');
  assert.deepEqual(JSON.parse(calls[0].options.body), request);
  assert.equal(calls[0].options.body.includes('lat'), false);
});
