import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const TOKEN = 'a'.repeat(64);

function makeContext() {
  return { log: { error() {}, warn() {}, info() {} } };
}

function restoreEnv(key, value) {
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
}

async function invoke(req, fetchImpl) {
  const route = require('../api/paper-state/index.js');
  const previous = {
    BACKEND_PAPER_STATE_BASE_URL: process.env.BACKEND_PAPER_STATE_BASE_URL,
    BACKEND_CYBERMAP_BASE_URL: process.env.BACKEND_CYBERMAP_BASE_URL,
    BSS_PAPER_STATE_TOKEN: process.env.BSS_PAPER_STATE_TOKEN,
  };
  process.env.BACKEND_PAPER_STATE_BASE_URL = 'https://backend.internal';
  process.env.BACKEND_CYBERMAP_BASE_URL = 'https://backend.internal';
  process.env.BSS_PAPER_STATE_TOKEN = TOKEN;
  const originalFetch = global.fetch;
  global.fetch = fetchImpl;
  try {
    const context = makeContext();
    await route(context, req);
    return context.res;
  } finally {
    global.fetch = originalFetch;
    for (const [key, value] of Object.entries(previous)) restoreEnv(key, value);
  }
}

test('paper-state edge proxy rejects unauthenticated callers before backend I/O', async () => {
  let called = false;
  const response = await invoke({ method: 'GET', headers: {} }, async () => {
    called = true;
    throw new Error('must not fetch');
  });
  assert.equal(called, false);
  assert.equal(response.status, 401);
  assert.equal(response.headers['cache-control'], 'no-store');
});

test('paper-state edge proxy forwards canonical PUT with an explicit application token', async () => {
  const state = { schema_version: 'bss.paper_state.v3', paper_only: true };
  const calls = [];
  const response = await invoke({
    method: 'PUT',
    headers: { 'x-blue-swallow-paper-state-token': TOKEN, 'idempotency-key': 'paper:test:1' },
    body: state,
  }, async (url, options) => {
    calls.push({ url: String(url), options });
    return {
      ok: true,
      status: 201,
      headers: { get: (name) => name.toLowerCase() === 'idempotent-replayed' ? 'false' : null },
      text: async () => JSON.stringify({ ok: true, stored: true }),
    };
  });

  assert.equal(response.status, 201);
  assert.equal(response.headers['idempotent-replayed'], 'false');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://backend.internal/api/v1/paper/state');
  assert.equal(calls[0].options.method, 'PUT');
  assert.equal(calls[0].options.headers['x-blue-swallow-paper-state-token'], TOKEN);
  assert.equal('x-blue-swallow-cybermap-read-token' in calls[0].options.headers, false);
  assert.equal(calls[0].options.headers['idempotency-key'], 'paper:test:1');
  assert.equal('authorization' in calls[0].options.headers, false);
  assert.equal(calls[0].options.body, JSON.stringify(state));
});

test('paper-state edge proxy supports token-gated canonical GET', async () => {
  const response = await invoke({ method: 'GET', headers: { 'x-blue-swallow-paper-state-token': TOKEN } }, async (_url, options) => ({
    ok: true,
    status: 200,
    headers: { get: () => null },
    text: async () => JSON.stringify({ ok: true, state: { schema_version: 'bss.paper_state.v3' } }),
    options,
  }));
  assert.equal(response.status, 200);
  assert.equal(response.body.state.schema_version, 'bss.paper_state.v3');
});

test('paper-state edge proxy fails closed on malformed replay acknowledgement', async () => {
  const response = await invoke({
    method: 'PUT',
    headers: { 'x-blue-swallow-paper-state-token': TOKEN, 'idempotency-key': 'paper:test:2' },
    body: { schema_version: 'bss.paper_state.v2' },
  }, async () => ({
    ok: true,
    status: 201,
    headers: { get: () => 'maybe' },
    text: async () => JSON.stringify({ ok: true }),
  }));
  assert.equal(response.status, 502);
  assert.match(response.body.message, /malformed replay/i);
});

test('paper-state edge proxy rejects POST instead of translating write semantics', async () => {
  const response = await invoke({ method: 'POST', headers: { 'x-blue-swallow-paper-state-token': TOKEN } }, async () => {
    throw new Error('must not fetch');
  });
  assert.equal(response.status, 405);
  assert.equal(response.headers.allow, 'GET, PUT');
});
