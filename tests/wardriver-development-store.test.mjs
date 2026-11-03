import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { Readable } from 'node:stream';
import { readerFixture, releaseFixture, signerSha256, sha256 } from './fixtures/wardriver-development.mjs';

const require = createRequire(import.meta.url);
const { createDevelopmentStore, validateManifest, LATEST_BLOB } = require('../api/_lib/wardriver-development-store');
const issuedAt = Date.parse('2026-11-03T12:30:00Z');

function storageFixture(entries, env = readerFixture().env) {
  const reads = [];
  const serviceClient = {
    getContainerClient(name) {
      assert.equal(name, 'development-fixture');
      return {
        getBlockBlobClient(blobName) {
          return {
            async download(offset, count) {
              reads.push({ blobName, offset, count });
              if (!entries.has(blobName)) throw new Error('synthetic storage failure');
              const value = entries.get(blobName);
              const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
              return { contentLength: bytes.length, readableStreamBody: Readable.from([bytes]) };
            },
          };
        },
      };
    },
  };
  return { store: createDevelopmentStore({ env, serviceClient, now: () => issuedAt }), reads };
}

test('development receipt validates the publisher contract and ignores extra publication evidence', () => {
  const input = { ...releaseFixture(), nativeVoice: { compiled: true }, ignored: 'publisher-only evidence' };
  const result = validateManifest(input, signerSha256);
  assert.equal(result.packageId, 'co.blueswallow.wardriver.vnext');
  assert.equal(result.extensions[0].firmwareVersion, '1.5.1');
  assert.equal(result.extensions[0].apiMajor, 88);
  assert.equal(result.nativeVoice, undefined);
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.extensions[0]));
});

const invalidManifests = [
  ['production package', (m) => { m.packageId = 'co.blueswallow.wardriver'; }],
  ['production build', (m) => { m.buildType = 'release'; }],
  ['different schema', (m) => { m.schemaVersion = 2; }],
  ['different channel', (m) => { m.channel = 'public'; }],
  ['different kind', (m) => { m.kind = 'release'; }],
  ['different signer', (m) => { m.signerSha256 = sha256('different synthetic signer'); }],
  ['zero version', (m) => { m.versionCode = 0; }],
  ['oversized version', (m) => { m.versionCode = 2100000001; }],
  ['HTML version', (m) => { m.versionName = '<script>'; }],
  ['truncated source SHA', (m) => { m.sourceCommit = m.sourceCommit.slice(0, 7); }],
  ['uppercase source SHA', (m) => { m.sourceCommit = m.sourceCommit.toUpperCase(); }],
  ['invalid run attempt', (m) => { m.buildRunId = '123-0'; }],
  ['non-UTC time', (m) => { m.publishedAt = '2026-11-03T12:00:00+01:00'; }],
  ['impossible date', (m) => { m.publishedAt = '2026-02-30T12:00:00Z'; }],
  ['different APK name', (m) => { m.apk.fileName = 'other.apk'; }],
  ['outside APK prefix', (m) => { m.apk.blobName = 'wardriver/releases/other.apk'; }],
  ['negative APK size', (m) => { m.apk.sizeBytes = -1; }],
  ['invalid APK hash', (m) => { m.apk.sha256 = 'invalid'; }],
  ['no bundled extension', (m) => { m.extensions = []; }],
  ['duplicate extension', (m) => { m.extensions.push({ ...m.extensions[0] }); }],
  ['extension traversal', (m) => { m.extensions[0].id = '../outside'; }],
  ['extension name/path mismatch', (m) => { m.extensions[0].fileName = 'other.fap'; }],
  ['outside FAP prefix', (m) => { m.extensions[0].blobName = '../outside.fap'; }],
  ['invalid FAP md5', (m) => { m.extensions[0].md5 = 'bad'; }],
  ['invalid FAP API', (m) => { m.extensions[0].apiMajor = -1; }],
  ['invalid FAP source', (m) => { m.extensions[0].sourceCommit = 'short'; }],
];
for (const [name, change] of invalidManifests) {
  test(`development receipt rejects ${name}`, () => {
    const manifest = releaseFixture();
    change(manifest);
    assert.throws(() => validateManifest(manifest, signerSha256), /unavailable/);
  });
}

test('current and immutable reads use fixed names and bound the response size', async () => {
  const release = releaseFixture();
  const immutable = release.apk.blobName.replace(release.apk.fileName, 'release.json');
  const { store, reads } = storageFixture(new Map([[LATEST_BLOB, release], [immutable, release]]));
  assert.deepEqual(await store.getRelease(), validateManifest(release, signerSha256));
  assert.equal((await store.getRelease(release)).versionCode, release.versionCode);
  assert.deepEqual(reads, [LATEST_BLOB, immutable].map((blobName) => ({ blobName, offset: 0, count: 131073 })));
});

test('immutable manifest identity must match the requested version and commit', async () => {
  const requested = releaseFixture();
  const newer = releaseFixture(21, 'b'.repeat(40));
  const path = requested.apk.blobName.replace(requested.apk.fileName, 'release.json');
  const { store } = storageFixture(new Map([[path, newer], [LATEST_BLOB, newer]]));
  await assert.rejects(store.getRelease(requested), /unavailable/);
});

test('oversized, malformed, and missing manifests fail without a stale fallback', async () => {
  for (const entries of [new Map([[LATEST_BLOB, 'x'.repeat(131073)]]), new Map([[LATEST_BLOB, '{bad json']]), new Map()]) {
    const { store, reads } = storageFixture(entries);
    await assert.rejects(store.getRelease(), /unavailable/);
    assert.equal(reads.length, 1);
  }
});

test('APK and FAP grants are exact-blob, HTTPS, read-only, fresh five-minute SAS grants', async () => {
  const release = releaseFixture();
  const { store, reads } = storageFixture(new Map());
  for (const artifact of [release.apk, ...release.extensions]) {
    const url = new URL(await store.createDownloadUrl(release, artifact.fileName));
    assert.equal(url.origin, 'https://fixtureaccount.blob.core.windows.net');
    assert.equal(url.pathname, `/development-fixture/${artifact.blobName}`);
    assert.equal(url.searchParams.get('sp'), 'r');
    assert.equal(url.searchParams.get('spr'), 'https');
    assert.equal(url.searchParams.get('sr'), 'b');
    assert.equal(Date.parse(url.searchParams.get('se')), issuedAt + 300000);
    assert.equal(Date.parse(url.searchParams.get('st')), issuedAt - 30000);
    assert.ok(url.searchParams.get('sig'));
  }
  assert.deepEqual(reads, [], 'Generating a grant must not download artifact bytes');
  await assert.rejects(store.createDownloadUrl(release, 'unlisted.fap'), /unavailable/);
  await assert.rejects(store.createDownloadUrl(release, '../outside.apk'), /unavailable/);
  await assert.rejects(store.createDownloadUrl(release, 'release.json'), /unavailable/);
});

test('development storage cannot use production configuration or an arbitrary endpoint', () => {
  const { env } = readerFixture();
  for (const key of ['BSS_WARDRIVER_DEVELOPMENT_SIGNER_SHA256', 'BSS_WARDRIVER_DEVELOPMENT_CONTAINER',
    'BSS_WARDRIVER_DEVELOPMENT_STORAGE_CONNECTION_STRING']) {
    const missing = { ...env }; delete missing[key];
    assert.throws(() => createDevelopmentStore({ env: missing }), /unavailable/);
  }
  for (const append of [';BlobEndpoint=https://unexpected.invalid', ';DefaultEndpointsProtocol=http', ';EndpointSuffix=other.invalid']) {
    assert.throws(() => createDevelopmentStore({ env: { ...env,
      BSS_WARDRIVER_DEVELOPMENT_STORAGE_CONNECTION_STRING: env.BSS_WARDRIVER_DEVELOPMENT_STORAGE_CONNECTION_STRING + append,
    } }), /unavailable/);
  }
  assert.throws(() => createDevelopmentStore({ env: {
    BSS_WARDRIVER_RELEASE_STORAGE_CONNECTION_STRING: env.BSS_WARDRIVER_DEVELOPMENT_STORAGE_CONNECTION_STRING,
  } }), /unavailable/);
});
