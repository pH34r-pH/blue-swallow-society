import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createOperatorToken, verifyOperatorRequest } = require('../api/_lib/operator-auth.js');

function restore(name, value) {
  if (value === undefined) delete process.env[name]; else process.env[name] = value;
}

test('operator token version provides global emergency revocation without browser persistence', () => {
  const previous = {
    digest: process.env.BLUE_SWALLOW_PASSCODE_SHA256,
    signing: process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY,
    version: process.env.BLUE_SWALLOW_OPERATOR_TOKEN_VERSION,
  };
  try {
    process.env.BLUE_SWALLOW_PASSCODE_SHA256 = '0'.repeat(64);
    process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = 'operator-token-version-test-key-32bytes';
    process.env.BLUE_SWALLOW_OPERATOR_TOKEN_VERSION = '7';
    const { token } = createOperatorToken({ ttlMs: 60_000 });
    assert.equal(verifyOperatorRequest({ headers: { 'x-blue-swallow-operator-token': token } }).ok, true);

    process.env.BLUE_SWALLOW_OPERATOR_TOKEN_VERSION = '8';
    const revoked = verifyOperatorRequest({ headers: { 'x-blue-swallow-operator-token': token } });
    assert.equal(revoked.ok, false);
    assert.match(revoked.error, /Invalid operator session token/);
  } finally {
    restore('BLUE_SWALLOW_PASSCODE_SHA256', previous.digest);
    restore('BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY', previous.signing);
    restore('BLUE_SWALLOW_OPERATOR_TOKEN_VERSION', previous.version);
  }
});
