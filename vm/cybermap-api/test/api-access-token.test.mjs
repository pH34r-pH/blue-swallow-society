import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { SignJWT, createLocalJWKSet, exportJWK } from 'jose';
import common from '../src/api-access-token.cjs';
import { createCybermapApiServer } from '../src/server.mjs';
const now = Date.parse('2026-09-30T12:00:00Z');
const config = { tenantId: '11111111-1111-4111-8111-111111111111', clientId: '22222222-2222-4222-8222-222222222222', objectId: '33333333-3333-4333-8333-333333333333' };
config.issuer = `https://login.microsoftonline.com/${config.tenantId}/v2.0`;
const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = await exportJWK(pair.publicKey); jwk.kid = 'synthetic';
const verify = common.createApiTokenValidator({ getConfig: () => config, keySet: createLocalJWKSet({ keys: [jwk] }), now: () => now });
const claims = { ver: '2.0', tid: config.tenantId, oid: config.objectId, iss: config.issuer, aud: config.clientId,
  iat: now / 1000, nbf: now / 1000, exp: now / 1000 + 3600, scp: 'Owner.Read Observations.Upload Entities.Write World.Manage' };
async function token(patch = {}) { return new SignJWT({ ...claims, ...patch }).setProtectedHeader({ alg: 'RS256', kid: 'synthetic' }).sign(pair.privateKey); }

test('common API token returns frozen immutable owner and checks each exact operation scope', async () => {
  const raw = await token();
  for (const scope of common.SCOPES) {
    const owner = await verify(raw, scope);
    assert.equal(owner.operatorId, `${config.tenantId}:${config.objectId}`);
    assert.equal(Object.isFrozen(owner), true); assert.equal(Object.isFrozen(owner.scopes), true);
  }
  await assert.rejects(verify(await token({ scp: 'Owner.Read' }), 'Entities.Write'), /api_scope_denied/);
  await assert.rejects(verify(await token({ scp: 'Owner.Read Entities.Write' }), 'World.Manage'), /api_scope_denied/);
  await assert.rejects(verify(raw, 'Entities.Read'), /api_auth_unavailable/);
});

test('common API token rejects wrong owner/issuer/tenant/audience, ID tokens, app-only, future and expired claims', async () => {
  for (const patch of [{ tid: 'other' }, { oid: 'other' }, { iss: 'https://attacker.invalid' }, { aud: 'graph' },
    { aud: [config.clientId] }, { ver: '1.0' }, { scp: undefined }, { scp: '', roles: ['Owner.Read'] },
    { idtyp: 'app' }, { scp: 'owner.read' }, { scp: 'Owner.Read Unapproved.Scope' }, { exp: now / 1000 },
    { nbf: now / 1000 + 1 }, { iat: now / 1000 + 1 }, { nbf: undefined }]) {
    await assert.rejects(verify(await token(patch), 'Owner.Read'));
  }
  await assert.rejects(verify('old.application-session', 'Owner.Read'));
  await assert.rejects(verify((await token()).slice(0, -8) + 'tampered', 'Owner.Read'));
  assert.equal(common.bearerToken({ headers: { 'x-ms-client-principal': 'owner', cookie: 'owner' } }), '');
  assert.equal(common.bearerToken({ headers: { Authorization: 'Bearer token', authorization: 'Bearer second' } }), '');
});

test('common API validator fails closed when configuration is absent', async () => {
  const unconfigured = common.createApiTokenValidator({ getConfig() { throw new Error('missing'); } });
  await assert.rejects(unconfigured(await token(), 'Owner.Read'), (error) => error.status === 503);
});

test('actual HTTP read endpoint accepts validated API bearer and rejects wrong scope before store access', async (t) => {
  process.env.BLUE_SWALLOW_AUTH_MODE = 'entra';
  let reads = 0;
  const server = createCybermapApiServer({ verifyApiRead: verify, store: { async queryViewport() { reads++; return { accessPoints: [] }; } } });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const url = `http://127.0.0.1:${server.address().port}/api/v1/cybermap/operator-signals`;
  const request = async (raw) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${raw}` }, body: JSON.stringify({ lat: 0, lon: 0 }) });
  assert.equal((await request(await token({ scp: 'Observations.Upload' }))).status, 403); assert.equal(reads, 0);
  assert.equal((await request(await token({ scp: 'Owner.Read' }))).status, 200); assert.equal(reads, 1);
  const viewport = await fetch(url.replace('operator-signals', 'viewport'), { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${await token({ scp: 'Owner.Read' })}` }, body: JSON.stringify({ lat: 0, lon: 0 }) });
  assert.equal(viewport.status, 200); assert.equal(reads, 2);
  const forged = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-ms-client-principal': 'owner' }, body: '{}' });
  assert.notEqual(forged.status, 200); assert.equal(reads, 2);
});
