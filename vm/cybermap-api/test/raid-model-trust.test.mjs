import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { modelReleaseSignaturePayload } from '../src/raid-model-contract.mjs';
import { createRaIDReleaseTrustVerifier, parseRaIDTrustedPublicKeys, resolveRaIDTrustedPublicKeysJson } from '../src/raid-model-trust.mjs';
import { release } from './raid-model-fixtures.mjs';

test('RaID release trust configuration fails closed when absent and verifies only named P-256 keys', () => {
  const absent = createRaIDReleaseTrustVerifier('');
  assert.equal(absent.configured, false);
  assert.equal(absent.verify(release()), false);

  const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
  const candidate = release();
  candidate.manifest.signature.value = crypto.sign(
    'sha256', Buffer.from(modelReleaseSignaturePayload(candidate), 'utf8'), privateKey,
  ).toString('base64');
  const json = JSON.stringify({ [candidate.manifest.signature.key_id]: publicKey.export({ type: 'spki', format: 'pem' }) });
  const configured = createRaIDReleaseTrustVerifier(json);
  assert.equal(configured.configured, true);
  assert.equal(configured.verify(candidate), true);
});

test('RaID trust JSON permits a bounded canonical base64 EnvironmentFile value without shell quoting', () => {
  const json = JSON.stringify({ 'raid-key-2026': '-----BEGIN PUBLIC KEY-----\' ; noop #\n-----END PUBLIC KEY-----' });
  const encoded = Buffer.from(json, 'utf8').toString('base64');
  assert.match(encoded, /^[A-Za-z0-9+/=]+$/);
  assert.equal(resolveRaIDTrustedPublicKeysJson({ encoded }), json);
  assert.throws(() => resolveRaIDTrustedPublicKeysJson({ encoded: 'not base64!' }), /encoding/i);
  assert.throws(() => resolveRaIDTrustedPublicKeysJson({ encoded, plain: json }), /ambiguous/i);
});

test('RaID release trust configuration rejects malformed, oversized, and unexpected key entries', () => {
  assert.throws(() => parseRaIDTrustedPublicKeys('{'), /valid JSON/i);
  assert.throws(() => parseRaIDTrustedPublicKeys(JSON.stringify({ nope: 3 })), /valid PEM/i);
  assert.throws(() => parseRaIDTrustedPublicKeys(JSON.stringify({ ['A'.repeat(121)]: 'pem' })), /key ID/i);
});
