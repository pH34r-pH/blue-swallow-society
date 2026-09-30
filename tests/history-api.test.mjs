process.env.BLUE_SWALLOW_AUTH_MODE = 'legacy';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const handler = require('../api/cybermap-history');
const { createOperatorToken } = require('../api/_lib/operator-auth');
Object.assign(process.env, { BLUE_SWALLOW_PASSCODE_SHA256: 'a'.repeat(64), BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: 'synthetic-history-api-session-key-32-bytes',
  BACKEND_CYBERMAP_BASE_URL: 'https://synthetic-history.invalid', BSS_CYBERMAP_READ_TOKEN: 'synthetic-history-read-token' });
const session = createOperatorToken();
const headers = { 'x-blue-swallow-operator-token': session.token };
test('history Function denies anonymous and URL filters before forwarding private body', async () => {
  let calls = 0; const original = global.fetch;
  global.fetch = async (url, options) => { calls++; assert.equal(url.search, ''); assert.equal(options.headers['x-blue-swallow-cybermap-read-token'], 'synthetic-history-read-token');
    assert.deepEqual(JSON.parse(options.body), { from: '2026-09-01T00:00:00Z', to: '2026-09-02T00:00:00Z' });
    return Response.json({ ok: true, schemaVersion: 'bss.observation_history.v1', observations: [] }); };
  try {
    const denied = {}; await handler(denied, { method: 'POST', headers: {}, body: {} }); assert.equal(denied.res.status, 403); assert.equal(calls, 0);
    const urlFilter = {}; await handler(urlFilter, { method: 'POST', headers, query: { deviceId: 'private' }, body: {} }); assert.equal(urlFilter.res.status, 400); assert.equal(calls, 0);
    const allowed = {}; await handler(allowed, { method: 'POST', headers, body: { from: '2026-09-01T00:00:00Z', to: '2026-09-02T00:00:00Z' } });
    assert.equal(allowed.res.status, 200); assert.match(allowed.res.headers['Cache-Control'], /no-store/); assert.equal(calls, 1);
  } finally { global.fetch = original; }
});
