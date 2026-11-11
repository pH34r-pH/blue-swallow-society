import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { fixture as syncFixture, fakeStorage, device } from './fixtures/wardriver-sync.mjs';
const require = createRequire(import.meta.url);
const { fixture: viewerFixture } = require('./helpers/viewer-fixture.cjs');
const viewer = require('../api/_lib/viewer-session');
const { createCompanionGuard } = require('../api/_lib/companion-auth');
const { createCompanionDatasetsHandler } = require('../api/companion-datasets');
const { createDatasetStore, readDatasetConfig, MAX_OBJECT_BYTES, MAX_HEAD_BYTES } = require('../api/_lib/companion-dataset-store');
const { initialState, STATE_BLOB, ROSTER_BLOB } = require('../api/_lib/wardriver-sync-store');
const { rosterPayload, signJson, ROSTER_TYPE, sha256 } = require('../api/_lib/wardriver-sync-auth');
const f = syncFixture(); const peer = device();
const datasetEnv = { ...f.env, BSS_WARDRIVER_VIEWER_DATASET_ENABLED: 'true',
  BSS_WARDRIVER_VIEWER_DATASET_ROSTER_PUBLIC_KEY_SPKI: f.signer.publicKeySpki,
  BLUE_SWALLOW_PUBLIC_ORIGIN: 'https://companion.example.test' };
delete datasetEnv.BSS_WARDRIVER_SYNC_ROSTER_PRIVATE_KEY_PEM;
const config = readDatasetConfig(datasetEnv);

async function publish(storage, state = initialState(f.config)) {
  storage.set(STATE_BLOB, state);
  storage.set(ROSTER_BLOB, { version: 1, roster: await signJson(rosterPayload(state, f.config), ROSTER_TYPE, f.config) });
}
async function setup() {
  const storage = fakeStorage(); await publish(storage);
  const store = createDatasetStore({ config, serviceClient: storage.service });
  const roster = await store.roster();
  const reference = { version: 1, revision: roster.revision, rosterSha256: roster.rosterSha256,
    deviceId: f.owner.deviceId, object: 'head' };
  return { storage, store, roster, reference };
}
async function apiSetup() {
  const data = await setup(); const v = await viewerFixture();
  const settings = viewer.config({ ...v.env, BSS_WARDRIVER_SYNC_GROUP_ID: config.groupId });
  const record = await v.store.create(settings); const session = viewer.signSession(record, settings);
  const authorize = createCompanionGuard({ getConfig: () => settings, createStore: () => v.store,
    verifyOwner: () => ({ ok: false, status: 401 }) });
  let constructions = 0;
  const handler = createCompanionDatasetsHandler({ authorize, env: datasetEnv,
    createStore: () => { constructions++; return data.store; } });
  const headers = { 'x-blue-swallow-operator-token': session.token, 'content-type': 'application/json', origin: config.origin };
  async function call(changes = {}) {
    const context = {}; await handler(context, { method: 'GET', params: { action: 'roster' }, query: {}, headers, ...changes });
    return context.res;
  }
  return { ...data, v, settings, session, headers, call, constructions: () => constructions };
}

test('dataset adapter uses public pins only; disabled or invalid protected configuration fails closed', () => {
  assert.equal(config.signer.deviceId, f.signer.deviceId); assert.equal(config.signingKey, undefined);
  for (const delta of [{ BSS_WARDRIVER_VIEWER_DATASET_ENABLED: 'false' }, { BSS_WARDRIVER_SYNC_GROUP_ID: '../other' },
    { BSS_WARDRIVER_SYNC_CONTAINER: 'bad/container' }, { BSS_WARDRIVER_SYNC_ACCOUNT_NAME: 'https://elsewhere.invalid' },
    { BSS_WARDRIVER_VIEWER_DATASET_ROSTER_PUBLIC_KEY_SPKI: f.owner.publicKeySpki },
    { BLUE_SWALLOW_PUBLIC_ORIGIN: 'https://companion.example.test/path' },
    { BSS_WARDRIVER_VIEWER_DATASET_MANAGED_IDENTITY_CLIENT_ID: 'not-an-identity' }]) {
    assert.throws(() => readDatasetConfig({ ...datasetEnv, ...delta }), /datasets_unavailable/);
  }
});

test('actual viewer authorization precedes store construction and never grants device or owner authority', async () => {
  const s = await apiSetup();
  for (const headers of [{}, { 'x-ms-client-principal': 'owner' }, { authorization: 'Bearer fixture' }]) {
    assert.equal((await s.call({ headers })).status, 401);
  }
  assert.equal(s.constructions(), 0);
  const result = await s.call(); assert.equal(result.status, 200); assert.equal(result.body.roster, s.roster.roster);
  assert.equal(result.headers['Cache-Control'], 'private, no-store');
  assert.doesNotMatch(JSON.stringify(result), /invitation|requests|PRIVATE KEY|createUrl|headUrl|sig=/);
  const head = await s.call({ method: 'HEAD' }); assert.equal(head.status, 200); assert.equal(head.body, undefined);
  await s.v.store.revoke(viewer.verifyToken(s.session.token, s.settings));
  const previous = s.constructions(); assert.equal((await s.call()).status, 401); assert.equal(s.constructions(), previous);
});

test('object API rejects group/path/query/write/origin confusion before storage', async () => {
  const s = await apiSetup();
  for (const changes of [{ params: { action: '../roster' } }, { query: { group: 'other' } },
    { method: 'PUT' }, { method: 'POST' }, { params: { action: 'object' } }]) {
    assert.ok([404, 405].includes((await s.call(changes)).status));
  }
  for (const object of ['../_control/wardriver-sync-state.json', 'head.json', 'https://elsewhere.invalid', 'A'.repeat(64), ['a'.repeat(64)]]) {
    assert.equal((await s.call({ method: 'POST', params: { action: 'object' }, body: { ...s.reference, object } })).status, 400);
  }
  for (const body of [{ ...s.reference, groupId: 'other' }, { ...s.reference, revision: Number.MAX_SAFE_INTEGER + 1 }, 'x'.repeat(1025), '{']) {
    assert.equal((await s.call({ method: 'POST', params: { action: 'object' }, body })).status, 400);
  }
  assert.equal((await s.call({ method: 'POST', params: { action: 'object' }, body: s.reference,
    headers: { ...s.headers, origin: 'https://elsewhere.invalid' } })).status, 401);
  assert.equal(s.constructions(), 0);
  const handler = createCompanionDatasetsHandler({ env: datasetEnv, authorize: async () => ({ ok: true, role: 'viewer', token: { group: 'other' } }),
    createStore: () => { throw new Error('must not construct'); } });
  const context = {}; await handler(context, { method: 'GET', params: { action: 'roster' } }); assert.equal(context.res.status, 403);
});

test('bounded opaque object reads preserve exact bytes and emit no capability or storage mutation', async () => {
  const s = await apiSetup(); const bytes = Buffer.from([0, 255, 1, 128, 10]);
  const object = sha256(bytes); const path = `devices/${f.owner.deviceId}/objects/${object}`;
  s.storage.set(path, bytes);
  const response = await s.call({ method: 'POST', params: { action: 'object' }, body: { ...s.reference, object } });
  assert.equal(response.status, 200); assert.deepEqual(response.body, bytes); assert.equal(response.isRaw, true);
  assert.equal(response.headers['X-Blue-Swallow-Roster-Sha256'], s.roster.rosterSha256);
  assert.equal(response.headers['Content-Type'], 'application/octet-stream');
  assert.ok(s.storage.operations.every((op) => ['container', 'read'].includes(op.operation)));
  assert.ok(s.storage.operations.filter((op) => op.operation === 'read').every((op) => op.count <= MAX_OBJECT_BYTES + 1));
  assert.equal((await s.call({ method: 'POST', params: { action: 'object' }, body: s.reference })).status, 404);
});

test('roster signature, current state, missing authority and same-revision conflicts are checked', async () => {
  for (const alter of [
    (s) => s.entries.delete(STATE_BLOB),
    (s) => s.entries.delete(ROSTER_BLOB),
    (s) => s.set(ROSTER_BLOB, { version: 1, roster: s.read(ROSTER_BLOB).roster.replace(/^./, 'x') }),
    (s) => { const state = s.read(STATE_BLOB); state.rosterRevision++; s.set(STATE_BLOB, state); },
    (s) => { const state = s.read(STATE_BLOB); state.devices[f.owner.deviceId].displayName = 'Changed'; s.set(STATE_BLOB, state); },
  ]) {
    const s = await setup(); alter(s.storage); await assert.rejects(s.store.roster(), /datasets_unavailable/);
  }
  const s = await setup(); let reads = 0;
  s.storage.hooks.beforeRead = (name) => { if (name === STATE_BLOB && ++reads === 2) s.storage.set(STATE_BLOB, s.storage.read(STATE_BLOB)); };
  await assert.rejects(s.store.roster(), /roster_changed/);
});

test('a changed roster during an object read never returns old generation bytes', async () => {
  const s = await setup(); const path = `devices/${f.owner.deviceId}/head.json`; s.storage.set(path, Buffer.from('opaque-head'));
  s.storage.hooks.beforeRead = async (name) => {
    if (name !== path) return;
    const state = s.storage.read(STATE_BLOB); state.rosterRevision++;
    state.devices[f.owner.deviceId].displayName = 'Renamed'; await publish(s.storage, state);
  };
  await assert.rejects(s.store.object(s.reference), /roster_changed/);
  await assert.rejects(s.store.object({ ...s.reference, revision: 0 }), /roster_changed/);
});

test('revoked contributors retain immutable historical reads but no mutable head read; unknown member denied', async () => {
  const s = await setup(); const state = initialState(f.config);
  state.devices[peer.deviceId] = { publicKeySpki: peer.publicKeySpki, displayName: 'Revoked peer', status: 'revoked',
    acceptedThrough: { sequence: 0, commitHash: null } };
  state.rosterRevision++; await publish(s.storage, state); const roster = await s.store.roster();
  const ref = { ...s.reference, revision: roster.revision, rosterSha256: roster.rosterSha256, deviceId: peer.deviceId };
  await assert.rejects(s.store.object(ref), /not_found/);
  const bytes = Buffer.from('retained untrusted history'); const object = sha256(bytes);
  s.storage.set(`devices/${peer.deviceId}/objects/${object}`, bytes);
  assert.deepEqual(await s.store.object({ ...ref, object }), bytes);
  await assert.rejects(s.store.object({ ...ref, deviceId: '0'.repeat(64) }), /not_found/);
  assert.equal(s.storage.operations.filter((op) => op.blobName === `devices/${peer.deviceId}/head.json`).length, 0);
});

test('oversized, partial and encoded storage streams fail closed without private exception leakage', async () => {
  const s = await setup(); const path = `devices/${f.owner.deviceId}/head.json`;
  s.storage.set(path, Buffer.alloc(MAX_HEAD_BYTES + 1)); await assert.rejects(s.store.object(s.reference), /datasets_unavailable/);
  for (const result of [
    { contentLength: 10, readableStreamBody: Readable.from([Buffer.from('short')]) },
    { contentLength: 1, readableStreamBody: Readable.from([Buffer.from('too long')]) },
    { contentLength: 1, contentEncoding: 'gzip', readableStreamBody: Readable.from([Buffer.from('x')]) },
  ]) {
    const base = s.storage.service.getContainerClient(config.container);
    const serviceClient = { getContainerClient: () => ({ getBlockBlobClient: (name) => name === path
      ? { download: async () => ({ etag: 'fixture', ...result }) } : base.getBlockBlobClient(name) }) };
    await assert.rejects(createDatasetStore({ config, serviceClient }).object(s.reference), /datasets_unavailable/);
  }
  const context = {}; const handler = createCompanionDatasetsHandler({ env: datasetEnv,
    authorize: async () => ({ ok: true, role: 'owner' }), createStore: () => ({ roster: async () => { throw new Error('PRIVATE sig=secret'); } }) });
  await handler(context, { method: 'GET', params: { action: 'roster' } });
  assert.equal(context.res.status, 503); assert.doesNotMatch(JSON.stringify(context.res), /PRIVATE|secret/);
});

test('deadline and concurrency budget remain effective when a transport ignores abort', async () => {
  const s = await setup(); let release; const pending = new Promise((resolve) => { release = resolve; });
  s.storage.hooks.beforeRead = () => pending;
  const store = createDatasetStore({ config, serviceClient: s.storage.service, timeoutMs: 20 });
  const first = assert.rejects(store.roster(), /datasets_unavailable/);
  const second = assert.rejects(store.roster(), /datasets_unavailable/);
  await assert.rejects(store.roster(), /datasets_unavailable/); await Promise.all([first, second]);
  await assert.rejects(store.roster(), /datasets_unavailable/);
  release(); await new Promise((resolve) => setImmediate(resolve));
  s.storage.hooks.beforeRead = undefined;
  assert.equal((await s.store.roster()).revision, 1);
});
