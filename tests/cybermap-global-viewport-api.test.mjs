import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const TEST_OPERATOR_DIGEST = '0'.repeat(64);
const TEST_SIGNING_KEY = 'cybermap-global-viewport-signing-key-32-bytes-minimum';
const FIXED_BACKEND_READ_TOKEN = 'fixed-backend-read-token-32-bytes-minimum';

const globalViewportRequest = {
  schema_version: 'bss.godeye.global_viewport.v1',
  bbox: { west: -180, south: -85, east: 180, north: 85 },
  zoom: 2,
  layer_ids: ['usgs-earthquakes'],
  max_cells: 1_000,
};

const globalViewportResponse = {
  ok: true,
  schema_version: 'bss.godeye.global_viewport.v1',
  mode: 'global',
  generated_at: '2026-07-22T20:00:00.000Z',
  bbox: globalViewportRequest.bbox,
  requested_zoom: globalViewportRequest.zoom,
  selected_resolution: 5,
  aggregation_applied: false,
  cells: [],
  source_health: [],
  intelligence_gaps: [],
};

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

function withOperatorEnv(env = {}) {
  return {
    ...env,
    BLUE_SWALLOW_PASSCODE_SHA256: TEST_OPERATOR_DIGEST,
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: TEST_SIGNING_KEY,
  };
}

function makeOperatorHeaders() {
  const previousDigest = process.env.BLUE_SWALLOW_PASSCODE_SHA256;
  const previousSigningKey = process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY;
  process.env.BLUE_SWALLOW_PASSCODE_SHA256 = TEST_OPERATOR_DIGEST;
  process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = TEST_SIGNING_KEY;

  try {
    const { createOperatorToken } = require('../api/_lib/operator-auth');
    const session = createOperatorToken({ ttlMs: 60_000 });
    return { 'x-blue-swallow-operator-token': session.token };
  } finally {
    restoreEnv('BLUE_SWALLOW_PASSCODE_SHA256', previousDigest);
    restoreEnv('BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY', previousSigningKey);
  }
}

function responseHeader(response, name) {
  const expected = name.toLowerCase();
  return Object.entries(response.headers || {}).find(([key]) => key.toLowerCase() === expected)?.[1];
}

async function invokeRoute(req, env, fetchImpl) {
  const route = require('../api/cybermap-global-viewport/index.js');
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

function backendResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  };
}

const configuredProxyEnv = {
  BACKEND_CYBERMAP_BASE_URL: 'https://backend.local/root/',
  BSS_CYBERMAP_READ_TOKEN: FIXED_BACKEND_READ_TOKEN,
};

test('cybermap global viewport proxy rejects anonymous callers before backend I/O', async () => {
  let fetchCalled = false;
  const response = await invokeRoute(
    { method: 'POST', headers: {}, body: globalViewportRequest },
    withOperatorEnv(configuredProxyEnv),
    async () => {
      fetchCalled = true;
      throw new Error('backend must not receive anonymous requests');
    },
  );

  assert.equal(fetchCalled, false);
  assert.equal(response.status, 403);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /operator session required/i);
  assert.equal(responseHeader(response, 'cache-control'), 'no-store');
});

test('cybermap global viewport proxy forwards only its fixed backend-read credential', async () => {
  const fetchCalls = [];
  const response = await invokeRoute(
    {
      method: 'POST',
      headers: {
        ...makeOperatorHeaders(),
        authorization: 'Bearer browser-operator-token-must-not-forward',
        'x-blue-swallow-cybermap-read-token': 'browser-read-token-must-not-forward',
      },
      body: globalViewportRequest,
    },
    withOperatorEnv(configuredProxyEnv),
    async (url, options) => {
      fetchCalls.push({ url: String(url), options });
      return backendResponse(globalViewportResponse);
    },
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, globalViewportResponse);
  assert.equal(responseHeader(response, 'cache-control'), 'no-store');
  assert.equal(fetchCalls.length, 1);
  assert.equal(fetchCalls[0].url, 'https://backend.local/root/api/v1/cybermap/global-viewport');
  assert.equal(fetchCalls[0].options.method, 'POST');
  assert.deepEqual(fetchCalls[0].options.headers, {
    accept: 'application/json',
    'content-type': 'application/json',
    'x-blue-swallow-cybermap-read-token': FIXED_BACKEND_READ_TOKEN,
  });
  assert.equal(fetchCalls[0].options.body, JSON.stringify(globalViewportRequest));
});

test('cybermap global viewport proxy fails closed when its backend read credential is unavailable', async () => {
  let fetchCalled = false;
  const response = await invokeRoute(
    { method: 'POST', headers: makeOperatorHeaders(), body: globalViewportRequest },
    withOperatorEnv({
      BACKEND_CYBERMAP_BASE_URL: 'https://backend.local',
      BSS_CYBERMAP_READ_TOKEN: '',
    }),
    async () => {
      fetchCalled = true;
      throw new Error('backend must not receive a request without its fixed credential');
    },
  );

  assert.equal(fetchCalled, false);
  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error, 'global_viewport_unavailable');
  assert.equal(responseHeader(response, 'cache-control'), 'no-store');
});

test('cybermap global viewport proxy maps upstream failures to a controlled unavailable response', async () => {
  const response = await invokeRoute(
    { method: 'POST', headers: makeOperatorHeaders(), body: globalViewportRequest },
    withOperatorEnv(configuredProxyEnv),
    async () => backendResponse({ error: 'backend diagnostic must not reach the browser' }, 502),
  );

  assert.equal(response.status, 503);
  assert.equal(response.body.ok, false);
  assert.equal(response.body.error, 'global_viewport_unavailable');
  assert.equal(responseHeader(response, 'cache-control'), 'no-store');
  assert.doesNotMatch(JSON.stringify(response.body), /backend diagnostic/i);
});
