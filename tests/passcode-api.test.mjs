import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const handler = require('../api/validate-passcode/index.js');
const { createOperatorToken, verifyOperatorRequest } = require('../api/_lib/operator-auth.js');

const TEST_SIGNING_KEY = 'test-operator-token-signing-key-32-bytes-minimum';

function makeContext() {
  return { log: { warn: () => {}, error: () => {} } };
}

async function invoke(passcode, { ip = '203.0.113.10' } = {}) {
  const context = makeContext();
  await handler(context, {
    body: { passcode },
    headers: { 'x-forwarded-for': ip },
  });
  return context.res;
}

function withEnv(nextEnv, fn) {
  const previous = {
    BLUE_SWALLOW_PASSCODE: process.env.BLUE_SWALLOW_PASSCODE,
    BLUE_SWALLOW_PASSCODE_SHA256: process.env.BLUE_SWALLOW_PASSCODE_SHA256,
    BLUE_SWALLOW_PASSCODE_MAX_ATTEMPTS: process.env.BLUE_SWALLOW_PASSCODE_MAX_ATTEMPTS,
    BLUE_SWALLOW_PASSCODE_WINDOW_MS: process.env.BLUE_SWALLOW_PASSCODE_WINDOW_MS,
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY,
  };

  for (const key of Object.keys(previous)) {
    delete process.env[key];
  }
  Object.assign(process.env, nextEnv);

  if (handler._resetRateLimitForTests) {
    handler._resetRateLimitForTests();
  }

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
      if (handler._resetRateLimitForTests) {
        handler._resetRateLimitForTests();
      }
    });
}

test('validate-passcode fails closed when no secret hash or env passcode is configured', async () => {
  await withEnv({}, async () => {
    const response = await invoke('blue-swallow');
    assert.equal(response.status, 503);
    assert.equal(response.body.ok, false);
    assert.match(response.body.message, /not configured/i);
  });
});

test('validate-passcode accepts SHA-256 configured passcodes and rejects wrong guesses', async () => {
  const digest = crypto.createHash('sha256').update('s3cr3t passphrase').digest('hex');
  await withEnv({ BLUE_SWALLOW_PASSCODE_SHA256: digest, BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: TEST_SIGNING_KEY }, async () => {
    const accepted = await invoke('s3cr3t passphrase');
    assert.equal(accepted.status, 200);
    assert.equal(accepted.body.ok, true);
    assert.match(accepted.body.operatorSession.token, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
    assert.match(accepted.body.operatorSession.expiresAt, /^\d{4}-\d{2}-\d{2}T/);
    assert.equal(accepted.headers['Cache-Control'], 'no-store');

    const rejected = await invoke('blue-swallow');
    assert.equal(rejected.status, 401);
    assert.equal(rejected.body.ok, false);
  });
});

test('validate-passcode fails closed when token signing secret is missing', async () => {
  const digest = crypto.createHash('sha256').update('signing-required').digest('hex');
  await withEnv({ BLUE_SWALLOW_PASSCODE_SHA256: digest }, async () => {
    const response = await invoke('signing-required');
    assert.equal(response.status, 503);
    assert.equal(response.body.ok, false);
    assert.match(response.body.message, /token signing/i);
  });
});

test('validate-passcode rate limits repeated failures per caller', async () => {
  const digest = crypto.createHash('sha256').update('correct horse').digest('hex');
  await withEnv({
    BLUE_SWALLOW_PASSCODE_SHA256: digest,
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: TEST_SIGNING_KEY,
    BLUE_SWALLOW_PASSCODE_MAX_ATTEMPTS: '2',
    BLUE_SWALLOW_PASSCODE_WINDOW_MS: '60000',
  }, async () => {
    assert.equal((await invoke('wrong', { ip: '198.51.100.23' })).status, 401);
    assert.equal((await invoke('still wrong', { ip: '198.51.100.23' })).status, 401);

    const limited = await invoke('correct horse', { ip: '198.51.100.23' });
    assert.equal(limited.status, 429);
    assert.equal(limited.body.ok, false);
  });
});

test('operator token header takes precedence over SWA platform authorization', async () => {
  const digest = crypto.createHash('sha256').update('tzeentch platform auth').digest('hex');
  await withEnv({ BLUE_SWALLOW_PASSCODE_SHA256: digest, BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: TEST_SIGNING_KEY }, async () => {
    const session = createOperatorToken({ now: Date.UTC(2026, 0, 1), ttlMs: 60_000 });
    const verified = verifyOperatorRequest({
      headers: {
        authorization: 'Bearer platform-injected-token',
        'x-blue-swallow-operator-token': session.token,
      },
    }, { now: Date.UTC(2026, 0, 1) + 1000 });

    assert.equal(verified.ok, true);
    assert.equal(verified.token.sub, 'operator');
  });
});
