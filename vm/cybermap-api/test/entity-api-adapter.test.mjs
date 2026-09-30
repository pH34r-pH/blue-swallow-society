import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import common from '../src/api-access-token.cjs';
import { createEntityApiAdapter } from '../src/entity-api-adapter.mjs';

const now = Date.parse('2026-09-30T12:00:00Z');
const config = { tenantId: '11111111-1111-4111-8111-111111111111', clientId: '22222222-2222-4222-8222-222222222222', objectId: '33333333-3333-4333-8333-333333333333' };
config.issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = await exportJWK(pair.publicKey); jwk.kid = 'synthetic-entity';
const verify = common.createApiTokenValidator({ getConfig: () => config, keySet: createLocalJWKSet({ keys: [jwk] }), now: () => now });
async function token(scp, patch = {}) {
  return new SignJWT({ ver: '2.0', tid: config.tenantId, oid: config.objectId, iss: config.issuer,
    aud: config.clientId, iat: now / 1000, nbf: now / 1000, exp: now / 1000 + 3600, scp, ...patch })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid }).sign(pair.privateKey);
}
test('entity adapter uses canonical owner validation and exact read/write scopes before store access', async () => {
  const calls = [];
  const store = Object.fromEntries(['list', 'detail', 'preview', 'mutate'].map((op) => [op, async (input) => { calls.push({ op, input }); return input; }]));
  const adapter = createEntityApiAdapter({ store, verifyApiAccessToken: verify });
  const request = async (operation, scope, patch = {}) => adapter.handle({ operation, input: {},
    actor_id: 'forged', principal: { operatorId: 'forged' }, headers: { authorization: `Bearer ${await token(scope, patch)}` } });
  for (const op of ['list', 'detail']) await request(op, 'Owner.Read');
  for (const op of ['preview', 'mutate']) {
    const result = await request(op, 'Entities.Write');
    assert.equal(result.actor_id, `${config.tenantId}:${config.objectId}`);
    await assert.rejects(request(op, 'Owner.Read'), { code: 'api_scope_denied' });
    await assert.rejects(request(op, 'Observations.Upload'), { code: 'api_scope_denied' });
  }
  assert.equal(calls.length, 4);
  await assert.rejects(request('list', 'Entities.Write'), { code: 'api_scope_denied' });
  await assert.rejects(request('mutate', 'Entities.Write', { oid: crypto.randomUUID() }), { code: 'api_owner_denied' });
  await assert.rejects(request('mutate', 'Entities.Write', { aud: 'graph' }), { code: 'api_owner_denied' });
  await assert.rejects(adapter.handle({ operation: 'mutate', input: {}, headers: { 'x-ms-client-principal': 'owner', 'x-blue-swallow-owner-proof': 'read-proof' } }), { code: 'api_token_required' });
  assert.equal(calls.length, 4);
});

test('optional entity HTTP dispatch is bounded, token gated and ignores actor headers', async (t) => {
  const { createCybermapApiServer } = await import('../src/server.mjs');
  const calls = [];
  const server = createCybermapApiServer({ verifyEntityApiToken: verify, store: { async ready() { return { ok: true }; } },
    entityStore: { async mutate(input) { calls.push(input); return { actor_id: input.actor_id }; } } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/v1/entities/mutate`;
  const send = (raw, body = '{}', extra = {}) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', ...(raw ? { Authorization: `Bearer ${raw}` } : {}), 'x-actor-id': 'forged', ...extra }, body });
  assert.equal((await send(await token('Owner.Read'))).status, 403);
  assert.equal((await send(null, '{}', { 'x-ms-client-principal': 'owner' })).status, 401);
  assert.equal(calls.length, 0);
  const result = await send(await token('Entities.Write'));
  assert.equal(result.status, 200);
  assert.match(result.headers.get('cache-control'), /no-store/);
  assert.equal((await result.json()).actor_id, `${config.tenantId}:${config.objectId}`);
  assert.equal((await send(await token('Entities.Write'), '{bad json')).status, 400);
  assert.equal((await send(await token('Entities.Write'), 'x'.repeat(65537))).status, 413);
  assert.equal((await send(await token('Entities.Write'), '{}', { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await fetch(url)).status, 405);
  assert.equal(calls.length, 1);
});

test('wired entity readiness stays pending until its migration is present', async (t) => {
  const { createCybermapApiServer } = await import('../src/server.mjs');
  let ready = false;
  const server = createCybermapApiServer({ store: { async ready() { return { ok: true }; } }, entityStore: { async ready() { return ready; } } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/readyz`;
  assert.equal((await fetch(url)).status, 503);
  ready = true;
  const result = await fetch(url); assert.equal(result.status, 200); assert.equal((await result.json()).entities, 'ready');
});
