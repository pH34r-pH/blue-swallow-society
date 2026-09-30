import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const owner = require('./shared/owner-session.cjs');
const login = require('./_lib/owner-login');
const cache = require('./_lib/owner-api-token-cache');
const { createOwnerAuthHandler } = require('./owner-auth');
const { verifyIdToken } = require('./_lib/owner-id-token');
const { createApiTokenValidator } = require('./_lib/api-access-token');
const { SignJWT, createLocalJWKSet, exportJWK } = await import(require.resolve('jose'));
Object.assign(process.env, { BLUE_SWALLOW_AUTH_MODE: 'entra', BLUE_SWALLOW_ENTRA_TENANT_ID: '11111111-1111-1111-1111-111111111111',
  BLUE_SWALLOW_ENTRA_CLIENT_ID: '22222222-2222-2222-2222-222222222222', BLUE_SWALLOW_ENTRA_API_CLIENT_ID: '44444444-4444-4444-4444-444444444444',
  BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID: '33333333-3333-3333-3333-333333333333', BLUE_SWALLOW_OWNER_SESSION_KEY: 'synthetic-owner-edit-session-key-at-least-32-bytes',
  BLUE_SWALLOW_PUBLIC_ORIGIN: 'https://owner.example.test', BLUE_SWALLOW_ENTRA_CLIENT_SECRET: 'synthetic-client-secret' });
const config = login.loginConfig(), now = Date.now();
const claims = { iss: config.issuer, aud: config.audience, tid: config.tenant, oid: config.owner, iat: Math.floor(now / 1000), exp: Math.floor(now / 1000) + 3600 };
const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }), jwk = await exportJWK(pair.publicKey); jwk.kid = 'synthetic';
const keySet = createLocalJWKSet({ keys: [jwk] });
const sign = (claims) => new SignJWT(claims).setProtectedHeader({ alg: 'RS256', kid: 'synthetic' }).sign(pair.privateKey);
function fixture({ tokenScope = 'Owner.Read Entities.Write', wrongOwner = false, wrongNonce = false, codeFailure = false } = {}) {
  const session = owner.createOwnerSession(claims, config, now); let clock = now, authorization, transaction, exchanges = 0;
  const client = { async getAuthCodeUrl(input) { authorization = input; return 'https://login.microsoftonline.com/synthetic'; },
    async acquireTokenByCode(input) {
      exchanges++; if (codeFailure) throw new Error('synthetic-provider-unavailable'); assert.equal(input.codeVerifier, transaction.verifier);
      assert.deepEqual(input.scopes, authorization.scopes);
      return { account: { homeAccountId: 'synthetic' }, idToken: await sign({ ...claims, nonce: wrongNonce ? 'incorrect' : transaction.nonce, ...(wrongOwner ? { oid: '55555555-5555-5555-5555-555555555555' } : {}) }),
        accessToken: await sign({ ...claims, aud: config.apiClientId, ver: '2.0', nbf: claims.iat, scp: tokenScope }) };
    }, async acquireTokenSilent() { return { accessToken: 'synthetic-broader-provider-cache-token' }; } };
  cache.store(session, client, { homeAccountId: 'synthetic' }, login.apiScopes(config), now);
  const handler = createOwnerAuthHandler({ getConfig: () => config, clientFactory: () => client, now: () => clock,
    verify: (token, cfg, nonce) => verifyIdToken(token, cfg, nonce, { keySet, now: clock }),
    verifyApi: createApiTokenValidator({ keySet, now: () => clock, loadJose: () => import(require.resolve('jose')) }) });
  const headers = { cookie: `${owner.COOKIE}=${session.token}`, origin: config.origin };
  async function invoke(req) { const context = {}; await handler(context, req); return context.res; }
  async function begin(patch = {}) {
    const response = await invoke({ method: 'POST', params: { action: 'edit' }, headers, ...patch });
    if (response.cookies) transaction = login.openTransaction(response.cookies[0].value, authorization.state, config, clock);
    return response;
  }
  const callback = (query = {}, sealed) => invoke({ method: 'GET', params: { action: 'callback' }, headers: { cookie: `${login.TRANSACTION_COOKIE}=${sealed || login.sealTransaction(transaction, config)}` },
    query: { state: transaction.state, code: 'synthetic', ...query } });
  return { session, begin, callback, invoke, headers, client, get authorization() { return authorization; }, get exchanges() { return exchanges; }, expire() { clock += 300000; } };
}
test('explicit owner edit action requests only approved scopes with sealed state/nonce/PKCE and validates both JWTs', async () => {
  const f = fixture(); assert.equal(cache.status(f.session.token).editing, false);
  assert.equal((await f.begin()).status, 200);
  assert.deepEqual(f.authorization.scopes, ['openid', 'profile', ...login.apiScopes(config, true)]);
  assert.equal(f.authorization.codeChallengeMethod, 'S256'); assert.ok(f.authorization.nonce);
  const result = await f.callback(); assert.equal(result.headers.Location, '/operator/entities?editing=enabled');
  const fresh = result.cookies[1].value;
  assert.equal(owner.verifyOwnerSession(fresh).ok, true); assert.equal(cache.status(fresh).editing, true);
  assert.equal(cache.status(f.session.token).active, false); cache.forget(fresh);
});
test('read-session intent rejects a broader cached token before provider access; origin and owner are required to begin', async () => {
  const f = fixture();
  await assert.rejects(cache.acquire(f.session.token, now, 'Entities.Write'), { message: 'api_scope_denied', status: 403 });
  assert.equal((await f.begin({ headers: { ...f.headers, origin: 'https://attacker.invalid' } })).status, 403);
  assert.equal((await f.begin({ headers: { origin: config.origin, 'x-ms-client-principal': 'owner' } })).status, 401);
  assert.equal((await f.begin({ method: 'GET' })).body.editing, false);
  assert.equal(f.authorization, undefined); cache.forget(f.session.token);
});
test('cancel, missing write grant and wrong owner return the existing read-only session without escalation', async () => {
  for (const options of [{ cancel: true }, { tokenScope: 'Owner.Read' }, { wrongOwner: true }, { wrongNonce: true }, { codeFailure: true }]) {
    const f = fixture(options); await f.begin();
    const result = await f.callback(options.cancel ? { error: 'access_denied', code: undefined } : {});
    assert.equal(result.headers.Location, '/operator/entities?editing=denied');
    assert.equal(result.cookies[1].value, f.session.token); assert.equal(cache.status(f.session.token).editing, false);
    await assert.rejects(cache.acquire(f.session.token, now, 'Entities.Write'), { status: 403 }); cache.forget(f.session.token);
  }
});
test('expired, logout and tampered edit transactions cannot exchange codes or revive editing', async () => {
  const expired = fixture(); await expired.begin(); expired.expire(); assert.match((await expired.callback()).headers.Location, /auth=denied/); assert.equal(expired.exchanges, 0); cache.forget(expired.session.token);
  const loggedOut = fixture(); await loggedOut.begin(); cache.forget(loggedOut.session.token); assert.equal((await loggedOut.callback()).headers.Location, '/?auth=expired'); assert.equal(loggedOut.exchanges, 0);
  const forged = fixture(); await forged.begin(); assert.equal((await forged.callback({}, 'forged')).headers.Location, '/?auth=denied'); assert.equal(forged.exchanges, 0); cache.forget(forged.session.token);
});
