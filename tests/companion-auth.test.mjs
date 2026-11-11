import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { fixture } = require('./helpers/viewer-fixture.cjs');
const { createCompanionAuthHandler } = require('../api/companion-auth');
const viewer = require('../api/_lib/viewer-session');
const f = await fixture();
let clock = Date.parse('2026-11-10T12:00:00Z');
let limited = false, limiterFailure = false;
let reservations = [];
const handler = createCompanionAuthHandler({ getConfig: () => f.settings, createStore: () => f.store, now: () => clock,
  createLimiter: () => ({ async reserveAttempt(key, config) {
    reservations.push({ key, config });
    if (limiterFailure) throw new Error('sensitive storage error');
    return { limited, retryAfterSeconds: 60 };
  } }) });
async function call(action, options = {}) {
  const context = {};
  await handler(context, { method: action === 'session' ? 'GET' : 'POST', params: { action },
    headers: { origin: f.settings.origin, 'content-type': 'application/json' }, body: {}, ...options });
  return context.res;
}

test('login, restore, renewal and logout use the real durable session boundary', async () => {
  const login = await call('login', { body: { password: f.password } });
  assert.equal(login.status, 200);
  assert.deepEqual(reservations.map((item) => item.config.maxAttempts), [30, 5]);
  assert.equal(login.cookies[0].name, '__Host-bss_viewer_session');
  assert.equal(login.cookies[0].httpOnly, true);
  assert.equal(login.cookies[0].secure, true);
  assert.equal(login.cookies[0].sameSite, 'Strict');
  const headers = { origin: f.settings.origin, 'content-type': 'application/json', cookie: `${viewer.COOKIE}=${login.cookies[0].value}` };
  clock += 60000;
  const restored = await call('session', { headers });
  assert.equal(restored.body.operatorSession.token, login.body.operatorSession.token);
  assert.equal(restored.cookies.length, 0);
  const renewed = await call('renew', { headers });
  assert.equal(renewed.status, 200);
  assert.ok(Date.parse(renewed.body.operatorSession.expiresAt) > Date.parse(login.body.operatorSession.expiresAt));
  assert.equal((await call('logout', { headers })).status, 200);
  assert.equal((await call('session', { headers })).status, 401);
  assert.equal((await call('session', { headers: { cookie: `${viewer.COOKIE}=${renewed.cookies[0].value}` } })).status, 401);
  assert.equal((await call('logout')).status, 200);
});

test('invalid input, Origin, method, password and throttling cannot create a session', async () => {
  const before = f.table.rows.size;
  assert.equal((await call('login', { body: { password: 'wrong' } })).status, 401);
  assert.equal((await call('login', { body: { password: 'x'.repeat(5000) } })).status, 413);
  assert.equal((await call('login', { body: { password: 'x'.repeat(1025) } })).status, 400);
  assert.equal((await call('login', { body: { password: f.password, role: 'owner' } })).status, 400);
  assert.equal((await call('login', { method: 'GET' })).status, 405);
  assert.equal((await call('login', { headers: { origin: 'https://other.test', 'content-type': 'application/json' } })).status, 403);
  assert.equal((await call('login', { headers: { origin: f.settings.origin, 'content-type': 'text/plain' } })).status, 415);
  assert.equal((await call('unknown')).status, 404);
  limited = true;
  const throttled = await call('login', { body: { password: f.password } });
  assert.equal(throttled.status, 429);
  assert.equal(throttled.headers['Retry-After'], '60');
  limited = false;
  limiterFailure = true;
  const failure = await call('login', { body: { password: f.password } });
  assert.equal(failure.status, 503);
  assert.doesNotMatch(JSON.stringify(failure), /sensitive storage/);
  limiterFailure = false;
  assert.equal(f.table.rows.size, before);
});

test('unavailable durable store fails closed and never reports successful logout', async () => {
  const login = await call('login', { body: { password: f.password } });
  const headers = { origin: f.settings.origin, 'content-type': 'application/json', cookie: `${viewer.COOKIE}=${login.cookies[0].value}` };
  f.table.fail = true;
  for (const action of ['session', 'renew', 'logout']) assert.equal((await call(action, { headers })).status, 503);
  const failed = await call('login', { body: { password: f.password } });
  assert.equal(failed.status, 503);
  assert.equal(failed.cookies.length, 0);
  f.table.fail = false;
  assert.equal((await call('logout', { headers })).status, 200);
});
