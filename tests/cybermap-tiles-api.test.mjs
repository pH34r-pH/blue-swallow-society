import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createOperatorToken } = require('../api/_lib/operator-auth');

const TEST_OPERATOR_DIGEST = '0'.repeat(64);
const TEST_SIGNING_KEY = 'cybermap-tile-route-token-signing-key-32-bytes-minimum';

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

function makeOperatorHeaders() {
  const previousDigest = process.env.BLUE_SWALLOW_PASSCODE_SHA256;
  const previousSigningKey = process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY;
  process.env.BLUE_SWALLOW_PASSCODE_SHA256 = TEST_OPERATOR_DIGEST;
  process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = TEST_SIGNING_KEY;
  try {
    return { Authorization: `Bearer ${createOperatorToken({ ttlMs: 60_000 }).token}` };
  } finally {
    restoreEnv('BLUE_SWALLOW_PASSCODE_SHA256', previousDigest);
    restoreEnv('BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY', previousSigningKey);
  }
}

function withOperatorEnv(env = {}) {
  return {
    ...env,
    BLUE_SWALLOW_PASSCODE_SHA256: TEST_OPERATOR_DIGEST,
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: TEST_SIGNING_KEY,
  };
}

async function invokeRoute(req, env = {}, fetchImpl = global.fetch) {
  const route = require('../api/cybermap-tiles/index.js');
  const previousEnv = {};
  for (const [key, value] of Object.entries(env)) {
    previousEnv[key] = process.env[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
  const originalFetch = global.fetch;
  global.fetch = fetchImpl;
  try {
    const context = { log: { error() {}, warn() {}, info() {} } };
    await route(context, req);
    return context.res;
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previousEnv)) restoreEnv(key, value);
  }
}

test('cybermap tile Function requires a passcode-issued operator token before backend I/O', async () => {
  let fetchCalls = 0;
  const response = await invokeRoute(
    { params: { z: '8', x: '41', y: '92' } },
    withOperatorEnv({
      BACKEND_CYBERMAP_BASE_URL: 'https://backend.example.test/root/',
      BSS_CYBERMAP_READ_TOKEN: 'read-token-value-32-byte-minimum',
    }),
    async () => {
      fetchCalls += 1;
      throw new Error('must not fetch');
    },
  );

  assert.equal(response.status, 403);
  assert.equal(fetchCalls, 0);
});

test('cybermap tile Function rejects query-bearing and invalid tile paths before backend I/O', async () => {
  const fetchCalls = [];
  const env = withOperatorEnv({
    BACKEND_CYBERMAP_BASE_URL: 'https://backend.example.test/root/',
    BSS_CYBERMAP_READ_TOKEN: 'read-token-value-32-byte-minimum',
  });

  for (const req of [
    { headers: makeOperatorHeaders(), params: { z: '13', x: '1', y: '1' } },
    { headers: makeOperatorHeaders(), params: { z: '8', x: '256', y: '1' } },
    { headers: makeOperatorHeaders(), query: { source: 'green-cells' }, params: { z: '8', x: '41', y: '92' } },
  ]) {
    const response = await invokeRoute(req, env, async (...args) => {
      fetchCalls.push(args);
      throw new Error('must not fetch');
    });
    assert.equal(response.status, 400);
    assert.equal(response.headers['cache-control'], 'no-store');
  }
  assert.equal(fetchCalls.length, 0);
});

test('cybermap tile Function forwards only a validated HTTPS path and returns MVT bytes no-store', async () => {
  const tile = Buffer.from([0x1a, 0x00]);
  const calls = [];
  const response = await invokeRoute(
    { headers: makeOperatorHeaders(), params: { z: '8', x: '41', y: '92' } },
    withOperatorEnv({
      BACKEND_CYBERMAP_BASE_URL: 'https://backend.example.test/root/',
      BSS_CYBERMAP_READ_TOKEN: 'read-token-value-32-byte-minimum',
    }),
    async (url, options) => {
      calls.push({ url: String(url), options });
      return new Response(tile, {
        status: 200,
        headers: { 'content-type': 'application/vnd.mapbox-vector-tile' },
      });
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.headers['content-type'], 'application/vnd.mapbox-vector-tile');
  assert.equal(response.headers['cache-control'], 'no-store');
  assert.deepEqual(Buffer.from(response.body), tile);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://backend.example.test/root/api/v1/cybermap/tiles/8/41/92');
  assert.equal(calls[0].options.method, 'GET');
  assert.equal(calls[0].options.headers.accept, 'application/vnd.mapbox-vector-tile');
  assert.equal(calls[0].options.headers['x-blue-swallow-cybermap-read-token'], 'read-token-value-32-byte-minimum');
  assert.equal(JSON.stringify(calls[0].options.headers).includes('Bearer'), false);
});
