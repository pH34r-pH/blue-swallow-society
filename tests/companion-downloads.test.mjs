import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { releaseFixture, readerFixture } from './fixtures/wardriver-development.mjs';
const require = createRequire(import.meta.url);
const { fixture } = require('./helpers/viewer-fixture.cjs');
const viewer = require('../api/_lib/viewer-session');
const { createCompanionGuard } = require('../api/_lib/companion-auth');
const { createCompanionDownloadsHandler } = require('../api/companion-downloads');
const machine = require('../api/wardriver-development')._internals;
const f = await fixture();
Object.assign(process.env, f.env);
const now = Date.parse('2026-11-10T12:00:00Z');
const record = await f.store.create(f.settings, now);
const session = viewer.signSession(record, f.settings, now);
const authorize = createCompanionGuard({ getConfig: () => f.settings, createStore: () => f.store, now: () => now });
const requestHeaders = { cookie: `${viewer.COOKIE}=${session.token}` };

async function invoke(artifact = 'current.json', options = {}) {
  const release = options.release || releaseFixture();
  const reads = [], grants = [];
  let constructions = 0;
  const handler = createCompanionDownloadsHandler({ authorize,
    env: { BSS_WARDRIVER_DEVELOPMENT_SIGNER_SHA256: releaseFixture().signerSha256 },
    createStore: () => {
      constructions++;
      return { async getRelease(reference) { reads.push(reference); if (options.unavailable) throw new Error('private details'); return release; },
        async createDownloadUrl(manifest, name) { grants.push({ manifest, name }); return 'https://synthetic.blob.core.windows.net/releases/approved.apk?sp=r&spr=https'; } };
    } });
  const context = {};
  await handler(context, { method: options.method || 'GET', headers: options.headers || requestHeaders,
    params: { artifact }, query: options.query });
  return { response: context.res, constructions, reads, grants };
}

test('anonymous, feed-reader and forged browser identities fail before release storage', async () => {
  const reader = readerFixture();
  for (const headers of [{}, { authorization: `Bearer ${reader.token}` }, { 'x-ms-client-principal': 'owner' },
    { cookie: `${viewer.COOKIE}=invalid` }]) {
    const result = await invoke('current.json', { headers });
    assert.ok(result.response.status >= 400);
    assert.equal(result.constructions, 0);
  }
});

test('browser sees validated development metadata and only immutable allowlisted APK/FAP grants', async () => {
  const release = releaseFixture();
  const metadata = await invoke();
  assert.equal(metadata.response.status, 200);
  assert.equal(metadata.response.body.packageId, 'co.blueswallow.wardriver.vnext');
  assert.equal(metadata.response.headers['Cache-Control'], 'private, no-store');
  assert.equal(metadata.response.headers.Vary, 'Cookie, Authorization, X-Blue-Swallow-Operator-Token');
  assert.equal(metadata.grants.length, 0);
  for (const file of [release.apk.fileName, release.extensions[0].fileName, 'release.json']) {
    const result = await invoke(`${release.versionCode}/${release.sourceCommit}/${file}`);
    assert.deepEqual(result.reads, [{ versionCode: release.versionCode, sourceCommit: release.sourceCommit, fileName: file }]);
    assert.equal(result.response.status, file === 'release.json' ? 200 : 302);
    assert.equal(result.grants.length, file === 'release.json' ? 0 : 1);
  }
  const head = await invoke('current.json', { method: 'HEAD' });
  assert.equal(head.response.status, 200);
  assert.equal(head.response.body, undefined);
});

test('unknown paths, query credentials and methods never construct a store', async () => {
  for (const path of ['index.html', undefined, '../secret', '1/not-a-sha/a.apk', '0/' + 'a'.repeat(40) + '/a.apk']) {
    const result = await invoke(path === undefined ? '' : path);
    assert.equal(result.response.status, 404);
    assert.equal(result.constructions, 0);
  }
  const query = await invoke('current.json', { query: { token: 'secret' } });
  assert.equal(query.response.status, 404);
  assert.equal(query.constructions, 0);
  const method = await invoke('current.json', { method: 'POST', headers: { ...requestHeaders, origin: f.settings.origin } });
  assert.equal(method.response.status, 405);
  assert.equal(method.constructions, 0);
});

test('wrong package/channel/signer and pointer races fail closed without artifact grants', async () => {
  for (const change of [{ packageId: 'co.blueswallow.wardriver' }, { channel: 'production' }, { signerSha256: 'f'.repeat(64) }]) {
    const result = await invoke('current.json', { release: { ...releaseFixture(), ...change } });
    assert.equal(result.response.status, 503);
    assert.equal(result.grants.length, 0);
  }
  const release = releaseFixture();
  const race = await invoke(`${release.versionCode + 1}/${release.sourceCommit}/wardriver-vnext-${release.versionCode + 1}.apk`);
  assert.equal(race.response.status, 503);
  assert.equal(race.grants.length, 0);
  const unknown = await invoke(`${release.versionCode}/${release.sourceCommit}/unlisted.fap`);
  assert.equal(unknown.response.status, 404);
  assert.equal(unknown.grants.length, 0);
  const missing = await invoke('current.json', { unavailable: true });
  assert.equal(missing.response.status, 503);
  assert.doesNotMatch(JSON.stringify(missing.response), /private details/);
});

test('the same viewer cookie/token cannot enter the existing machine feed', async () => {
  for (const headers of [requestHeaders, { authorization: `Bearer ${session.token}` }]) {
    let reads = 0;
    const context = {};
    await machine.handle(context, { method: 'GET', params: { artifact: 'current.json' }, headers },
      { env: readerFixture().env, createStore: () => { reads++; throw new Error(); } });
    assert.equal(context.res.status, 401);
    assert.equal(reads, 0);
  }
});
