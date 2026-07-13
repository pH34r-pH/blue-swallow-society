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

async function invoke(headers = {}, query = {}) {
  const context = { res: null };
  await handler(context, { headers, query });
  return context.res;
}

test('operator shell rejects anonymous requests', async () => {
  await withAuthEnv(async () => {
    const response = await invoke();
    assert.equal(response.status, 403);
  });
});

test('operator shell serves composed private identity only with custom operator token header', async () => {
  await withAuthEnv(async () => {
    const session = createOperatorToken({ ttlMs: 60_000 });
    const headers = { 'x-blue-swallow-operator-token': session.token };
    const response = await invoke(headers);
    assert.equal(response.status, 200);
    assert.equal(response.headers['Content-Type'], 'text/html; charset=utf-8');
    assert.match(response.body, /id="nacre-moire-operator-style"/);
    assert.match(response.body, /<title[^>]*>Nacre-Moiré interference mark<\/title>/);
    assert.match(response.body, /id="mainInterface"/);
    assert.match(response.body, /<h1 class="console-heading">Nacre-Moiré<\/h1>/);
    assert.match(response.body, /data-operator-download="apk"/);
    assert.doesNotMatch(response.body, /\{\{NACRE_MOIRE_MARK\}\}/);
  });
});

test('operator shell serves the protected Interface Lab view without exposing the main console', async () => {
  await withAuthEnv(async () => {
    const session = createOperatorToken({ ttlMs: 60_000 });
    const headers = { 'x-blue-swallow-operator-token': session.token };
    const response = await invoke(headers, { view: 'agent' });
    assert.equal(response.status, 200);
    assert.match(response.body, /Nacre-Moiré Interface Lab/);
    assert.match(response.body, /They are the operator-side persona/);
    assert.match(response.body, /id="nacre-moire-operator-style"/);
    assert.match(response.body, /<svg/);
    assert.doesNotMatch(response.body, /id="mainInterface"/);
  });
});

test('operator shell rejects unknown private view selectors after authentication', async () => {
  await withAuthEnv(async () => {
    const session = createOperatorToken({ ttlMs: 60_000 });
    const response = await invoke({ 'x-blue-swallow-operator-token': session.token }, { view: 'unknown' });
    assert.equal(response.status, 400);
    assert.equal(response.body.error, 'Unsupported private operator view.');
  });
});
