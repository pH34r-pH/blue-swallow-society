export const DESKTOP_DEVICE_ID = 'wardriver-desktop-dev-2026';
export const DESKTOP_SOURCE_KEY = 'wardriver-desktop-dev-2026';
export const REQUIRED_DESKTOP_SCOPES = Object.freeze(['observations:write', 'cybermap:read']);

export const DESKTOP_SOURCE_POLICY = Object.freeze({
  source_class: 'owned_device',
  source_key: DESKTOP_SOURCE_KEY,
  name: 'Wardriver desktop development',
  provider: 'Blue Swallow Society',
  terms_url: 'https://example.invalid/blue-swallow/wardriver-desktop-dev/terms',
  authorized_scope_ref: 'owned:wardriver-desktop-development',
  allowed_preload: false,
  retains_raw_payload: false,
  cache_ttl_seconds: 300,
  enabled: true,
  attribution: 'Owned local development source.',
  terms_reviewed: true,
  provenance: Object.freeze({ credential_source: 'desktop', environment: 'local-proof' }),
});

export function assertDesktopSourcePolicy(row) {
  assertExactObject(row, DESKTOP_SOURCE_POLICY, 'Local proof source policy differs from the required desktop policy');
}

export function assertDesktopCredentialPolicy(row, certificateFingerprint) {
  requirePlainObject(row, 'Local proof credential is not a record');
  require(row.device_id === DESKTOP_DEVICE_ID, 'Local proof credential device identity differs');
  require(row.source_key === DESKTOP_SOURCE_KEY, 'Local proof credential source identity differs');
  require(row.enabled === true, 'Local proof credential must be enabled');
  require(row.expires_at === null, 'Local proof credential must not have an expiry');
  assertExactScopeSet(row.scopes);
  assertExactObject(row.metadata, {
    credential_source: 'desktop',
    environment: 'local-proof',
    mtls_certificate_fingerprint: normalizeFingerprint(certificateFingerprint),
  }, 'Local proof credential provenance differs');
}

export function desktopCredentialMetadata(certificateFingerprint) {
  return Object.freeze({
    credential_source: 'desktop',
    environment: 'local-proof',
    mtls_certificate_fingerprint: normalizeFingerprint(certificateFingerprint),
  });
}

function assertExactScopeSet(scopes) {
  require(Array.isArray(scopes), 'Local proof credential scopes are invalid');
  const actual = [...scopes].sort();
  const expected = [...REQUIRED_DESKTOP_SCOPES].sort();
  require(actual.length === expected.length && actual.every((scope, index) => scope === expected[index]),
    'Local proof credential scopes differ from the required desktop scopes');
}

function assertExactObject(actual, expected, message) {
  requirePlainObject(actual, message);
  requirePlainObject(expected, message);
  const actualKeys = Object.keys(actual).sort();
  const expectedKeys = Object.keys(expected).sort();
  require(actualKeys.length === expectedKeys.length && actualKeys.every((key, index) => key === expectedKeys[index]), message);
  for (const key of expectedKeys) {
    const expectedValue = expected[key];
    const actualValue = actual[key];
    if (isPlainObject(expectedValue)) {
      assertExactObject(actualValue, expectedValue, message);
    } else {
      require(actualValue === expectedValue, message);
    }
  }
}

function normalizeFingerprint(value) {
  require(typeof value === 'string' && /^[a-f0-9]{64}$/iu.test(value),
    'Local proof certificate fingerprint is invalid');
  return value.toLowerCase();
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    && Object.getPrototypeOf(value) === Object.prototype;
}

function requirePlainObject(value, message) {
  require(isPlainObject(value), message);
}

function require(value, message) {
  if (!value) throw new Error(message);
}
