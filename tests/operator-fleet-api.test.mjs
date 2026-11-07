import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';

const require = createRequire(new URL('../api/package.json', import.meta.url));
const { createFleetHandler } = require('./operator-fleet');
const { createFleetSnapshotStore, snapshotConfig } = require('./_lib/fleet-snapshot-store');
const { normalizeFleetSnapshot, MAX_SNAPSHOT_BYTES, LIMITS } = require('./_lib/fleet-snapshot');
const owner = require('./shared/owner-session.cjs');
const { createApiGuard, createApiTokenValidator } = require('./_lib/api-access-token');
const { SignJWT, createLocalJWKSet, exportJWK } = await import(require.resolve('jose'));

const generatedAt = '2026-11-07T08:00:00Z';
const observedAt = '2026-11-07T07:59:00Z';
const freshUntil = '2026-11-07T08:01:00Z';
const storageEnv = { BSS_FLEET_SNAPSHOT_BLOB_URL: 'https://fixtureaccount.blob.core.windows.net/private-fixture/fleet/snapshot.json' };
const authEnv = {
  BLUE_SWALLOW_AUTH_MODE: 'entra',
  BLUE_SWALLOW_ENTRA_TENANT_ID: '11111111-1111-1111-1111-111111111111',
  BLUE_SWALLOW_ENTRA_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
  BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID: '33333333-3333-3333-3333-333333333333',
  BLUE_SWALLOW_OWNER_SESSION_KEY: 'test-only-fleet-owner-session-key-at-least-thirty-two-bytes',
  BLUE_SWALLOW_PUBLIC_ORIGIN: 'https://owner.example.test',
};
const authKeys = [...Object.keys(authEnv), 'BLUE_SWALLOW_ENTRA_API_CLIENT_ID'];
const savedAuth = Object.fromEntries(authKeys.map((key) => [key, process.env[key]]));
test.before(() => { Object.assign(process.env, authEnv); delete process.env.BLUE_SWALLOW_ENTRA_API_CLIENT_ID; });
test.after(() => {
  for (const key of authKeys) {
    if (savedAuth[key] === undefined) delete process.env[key]; else process.env[key] = savedAuth[key];
  }
});

// Deliberately synthetic: real inventory and issue content never enter this public repository.
function fixture() {
  return {
    schemaVersion: 'bss.fleet.v1', generatedAt,
    sources: [{ id: 'source-fixture', label: 'Synthetic source', state: 'ok', observedAt }],
    nodes: [
      { id: 'repo-fixture', kind: 'repo', label: 'Example project', group: 'Example group' },
      { id: 'azure-fixture', kind: 'azure', label: 'Example service' },
      { id: 'hardware-fixture', kind: 'hardware', label: 'Example host', subtitle: 'Synthetic hardware',
        health: { state: 'warning', observedAt, freshUntil, metrics: [{ label: 'CPU', value: 83, unit: '%', max: 100 }] } },
    ],
    edges: [
      { id: 'edge-fixture', source: 'repo-fixture', target: 'azure-fixture', kind: 'deploy',
        evidenceUrl: 'https://github.com/example/fleet-fixture/blob/main/deploy.yml', inferred: true },
    ],
    issues: [
      { id: 'issue-fixture', repoId: 'repo-fixture', number: 1, title: 'Synthetic open work',
        state: 'open', stateReason: null, updatedAt: observedAt, url: 'https://github.com/example/fleet-fixture/issues/1' },
      { id: 'closed-fixture', repoId: 'repo-fixture', number: 2, title: 'Synthetic completed work',
        state: 'closed', stateReason: 'completed', updatedAt: observedAt, url: 'https://github.com/example/fleet-fixture/issues/2' },
      { id: 'unplanned-fixture', repoId: 'repo-fixture', number: 3, title: 'Synthetic not-planned work',
        state: 'closed', stateReason: 'not_planned', updatedAt: observedAt, url: 'https://github.com/example/fleet-fixture/issues/3' },
    ],
  };
}

function ownerRequest(overrides = {}, sessionConfig = owner.ownerConfig(), issued = Date.now()) {
  const claims = { iss: sessionConfig.issuer, aud: sessionConfig.audience, tid: sessionConfig.tenant,
    oid: sessionConfig.owner, exp: Math.floor(Date.now() / 1000) + 3600 };
  const session = owner.createOwnerSession(claims, sessionConfig, issued);
  return { method: 'GET', headers: { cookie: `${owner.COOKIE}=${session.token}`, origin: authEnv.BLUE_SWALLOW_PUBLIC_ORIGIN }, ...overrides };
}
function storageFixture(value = fixture(), responsePatch = {}) {
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  const reads = [];
  const stream = Readable.from([bytes]);
  const blobClient = { async download(offset, count, options) {
    reads.push({ offset, count });
    assert.equal(options.abortSignal.aborted, false);
    return { contentLength: bytes.length, readableStreamBody: stream, ...responsePatch };
  } };
  return { store: createFleetSnapshotStore({ env: storageEnv, blobClient }), reads, stream };
}

test('Fleet owner session authorizes the read before configuring storage; source times and private cache policy are retained', async () => {
  let constructions = 0;
  const { store, reads } = storageFixture();
  const handler = createFleetHandler({ createStore: () => { constructions++; return store; } });
  const context = {};
  await handler(context, ownerRequest());
  assert.equal(context.res.status, 200);
  assert.equal(context.res.headers['Cache-Control'], 'private, no-store');
  assert.equal(context.res.body.generatedAt, generatedAt);
  assert.equal(context.res.body.nodes[2].health.observedAt, observedAt);
  assert.equal(context.res.body.nodes[2].health.freshUntil, freshUntil);
  assert.equal(constructions, 1);
  assert.deepEqual(reads, [{ offset: 0, count: MAX_SNAPSHOT_BYTES + 1 }]);
});

test('anonymous, forged platform principal, wrong owner and expired owner are rejected before storage configuration', async () => {
  let reads = 0;
  const handler = createFleetHandler({ createStore: () => { reads++; throw new Error('must not construct storage'); } });
  const wrongOwner = { ...owner.ownerConfig(), owner: '99999999-9999-9999-9999-999999999999' };
  const denied = [
    { method: 'GET', headers: {} },
    { method: 'GET', headers: { 'x-ms-client-principal': 'authenticated-owner' } },
    { method: 'GET', headers: { 'x-blue-swallow-operator-token': 'device-update-fixture' } },
    ownerRequest({}, wrongOwner),
    ownerRequest({}, owner.ownerConfig(), Date.now() - 360000),
  ];
  for (const req of denied) {
    const context = {}; await handler(context, req);
    assert.ok([401, 403].includes(context.res.status));
    assert.equal(context.res.headers['Cache-Control'], 'private, no-store');
  }
  assert.equal(reads, 0);
});

test('Fleet rejects legacy and unknown auth modes, including otherwise accepted tokens', async () => {
  let calls = 0;
  for (const mode of ['legacy', 'invalid']) {
    const handler = createFleetHandler({ getAuthMode: () => mode,
      authorize: async () => { calls++; return { ok: true }; }, createStore: () => { calls++; } });
    const context = {}; await handler(context, ownerRequest());
    assert.equal(context.res.status, 503);
    assert.equal(context.res.body.error, 'owner_auth_unavailable');
  }
  assert.equal(calls, 0);
});

test('configured API authority never falls back to an owner session when its MSAL cache is absent', async () => {
  process.env.BLUE_SWALLOW_ENTRA_API_CLIENT_ID = '44444444-4444-4444-4444-444444444444';
  let reads = 0;
  try {
    const handler = createFleetHandler({ createStore: () => { reads++; } });
    const context = {}; await handler(context, ownerRequest());
    assert.equal(context.res.status, 401);
    assert.equal(context.res.body.error, 'session_expired');
    assert.equal(reads, 0);
  } finally { delete process.env.BLUE_SWALLOW_ENTRA_API_CLIENT_ID; }
});

test('scoped API owner reads pass the canonical verifier; wrong scope and wrong owner never reach the reader', async () => {
  const config = { tenantId: authEnv.BLUE_SWALLOW_ENTRA_TENANT_ID, objectId: authEnv.BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID,
    clientId: '44444444-4444-4444-4444-444444444444', issuer: `https://login.microsoftonline.com/${authEnv.BLUE_SWALLOW_ENTRA_TENANT_ID}/v2.0` };
  const now = Math.floor(Date.now() / 1000);
  const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = await exportJWK(pair.publicKey); jwk.kid = 'fleet-test';
  const verify = createApiTokenValidator({ getConfig: () => config, keySet: createLocalJWKSet({ keys: [jwk] }),
    loadJose: () => import(require.resolve('jose')) });
  const guard = createApiGuard(verify);
  let reads = 0;
  const handler = createFleetHandler({ authorize: async (context, req) => {
    const principal = await guard(context, req, 'Owner.Read'); return { ok: !!principal, principal };
  }, createStore: () => ({ getSnapshot: async () => { reads++; return normalizeFleetSnapshot(fixture()); } }) });
  for (const [scp, oid, expected] of [['Entities.Write', config.objectId, 403], ['Observations.Upload', config.objectId, 403],
    ['Owner.Read', '99999999-9999-9999-9999-999999999999', 403], ['Owner.Read', config.objectId, 200]]) {
    const token = await new SignJWT({ iss: config.issuer, aud: config.clientId, tid: config.tenantId, oid,
      ver: '2.0', scp, iat: now, nbf: now, exp: now + 300 }).setProtectedHeader({ alg: 'RS256', kid: 'fleet-test' }).sign(pair.privateKey);
    const context = {}; await handler(context, { method: 'GET', headers: { authorization: `Bearer ${token}` } });
    assert.equal(context.res.status, expected);
    if (expected !== 200) assert.equal(reads, 0);
  }
  assert.equal(reads, 1);
});

test('Fleet accepts only a fixed GET without query or body selectors and retains no-store errors', async () => {
  let reads = 0;
  const handler = createFleetHandler({ createStore: () => { reads++; } });
  for (const [patch, status] of [[{ method: 'POST' }, 405], [{ query: { url: 'https://untrusted.invalid/private' } }, 400],
    [{ query: { repository: 'outside' } }, 400], [{ body: { url: storageEnv.BSS_FLEET_SNAPSHOT_BLOB_URL } }, 400]]) {
    const context = {}; await handler(context, ownerRequest(patch));
    assert.equal(context.res.status, status);
    assert.equal(context.res.headers['Cache-Control'], 'private, no-store');
  }
  assert.equal(reads, 0);
});

test('missing configuration and upstream failures return redacted unavailability without logging private values', async () => {
  const factories = [() => createFleetSnapshotStore({ env: {} }), () => ({ getSnapshot: async () => {
    throw new Error(`${storageEnv.BSS_FLEET_SNAPSHOT_BLOB_URL}?sig=must-not-escape`);
  } })];
  for (const createStore of factories) {
    const handler = createFleetHandler({ createStore });
    const context = { log() { assert.fail('private failures must not be logged'); } };
    await handler(context, ownerRequest());
    assert.equal(context.res.status, 503);
    assert.deepEqual(context.res.body, { ok: false, error: 'fleet_snapshot_unavailable' });
    assert.equal(context.res.headers['Cache-Control'], 'private, no-store');
  }
});

test('normalization returns only bounded contract fields, supplies unknown health and preserves closure reasons', () => {
  const input = fixture();
  input.credential = 'must-not-escape'; input.nodes[0].privateEndpoint = 'must-not-escape';
  input.nodes[2].health.metrics[0].internal = 'must-not-escape'; input.issues[0].body = 'must-not-escape';
  const output = normalizeFleetSnapshot(input);
  assert.equal(JSON.stringify(output).includes('must-not-escape'), false);
  assert.deepEqual(output.nodes[0].health, { state: 'unknown', observedAt: null, freshUntil: null, metrics: [] });
  assert.equal(output.nodes[0].group, 'Example group');
  assert.equal(output.issues[1].stateReason, 'completed');
  assert.equal(output.issues[2].stateReason, 'not_planned');
  assert.equal(output.generatedAt, input.generatedAt);
  assert.equal(output.issues[0].updatedAt, input.issues[0].updatedAt);
  assert.ok(Object.isFrozen(output) && Object.isFrozen(output.nodes) && Object.isFrozen(output.nodes[2].health.metrics[0]));
  assert.deepEqual(normalizeFleetSnapshot({ schemaVersion: 'bss.fleet.v1', generatedAt, sources: [], nodes: [], edges: [], issues: [] }).nodes, []);
  input.sources[0] = { id: 'source-fixture', label: 'Missing source', state: 'unavailable', observedAt: null };
  assert.equal(normalizeFleetSnapshot(input).sources[0].observedAt, null);
});

test('invalid topology, dates, health claims, metrics and issue identity fail the whole snapshot', () => {
  const invalid = [
    (v) => { v.schemaVersion = 'other'; }, (v) => { v.generatedAt = '2026-02-30T00:00:00Z'; },
    (v) => { v.generatedAt = '2026-11-07'; }, (v) => { v.sources[0].observedAt = null; },
    (v) => { v.nodes.push(v.nodes[0]); }, (v) => { v.edges.push(v.edges[0]); },
    (v) => { v.sources.push(v.sources[0]); }, (v) => { v.issues.push(v.issues[0]); },
    (v) => { v.edges[0].source = 'missing'; }, (v) => { v.edges[0].target = 'missing'; },
    (v) => { v.issues[0].repoId = 'hardware-fixture'; },
    (v) => { v.issues[1] = { ...v.issues[0], id: 'different-id' }; },
    (v) => { v.nodes[2].health.freshUntil = '2026-11-07T07:00:00Z'; },
    (v) => { v.nodes[2].health.observedAt = null; v.nodes[2].health.freshUntil = null; },
    (v) => { v.nodes[2].health.state = 'unknown'; v.nodes[2].health.observedAt = null; v.nodes[2].health.freshUntil = null; },
    (v) => { v.nodes[2].health.metrics[0].value = Infinity; }, (v) => { v.nodes[2].health.metrics[0].value = '83'; },
    (v) => { v.nodes[2].health.metrics[0].max = 0; }, (v) => { v.nodes[0].label = 'bad\nlabel'; },
    (v) => { v.nodes[0].group = 'g'.repeat(65); }, (v) => { v.edges[0].inferred = 'yes'; },
    (v) => { v.issues[0].stateReason = 'completed'; }, (v) => { v.issues[0].number = 2; },
    (v) => { v.issues[0].updatedAt = 'invalid'; }, (v) => { v.issues[0].title = 'x'.repeat(257); },
  ];
  for (const change of invalid) {
    const input = fixture(); change(input);
    assert.throws(() => normalizeFleetSnapshot(input), /fleet_snapshot_unavailable/);
  }
});

test('collection ceilings are enforced before returning any oversized graph or activity feed', () => {
  for (const key of ['sources', 'nodes', 'edges', 'issues']) {
    const input = fixture(); input[key] = Array.from({ length: LIMITS[key] + 1 }, () => input[key][0]);
    assert.throws(() => normalizeFleetSnapshot(input), /fleet_snapshot_unavailable/);
  }
  const input = fixture(); input.nodes[2].health.metrics = Array.from({ length: LIMITS.metrics + 1 }, () => ({ label: 'CPU', value: 1, unit: '%' }));
  assert.throws(() => normalizeFleetSnapshot(input), /fleet_snapshot_unavailable/);
});

test('only bounded HTTPS GitHub evidence and exact issue URLs are returned', () => {
  for (const url of ['https://untrusted.invalid/example/repo', 'http://github.com/example/repo',
    'https://github.com.attacker.invalid/example/repo', 'https://token@github.com/example/repo',
    'https://github.com/example/repo?token=private', 'https://github.com/example/repo#private', 'javascript:alert(1)']) {
    const input = fixture(); input.edges[0].evidenceUrl = url;
    assert.throws(() => normalizeFleetSnapshot(input), /fleet_snapshot_unavailable/);
  }
  for (const url of ['https://github.com/example/fleet-fixture/pull/1', 'https://github.com/example/fleet-fixture/issues/2',
    'https://github.com/example/fleet-fixture/issues/1?token=private']) {
    const input = fixture(); input.issues[0].url = url;
    assert.throws(() => normalizeFleetSnapshot(input), /fleet_snapshot_unavailable/);
  }
});

test('private Blob configuration rejects SAS, alternative endpoints, noncanonical paths and malformed identity IDs', () => {
  assert.equal(snapshotConfig(storageEnv).url, storageEnv.BSS_FLEET_SNAPSHOT_BLOB_URL);
  for (const url of [undefined, '', 'http://fixtureaccount.blob.core.windows.net/private-fixture/fleet.json',
    'https://untrusted.invalid/private/fleet.json', 'https://fixtureaccount.blob.core.windows.net.attacker.invalid/private/fleet.json',
    'https://fixtureaccount.blob.core.windows.net/private-fixture', `${storageEnv.BSS_FLEET_SNAPSHOT_BLOB_URL}?sig=private`,
    `${storageEnv.BSS_FLEET_SNAPSHOT_BLOB_URL}#private`, 'https://token@fixtureaccount.blob.core.windows.net/private-fixture/fleet.json',
    'https://fixtureaccount.blob.core.windows.net/private-fixture/../outside.json',
    'https://fixtureaccount.blob.core.windows.net/private-fixture/%2e%2e/outside.json']) {
    assert.throws(() => snapshotConfig({ BSS_FLEET_SNAPSHOT_BLOB_URL: url }), /fleet_snapshot_unavailable/);
  }
  assert.throws(() => snapshotConfig({ ...storageEnv, BSS_FLEET_MANAGED_IDENTITY_CLIENT_ID: 'invalid' }), /fleet_snapshot_unavailable/);
  assert.equal(snapshotConfig({ ...storageEnv, BSS_FLEET_MANAGED_IDENTITY_CLIENT_ID: authEnv.BLUE_SWALLOW_ENTRA_CLIENT_ID }).clientId,
    authEnv.BLUE_SWALLOW_ENTRA_CLIENT_ID);
});

test('Blob reads reject oversized declared and chunked bodies, invalid UTF-8, malformed JSON and invalid schema', async () => {
  const cases = [
    storageFixture(fixture(), { contentLength: MAX_SNAPSHOT_BYTES + 1 }),
    storageFixture(Buffer.alloc(MAX_SNAPSHOT_BYTES + 1, 32), { contentLength: undefined }),
    storageFixture(Buffer.from([0xff, 0xfe])), storageFixture('{invalid JSON'), storageFixture({ schemaVersion: 'wrong' }),
  ];
  for (const { store, stream } of cases) {
    await assert.rejects(store.getSnapshot(), /fleet_snapshot_unavailable/);
    assert.equal(stream.destroyed, true);
  }
});

test('deadline bounds both the initial download and a stalled response body', { timeout: 1000 }, async () => {
  let signal;
  const pending = createFleetSnapshotStore({ env: storageEnv, timeoutMs: 10,
    blobClient: { download(_offset, _count, options) { signal = options.abortSignal; return new Promise(() => {}); } } });
  await assert.rejects(pending.getSnapshot(), /fleet_snapshot_unavailable/);
  assert.equal(signal.aborted, true);
  const stream = new Readable({ read() {} });
  const stalled = createFleetSnapshotStore({ env: storageEnv, timeoutMs: 10,
    blobClient: { async download() { return { readableStreamBody: stream }; } } });
  await assert.rejects(stalled.getSnapshot(), /fleet_snapshot_unavailable/);
  assert.equal(stream.destroyed, true);
});
