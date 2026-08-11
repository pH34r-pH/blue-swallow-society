import { forbidden } from './auth.mjs';

const REQUIRED_MTLS_PROVENANCE_FIELDS = Object.freeze(['credential_source', 'environment']);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

export function mtlsCredentialIsExpired(value, evaluatedAt) {
  if (value == null) return false;
  const expiresAt = new Date(value).getTime();
  const referenceTime = new Date(evaluatedAt).getTime();
  return !Number.isFinite(expiresAt) || !Number.isFinite(referenceTime) || expiresAt <= referenceTime;
}

export function matchesCredentialSourceProvenance(record) {
  const credentialSource = jsonTextField(record.credential_metadata, 'credential_source');
  const sourceCredentialSource = jsonTextField(record.source_provenance, 'credential_source');
  const environment = jsonTextField(record.credential_metadata, 'environment');
  const sourceEnvironment = jsonTextField(record.source_provenance, 'environment');
  return credentialSource !== null && credentialSource === sourceCredentialSource
    && environment !== null && environment === sourceEnvironment;
}

export function normalizeMtlsCredentialPolicy(value) {
  if (value == null) return null;
  if (!isPlainObject(value)) throw new TypeError('mtlsCredentialPolicy must be an object.');
  const sourceProvenance = normalizeMtlsPolicyRecord(value.sourceProvenance, 'sourceProvenance');
  const credentialMetadata = normalizeMtlsPolicyRecord(value.credentialMetadata, 'credentialMetadata');
  if (Object.hasOwn(credentialMetadata, 'mtls_certificate_fingerprint')) {
    throw new TypeError('mtlsCredentialPolicy credentialMetadata must not configure the dynamic certificate fingerprint.');
  }
  for (const field of REQUIRED_MTLS_PROVENANCE_FIELDS) {
    if (sourceProvenance[field] !== credentialMetadata[field]) {
      throw new TypeError(`mtlsCredentialPolicy ${field} must agree between sourceProvenance and credentialMetadata.`);
    }
  }
  return Object.freeze({
    deviceId: requireMtlsPolicyString(value.deviceId, 'deviceId'),
    sourceKey: requireMtlsPolicyString(value.sourceKey, 'sourceKey'),
    sourceClass: requireMtlsPolicyString(value.sourceClass, 'sourceClass'),
    sourceProvenance,
    credentialMetadata,
    scopes: normalizeMtlsPolicyScopes(value.scopes),
  });
}

export function bindMtlsCredentialPolicy(policy, certificateFingerprint) {
  if (typeof certificateFingerprint !== 'string') throw forbidden();
  const fingerprint = certificateFingerprint.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/u.test(fingerprint)) throw forbidden();
  return Object.freeze({
    ...policy,
    credentialMetadata: Object.freeze({
      ...policy.credentialMetadata,
      mtls_certificate_fingerprint: fingerprint,
    }),
  });
}

export function matchesMtlsCredentialPolicy(record, policy) {
  return record.device_id === policy.deviceId
    && record.source_key === policy.sourceKey
    && record.source_class === policy.sourceClass
    && exactJsonRecord(record.source_provenance, policy.sourceProvenance)
    && exactJsonRecord(record.credential_metadata, policy.credentialMetadata)
    && exactStringSet(record.scopes, policy.scopes);
}

function jsonTextField(value, key) {
  if (!isPlainObject(value) || !Object.hasOwn(value, key) || value[key] === null) return null;
  const field = value[key];
  return typeof field === 'string' && field.length > 0 ? field : null;
}

function normalizeMtlsPolicyRecord(value, name) {
  if (!isPlainObject(value)) throw new TypeError(`mtlsCredentialPolicy ${name} must be an object.`);
  const normalized = Object.fromEntries(Object.entries(value).map(([field, fieldValue]) => [
    field,
    requireMtlsPolicyString(fieldValue, `${name}.${field}`),
  ]));
  for (const field of REQUIRED_MTLS_PROVENANCE_FIELDS) {
    if (!Object.hasOwn(normalized, field)) {
      throw new TypeError(`mtlsCredentialPolicy ${name}.${field} is required.`);
    }
  }
  return Object.freeze(normalized);
}

function requireMtlsPolicyString(value, name) {
  if (typeof value !== 'string') throw new TypeError(`mtlsCredentialPolicy ${name} must be a string.`);
  const normalized = value.trim();
  if (!normalized || normalized.length > 200) throw new TypeError(`mtlsCredentialPolicy ${name} is invalid.`);
  return normalized;
}

function normalizeMtlsPolicyScopes(value) {
  if (!Array.isArray(value) || value.length === 0) throw new TypeError('mtlsCredentialPolicy scopes are invalid.');
  const scopes = value.map((scope) => requireMtlsPolicyString(scope, 'scope'));
  if (new Set(scopes).size !== scopes.length) throw new TypeError('mtlsCredentialPolicy scopes must be unique.');
  return Object.freeze(scopes.sort());
}

function exactStringSet(actual, expected) {
  if (!Array.isArray(actual) || actual.some((value) => typeof value !== 'string')) return false;
  if (new Set(actual).size !== actual.length) return false;
  const sorted = [...actual].sort();
  return sorted.length === expected.length && sorted.every((value, index) => value === expected[index]);
}

function exactJsonRecord(actual, expected) {
  return isPlainObject(actual) && JSON.stringify(canonicalizeJson(actual)) === JSON.stringify(canonicalizeJson(expected));
}

function canonicalizeJson(value) {
  if (Array.isArray(value)) return value.map(canonicalizeJson);
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalizeJson(value[key])]));
  }
  return value;
}
