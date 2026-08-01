import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';

const require = createRequire(import.meta.url);
const handler = require('../api/wardriver-release-probe/index.js');
const {
  ReleaseUnavailableError,
  _internals,
  toReleaseProbeMetadata,
  validateManifest,
} = require('../api/_lib/wardriver-release-store.js');

const PROBE_VALUE = 'test-probe-value-for-contract';
const release = Object.freeze({
  schemaVersion: 1,
  name: 'Blue Swallow Wardriver',
  packageId: 'co.blueswallow.wardriver',
  versionName: '2.110-bss.26',
  versionCode: 335,
  buildType: 'release',
  fileName: 'blue-swallow-wardriver-2.110-bss.26-a6295aba93efcdd425db1c7c32754c6eafaa0c94.apk',
  sizeBytes: 67012000,
  sha256: 'a'.repeat(64),
  signerSha256: 'b'.repeat(64),
  sourceCommit: 'a6295aba93efcdd425db1c7c32754c6eafaa0c94',
  sourceTag: 'wardriver-v2.110-bss.26',
  buildRunId: '123456789-1',
  publishedAt: '2026-08-01T12:00:00Z',
  notes: ['Direct-current release policy.'],
  blobName: 'wardriver/releases/2.110-bss.26/a6295aba93efcdd425db1c7c32754c6eafaa0c94/blue-swallow-wardriver-2.110-bss.26-a6295aba93efcdd425db1c7c32754c6eafaa0c94.apk',
  acceptanceMode: 'post-publication-required',
});

function makeContext() {
  return { log: { error: () => {} } };
}

async function withProbeSetting(value, fn) {
  const previous = process.env.BSS_WARDRIVER_RELEASE_PROBE_SECRET;
  if (value === undefined) delete process.env.BSS_WARDRIVER_RELEASE_PROBE_SECRET;
  else process.env.BSS_WARDRIVER_RELEASE_PROBE_SECRET = value;
  try {
    await fn();
  } finally {
    if (previous === undefined) delete process.env.BSS_WARDRIVER_RELEASE_PROBE_SECRET;
    else process.env.BSS_WARDRIVER_RELEASE_PROBE_SECRET = previous;
  }
}

test('release probe rejects anonymous and wrong-header callers before release-store construction', async () => {
  await withProbeSetting(PROBE_VALUE, async () => {
    for (const headers of [{}, { 'x-blue-swallow-release-probe': 'wrong-probe-value' }]) {
      const context = makeContext();
      await handler(context, { method: 'GET', headers });
      assert.equal(context.res.status, 403);
      assert.deepEqual(context.res.body, { ok: false, error: 'Release probe authorization required.' });
    }
  });
});

test('release probe reports unavailable configuration before release-store construction', async () => {
  await withProbeSetting(undefined, async () => {
    const context = makeContext();
    await handler(context, { method: 'GET', headers: {} });
    assert.equal(context.res.status, 503);
    assert.deepEqual(context.res.body, { ok: false, error: 'Wardriver release probe is unavailable.' });
  });
});

test('authorized non-GET requests are rejected before release-store construction', async () => {
  await withProbeSetting(PROBE_VALUE, async () => {
    let constructed = false;
    const context = makeContext();
    await handler(context, {
      method: 'POST',
      headers: { 'x-blue-swallow-release-probe': PROBE_VALUE },
    }, {
      createReleaseStore: () => {
        constructed = true;
        throw new Error('release store must not be constructed');
      },
    });

    assert.equal(context.res.status, 405);
    assert.equal(context.res.body.ok, false);
    assert.equal(constructed, false);
  });
});

test('release probe projection preserves compatibility for manifests without acceptance mode', () => {
  const legacyRelease = { ...release };
  delete legacyRelease.acceptanceMode;

  const projection = toReleaseProbeMetadata(legacyRelease);

  assert.equal(projection.acceptanceMode, null);
});

test('release manifest binds source tag to version name', () => {
  assert.throws(
    () => validateManifest({ ...release, sourceTag: 'wardriver-v2.110-bss.25' }),
    ReleaseUnavailableError,
  );
});

test('release manifest rejects unrecognized artifact file names', () => {
  const fileName = 'blue-swallow-wardriver-2.110-bss.26-deadbeef.apk';
  assert.throws(
    () => validateManifest({
      ...release,
      fileName,
      blobName: `wardriver/releases/${release.versionName}/${release.sourceCommit}/${fileName}`,
    }),
    ReleaseUnavailableError,
  );
});

test('release manifest preserves legacy version-only artifact file names', () => {
  const fileName = `blue-swallow-wardriver-${release.versionName}.apk`;
  const legacy = validateManifest({
    ...release,
    fileName,
    blobName: `wardriver/releases/${release.versionName}/${release.sourceCommit}/${fileName}`,
  });

  assert.equal(legacy.fileName, fileName);
});

test('release manifest reader rejects an oversized body', async () => {
  assert.equal(typeof _internals?.readStream, 'function');
  await assert.rejects(
    _internals.readStream(Readable.from([Buffer.alloc(128 * 1024 + 1)])),
    ReleaseUnavailableError,
  );
});

test('authorized release probe returns exact manifest provenance without delivery capability', async () => {
  const context = makeContext();
  await handler._internals.handleAuthorized(context, { method: 'GET' }, {
    getRelease: async () => release,
  });

  assert.equal(context.res.status, 200);
  assert.equal(context.res.headers['Cache-Control'], 'private, no-store');
  assert.equal(context.res.headers['X-Content-Type-Options'], 'nosniff');
  assert.deepEqual(context.res.body, { ok: true, release: toReleaseProbeMetadata(release) });
  assert.deepEqual(Object.keys(context.res.body.release).sort(), [
    'acceptanceMode', 'blobName', 'buildRunId', 'buildType', 'fileName', 'name', 'notes', 'packageId',
    'publishedAt', 'schemaVersion', 'sha256', 'signerSha256', 'sizeBytes', 'sourceCommit', 'sourceTag',
    'versionCode', 'versionName',
  ].sort());
  assert.equal(context.res.body.release.acceptanceMode, 'post-publication-required');
  assert.equal('downloadUrl' in context.res.body.release, false);
  assert.equal('downloadPath' in context.res.body.release, false);
  assert.equal('metadataPath' in context.res.body.release, false);
  assert.equal('sas' in context.res.body.release, false);
});

test('authorized release probe rejects non-GET methods without reading the release store', async () => {
  const context = makeContext();
  let read = false;
  await handler._internals.handleAuthorized(context, { method: 'POST' }, {
    getRelease: async () => { read = true; return release; },
  });

  assert.equal(context.res.status, 405);
  assert.equal(context.res.body.ok, false);
  assert.equal(read, false);
});

test('release probe source is bounded metadata-only code', () => {
  const source = readFileSync(new URL('../api/wardriver-release-probe/index.js', import.meta.url), 'utf8');
  assert.match(source, /crypto\.timingSafeEqual/);
  assert.match(source, /MAX_PROBE_VALUE_LENGTH/);
  assert.match(source, /x-blue-swallow-release-probe/);
  assert.doesNotMatch(source, /createDownloadUrl|generateBlobSAS|operator-downloads|\.apk/);
});
