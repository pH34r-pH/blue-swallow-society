import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const route = require('../api/operator-signals/index.js');
const { createOperatorToken } = require('../api/_lib/operator-auth');

const ORIGINAL_ENV = {
  digest: process.env.BLUE_SWALLOW_PASSCODE_SHA256,
  signing: process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY,
  backend: process.env.BACKEND_CYBERMAP_BASE_URL,
  read: process.env.BSS_CYBERMAP_READ_TOKEN,
};

function configure() {
  process.env.BLUE_SWALLOW_PASSCODE_SHA256 = '0'.repeat(64);
  process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = 'operator-signals-test-signing-key-32bytes';
  process.env.BACKEND_CYBERMAP_BASE_URL = 'https://cybermap.example/';
  process.env.BSS_CYBERMAP_READ_TOKEN = 'r'.repeat(40);
  return createOperatorToken({ ttlMs: 60_000 }).token;
}

function restore() {
  const values = {
    BLUE_SWALLOW_PASSCODE_SHA256: ORIGINAL_ENV.digest,
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: ORIGINAL_ENV.signing,
    BACKEND_CYBERMAP_BASE_URL: ORIGINAL_ENV.backend,
    BSS_CYBERMAP_READ_TOKEN: ORIGINAL_ENV.read,
  };
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
}

test('operator signal adapter forwards a body-only query to the VM projection route', async () => {
  const token = configure();
  const originalFetch = global.fetch;
  const calls = [];
  global.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    return new Response(JSON.stringify({
      schema_version: 'bss.operator_signal_snapshot.v1', ok: true, signals: [], source: 'cybermap-postgis',
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  try {
    const context = { log: { warn() {} } };
    await route(context, {
      headers: { 'x-blue-swallow-operator-token': token },
      body: { lat: 47.6062, lon: -122.3321, radiusMeters: 100 },
    });
    assert.equal(context.res.status, 200);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, 'https://cybermap.example/api/v1/cybermap/operator-signals');
    assert.equal(new URL(calls[0].url).search, '');
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body), { lat: 47.6062, lon: -122.3321, radiusMeters: 100, limit: 100 });
  } finally {
    global.fetch = originalFetch;
    restore();
  }
});

test('operator signal adapter rejects coordinate query parameters before forwarding', async () => {
  const token = configure();
  try {
    const context = { log: { warn() {} } };
    await route(context, {
      headers: { 'x-blue-swallow-operator-token': token },
      query: { lat: '47.6062' },
      body: { lon: -122.3321 },
    });
    assert.equal(context.res.status, 400);
  } finally {
    restore();
  }
});
