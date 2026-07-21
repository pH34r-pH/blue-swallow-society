import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../api/wardriver-release-current/index.js');

const release = Object.freeze({
  schemaVersion: 1,
  name: 'Blue Swallow Wardriver',
  packageId: 'co.blueswallow.wardriver',
  versionName: '2.109-bss.2',
  versionCode: 311,
  buildType: 'release',
  fileName: 'blue-swallow-wardriver-2.109-bss.2.apk',
  sizeBytes: 67012000,
  sha256: 'a'.repeat(64),
  signerSha256: 'b'.repeat(64),
  sourceCommit: 'a6295aba93efcdd425db1c7c32754c6eafaa0c94',
  sourceTag: 'wardriver-v2.109-bss.2',
  buildRunId: '123456789-1',
  publishedAt: '2026-07-19T22:00:00Z',
  notes: ['Secure BSS upload and live RaID detection.'],
  blobName: 'wardriver/releases/2.109-bss.2/a6295aba93efcdd425db1c7c32754c6eafaa0c94/blue-swallow-wardriver-2.109-bss.2.apk',
});

test('current-release route exposes only device-safe availability metadata', async () => {
  const context = { log: { error: () => {} } };
  await handler._internals.handle(context, { method: 'GET' }, {
    getRelease: async () => release,
  });

  assert.equal(context.res.status, 200);
  assert.equal(context.res.headers['Cache-Control'], 'no-store');
  assert.deepEqual(context.res.body, {
    ok: true,
    release: {
      versionName: '2.109-bss.2',
      versionCode: 311,
      publishedAt: '2026-07-19T22:00:00Z',
      notes: ['Secure BSS upload and live RaID detection.'],
    },
  });
});

test('current-release route fails closed when the private manifest is unavailable', async () => {
  const context = { log: { error: () => {} } };
  await handler._internals.handle(context, { method: 'GET' }, {
    getRelease: async () => { throw new Error('storage unavailable'); },
  });

  assert.equal(context.res.status, 503);
  assert.deepEqual(context.res.body, { ok: false, error: 'Wardriver release is unavailable.' });
});

test('current-release handler fails closed when release-store configuration is absent', async () => {
  const keys = [
    'BSS_WARDRIVER_RELEASE_STORAGE_CONNECTION_STRING',
    'BSS_WARDRIVER_RELEASE_CONTAINER',
    'BSS_WARDRIVER_RELEASE_MANIFEST_BLOB',
  ];
  const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  for (const key of keys) delete process.env[key];

  try {
    const context = { log: { error: () => {} } };
    await handler(context, { method: 'GET' });

    assert.equal(context.res.status, 503);
    assert.deepEqual(context.res.body, { ok: false, error: 'Wardriver release is unavailable.' });
  } finally {
    for (const key of keys) {
      if (original[key] === undefined) delete process.env[key];
      else process.env[key] = original[key];
    }
  }
});
