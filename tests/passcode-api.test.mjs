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

function createTestRateLimiter() {
  const failures = new Map();
  return {
    async check(callerKey, { maxAttempts, now = Date.now() }) {
      const state = failures.get(callerKey);
      if (!state || state.expiresAtMs <= now || state.attempts < maxAttempts) {
        return { limited: false, retryAfterSeconds: 0 };
      }
      return { limited: true, retryAfterSeconds: Math.max(1, Math.ceil((state.expiresAtMs - now) / 1000)) };
    },
    async recordFailure(callerKey, { windowMs, now = Date.now() }) {
      const previous = failures.get(callerKey);
      const state = previous && previous.expiresAtMs > now
        ? previous
        : { attempts: 0, expiresAtMs: now + windowMs, etag: 0 };
      state.attempts += 1;
      state.etag += 1;
      failures.set(callerKey, state);
    },
    async reserveAttempt(callerKey, { maxAttempts, windowMs, now = Date.now() }) {
      const previous = failures.get(callerKey);
      const state = previous && previous.expiresAtMs > now
        ? previous
        : { attempts: 0, expiresAtMs: now + windowMs, etag: 0 };
      if (state.attempts >= maxAttempts) {
        return {
          limited: true,
          retryAfterSeconds: Math.max(1, Math.ceil((state.expiresAtMs - now) / 1000)),
        };
      }
      state.attempts += 1;
      state.etag += 1;
      failures.set(callerKey, state);
      return {
        limited: false,
        retryAfterSeconds: 0,
        reservation: { etag: String(state.etag) },
      };
    },
    async reset(callerKey) {
      failures.delete(callerKey);
    },
  };
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
  handler._setRateLimiterForTests?.(createTestRateLimiter());

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

test('validate-passcode fails closed when no SHA-256 passcode digest is configured', async () => {
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
    assert.equal(accepted.headers['Set-Cookie'], undefined);

    const verifiedHeader = verifyOperatorRequest({
      headers: {
        'x-blue-swallow-operator-token': accepted.body.operatorSession.token,
      },
    });
    assert.equal(verifiedHeader.ok, true);
    assert.equal(verifiedHeader.token.sub, 'operator');

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
    assert.match(limited.headers['Retry-After'], /^\d+$/);
  });
});

test('successful passcode authentication clears its current reservation', async () => {
  const digest = crypto.createHash('sha256').update('clear-current-reservation').digest('hex');
  await withEnv({
    BLUE_SWALLOW_PASSCODE_SHA256: digest,
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: TEST_SIGNING_KEY,
    BLUE_SWALLOW_PASSCODE_MAX_ATTEMPTS: '2',
    BLUE_SWALLOW_PASSCODE_WINDOW_MS: '60000',
  }, async () => {
    assert.equal((await invoke('wrong', { ip: '198.51.100.44' })).status, 401);
    assert.equal((await invoke('clear-current-reservation', { ip: '198.51.100.44' })).status, 200);
    assert.equal((await invoke('wrong again', { ip: '198.51.100.44' })).status, 401);
  });
});

test('validate-passcode reserves before verifying a concurrent burst', async () => {
  const digest = crypto.createHash('sha256').update('burst-safe passcode').digest('hex');
  await withEnv({
    BLUE_SWALLOW_PASSCODE_SHA256: digest,
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: TEST_SIGNING_KEY,
    BLUE_SWALLOW_PASSCODE_MAX_ATTEMPTS: '5',
    BLUE_SWALLOW_PASSCODE_WINDOW_MS: '60000',
  }, async () => {
    const responses = await Promise.all(Array.from({ length: 12 }, () => invoke('wrong', { ip: '198.51.100.91' })));
    assert.equal(responses.filter((response) => response.status === 401).length, 5);
    assert.equal(responses.filter((response) => response.status === 429).length, 7);
    assert.ok(responses.filter((response) => response.status === 429).every((response) => /^\d+$/.test(response.headers['Retry-After'])));
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

test('validate-passcode fails closed when only a legacy plaintext passcode is configured', async () => {
  await withEnv({
    BLUE_SWALLOW_PASSCODE: 'legacy-only-passcode',
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: TEST_SIGNING_KEY,
  }, async () => {
    const response = await invoke('legacy-only-passcode');
    assert.equal(response.status, 503);
    assert.equal(response.body.ok, false);
    assert.match(response.body.message, /not configured/i);
  });
});

test('validate-passcode fails closed when a malformed digest is accompanied by a legacy plaintext passcode', async () => {
  await withEnv({
    BLUE_SWALLOW_PASSCODE_SHA256: 'not-a-sha256-digest',
    BLUE_SWALLOW_PASSCODE: 'legacy-with-malformed-digest',
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: TEST_SIGNING_KEY,
  }, async () => {
    const response = await invoke('legacy-with-malformed-digest');
    assert.equal(response.status, 503);
    assert.equal(response.body.ok, false);
    assert.match(response.body.message, /not configured/i);
  });
});

test('validate-passcode keeps a valid digest authoritative when a legacy plaintext setting is also present', async () => {
  const canonicalPasscode = 'canonical-digest-passcode';
  await withEnv({
    BLUE_SWALLOW_PASSCODE_SHA256: crypto.createHash('sha256').update(canonicalPasscode).digest('hex'),
    BLUE_SWALLOW_PASSCODE: 'legacy-shadow-passcode',
    BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: TEST_SIGNING_KEY,
  }, async () => {
    assert.equal((await invoke('legacy-shadow-passcode')).status, 401);
    assert.equal((await invoke(canonicalPasscode)).status, 200);
  });
});
