import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { createCybermapApiServer } from '../vm/cybermap-api/src/server.mjs';
import { createWorldRoute } from '../vm/cybermap-api/src/world-route.mjs';
const require = createRequire(import.meta.url);
const { createWorldContextHandler } = require('../api/world-context/index.js');
test('World Function requires verified common API principal and never forwards provider/private filters', async () => {
  let calls = 0; const read = async (auth) => { calls++; assert.equal(auth.apiAccessToken, 'synthetic-token'); return { version: 'bss.world.v1' }; };
  const denied = createWorldContextHandler({ authorize: async (ctx) => { ctx.res = { status: 403 }; return { ok: false }; }, read });
  const ctx = {}; await denied(ctx, { method: 'GET' }); assert.equal(ctx.res.status, 403); assert.equal(calls, 0);
  const legacy = createWorldContextHandler({ authorize: async () => ({ ok: true }), read }); await legacy(ctx, { method: 'GET' }); assert.equal(ctx.res.status, 403);
  const handler = createWorldContextHandler({ authorize: async () => ({ ok: true, principal: {}, apiAccessToken: 'synthetic-token' }), read });
  await handler(ctx, { method: 'GET', query: { lat: 1 } }); assert.equal(ctx.res.status, 400);
  await handler(ctx, { method: 'GET', query: {} }); assert.equal(ctx.res.status, 200); assert.equal(calls, 1); assert.match(ctx.res.headers['Cache-Control'], /no-store/);
});
test('World VM hook verifies Owner.Read before snapshot access; rejects filters and has no provider refresh path', async (t) => {
  let reads = 0; let allow = false;
  const route = createWorldRoute({ service: { read: () => { reads++; return { version: 'bss.world.v1' }; } }, verify: async (token, scope) => { assert.equal(scope, 'Owner.Read'); if (!allow) throw new Error('denied'); assert.equal(token, 'synthetic-token'); } });
  const server = createServer(async (req, res) => { try { await route(req, res, new URL(req.url, 'http://localhost')); } catch { res.writeHead(403); res.end(); } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/v1/world/context`;
  assert.equal((await fetch(url, { method: 'POST', body: '{}' })).status, 403); assert.equal(reads, 0);
  allow = true; const options = { method: 'POST', body: '{}', headers: { Authorization: 'Bearer synthetic-token' } };
  assert.equal((await fetch(url, options)).status, 200); assert.equal(reads, 1);
  assert.equal((await fetch(url, { ...options, body: '{"lat":1}' })).status, 400); assert.equal(reads, 1);
});

test('World dispatch mounted in common server preserves route isolation and authorization errors', async (t) => {
  let reads = 0;
  const worldRoute = createWorldRoute({ service: { read: () => { reads++; return { version: 'bss.world.v1' }; } }, verify: async (token) => {
    if (token !== 'synthetic-owner') throw Object.assign(new Error('denied'), { status: 401, code: 'api_token_invalid' });
  } });
  const store = new Proxy({}, { get: () => { throw new Error('World must never access the personal store'); } });
  const server = createCybermapApiServer({ store, worldRoute, logger: { error() {} } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const denied = await fetch(`${origin}/api/v1/world/context`, { method: 'POST', body: '{}' });
  assert.equal(denied.status, 401); assert.equal(reads, 0);
  const accepted = await fetch(`${origin}/api/v1/world/context`, { method: 'POST', body: '{}', headers: { Authorization: 'Bearer synthetic-owner' } });
  assert.equal(accepted.status, 200); assert.equal((await accepted.json()).version, 'bss.world.v1'); assert.equal(reads, 1);
  assert.equal((await fetch(`${origin}/unrelated-world-path`)).status, 404); assert.equal(reads, 1);
});
