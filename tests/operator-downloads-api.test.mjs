import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

const require = createRequire(import.meta.url);
const handler = require('../api/operator-downloads/index.js');
const { createOperatorToken } = require('../api/_lib/operator-auth.js');

const TEST_SIGNING_KEY = 'test-operator-token-signing-key-32-bytes-minimum';
const WARDRIVER_METADATA_URL = new URL('../api/_private/downloads/blue-swallow-wardriver.json', import.meta.url);
const WARDRIVER_APK_URL = new URL('../api/_private/downloads/blue-swallow-wardriver-2.109-bss.1-debug.apk', import.meta.url);
const WARDRIVER_METADATA = JSON.parse(readFileSync(WARDRIVER_METADATA_URL, 'utf8'));

function makeContext() {
  return { log: { warn: () => {}, error: () => {} } };
}

async function invoke(artifact, { headers = {}, method = 'GET' } = {}) {
  const context = makeContext();
  await handler(context, {
    method,
    params: { artifact },
    headers,
  });
  return context.res;
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
        if (value === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = value;
        }
      }
    });
}

test('operator downloads reject anonymous requests', async () => {
  await withSigningKey(async () => {
    const response = await invoke('metadata');
    assert.equal(response.status, 403);
    assert.equal(response.body.ok, false);
  });
});

test('operator download metadata is served only with a passcode-issued token cookie', async () => {
  await withSigningKey(async () => {
    const session = createOperatorToken();
    const response = await invoke('metadata', {
      headers: { cookie: `bss_operator_session=${encodeURIComponent(session.token)}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(response.body.ok, true);
    assert.equal(response.body.artifact.downloadPath, '/api/operator-downloads/wardriver/apk');
    assert.equal(response.body.artifact.metadataPath, '/api/operator-downloads/wardriver/metadata');
  });
});

test('operator download metadata matches the packaged APK bytes', () => {
  const apkBytes = readFileSync(WARDRIVER_APK_URL);
  assert.equal(statSync(WARDRIVER_APK_URL).size, WARDRIVER_METADATA.sizeBytes);
  assert.equal(createHash('sha256').update(apkBytes).digest('hex'), WARDRIVER_METADATA.sha256);
});

test('operator APK HEAD returns binary metadata without loading the APK body', async () => {
  await withSigningKey(async () => {
    const session = createOperatorToken();
    const response = await invoke('apk', {
      method: 'HEAD',
      headers: { authorization: `Bearer ${session.token}` },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers['Content-Type'], 'application/vnd.android.package-archive');
    assert.match(response.headers['Content-Disposition'], /^attachment; filename="blue-swallow-wardriver-2\.109-bss\.1-debug\.apk"/);
    assert.equal(response.headers['Content-Length'], String(WARDRIVER_METADATA.sizeBytes));
    assert.equal(response.headers['Cache-Control'], 'private, no-store');
    assert.equal(response.body, undefined);
  });
});
