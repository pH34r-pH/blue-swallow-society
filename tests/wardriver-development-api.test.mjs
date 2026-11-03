import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { randomBytes } from 'node:crypto';
import { readerFixture, releaseFixture, sha256 } from './fixtures/wardriver-development.mjs';

const require = createRequire(import.meta.url);
const { handle } = require('../api/wardriver-development')._internals;
const { verifyDevelopmentReader } = require('../api/_lib/wardriver-development-auth');

function fakeStore(release = releaseFixture()) {
  const references = [];
  const grants = [];
  return {
    references,
    grants,
    async getRelease(reference) { references.push(reference); return release; },
    async createDownloadUrl(manifest, fileName) {
      grants.push({ manifest, fileName });
      return `https://fixtureaccount.blob.core.windows.net/development-fixture/${manifest.apk.blobName}?sp=r&spr=https&sig=synthetic`;
    },
  };
}

async function invoke(fixture, artifact = 'index.html', options = {}) {
  const logs = [];
  const context = { log: { error: (...items) => logs.push(items) } };
  const store = options.store || fakeStore();
  let constructions = 0;
  await handle(context, {
    method: options.method || 'GET',
    params: { artifact },
    headers: options.headers ?? { authorization: `Bearer ${fixture.token}` },
    query: options.query,
  }, {
    env: options.env || fixture.env,
    createStore: options.createStore || (() => { constructions += 1; return store; }),
  });
  return { ...context.res, logs, store, constructions };
}

test('anonymous, wrong, malformed, cookie, query, and forged-principal readers fail before storage construction', async () => {
  const fixture = readerFixture();
  for (const headers of [{}, { authorization: 'Bearer malformed' },
    { authorization: `Bearer ${randomBytes(32).toString('base64url')}` },
    { cookie: `__Host-bss_owner_session=${fixture.token}` },
    { 'x-blue-swallow-operator-token': fixture.token }, { 'x-ms-client-principal': 'forged-owner' },
    { authorization: [`Bearer ${fixture.token}`] },
    { authorization: `Bearer ${fixture.token}`, Authorization: 'ambiguous' }]) {
    const response = await invoke(fixture, 'index.html', { headers, query: { token: fixture.token } });
    assert.equal(response.status, 401);
    assert.equal(response.constructions, 0);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.doesNotMatch(JSON.stringify(response.body), new RegExp(fixture.token));
  }
});

test('reader configuration is bounded and malformed or missing configuration fails closed', async () => {
  const fixture = readerFixture();
  for (const config of [{}, { BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_SHA256: 'invalid' },
    { ...fixture.env, BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_HASHES: 'not json' },
    { ...fixture.env, BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_HASHES: '[]' },
    { ...fixture.env, BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_HASHES: JSON.stringify({ friend: 'bad' }) },
    { ...fixture.env, BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_HASHES: JSON.stringify(Object.fromEntries(
      Array.from({ length: 16 }, (_, n) => [`friend${n}`, sha256(`synthetic reader ${n}`)]))) }]) {
    const response = await invoke(fixture, 'index.html', { env: config });
    assert.equal(response.status, 503);
    assert.equal(response.constructions, 0);
  }
});

test('independent reader hashes support per-device revocation without granting owner access', () => {
  const owner = readerFixture();
  const friend = readerFixture();
  const env = { ...owner.env,
    BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_HASHES: JSON.stringify({ friend_phone: sha256(friend.token) }),
  };
  const request = (token) => ({ headers: { Authorization: `Bearer ${token}` } });
  assert.equal(verifyDevelopmentReader(request(owner.token), env).ok, true);
  assert.equal(verifyDevelopmentReader(request(friend.token), env).ok, true);
  delete env.BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_HASHES;
  assert.equal(verifyDevelopmentReader(request(friend.token), env).ok, false);
  assert.equal(verifyDevelopmentReader(request(owner.token), env).ok, true);
  const { BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_SHA256: removed, ...friendOnly } = owner.env;
  friendOnly.BSS_WARDRIVER_DEVELOPMENT_READ_TOKEN_HASHES = JSON.stringify({ friend_phone: sha256(friend.token) });
  assert.equal(verifyDevelopmentReader(request(friend.token), friendOnly).ok, true);
});

test('a valid development reader and a valid owner session cannot cross authentication boundaries', () => {
  const { createOwnerSession } = require('../api/shared/owner-session.cjs');
  const { verifyOperatorRequest } = require('../api/_lib/operator-auth');
  const fixture = readerFixture();
  const configured = {
    BLUE_SWALLOW_AUTH_MODE: 'entra',
    BLUE_SWALLOW_ENTRA_TENANT_ID: '11111111-1111-1111-1111-111111111111',
    BLUE_SWALLOW_ENTRA_CLIENT_ID: '22222222-2222-2222-2222-222222222222',
    BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID: '33333333-3333-3333-3333-333333333333',
    BLUE_SWALLOW_OWNER_SESSION_KEY: randomBytes(32).toString('base64url'),
  };
  const previous = Object.fromEntries(Object.keys(configured).map((name) => [name, process.env[name]]));
  try {
    Object.assign(process.env, configured);
    const owner = createOwnerSession({
      iss: `https://login.microsoftonline.com/${configured.BLUE_SWALLOW_ENTRA_TENANT_ID}/v2.0`,
      aud: configured.BLUE_SWALLOW_ENTRA_CLIENT_ID,
      tid: configured.BLUE_SWALLOW_ENTRA_TENANT_ID,
      oid: configured.BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID,
      exp: Math.floor(Date.now() / 1000) + 600,
    });
    const ownerRequest = { headers: { authorization: `Bearer ${owner.token}` } };
    const readerRequest = { headers: { authorization: `Bearer ${fixture.token}` } };
    assert.equal(verifyOperatorRequest(ownerRequest).ok, true);
    assert.equal(verifyOperatorRequest(readerRequest).ok, false);
    assert.equal(verifyDevelopmentReader(readerRequest, fixture.env).ok, true);
    assert.equal(verifyDevelopmentReader(ownerRequest, fixture.env).ok, false);
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name]; else process.env[name] = value;
    }
  }
});

test('authorized HTML has one stable versioned APK plus paired FAP and receipt links without bearer or SAS', async () => {
  const fixture = readerFixture();
  const release = releaseFixture();
  release.extensions[0].name = 'Power <display> & tools';
  const response = await invoke(fixture, 'index.html', { store: fakeStore(release) });
  assert.equal(response.status, 200);
  assert.equal(response.headers['Content-Type'], 'text/html; charset=utf-8');
  assert.equal(response.headers['Cache-Control'], 'private, no-store');
  const links = [...response.body.matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
  const prefix = `/api/wardriver-development/20/${release.sourceCommit}/`;
  assert.deepEqual(links, [`${prefix}wardriver-vnext-20.apk`, `${prefix}wardriver_power.fap`, `${prefix}release.json`]);
  assert.equal(new RegExp('id="version-code">([0-9]+)<').exec(response.body)?.[1], String(release.versionCode));
  assert.match(response.body, /Power &lt;display&gt; &amp; tools/);
  assert.doesNotMatch(response.body, /sig=|AccountKey=|blob\.core\.windows\.net/);
  assert.ok(!response.body.includes(fixture.token));
});

test('every versioned APK/FAP download authenticates and resolves the requested immutable release', async () => {
  const fixture = readerFixture();
  const release = releaseFixture();
  for (const fileName of [release.apk.fileName, release.extensions[0].fileName]) {
    const artifact = `${release.versionCode}/${release.sourceCommit}/${fileName}`;
    const response = await invoke(fixture, artifact);
    assert.equal(response.status, 302);
    assert.equal(response.body, undefined);
    assert.equal(response.store.references[0].versionCode, release.versionCode);
    assert.equal(response.store.references[0].sourceCommit, release.sourceCommit);
    assert.equal(response.store.grants[0].fileName, fileName);
    assert.equal((await invoke(fixture, artifact, { headers: {} })).status, 401);
  }
});

test('latest-pointer movement does not replace an explicitly requested previous version', async () => {
  const fixture = readerFixture();
  const previous = releaseFixture();
  const current = releaseFixture(21, 'b'.repeat(40));
  const store = fakeStore();
  store.getRelease = async (reference) => reference ? previous : current;
  const index = await invoke(fixture, 'index.html', { store });
  assert.match(index.body, /wardriver-vnext-21\.apk/);
  const download = await invoke(fixture, `20/${previous.sourceCommit}/${previous.apk.fileName}`, { store });
  assert.equal(download.status, 302);
  assert.equal(store.grants[0].manifest.versionCode, 20);
  store.getRelease = async () => current;
  const wrong = await invoke(fixture, `20/${previous.sourceCommit}/${previous.apk.fileName}`, { store });
  assert.equal(wrong.status, 503);
  assert.equal(store.grants.length, 1);
});

test('receipt and HEAD responses preserve private provenance without artifact grants or response bodies', async () => {
  const fixture = readerFixture();
  const release = releaseFixture();
  const path = `20/${release.sourceCommit}/release.json`;
  const receipt = await invoke(fixture, path);
  assert.equal(receipt.status, 200);
  assert.equal(receipt.body.signerSha256, fixture.env.BSS_WARDRIVER_DEVELOPMENT_SIGNER_SHA256);
  assert.equal(receipt.body.apk.sha256, release.apk.sha256);
  assert.deepEqual(receipt.store.grants, []);
  for (const artifact of ['index.html', path, `20/${release.sourceCommit}/${release.apk.fileName}`]) {
    const head = await invoke(fixture, artifact, { method: 'HEAD' });
    assert.equal(head.body, undefined);
    assert.ok([200, 302].includes(head.status));
  }
  assert.equal((await invoke(fixture, path, { method: 'HEAD', headers: {} })).body, undefined);
});

test('invalid routes, traversal, unsupported methods, and unlisted files cannot obtain grants', async () => {
  const fixture = readerFixture();
  const commit = releaseFixture().sourceCommit;
  for (const artifact of ['../latest.json', `20/${commit}/../other.apk`, `20/${commit}/%2e%2e`,
    `020/${commit}/release.json`, `2100000001/${commit}/release.json`,
    `20/${commit}/wardriver-vnext-21.apk`, `20/${commit}/private.txt`]) {
    const response = await invoke(fixture, artifact);
    assert.equal(response.status, 404);
    assert.equal(response.constructions, 0);
  }
  const unlisted = await invoke(fixture, `20/${commit}/unlisted.fap`);
  assert.equal(unlisted.status, 404);
  assert.deepEqual(unlisted.store.grants, []);
  const post = await invoke(fixture, 'index.html', { method: 'POST' });
  assert.equal(post.status, 405);
  assert.equal(post.constructions, 0);
});

test('configuration and storage errors are redacted and cannot serve stale releases', async () => {
  const fixture = readerFixture();
  for (const createStore of [() => { throw new Error(fixture.token); },
    () => ({ getRelease: async () => { throw new Error(fixture.env.BSS_WARDRIVER_DEVELOPMENT_STORAGE_CONNECTION_STRING); } }),
    () => ({ getRelease: async () => ({ ...releaseFixture(), signerSha256: sha256('different signer') }) })]) {
    const response = await invoke(fixture, 'index.html', { createStore });
    assert.equal(response.status, 503);
    assert.equal(response.headers.Location, undefined);
    assert.ok(!JSON.stringify(response).includes(fixture.token));
    assert.doesNotMatch(JSON.stringify(response), /AccountKey=/);
  }
});
