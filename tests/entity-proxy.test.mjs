import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { createApiGuard } = require('./_lib/api-access-token');
const { createEntityOwnerGuard } = require('./_lib/entity-owner-auth');
const { createEntityProxy } = require('./cybermap-entities');

const owner = Object.freeze({ tenantId: 'synthetic-tid', objectId: 'synthetic-oid', operatorId: 'synthetic-tid:synthetic-oid', scopes: Object.freeze(['Owner.Read', 'Entities.Write']) });
const apiGuard = createApiGuard(async (token, scope) => {
  if (token !== 'synthetic.api.write' && !(token === 'synthetic.api.read' && scope === 'Owner.Read')) throw Object.assign(new Error(), { status: 403, code: 'api_scope_denied' });
  return owner;
});
test('entity Functions proxy requires operation-scoped API authority for bearer and verified Web sessions', async () => {
  let writes = 0;
  const sessionGuard = (context, req) => {
    if (req.headers.origin !== 'https://synthetic.invalid') { context.res = { status: 403 }; return { ok: false }; }
    return { ok: true, rawToken: 'verified-session', token: { tid: owner.tenantId, oid: owner.objectId } };
  };
  let cached = 'synthetic.api.read';
  const authorize = createEntityOwnerGuard({ apiGuard, sessionGuard, acquire: async () => cached });
  const handler = createEntityProxy({ authorize, post: async (path, input, auth) => { writes++; assert.equal(auth.principal, owner); assert.ok(path.endsWith('/mutate')); return input; } });
  const req = { method: 'POST', params: { operation: 'mutate' }, headers: { origin: 'https://synthetic.invalid' }, body: {} };
  let context = {}; await handler(context, req); assert.equal(context.res.status, 403); assert.equal(writes, 0);
  cached = 'synthetic.api.write'; context = {}; await handler(context, req); assert.equal(context.res.status, 200); assert.equal(writes, 1);
  context = {}; await handler(context, { ...req, headers: { origin: 'https://attacker.invalid' } }); assert.equal(context.res.status, 403); assert.equal(writes, 1);
  context = {}; await handler(context, { ...req, headers: { authorization: 'Bearer synthetic.api.read' } }); assert.equal(context.res.status, 403);
  context = {}; await handler(context, { ...req, headers: { authorization: 'Bearer synthetic.api.write', 'x-actor-id': 'forged' } }); assert.equal(context.res.status, 200);
  const legacy = createEntityOwnerGuard({ apiGuard, sessionGuard: () => ({ ok: true, token: { operatorId: 'legacy' } }) });
  context = {}; assert.equal(await legacy(context, { headers: {} }, 'Entities.Write'), null); assert.equal(context.res.status, 403);
});
test('entity Functions rejects unbounded bodies/query/methods and never proxies denied authority', async () => {
  let calls = 0;
  const handler = createEntityProxy({ authorize: async () => ({ principal: owner, apiAccessToken: 'synthetic.api.write' }), post: async () => { calls++; return {}; } });
  for (const patch of [{ method: 'GET' }, { query: { actor_id: 'forged' } }, { body: { reason: 'x'.repeat(65536) } }, { params: { operation: 'delete-raw' } }]) {
    const context = {}; await handler(context, { method: 'POST', params: { operation: 'mutate' }, body: {}, ...patch }); assert.ok(context.res.status >= 400);
  }
  assert.equal(calls, 0);
});
