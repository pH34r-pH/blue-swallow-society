import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const viewer = require('../api/_lib/viewer-session');
const { fixture } = require('./helpers/viewer-fixture.cjs');
const { createCompanionGuard } = require('../api/_lib/companion-auth');
const { verifyOperatorRequest } = require('../api/_lib/operator-auth');
const { createEntityOwnerGuard } = require('../api/_lib/entity-owner-auth');
const owner = require('../api/shared/owner-session.cjs');
const f = await fixture();
const now = Date.parse('2026-11-10T12:00:00Z');
Object.assign(process.env, f.env);

test('password KDF validates a generated verifier and bounds untrusted input/cost', async () => {
  assert.equal(await viewer.verifyPassword(f.password, f.settings), true);
  assert.equal(await viewer.verifyPassword(f.password + 'wrong', f.settings), false);
  for (const value of ['', null, {}, 'x'.repeat(1025)]) assert.equal(await viewer.verifyPassword(value, f.settings), false);
  for (const value of ['', 'scrypt$2$8$1$' + '0'.repeat(32) + '$' + '0'.repeat(64), 'sha256:' + '0'.repeat(64)]) {
    assert.throws(() => viewer.verifier(value));
  }
  const results = await Promise.allSettled(Array.from({ length: 3 }, () => viewer.verifyPassword(f.password, f.settings)));
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 2);
  assert.equal(results.filter((result) => result.status === 'rejected').length, 1);
});

test('configuration, purpose, generation and time are fail-closed', async () => {
  const record = await f.store.create(f.settings, now);
  const session = viewer.signSession(record, f.settings, now);
  assert.equal(session.ttlSeconds, 900);
  const claims = viewer.verifyToken(session.token, f.settings, now);
  assert.equal(claims.typ, 'bss.viewer.v1');
  assert.throws(() => viewer.verifyToken(session.token, f.settings, now + 900000));
  assert.throws(() => viewer.verifyToken(session.token, f.settings, now - 1000));
  for (const token of ['x' + session.token, session.token + '.extra', 'a.b.c', '', 'x'.repeat(3000)]) {
    assert.throws(() => viewer.verifyToken(token, f.settings, now));
  }
  for (const change of [{ BLUE_SWALLOW_VIEWER_SESSION_EPOCH: 'fixture-2' },
    { BSS_WARDRIVER_SYNC_GROUP_ID: 'other-group' }, { BLUE_SWALLOW_VIEWER_SESSION_KEY: crypto.randomBytes(32).toString('base64url') },
    { BLUE_SWALLOW_VIEWER_PASSWORD_SCRYPT: await viewer.encodePassword(crypto.randomBytes(24).toString('hex')) }]) {
    assert.throws(() => viewer.verifyToken(session.token, viewer.config({ ...f.env, ...change }), now));
  }
  for (const change of [{ BLUE_SWALLOW_AUTH_MODE: 'legacy' }, { BLUE_SWALLOW_PUBLIC_ORIGIN: 'http://unsafe.test' },
    { BLUE_SWALLOW_VIEWER_SESSION_KEY: 'short' }, { BLUE_SWALLOW_VIEWER_SESSION_EPOCH: '' }]) {
    assert.throws(() => viewer.config({ ...f.env, ...change }));
  }
});

test('durable idle expiry, absolute lifetime and logout are authoritative', async () => {
  const record = await f.store.create(f.settings, now);
  const claims = viewer.verifyToken(viewer.signSession(record, f.settings, now).token, f.settings, now);
  await assert.rejects(f.store.validate(claims, now + 900000));
  let renewed;
  for (let at = now + 600000; at < now + 28800000; at += 600000) renewed = await f.store.renew(claims, at);
  const last = viewer.signSession(renewed, f.settings, now + 28700000);
  assert.equal(Date.parse(last.expiresAt), now + 28800000);
  await assert.rejects(f.store.renew(claims, now + 28800000));
  await f.store.revoke(claims);
  await assert.rejects(f.store.validate(claims, now));
  await f.store.revoke(claims); // retry after a lost successful response
  f.table.fail = true;
  await assert.rejects(f.store.create(f.settings, now), /viewer_unavailable/);
  f.table.fail = false;
});

test('concurrent renewal cannot resurrect logout and converges on one idle expiry', async () => {
  const record = await f.store.create(f.settings, now);
  const claims = viewer.verifyToken(viewer.signSession(record, f.settings, now).token, f.settings, now);
  const rows = await Promise.all([f.store.renew(claims, now + 1000), f.store.renew(claims, now + 1000)]);
  assert.equal(rows[0].idleExpiresAt, rows[1].idleExpiresAt);
  f.table.beforeUpdate = async () => { f.table.beforeUpdate = null; await f.store.revoke(claims); };
  await assert.rejects(f.store.renew(claims, now + 2000), /session_expired/);
  await assert.rejects(f.store.validate(claims, now + 2000));
});

test('cleanup is bounded and cannot delete a concurrently renewed row', async () => {
  const record = await f.store.create(f.settings, now);
  const claims = viewer.verifyToken(viewer.signSession(record, f.settings, now).token, f.settings, now);
  // Sweep captured an expired snapshot while a renewal begun earlier finishes.
  f.table.beforeDelete = async (id) => {
    if (id !== record.rowKey) return;
    f.table.beforeDelete = null;
    await f.store.renew(claims, now + 800000);
  };
  await f.store.sweep(now + 900000);
  await f.store.validate(claims, now + 900000);
  await f.store.sweep(now + 28800001);
  await assert.rejects(f.store.validate(claims, now));
  f.table.rows.clear();
  for (let i = 0; i < 205; i++) await f.store.create(f.settings, now);
  assert.equal(await f.store.sweep(now + 900001, 1000), 200);
  assert.equal(f.table.rows.size, 5);
});

test('only companion guard accepts viewer; owner/device/feed authority stays separate', async () => {
  const record = await f.store.create(f.settings, now);
  const session = viewer.signSession(record, f.settings, now);
  const req = { method: 'GET', headers: { 'x-blue-swallow-operator-token': session.token } };
  assert.equal(verifyOperatorRequest(req, { now }).ok, false);
  const guard = createCompanionGuard({ getConfig: () => f.settings, createStore: () => f.store, now: () => now });
  assert.equal((await guard({}, req)).role, 'viewer');
  const writeContext = {};
  assert.equal(await createEntityOwnerGuard() (writeContext, req, 'Entities.Write'), null);
  assert.ok(writeContext.res.status >= 400);
  const context = {};
  assert.equal((await guard(context, { ...req, method: 'POST', headers: { ...req.headers, origin: 'https://other.test' } })).ok, false);
  assert.equal(context.res.status, 401);
  await f.store.revoke(viewer.verifyToken(session.token, f.settings, now));
  assert.equal((await guard({}, req)).ok, false);
});

test('password mode retains Entra owner step-up but explicit credentials cannot borrow its cookie', () => {
  Object.assign(process.env, { BLUE_SWALLOW_ENTRA_TENANT_ID: '11111111-1111-1111-1111-111111111111',
    BLUE_SWALLOW_ENTRA_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
    BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID: '33333333-3333-3333-3333-333333333333',
    BLUE_SWALLOW_OWNER_SESSION_KEY: crypto.randomBytes(32).toString('hex') });
  const config = owner.ownerConfig();
  const session = owner.createOwnerSession({ iss: config.issuer, aud: config.audience, tid: config.tenant,
    oid: config.owner, exp: now / 1000 + 300 }, config, now);
  const headers = { cookie: `${owner.COOKIE}=${session.token}` };
  assert.equal(verifyOperatorRequest({ headers }, { now }).ok, true);
  assert.equal(verifyOperatorRequest({ headers: { ...headers, authorization: 'Bearer viewer-or-invalid' } }, { now }).ok, false);
  assert.equal(verifyOperatorRequest({ headers: { ...headers, 'x-blue-swallow-operator-token': 'viewer-or-invalid' } }, { now }).ok, false);
  for (const malformed of [
    { authorization: 'Basic invalid' }, { authorization: '' }, { authorization: ['Bearer ' + session.token] },
    { 'x-blue-swallow-operator-token': '' },
    { authorization: 'Bearer ' + session.token, Authorization: 'Bearer invalid' },
    { authorization: 'Bearer invalid', 'x-blue-swallow-operator-token': session.token },
    { cookie: `${owner.COOKIE}=${session.token}; ${owner.COOKIE}=invalid` },
  ]) assert.equal(verifyOperatorRequest({ headers: { ...headers, ...malformed } }, { now }).ok, false);
});

test('viewer credentials reject duplicate, empty and conflicting headers instead of falling back to cookies', async () => {
  const record = await f.store.create(f.settings, now);
  const session = viewer.signSession(record, f.settings, now);
  const cookie = `${viewer.COOKIE}=${session.token}`;
  for (const extra of [{ authorization: '' }, { authorization: 'Basic invalid' },
    { 'x-blue-swallow-operator-token': [] }, { 'x-blue-swallow-operator-token': '' },
    { authorization: 'Bearer ' + session.token, Authorization: 'Bearer invalid' },
    { authorization: 'Bearer invalid', 'x-blue-swallow-operator-token': session.token },
    { cookie: `${cookie}; ${cookie}` }]) {
    assert.throws(() => viewer.requestToken({ headers: { cookie, ...extra } }), /session_expired/);
  }
  assert.equal(viewer.requestToken({ headers: { cookie } }), session.token);
});
