import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { requireOwnerReadProof } from '../vm/cybermap-api/src/owner-read-auth.mjs';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { SignJWT, createLocalJWKSet, exportJWK } = await import(require.resolve('jose'));
const owner = require('./shared/owner-session.cjs');
const { verifyIdToken } = require('./_lib/owner-id-token');
const { ownerBackendHeaders } = require('./_lib/owner-backend-proof');
const { verifyOperatorRequest } = require('./_lib/operator-auth');
const { createOwnerAuthHandler } = require('./owner-auth');
const login = require('./_lib/owner-login');

Object.assign(process.env, { BLUE_SWALLOW_AUTH_MODE: 'entra', BLUE_SWALLOW_ENTRA_TENANT_ID: '11111111-1111-1111-1111-111111111111',
  BLUE_SWALLOW_ENTRA_CLIENT_ID: '22222222-2222-2222-2222-222222222222', BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID: '33333333-3333-3333-3333-333333333333',
  BLUE_SWALLOW_OWNER_SESSION_KEY: 'test-only-owner-session-key-at-least-thirty-two-bytes', BLUE_SWALLOW_PUBLIC_ORIGIN: 'https://owner.example.test', BLUE_SWALLOW_ENTRA_CLIENT_SECRET: 'test-only-client-secret' });
const config = login.loginConfig();
const now = Date.parse('2026-09-30T00:00:00Z');
const claims = { iss: config.issuer, aud: config.audience, tid: config.tenant, oid: config.owner, iat: now / 1000, exp: now / 1000 + 3600, nonce: 'test-nonce' };
const keys = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = await exportJWK(keys.publicKey);
jwk.kid = 'test';
const keySet = createLocalJWKSet({ keys: [jwk] });
async function signed(overrides = {}, key = keys.privateKey) {
  return new SignJWT({ ...claims, ...overrides }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(key);
}

test('Entra ID token requires signature, exact issuer/audience/tenant/owner, expiry and nonce', async () => {
  assert.equal((await verifyIdToken(await signed(), config, 'test-nonce', { keySet, now })).oid, config.owner);
  for (const overrides of [{ iss: 'https://attacker.test' }, { aud: 'other' }, { aud: [config.audience] }, { tid: 'other' }, { oid: 'other' }, { exp: now / 1000 }, { iat: now / 1000 + 1 }, { nonce: 'other' }, { oid: undefined, email: 'owner@example.test', roles: ['authenticated'] }]) {
    await assert.rejects(verifyIdToken(await signed(overrides), config, 'test-nonce', { keySet, now }));
  }
  const attacker = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  await assert.rejects(verifyIdToken(await signed({}, attacker.privateKey), config, 'test-nonce', { keySet, now }));
});

test('owner sessions are bounded, reject legacy/forged identity headers and fail closed without config', () => {
  const session = owner.createOwnerSession(claims, config, now);
  assert.equal(session.ttlSeconds, 300);
  assert.equal(owner.verifyOwnerSession(session.token, { config, now }).ok, true);
  assert.equal(owner.verifyOwnerSession(session.token, { config, now: now + 300000 }).error, 'session_expired');
  assert.equal(verifyOperatorRequest({ headers: { 'x-ms-client-principal': Buffer.from(JSON.stringify(claims)).toString('base64') } }, { now }).ok, false);
  assert.equal(verifyOperatorRequest({ headers: { 'x-blue-swallow-operator-token': session.token } }, { now }).ok, true);
  const saved = process.env.BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID;
  delete process.env.BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID;
  assert.equal(verifyOperatorRequest({ headers: { 'x-blue-swallow-operator-token': session.token } }, { now }).status, 503);
  process.env.BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID = saved;
});

test('login transactions bind state, expire, resist tampering and prevent external return redirects', () => {
  const transaction = login.newTransaction('https://attacker.test', config, now);
  assert.equal(transaction.returnTo, '/operator/travels');
  const sealed = login.sealTransaction(transaction, config);
  assert.equal(login.openTransaction(sealed, transaction.state, config, now).verifier, transaction.verifier);
  assert.throws(() => login.openTransaction(sealed, 'other', config, now));
  assert.throws(() => login.openTransaction(sealed, transaction.state, config, now + 300000));
  assert.throws(() => login.openTransaction('x' + sealed, transaction.state, config, now));
});

test('authorization-code callback uses PKCE, validates owner and sets a secure bounded cookie', async () => {
  let request;
  let transaction;
  const client = { async getAuthCodeUrl(input) { request = input; return 'https://login.microsoftonline.com/test'; },
    async acquireTokenByCode(input) { assert.equal(input.codeVerifier, transaction.verifier); return { idToken: await signed({ nonce: transaction.nonce }) }; } };
  const handler = createOwnerAuthHandler({ getConfig: () => config, clientFactory: () => client, now: () => now,
    verify: (raw, config, nonce) => verifyIdToken(raw, config, nonce, { keySet, now }) });
  const start = {};
  await handler(start, { params: { action: 'login' }, query: { returnTo: '/operator/devices?selected=test' } });
  const cookie = `${start.res.cookies[0].name}=${start.res.cookies[0].value}`;
  transaction = login.openTransaction(cookie.split('=')[1], request.state, config, now);
  assert.equal(request.codeChallengeMethod, 'S256');
  const callback = {};
  await handler(callback, { params: { action: 'callback' }, headers: { cookie }, query: { state: request.state, code: 'test-code' } });
  assert.equal(callback.res.headers.Location, '/operator/devices?selected=test');
  const sessionCookie = callback.res.cookies[1];
  assert.equal(sessionCookie.httpOnly, true);
  assert.equal(sessionCookie.secure, true);
  assert.equal(sessionCookie.sameSite, 'Strict');
  assert.equal(owner.verifyOwnerSession(sessionCookie.value, { config, now }).ok, true);
  const denied = {};
  await handler(denied, { params: { action: 'callback' }, headers: { cookie }, query: { state: 'forged', code: 'test-code' } });
  assert.equal(denied.res.headers.Location, '/?auth=denied');
});

test('direct backend reads need a short-lived signed owner proof, not just a service token or principal header', () => {
  const pair = crypto.generateKeyPairSync('ed25519');
  process.env.BLUE_SWALLOW_OWNER_PROXY_PRIVATE_KEY = pair.privateKey.export({ type: 'pkcs8', format: 'pem' });
  process.env.BLUE_SWALLOW_OWNER_PROXY_PUBLIC_KEY = pair.publicKey.export({ type: 'spki', format: 'pem' });
  const session = owner.createOwnerSession(claims, config, now);
  const auth = owner.verifyOwnerSession(session.token, { config, now });
  const headers = ownerBackendHeaders(auth, now);
  assert.deepEqual(requireOwnerReadProof({ headers }, now), { tenantId: config.tenant, objectId: config.owner, operatorId: `${config.tenant}:${config.owner}` });
  assert.throws(() => requireOwnerReadProof({ headers }, now + 30000));
  assert.throws(() => requireOwnerReadProof({ headers: { 'x-blue-swallow-cybermap-read-token': 'valid-service-token', 'x-ms-client-principal': 'owner' } }, now));
  for (const key of ['oid', 'tid', 'iss']) {
    const forgedOwner = ownerBackendHeaders({ ...auth, token: { ...auth.token, [key]: 'other' } }, now);
    assert.throws(() => requireOwnerReadProof({ headers: forgedOwner }, now));
  }
});

test('owner cookie wins over platform authorization; cookie writes require the exact origin', () => {
  const session = owner.createOwnerSession(claims, config, now);
  const headers = { cookie: `${owner.COOKIE}=${session.token}`, authorization: 'Bearer platform-token' };
  assert.equal(verifyOperatorRequest({ headers }, { now }).ok, true);
  assert.equal(verifyOperatorRequest({ method: 'POST', headers }, { now }).ok, false);
  assert.equal(verifyOperatorRequest({ method: 'POST', headers: { ...headers, origin: config.origin } }, { now }).ok, true);
});

test('direct Function shell/assets/downloads deny wrong owner before reading private data', async () => {
  const handlers = [require('./operator-shell'), require('./operator-assets'), require('./operator-downloads')];
  const realNow = Date.now();
  const session = owner.createOwnerSession({ ...claims, iat: Math.floor(realNow / 1000), exp: Math.floor(realNow / 1000) + 3600 }, config, realNow);
  const headers = { 'x-blue-swallow-operator-token': session.token };
  for (const handler of handlers) {
    const denied = {};
    await handler(denied, { method: 'GET', headers: { 'x-ms-client-principal': 'authenticated-owner' }, params: { asset: 'styles.css', action: 'metadata' } });
    assert.ok([401, 403].includes(denied.res.status));
  }
  const allowed = {};
  await handlers[0](allowed, { method: 'GET', headers });
  assert.equal(allowed.res.status, 200);
  assert.match(allowed.res.body, /Devices/);
});

test('Entra mode retires passcode login without consulting old secrets', async () => {
  const context = {};
  await require('./validate-passcode')(context, { body: { passcode: 'anything' } });
  assert.equal(context.res.status, 410);
});

test('HTTP backend refuses direct read-token requests before store access and accepts signed owner delegation', async (t) => {
  const { createCybermapApiServer } = await import('../vm/cybermap-api/src/server.mjs');
  let reads = 0;
  const server = createCybermapApiServer({ store: { async queryViewport() { reads++; return { accessPoints: [] }; } } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  process.env.BSS_CYBERMAP_READ_TOKEN = 'test-read-service-token';
  const url = `http://127.0.0.1:${server.address().port}/api/v1/cybermap/operator-signals`;
  const headers = { 'content-type': 'application/json', 'x-blue-swallow-cybermap-read-token': process.env.BSS_CYBERMAP_READ_TOKEN };
  const body = JSON.stringify({ lat: 0, lon: 0 });
  assert.equal((await fetch(url, { method: 'POST', headers, body })).status, 403);
  assert.equal(reads, 0);
  const realNow = Date.now();
  const session = owner.createOwnerSession({ ...claims, exp: Math.floor(realNow / 1000) + 3600 }, config, realNow);
  const auth = owner.verifyOwnerSession(session.token, { config, now: realNow });
  assert.equal((await fetch(url, { method: 'POST', headers: { ...headers, ...ownerBackendHeaders(auth, realNow) }, body })).status, 200);
  assert.equal(reads, 1);
});

test('profile and release metadata reject a forged platform principal before data access', async () => {
  for (const handler of [require('./profile'), require('./wardriver-release-current')]) {
    const context = {};
    await handler(context, { method: 'GET', headers: { 'x-ms-client-principal': 'owner' } });
    assert.equal(context.res.status, 401);
    assert.equal(context.res.headers['Cache-Control'], 'no-store');
  }
  const realNow = Date.now();
  const session = owner.createOwnerSession({ ...claims, exp: Math.floor(realNow / 1000) + 3600 }, config, realNow);
  const req = { method: 'GET', headers: { 'x-blue-swallow-operator-token': session.token } };
  const context = {};
  await require('./profile')(context, req);
  assert.equal(context.res.status, 200);
  assert.equal(context.res.body.operatorId, `${config.tenant}:${config.owner}`);
  let reads = 0;
  await require('./wardriver-release-current')._internals.handle(context, { method: 'GET', headers: {} }, { getRelease() { reads++; } });
  assert.equal(reads, 0);
});

test('unknown auth modes fail closed and logout clears both owner cookies', async () => {
  process.env.BLUE_SWALLOW_AUTH_MODE = 'misspelled';
  assert.equal(verifyOperatorRequest({ headers: {} }).status, 503);
  process.env.BLUE_SWALLOW_AUTH_MODE = 'entra';
  const context = {};
  await createOwnerAuthHandler()(context, { method: 'GET', headers: {}, params: { action: 'logout' } });
  assert.equal(context.res.headers.Location, '/?auth=signed-out');
  assert.equal(context.res.cookies.length, 2);
  assert.ok(context.res.cookies.every((cookie) => cookie.maxAge === 0));
});
