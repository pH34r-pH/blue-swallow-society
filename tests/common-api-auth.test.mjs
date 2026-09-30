import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { createApiGuard } = require('./_lib/api-access-token');
const cache = require('./_lib/owner-api-token-cache');
const login = require('./_lib/owner-login');

test('runtime-neutral API guard rejects forged principals/application sessions and returns only validated owner context', async () => {
  const principal = Object.freeze({ tenantId: 'tenant', objectId: 'object', operatorId: 'tenant:object', scopes: Object.freeze(['Owner.Read']) });
  const guard = createApiGuard(async (token, scope) => {
    assert.equal(scope, 'Owner.Read');
    if (token !== 'validated-api-token') throw Object.assign(new Error(), { status: 403, code: 'api_owner_denied' });
    return principal;
  });
  for (const headers of [{ 'x-ms-client-principal': 'owner' }, { cookie: 'bss_owner_session=old' }, { Authorization: 'Bearer old.app-session' }]) {
    const context = {};
    assert.equal(await guard(context, { headers }, 'Owner.Read'), null);
    assert.equal(context.res.status, 403); assert.match(context.res.headers['Cache-Control'], /no-store/);
  }
  assert.equal(await guard({}, { headers: { Authorization: 'Bearer validated-api-token' } }, 'Owner.Read'), principal);
});

test('BFF MSAL cache holds API credentials only server-side and is bounded by session expiry and logout', async () => {
  const now = Date.now();
  const session = { token: 'synthetic-session', expiresAt: new Date(now + 300000).toISOString() };
  const account = { homeAccountId: 'synthetic' };
  const scopes = ['api://resource/Owner.Read'];
  const client = { async acquireTokenSilent(request) { assert.deepEqual(request, { account, scopes }); return { accessToken: 'server-only-api-token' }; } };
  cache.store(session, client, account, scopes, now);
  assert.equal(await cache.acquire(session.token, now), 'server-only-api-token');
  await assert.rejects(cache.acquire(session.token, now + 300000), /session_expired/);
  cache.store(session, client, account, scopes, now); cache.forget(session.token);
  await assert.rejects(cache.acquire(session.token, now), /session_expired/);
  assert.deepEqual(login.apiScopes({ apiClientId: 'resource' }), ['api://resource/Owner.Read']);
  assert.deepEqual(login.loginScopes({ apiClientId: 'resource' }), ['openid', 'profile', 'api://resource/Owner.Read']);
  assert.deepEqual(login.apiScopes({}), []);
});
