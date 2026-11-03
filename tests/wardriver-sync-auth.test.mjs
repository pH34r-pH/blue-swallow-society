import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { generateKeyPairSync } from 'node:crypto';
import { device, fixture, signRequest } from './fixtures/wardriver-sync.mjs';

const require = createRequire(import.meta.url);
const auth = require('../api/_lib/wardriver-sync-auth');
const f = fixture();
const friend = device();

test('device identities bind canonical RSA SPKI DER, full SHA256, and accepted modulus sizes', () => {
  assert.equal(auth.publicIdentity(friend.publicKeySpki).deviceId, friend.deviceId);
  const large = device(4096);
  assert.equal(auth.publicIdentity(large.publicKeySpki).deviceId, large.deviceId);
  const weak = device(1024);
  const ec = generateKeyPairSync('ec', { namedCurve: 'P-256' }).publicKey.export({ format: 'der', type: 'spki' }).toString('base64url');
  for (const spki of [weak.publicKeySpki, ec, friend.publicKeySpki + '=', '', 'not-a-key']) {
    assert.throws(() => auth.publicIdentity(spki), { code: 'invalid_request' });
  }
});

test('explicit protected configuration pins owner, group, origin, and a separate service signer', () => {
  assert.equal(auth.readConfig(f.env).owner.deviceId, f.owner.deviceId);
  const invalid = [{}, { ...f.env, BSS_WARDRIVER_SYNC_ENABLED: 'false' },
    { ...f.env, BSS_WARDRIVER_SYNC_ENDPOINT: 'http://fixture.invalid/api/wardriver-sync' },
    { ...f.env, BSS_WARDRIVER_SYNC_ENDPOINT: f.config.endpoint + '?token=bad' },
    { ...f.env, BSS_WARDRIVER_SYNC_ENDPOINT: 'https://someone@fixture.invalid/api/wardriver-sync' },
    { ...f.env, BSS_WARDRIVER_SYNC_GROUP_ID: '../another' },
    { ...f.env, BSS_WARDRIVER_SYNC_CONTAINER: 'bad--container' },
    { ...f.env, BSS_WARDRIVER_SYNC_MAX_DEVICES: '17' },
    { ...f.env, BSS_WARDRIVER_SYNC_MANAGED_IDENTITY_CLIENT_ID: 'untrusted' },
    { ...f.env, BSS_WARDRIVER_SYNC_ROSTER_PRIVATE_KEY_PEM: f.owner.privateKey.export({ format: 'pem', type: 'pkcs8' }) }];
  for (const env of invalid) assert.throws(() => auth.readConfig(env), { code: 'sync_unavailable' });
});

test('challenge is signed, short lived, and bound to exact provider/group/device with distinct type', async () => {
  const result = await auth.challenge({ version: 1, publicKeySpki: friend.publicKeySpki }, f.config, f.now());
  assert.equal(result.expiresAt, f.now() + 120);
  assert.equal(result.rosterPublicKeySpki, f.signer.publicKeySpki);
  const ticket = await auth.verifyJson(result.challenge, f.signer.publicKey, auth.CHALLENGE_TYPE, f.signer.deviceId);
  assert.equal(ticket.audience, f.config.endpoint);
  assert.equal(ticket.deviceId, friend.deviceId);
  assert.equal(ticket.groupId, f.config.groupId);
  assert.equal(Buffer.from(ticket.nonce, 'base64url').length, 32);
});

test('signed request binds action, group, public key, kid, algorithm, type, and challenge', async () => {
  const valid = await signRequest(f, friend, 'grants');
  assert.equal((await auth.verifyProof(valid, 'grants', f.config, f.now())).deviceId, friend.deviceId);
  const invalid = [
    await signRequest(f, friend, 'grants', {}, { payload: { groupId: 'another_group' } }),
    await signRequest(f, friend, 'invite'),
    await signRequest(f, friend, 'grants', {}, { header: { kid: f.owner.deviceId } }),
    await signRequest(f, friend, 'grants', {}, { header: { typ: 'wardriver.dataset.head.v1' } }),
    await signRequest(f, friend, 'grants', {}, { header: { jwk: {} } }),
    await signRequest(f, friend, 'grants', {}, { privateKey: f.owner.privateKey }),
    await signRequest(f, friend, 'grants', {}, { payload: { publicKeySpki: f.owner.publicKeySpki } }),
    await signRequest(f, friend, 'grants', {}, { payload: { challenge: 'forged.challenge.value' } }),
    { proof: valid.proof.slice(0, -2) + 'aa' },
    { proof: `${Buffer.from(JSON.stringify({ alg: 'none', typ: auth.REQUEST_TYPE, kid: friend.deviceId })).toString('base64url')}.e30.` },
  ];
  for (const body of invalid) await assert.rejects(auth.verifyProof(body, 'grants', f.config, f.now()), { code: 'invalid_proof' });
});

test('server challenge expiry rejects replay even when a phone clock is unrelated', async () => {
  const body = await signRequest(f, friend, 'grants');
  await assert.rejects(auth.verifyProof(body, 'grants', f.config, f.now() + 120), { code: 'challenge_expired' });
  await assert.rejects(auth.verifyProof(body, 'grants', f.config, f.now() - 6), { code: 'invalid_proof' });
});

test('action fields and body are bounded; callers cannot choose paths, privilege, or a malformed cutoff', async () => {
  for (const [action, fields] of [
    ['grants', { blobName: 'devices/other/head.json' }],
    ['invite', { expiresInSeconds: 604801 }],
    ['rename', { displayName: '\u202ehidden' }],
    ['rename', { displayName: 'a'.repeat(65) }],
    ['enroll', { invitation: 'bad', displayName: 'name' }],
    ['revoke', { targetDeviceId: friend.deviceId, acceptedThrough: { sequence: 1, commitHash: null } }],
  ]) await assert.rejects(auth.verifyProof(await signRequest(f, friend, action, fields), action, f.config, f.now()), { code: 'invalid_request' });
  assert.throws(() => auth.parseBody({ body: 'a'.repeat(auth.MAX_BODY_BYTES + 1) }), { code: 'request_too_large' });
  for (const body of ['[]', 'null', '{broken', Buffer.from([0xff])]) assert.throws(() => auth.parseBody({ body }), { code: 'invalid_request' });
});
