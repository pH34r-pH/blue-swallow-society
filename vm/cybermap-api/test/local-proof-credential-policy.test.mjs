import assert from 'node:assert/strict';
import test from 'node:test';

import {
  DESKTOP_DEVICE_ID,
  DESKTOP_SOURCE_KEY,
  DESKTOP_SOURCE_POLICY,
  REQUIRED_DESKTOP_SCOPES,
  assertDesktopCredentialPolicy,
  assertDesktopSourcePolicy,
} from '../local-proof/desktop-credential-policy.mjs';

const FINGERPRINT = 'a'.repeat(64);

function exactSource() {
  return structuredClone(DESKTOP_SOURCE_POLICY);
}

function exactCredential() {
  return {
    device_id: DESKTOP_DEVICE_ID,
    source_key: DESKTOP_SOURCE_KEY,
    enabled: true,
    expires_at: null,
    scopes: [...REQUIRED_DESKTOP_SCOPES],
    metadata: {
      credential_source: 'desktop',
      environment: 'local-proof',
      mtls_certificate_fingerprint: FINGERPRINT,
    },
  };
}

test('desktop local-proof seed accepts only the exact source and credential policy', () => {
  assert.doesNotThrow(() => assertDesktopSourcePolicy(exactSource()));
  assert.doesNotThrow(() => assertDesktopCredentialPolicy(exactCredential(), FINGERPRINT));

  assert.throws(() => assertDesktopSourcePolicy({ ...exactSource(), source_class: 'green_owned' }));
  assert.throws(() => assertDesktopSourcePolicy({
    ...exactSource(),
    provenance: { credential_source: 'desktop', environment: 'different' },
  }));

  assert.throws(() => assertDesktopCredentialPolicy({ ...exactCredential(), enabled: false }, FINGERPRINT));
  assert.throws(() => assertDesktopCredentialPolicy({ ...exactCredential(), expires_at: '2027-01-01T00:00:00.000Z' }, FINGERPRINT));
  assert.throws(() => assertDesktopCredentialPolicy({
    ...exactCredential(),
    scopes: [...REQUIRED_DESKTOP_SCOPES, 'admin:write'],
  }, FINGERPRINT));
  assert.throws(() => assertDesktopCredentialPolicy({
    ...exactCredential(),
    metadata: { credential_source: 'desktop', environment: 'azure', mtls_certificate_fingerprint: FINGERPRINT },
  }, FINGERPRINT));
  assert.throws(() => assertDesktopCredentialPolicy(exactCredential(), 'b'.repeat(64)));
});
