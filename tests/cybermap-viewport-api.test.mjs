import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createOperatorToken } = require('../api/_lib/operator-auth');

const TEST_OPERATOR_DIGEST = '0'.repeat(64);
const TEST_SIGNING_KEY = 'cybermap-route-token-signing-key-32-bytes-minimum';

function makeOperatorHeaders() {
  const previousDigest = process.env.BLUE_SWALLOW_PASSCODE_SHA256;
  const previousSigningKey = process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY;
  process.env.BLUE_SWALLOW_PASSCODE_SHA256 = TEST_OPERATOR_DIGEST;
  process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = TEST_SIGNING_KEY;
  try {
    const session = createOperatorToken({ ttlMs: 60_000 });
    return {
      Authorization: `Bearer ${session.token}`,
    };
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
  const route = require('../api/cybermap-viewport/index.js');
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

test('cybermap viewport API requires a passcode-issued operator bearer token', async () => {
  const response = await invokeRoute(
    { body: { lat: 47.6062, lon: -122.3321 } },
    withOperatorEnv({
      BACKEND_CYBERMAP_BASE_URL: 'https://backend.local',
      BSS_CYBERMAP_READ_TOKEN: 'read-token-value-32-byte-minimum',
    }),
  );

  assert.equal(response.status, 403);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /Operator session required/);
});

test('cybermap viewport API rejects coordinates in query strings', async () => {
  const response = await invokeRoute(
    {
      headers: makeOperatorHeaders(),
      query: { lat: '47.6062', lon: '-122.3321' },
      body: {},
    },
    withOperatorEnv({
      BACKEND_CYBERMAP_BASE_URL: 'https://backend.local',
      BSS_CYBERMAP_READ_TOKEN: 'read-token-value-32-byte-minimum',
    }),
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.ok, false);
  assert.match(response.body.message, /POST body/);
});

test('cybermap viewport API proxies only real backend viewport reads', async () => {
  const fetchCalls = [];
  const backendPayload = {
    ok: true,
    mode: 'viewport',
    live: true,
    source: 'cybermap-postgis',
    location: { lat: 47.6062, lon: -122.3321 },
    totalResults: 1,
    accessPoints: [{ ssid: 'hashed Wi-Fi AP', distanceMeters: 7 }],
    updatedAt: '2026-07-11T18:42:29.814Z',
  };

  const response = await invokeRoute(
    {
      headers: makeOperatorHeaders(),
      body: {
        lat: 47.6062,
        lon: -122.3321,
        radiusMeters: 250,
        limit: 42,
        mode: 'sample',
      },
    },
    withOperatorEnv({
      BACKEND_CYBERMAP_BASE_URL: 'https://backend.local/root/',
      BSS_CYBERMAP_READ_TOKEN: 'read-token-value-32-byte-minimum',
    }),
    async (url, options) => {
      fetchCalls.push({ url: String(url), options });
      return {
        ok: true,
        status: 200,
        text: async () => JSON.stringify(backendPayload),
      };
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, backendPayload);
  assert.equal(fetchCalls.length, 1);
  const proxied = new URL(fetchCalls[0].url);
  assert.equal(proxied.href, 'https://backend.local/root/api/v1/cybermap/viewport?lat=47.6062&lon=-122.3321&radiusMeters=250&limit=42');
  assert.equal(fetchCalls[0].options.method, 'GET');
  assert.equal(fetchCalls[0].options.headers['x-blue-swallow-cybermap-read-token'], 'read-token-value-32-byte-minimum');
  assert.equal(fetchCalls[0].options.headers.accept, 'application/json');
});
