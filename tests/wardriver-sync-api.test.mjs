import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { device, fixture, signRequest, fakeStorage, invoke, invite, enroll, decodeRoster } from './fixtures/wardriver-sync.mjs';

const require = createRequire(import.meta.url);
const { STATE_BLOB, ROSTER_BLOB, MAX_STATE_BYTES } = require('../api/_lib/wardriver-sync-store');
const f = fixture();
const friend = device();
const other = device();

test('POST-only Function binding exposes a fixed action route', async () => {
  const binding = JSON.parse(await readFile(new URL('../api/wardriver-sync/function.json', import.meta.url)));
  const trigger = binding.bindings.find((entry) => entry.type === 'httpTrigger');
  assert.equal(trigger.route, 'wardriver-sync/{action}');
  assert.deepEqual(trigger.methods, ['post']);
  const workflow = await readFile(new URL('../.github/workflows/functions-release.yml', import.meta.url), 'utf8');
  assert.match(workflow, /for action in challenge enroll grants invite rename revoke/);
  assert.match(workflow, /api\/wardriver-sync\/challenge/);
  assert.equal((await invoke(f, 'challenge', {}, { method: 'GET' })).status, 405);
  assert.equal((await invoke(f, '../grants', {})).status, 404);
});

test('protected setup helper emits owner configuration link and public signer pin without private credentials', () => {
  const result = spawnSync(process.execPath, ['scripts/wardriver-sync-owner-setup.mjs'], {
    cwd: new URL('../', import.meta.url), env: { ...process.env, ...f.env }, encoding: 'utf8',
  });
  assert.equal(result.status, 0);
  const setup = JSON.parse(result.stdout);
  assert.equal(setup.ownerDeviceId, f.owner.deviceId);
  const url = new URL(setup.configurationUrl);
  assert.equal(url.protocol, 'wardriver:');
  assert.equal(url.hostname, 'configure');
  assert.equal(url.searchParams.get('endpoint'), f.config.endpoint);
  assert.equal(url.searchParams.get('group'), f.config.groupId);
  assert.equal(url.searchParams.get('key'), f.signer.publicKeySpki);
  assert.equal(url.searchParams.has('token'), false);
  assert.doesNotMatch(result.stdout, /PRIVATE KEY|AccountKey|sig=/);
});

test('disabled, malformed, forged session/principal and unsigned requests fail without storage construction', async () => {
  const disabled = await invoke(f, 'challenge', { version: 1, publicKeySpki: friend.publicKeySpki }, { env: {} });
  assert.equal(disabled.status, 503);
  assert.equal(disabled.constructions, 0);
  for (const headers of [{}, { cookie: '__Host-bss_owner_session=fixture' }, { 'x-ms-client-principal': 'owner' },
    { authorization: 'Bearer fixture' }, { 'x-blue-swallow-operator-token': 'fixture' }]) {
    const response = await invoke(f, 'grants', { proof: 'invalid' }, { req: { headers } });
    assert.equal(response.status, 401);
    assert.equal(response.constructions, 0);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.deepEqual(response.logs, []);
  }
  const oversized = await invoke(f, 'challenge', 'a'.repeat(16385));
  assert.equal(oversized.status, 413);
  assert.equal(oversized.constructions, 0);
});

test('challenge needs no storage and a valid non-member gets no grants or membership side effect', async () => {
  const ticket = await invoke(f, 'challenge', { version: 1, publicKeySpki: friend.publicKeySpki });
  assert.equal(ticket.status, 200);
  assert.equal(ticket.constructions, 0);
  const denied = await invoke(f, 'grants', await signRequest(f, friend, 'grants'));
  assert.equal(denied.status, 403);
  assert.equal(denied.body.error.code, 'not_member');
  assert.equal(denied.storage.entries.size, 0);
  assert.equal(denied.storage.operations.filter((entry) => entry.operation === 'delegation').length, 0);
});

test('owner receives a private invitation URL with signer pin; control state retains only its hash', async () => {
  const response = await invite(f, fakeStorage());
  assert.equal(response.status, 200);
  const { invitation, inviteUrl, rosterPublicKeySpki } = response.body;
  assert.match(invitation, /^[A-Za-z0-9_-]{43}$/);
  const url = new URL(inviteUrl);
  assert.equal(url.protocol, 'wardriver:');
  assert.equal(url.hostname, 'invite');
  assert.equal(url.searchParams.get('endpoint'), f.config.endpoint);
  assert.equal(url.searchParams.get('group'), f.config.groupId);
  assert.equal(url.searchParams.get('key'), rosterPublicKeySpki);
  assert.equal(url.searchParams.get('token'), invitation);
  assert.equal(response.body.expiresAt, f.now() + 86400);
  assert.equal(response.body.storage, undefined);
  assert.ok(!response.storage.entries.get(STATE_BLOB).bytes.toString().includes(invitation));
  assert.deepEqual(response.logs, []);
  assert.equal((await decodeRoster(f, response.body.roster)).ownerDeviceId, f.owner.deviceId);
});

test('enrollment produces signed full-key roster and strictly scoped five-minute user-delegation grants', async () => {
  const storage = fakeStorage();
  const invitation = (await invite(f, storage)).body.invitation;
  const joined = await enroll(f, storage, friend, invitation, 'Friendly phone');
  assert.equal(joined.status, 200);
  const payload = await decodeRoster(f, joined.body.roster);
  assert.equal(payload.revision, 2);
  assert.deepEqual(payload.devices.map((entry) => entry.deviceId), [f.owner.deviceId, friend.deviceId].sort());
  assert.deepEqual(payload.devices.find((entry) => entry.deviceId === friend.deviceId), {
    deviceId: friend.deviceId, publicKeySpki: friend.publicKeySpki, displayName: 'Friendly phone', status: 'active',
  });
  assert.equal(joined.body.expiresAt, f.now() + 300);
  assert.equal(joined.body.storage.containerUrl, f.config.containerUrl);
  const scopes = [
    ['readUrl', 'devices', 'r', 'd', '1'],
    ['createUrl', `devices/${friend.deviceId}/objects`, 'c', 'd', '3'],
    ['headUrl', `devices/${friend.deviceId}/head.json`, 'cw', 'b', null],
    ['rosterUrl', 'group.json', 'r', 'b', null],
  ];
  for (const [field, path, permission, resource, depth] of scopes) {
    const url = new URL(joined.body.storage[field]);
    assert.equal(url.origin, 'https://fixtureaccount.blob.core.windows.net');
    assert.equal(url.pathname, `/fixture-group/${path}`);
    assert.equal(url.searchParams.get('sp'), permission);
    assert.equal(url.searchParams.get('sr'), resource);
    assert.equal(url.searchParams.get('sdd'), depth);
    assert.equal(url.searchParams.get('spr'), 'https');
    assert.equal(url.searchParams.get('sv'), '2024-11-04');
    assert.ok(url.searchParams.get('skoid'));
    assert.ok(url.searchParams.get('sktid'));
    assert.ok(url.searchParams.get('sig'));
    assert.equal(Date.parse(url.searchParams.get('se')) / 1000, f.now() + 300);
    assert.equal(Date.parse(url.searchParams.get('st')) / 1000, f.now() - 30);
    assert.doesNotMatch(url.searchParams.get('sp'), /[ld]/);
    assert.ok(!url.pathname.includes('_control'));
  }
  assert.equal(storage.read(ROSTER_BLOB).roster, joined.body.roster);
  assert.ok(storage.operations.filter((entry) => entry.operation === 'write').every((entry) => entry.conditions.ifMatch || entry.conditions.ifNoneMatch === '*'));
});

test('atomic simultaneous claims admit one key and block another key; same-key enrollment recovers after token expiry', async () => {
  const own = fixture();
  const storage = fakeStorage();
  const invitation = (await invite(own, storage)).body.invitation;
  let arrivals = 0;
  let release;
  const gate = new Promise((resolve) => { release = resolve; });
  storage.hooks.beforeWrite = async (name) => {
    if (name === STATE_BLOB && ++arrivals <= 2) {
      if (arrivals === 2) release();
      await gate;
    }
  };
  const outcomes = await Promise.all([enroll(own, storage, friend, invitation), enroll(own, storage, other, invitation)]);
  assert.deepEqual(outcomes.map((entry) => entry.status).sort(), [200, 409]);
  assert.equal(outcomes.find((entry) => entry.status === 409).body.error.code, 'invitation_used');
  assert.equal(Object.keys(storage.read(STATE_BLOB).devices).length, 2);
  const winner = outcomes[0].status === 200 ? friend : other;
  own.advance(86401);
  delete storage.hooks.beforeWrite;
  const recovery = await enroll(own, storage, winner, invitation, 'Retry name');
  assert.equal(recovery.status, 200);
  assert.equal(recovery.body.displayName, 'Friend phone');
  assert.equal((await decodeRoster(own, recovery.body.roster)).revision, 2);
});

test('used challenge is rejected, while a fresh challenge makes grant retries safe', async () => {
  const storage = fakeStorage();
  const proof = await signRequest(f, f.owner, 'grants');
  assert.equal((await invoke(f, 'grants', proof, { storage })).status, 200);
  const replay = await invoke(f, 'grants', proof, { storage });
  assert.equal(replay.status, 409);
  assert.equal(replay.body.error.code, 'challenge_used');
  assert.equal((await invoke(f, 'grants', await signRequest(f, f.owner, 'grants'), { storage })).status, 200);
  assert.equal((await decodeRoster(f, storage.read(ROSTER_BLOB).roster)).revision, 1);
});

test('lost enrollment write acknowledgement is recoverable without consuming another invitation', async () => {
  const storage = fakeStorage();
  const invitation = (await invite(f, storage)).body.invitation;
  let failOnce = true;
  storage.hooks.afterWrite = async (name) => {
    if (name === STATE_BLOB && failOnce) { failOnce = false; throw new Error('synthetic transport interruption'); }
  };
  assert.equal((await enroll(f, storage, friend, invitation)).status, 503);
  const recovered = await enroll(f, storage, friend, invitation);
  assert.equal(recovered.status, 200);
  assert.equal((await decodeRoster(f, recovered.body.roster)).revision, 2);
  assert.equal(Object.keys(storage.read(STATE_BLOB).devices).length, 2);
});

test('public roster interruption repairs from durable membership on the next authenticated request', async () => {
  const storage = fakeStorage();
  const invitation = (await invite(f, storage)).body.invitation;
  storage.hooks.beforeWrite = async (name) => { if (name === ROSTER_BLOB) throw new Error('synthetic publication outage'); };
  assert.equal((await enroll(f, storage, friend, invitation)).status, 503);
  assert.equal((await decodeRoster(f, storage.read(ROSTER_BLOB).roster)).revision, 1);
  delete storage.hooks.beforeWrite;
  const repaired = await invoke(f, 'grants', await signRequest(f, friend, 'grants'), { storage });
  assert.equal(repaired.status, 200);
  assert.equal((await decodeRoster(f, repaired.body.roster)).revision, 2);
});

test('a delayed public roster writer cannot overwrite a newer membership revision', async () => {
  const storage = fakeStorage();
  const invitation = (await invite(f, storage)).body.invitation;
  await enroll(f, storage, friend, invitation);
  let held = false;
  let release;
  let reached;
  const hold = new Promise((resolve) => { release = resolve; });
  const ready = new Promise((resolve) => { reached = resolve; });
  storage.hooks.beforeWrite = async (name) => {
    if (name === ROSTER_BLOB && !held) { held = true; reached(); await hold; }
  };
  const firstProof = await signRequest(f, f.owner, 'rename', { displayName: 'Renamed owner' });
  const first = invoke(f, 'rename', firstProof, { storage });
  await ready;
  const second = await invoke(f, 'rename', await signRequest(f, friend, 'rename', { displayName: 'Renamed friend' }), { storage });
  assert.equal(second.status, 200);
  release();
  const delayed = await first;
  assert.equal(delayed.status, 200);
  const final = await decodeRoster(f, storage.read(ROSTER_BLOB).roster);
  assert.equal(final.revision, 4);
  assert.equal((await decodeRoster(f, delayed.body.roster)).revision, 4);
  assert.equal(final.devices.find((entry) => entry.deviceId === friend.deviceId).displayName, 'Renamed friend');
});

test('members can rename only themselves and owner-only revocation signs an explicit immutable cutoff', async () => {
  const storage = fakeStorage();
  const invitation = (await invite(f, storage)).body.invitation;
  await enroll(f, storage, friend, invitation);
  const forbidden = await invoke(f, 'invite', await signRequest(f, friend, 'invite'), { storage });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error.code, 'owner_required');
  const cutoff = { sequence: 4, commitHash: 'a'.repeat(64) };
  const ownerProtected = await invoke(f, 'revoke', await signRequest(f, f.owner, 'revoke', {
    targetDeviceId: f.owner.deviceId, acceptedThrough: cutoff,
  }), { storage });
  assert.equal(ownerProtected.body.error.code, 'owner_protected');
  const revoked = await invoke(f, 'revoke', await signRequest(f, f.owner, 'revoke', {
    targetDeviceId: friend.deviceId, acceptedThrough: cutoff,
  }), { storage });
  assert.equal(revoked.status, 200);
  const roster = await decodeRoster(f, revoked.body.roster);
  const entry = roster.devices.find((member) => member.deviceId === friend.deviceId);
  assert.equal(entry.status, 'revoked');
  assert.deepEqual(entry.acceptedThrough, cutoff);
  assert.equal((await invoke(f, 'grants', await signRequest(f, friend, 'grants'), { storage })).status, 403);
  assert.equal((await enroll(f, storage, friend, invitation)).status, 403);
  const changed = await invoke(f, 'revoke', await signRequest(f, f.owner, 'revoke', {
    targetDeviceId: friend.deviceId, acceptedThrough: { sequence: 0, commitHash: null },
  }), { storage });
  assert.equal(changed.body.error.code, 'cutoff_conflict');
});

test('group size, expired invitations, and replay-state growth remain bounded', async () => {
  const own = fixture();
  const storage = fakeStorage();
  const invitation = (await invite(own, storage)).body.invitation;
  const full = await enroll(own, storage, friend, invitation);
  assert.equal(full.status, 200);
  const next = (await invite(own, storage)).body.invitation;
  const denied = await invoke(own, 'enroll', await signRequest(own, other, 'enroll', { invitation: next, displayName: 'Third' }), {
    storage, env: { ...own.env, BSS_WARDRIVER_SYNC_MAX_DEVICES: '2' },
  });
  assert.equal(denied.body.error.code, 'group_full');
  own.advance(86401);
  const expired = await enroll(own, storage, other, next);
  assert.equal(expired.body.error.code, 'invitation_invalid');
  const state = storage.read(STATE_BLOB);
  state.requests = Array.from({ length: 64 }, (_, n) => ({ deviceId: own.owner.deviceId,
    nonce: Buffer.alloc(32, n).toString('base64url'), expiresAt: own.now() + 120 }));
  storage.set(STATE_BLOB, state);
  const limited = await invoke(own, 'grants', await signRequest(own, own.owner, 'grants'), { storage });
  assert.equal(limited.status, 429);
  assert.equal(limited.body.error.code, 'rate_limited');
});

test('corrupt or oversized control state fails closed with redacted logs and no delegation request', async () => {
  for (const bad of [Buffer.alloc(MAX_STATE_BYTES + 1), Buffer.from('{broken'), { version: 1, devices: {} }]) {
    const storage = fakeStorage();
    storage.set(STATE_BLOB, bad);
    const response = await invoke(f, 'grants', await signRequest(f, f.owner, 'grants'), { storage });
    assert.equal(response.status, 503);
    assert.deepEqual(response.body, { error: { code: 'sync_unavailable' } });
    assert.deepEqual(response.logs, [['Wardriver sync access is unavailable.']]);
    assert.equal(storage.operations.some((entry) => entry.operation === 'delegation'), false);
  }
});

test('storage credential errors never leak request proofs or capability-bearing SDK error URLs', async () => {
  const storage = fakeStorage();
  storage.hooks.delegation = async () => { throw new Error('https://fixture.invalid/private?sig=synthetic-sensitive-value'); };
  const response = await invoke(f, 'grants', await signRequest(f, f.owner, 'grants'), { storage });
  assert.equal(response.status, 503);
  assert.deepEqual(response.logs, [['Wardriver sync access is unavailable.']]);
  assert.doesNotMatch(JSON.stringify(response), /synthetic-sensitive-value/);
});
