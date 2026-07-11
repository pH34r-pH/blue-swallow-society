import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../api/operator-shell/index.js');
const { createOperatorToken } = require('../api/_lib/operator-auth');

const TEST_SIGNING_KEY = 'c'.repeat(64);
const TEST_DIGEST = 'd'.repeat(64);

async function withAuthEnv(fn) {
  const previous = {
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY,
    BLUE_SWALLOW_PASSCODE_SHA256: process.env.BLUE_SWALLOW_PASSCODE_SHA256,
  };
  process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = TEST_SIGNING_KEY;
  process.env.BLUE_SWALLOW_PASSCODE_SHA256 = TEST_DIGEST;
  try {
    return await fn();
  } finally {
    if (previous.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY === undefined) {
      delete process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY;
    } else {
      process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = previous.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY;
    }
    if (previous.BLUE_SWALLOW_PASSCODE_SHA256 === undefined) {
      delete process.env.BLUE_SWALLOW_PASSCODE_SHA256;
    } else {
      process.env.BLUE_SWALLOW_PASSCODE_SHA256 = previous.BLUE_SWALLOW_PASSCODE_SHA256;
    }
  }
}

async function invoke(headers = {}) {
  const context = { res: null };
  await handler(context, { headers });
  return context.res;
}

test('operator shell rejects anonymous requests', async () => {
  await withAuthEnv(async () => {
    const response = await invoke();
    assert.equal(response.status, 403);
  });
});

test('operator shell serves private operator markup only with custom operator token header', async () => {
  await withAuthEnv(async () => {
    const session = createOperatorToken({ ttlMs: 60_000 });
    const response = await invoke({ 'x-blue-swallow-operator-token': session.token });
    assert.equal(response.status, 200);
    assert.equal(response.headers['Content-Type'], 'text/html; charset=utf-8');
    assert.match(response.body, /id="mainInterface"/);
    assert.match(response.body, /data-operator-download="apk"/);
  });
});
