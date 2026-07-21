import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';

const require = createRequire(import.meta.url);
const handler = require('../api/operator-downloads/index.js');
const { createOperatorToken } = require('../api/_lib/operator-auth.js');

const TEST_SIGNING_KEY = 'test-operator-token-signing-key-32-bytes-minimum';
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

function makeContext() {
  return { log: { warn: () => {}, error: () => {} } };
}

async function invoke(artifact, { headers = {}, method = 'GET', dependencies } = {}) {
  const context = makeContext();
  await handler._internals.handle(context, {
    method,
    params: { artifact },
    headers,
  }, dependencies);
  return context.res;
}

function fakeReleaseStore() {
  return {
    async getRelease() {
      return release;
    },
    async createDownloadUrl(manifest) {
      assert.equal(manifest, release);
      return 'https://bsswardriver.blob.core.windows.net/wardriver-releases/wardriver/releases/2.109-bss.2/a6295aba.apk?sv=2025-01-01&sp=r&spr=https';
    },
  };
}

function withSigningKey(fn) {
  const previous = {
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY,
    BLUE_SWALLOW_PASSCODE_SHA256: process.env.BLUE_SWALLOW_PASSCODE_SHA256,
  };
  process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = TEST_SIGNING_KEY;
  process.env.BLUE_SWALLOW_PASSCODE_SHA256 = '0'.repeat(64);
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
    });
}

test('operator downloads reject anonymous requests before reading release storage', async () => {
  await withSigningKey(async () => {
    let read = false;
    const response = await invoke('metadata', {
      dependencies: { getRelease: async () => { read = true; return release; } },
    });
    assert.equal(response.status, 403);
    assert.equal(response.body.ok, false);
    assert.equal(read, false);
  });
});

async function withoutReleaseStoreConfig(fn) {
  const names = [
    'BSS_WARDRIVER_RELEASE_STORAGE_CONNECTION_STRING',
    'BSS_WARDRIVER_RELEASE_CONTAINER',
    'BSS_WARDRIVER_RELEASE_MANIFEST_BLOB',
  ];
  const previous = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  names.forEach((name) => delete process.env[name]);
  try {
    await fn();
  } finally {
    for (const [name, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
}

test('anonymous public handler requests are rejected before release-store construction', async () => {
  await withSigningKey(() => withoutReleaseStoreConfig(async () => {
    const context = makeContext();
    await handler(context, { method: 'GET', params: { artifact: 'metadata' }, headers: {} });
    assert.equal(context.res.status, 403);
    assert.equal(context.res.body.ok, false);
  }));
});

test('operator metadata exposes verified release provenance without storage internals', async () => {
  await withSigningKey(async () => {
    const session = createOperatorToken();
    const response = await invoke('metadata', {
      headers: { cookie: `bss_operator_session=${encodeURIComponent(session.token)}` },
      dependencies: fakeReleaseStore(),
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(response.body.ok, true);
    assert.equal(response.body.artifact.versionCode, 311);
    assert.equal(response.body.artifact.sourceTag, 'wardriver-v2.109-bss.2');
    assert.equal(response.body.artifact.downloadPath, '/api/operator-downloads/wardriver/apk');
    assert.equal(response.body.artifact.metadataPath, '/api/operator-downloads/wardriver/metadata');
    assert.equal('blobName' in response.body.artifact, false);
  });
});

test('operator APK request issues a bounded HTTPS redirect without buffering APK bytes', async () => {
  await withSigningKey(async () => {
    const session = createOperatorToken();
    const response = await invoke('apk', {
      headers: { authorization: `Bearer ${session.token}` },
      dependencies: fakeReleaseStore(),
    });

    assert.equal(response.status, 302);
    assert.match(response.headers.Location, /^https:\/\/bsswardriver\.blob\.core\.windows\.net\//);
    assert.match(response.headers.Location, /(?:\?|&)sp=r(?:&|$)/);
    assert.match(response.headers.Location, /(?:\?|&)spr=https(?:&|$)/);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(response.body, undefined);
    assert.equal('Content-Length' in response.headers, false);
  });
});

test('release storage failures produce an explicit unavailable response and no stale fallback', async () => {
  await withSigningKey(async () => {
    const session = createOperatorToken();
    const response = await invoke('metadata', {
      headers: { authorization: `Bearer ${session.token}` },
      dependencies: { getRelease: async () => { throw new Error('manifest unavailable'); } },
    });

    assert.equal(response.status, 503);
    assert.equal(response.body.ok, false);
    assert.equal(response.body.error, 'Wardriver release is unavailable.');
  });
});

test('operator handler contains no Functions-bundled APK fallback', () => {
  const source = readFileSync(new URL('../api/operator-downloads/index.js', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /_private[\\/]downloads|readFileSync\(apk|statSync\(apk/);
});
