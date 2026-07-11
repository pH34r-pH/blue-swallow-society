import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const SERVICE_TOKEN = 'swa service token fixture - must never leak';
const PASSCODE_DIGEST = crypto.createHash('sha256').update('cybermap proxy passcode').digest('hex');

const ENV_KEYS = [
  'BLUE_SWALLOW_PASSCODE',
  'BLUE_SWALLOW_PASSCODE_SHA256',
  'CYBERMAP_BACKEND_BASE_URL',
  'CYBERMAP_BACKEND_TOKEN',
  'CYBERMAP_PROXY_TIMEOUT_MS',
];

function loadHandler() {
  const modulePath = require.resolve('../api/cybermap/index.js');
  delete require.cache[modulePath];
  return require(modulePath);
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

function withEnv(env, fn) {
  const previousEnv = new Map(ENV_KEYS.map((key) => [key, process.env[key]]));
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }
  delete process.env.BLUE_SWALLOW_PASSCODE;
  process.env.BLUE_SWALLOW_PASSCODE_SHA256 = PASSCODE_DIGEST;
  process.env.CYBERMAP_PROXY_TIMEOUT_MS = '25';
  for (const [key, value] of Object.entries(env)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of previousEnv.entries()) {
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

function operatorHeaders() {
  const { createOperatorToken } = require('../api/_lib/operator-auth.js');
  const { token } = createOperatorToken({ operatorId: 'cybermap-proxy-test' });
  return {
    Authorization: `Bearer ${token}`,
    'X-Blue-Swallow-Operator-Token': token,
  };
}

function jsonResponse(body, { status = 200, headers = {} } = {}) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'ERR',
    headers: new Headers({ 'content-type': 'application/json', ...headers }),
    text: async () => JSON.stringify(body),
  };
}

async function invoke(req, env = {}, fetchImpl = async () => {
  throw new Error('unexpected fetch call');
}) {
  return withEnv(env, async () => {
    const originalFetch = globalThis.fetch;
    globalThis.fetch = fetchImpl;
    const context = makeContext();
    try {
      await loadHandler()(context, {
        method: 'GET',
        headers: operatorHeaders(),
        params: { path: 'viewport' },
        query: {},
        url: 'https://blue.example/api/cybermap/viewport',
        ...req,
      });
      return context.res;
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
}

function assertNoServiceTokenLeak(value) {
  const serialized = JSON.stringify(value);
  assert.doesNotMatch(serialized, new RegExp(SERVICE_TOKEN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(serialized, /x-cybermap-token|authorization|x-blue-swallow-operator-token/i);
}

test('api/cybermap function.json exposes an anonymous catch-all GET trigger', () => {
  const raw = readFileSync(new URL('../api/cybermap/function.json', import.meta.url), 'utf8');
  assert.ok(raw.trim().length > 0, 'function.json should not be empty');

  const config = JSON.parse(raw);
  const httpTrigger = config.bindings.find((binding) => binding.type === 'httpTrigger');
  const httpOutput = config.bindings.find((binding) => binding.type === 'http');

  assert.ok(httpTrigger, 'expected an httpTrigger binding');
  assert.ok(httpOutput, 'expected an http output binding');
  assert.equal(httpTrigger.authLevel, 'anonymous');
  assert.deepEqual(httpTrigger.methods, ['get']);
  assert.equal(httpTrigger.route, 'cybermap/{*path}');
});

test('static web app keeps Cybermap browser calls same-origin only', () => {
  const raw = readFileSync(new URL('../app/staticwebapp.config.json', import.meta.url), 'utf8');
  const config = JSON.parse(raw);
  assert.ok(config.routes.some((route) => route.route === '/api/cybermap/*'), 'expected /api/cybermap/* route declaration');
  const csp = config.globalHeaders['Content-Security-Policy'];
  const connectDirective = csp.split(';').map((part) => part.trim()).find((part) => part.startsWith('connect-src'));
  assert.equal(connectDirective, "connect-src 'self'");
});

test('cybermap SWA proxy requires an operator session before backend access', async () => {
  const response = await invoke(
    { headers: {} },
    { CYBERMAP_BACKEND_BASE_URL: 'https://vm.example', CYBERMAP_BACKEND_TOKEN: SERVICE_TOKEN },
    async () => assert.fail('backend fetch must not run without an operator session'),
  );

  assert.equal(response.status, 403);
  assert.equal(response.body.ok, false);
  assert.match(response.body.error, /operator session/i);
});

test('cybermap SWA proxy reports missing backend URL and token as config degradation', async () => {
  const missingUrl = await invoke(
    {},
    { CYBERMAP_BACKEND_BASE_URL: undefined, CYBERMAP_BACKEND_TOKEN: SERVICE_TOKEN },
    async () => assert.fail('backend fetch must not run without backend URL'),
  );

  assert.equal(missingUrl.status, 503);
  assert.equal(missingUrl.body.ok, false);
  assert.equal(missingUrl.body.state, 'degraded');
  assert.equal(missingUrl.body.error.code, 'backend_url_unconfigured');
  assertNoServiceTokenLeak(missingUrl.body);

  const missingToken = await invoke(
    {},
    { CYBERMAP_BACKEND_BASE_URL: 'https://vm.example', CYBERMAP_BACKEND_TOKEN: undefined },
    async () => assert.fail('backend fetch must not run without backend token'),
  );

  assert.equal(missingToken.status, 503);
  assert.equal(missingToken.body.ok, false);
  assert.equal(missingToken.body.state, 'degraded');
  assert.equal(missingToken.body.error.code, 'backend_token_unconfigured');
  assertNoServiceTokenLeak(missingToken.body);
});

test('cybermap SWA proxy maps browser viewport calls to VM v1 with only the service-token header', async () => {
  let capturedRequest;
  const response = await invoke(
    {
      params: { path: 'viewport' },
      query: { bbox: '-122.45,47.55,-122.25,47.70', zoom: '12', layers: 'green_preload' },
      url: 'https://blue.example/api/cybermap/viewport?bbox=-122.45%2C47.55%2C-122.25%2C47.70&zoom=12&layers=green_preload',
    },
    { CYBERMAP_BACKEND_BASE_URL: 'https://vm.example/root/', CYBERMAP_BACKEND_TOKEN: SERVICE_TOKEN },
    async (url, options) => {
      capturedRequest = { url: String(url), options };
      return jsonResponse({ ok: true, cells: [{ h3_cell: 'gh9:c23nb62w7' }] });
    },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assert.equal(response.body.cells.length, 1);
  assert.equal(capturedRequest.url, 'https://vm.example/root/api/v1/cybermap/viewport?bbox=-122.45%2C47.55%2C-122.25%2C47.70&zoom=12&layers=green_preload');
  assert.equal(capturedRequest.options.method, 'GET');
  assert.equal(capturedRequest.options.headers['X-Cybermap-Token'], SERVICE_TOKEN);
  assert.equal('Authorization' in capturedRequest.options.headers, false);
  assert.equal('X-Blue-Swallow-Operator-Token' in capturedRequest.options.headers, false);
  assertNoServiceTokenLeak(response.body);
});

test('cybermap SWA proxy enumerates related read routes to VM v1 endpoints', async () => {
  const calls = [];
  const env = { CYBERMAP_BACKEND_BASE_URL: 'https://vm.example', CYBERMAP_BACKEND_TOKEN: SERVICE_TOKEN };
  const fetchImpl = async (url) => {
    calls.push(String(url));
    return jsonResponse({ ok: true });
  };

  await invoke({ params: { path: 'cells/gh9:c23nb62w7' }, url: 'https://blue.example/api/cybermap/cells/gh9:c23nb62w7' }, env, fetchImpl);
  await invoke({ params: { path: 'entities/entity-1' }, url: 'https://blue.example/api/cybermap/entities/entity-1' }, env, fetchImpl);
  await invoke({ params: { path: 'sources' }, url: 'https://blue.example/api/cybermap/sources' }, env, fetchImpl);

  assert.deepEqual(calls, [
    'https://vm.example/api/v1/cybermap/cells/gh9%3Ac23nb62w7',
    'https://vm.example/api/v1/entities/entity-1',
    'https://vm.example/api/v1/sources',
  ]);
});

test('cybermap SWA proxy redacts backend echo of service-token material before responding', async () => {
  const response = await invoke(
    {},
    { CYBERMAP_BACKEND_BASE_URL: 'https://vm.example', CYBERMAP_BACKEND_TOKEN: SERVICE_TOKEN },
    async () => jsonResponse({
      ok: true,
      echoedHeaders: {
        'x-cybermap-token': SERVICE_TOKEN,
        authorization: `Bearer ${SERVICE_TOKEN}`,
      },
      message: `token was ${SERVICE_TOKEN}`,
      nested: [{ value: SERVICE_TOKEN }],
    }),
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.ok, true);
  assertNoServiceTokenLeak(response.body);
  assert.equal(response.body.message, 'token was [redacted]');
  assert.equal(response.body.nested[0].value, '[redacted]');
  assert.equal('echoedHeaders' in response.body, true);
  assert.deepEqual(response.body.echoedHeaders, {});
});

test('cybermap SWA proxy shapes timeout and VM offline errors without raw backend details', async () => {
  const timedOut = await invoke(
    {},
    { CYBERMAP_BACKEND_BASE_URL: 'https://vm.example', CYBERMAP_BACKEND_TOKEN: SERVICE_TOKEN },
    async () => {
      const error = new Error('operation aborted while contacting secret backend');
      error.name = 'AbortError';
      throw error;
    },
  );

  assert.equal(timedOut.status, 504);
  assert.equal(timedOut.body.ok, false);
  assert.equal(timedOut.body.state, 'offline');
  assert.equal(timedOut.body.error.code, 'backend_timeout');
  assertNoServiceTokenLeak(timedOut.body);
  assert.doesNotMatch(JSON.stringify(timedOut.body), /secret backend/i);

  const offline = await invoke(
    {},
    { CYBERMAP_BACKEND_BASE_URL: 'https://vm.example', CYBERMAP_BACKEND_TOKEN: SERVICE_TOKEN },
    async () => {
      const error = new TypeError('fetch failed: ECONNREFUSED 10.0.0.4');
      error.cause = { code: 'ECONNREFUSED' };
      throw error;
    },
  );

  assert.equal(offline.status, 503);
  assert.equal(offline.body.ok, false);
  assert.equal(offline.body.state, 'offline');
  assert.equal(offline.body.error.code, 'vm_offline');
  assert.match(offline.body.message, /autoshutdown/i);
  assertNoServiceTokenLeak(offline.body);
  assert.doesNotMatch(JSON.stringify(offline.body), /10\.0\.0\.4/);
});

test('cybermap SWA proxy distinguishes backend auth/config errors and malformed responses', async () => {
  const backendAuth = await invoke(
    {},
    { CYBERMAP_BACKEND_BASE_URL: 'https://vm.example', CYBERMAP_BACKEND_TOKEN: SERVICE_TOKEN },
    async () => jsonResponse({ ok: false, error: { code: 'auth_forbidden', message: `rejected ${SERVICE_TOKEN}` } }, { status: 403 }),
  );

  assert.equal(backendAuth.status, 502);
  assert.equal(backendAuth.body.ok, false);
  assert.equal(backendAuth.body.state, 'degraded');
  assert.equal(backendAuth.body.error.code, 'backend_auth_failed');
  assertNoServiceTokenLeak(backendAuth.body);

  const malformed = await invoke(
    {},
    { CYBERMAP_BACKEND_BASE_URL: 'https://vm.example', CYBERMAP_BACKEND_TOKEN: SERVICE_TOKEN },
    async () => ({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: new Headers({ 'content-type': 'text/plain' }),
      text: async () => 'not-json and not a Cybermap payload',
    }),
  );

  assert.equal(malformed.status, 502);
  assert.equal(malformed.body.ok, false);
  assert.equal(malformed.body.state, 'degraded');
  assert.equal(malformed.body.error.code, 'backend_malformed_response');
  assert.doesNotMatch(JSON.stringify(malformed.body), /not-json/);
  assertNoServiceTokenLeak(malformed.body);
});
