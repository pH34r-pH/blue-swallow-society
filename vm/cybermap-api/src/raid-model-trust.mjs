import { verifyModelReleaseSignature } from './raid-model-contract.mjs';

const KEY_ID_RE = /^[a-z][a-z0-9-]{2,119}$/;
const MAX_TRUSTED_KEYS = 16;
const MAX_PEM_BYTES = 8 * 1024;
const MAX_TRUST_CONFIGURATION_BYTES = 256 * 1024;

/** Resolves direct development input or a shell-safe systemd EnvironmentFile value, never both. */
export function resolveRaIDTrustedPublicKeysJson({ encoded, plain } = {}) {
  if (encoded !== undefined && encoded !== '' && plain !== undefined && plain !== '') {
    throw new TypeError('RaID trusted public-key configuration is ambiguous.');
  }
  if (encoded === undefined || encoded === '') return plain ?? '';
  if (typeof encoded !== 'string' || encoded.length > MAX_TRUST_CONFIGURATION_BYTES * 2
      || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new TypeError('RaID trusted public-key configuration encoding is invalid.');
  }
  const decoded = Buffer.from(encoded, 'base64');
  if (decoded.length === 0 || decoded.length > MAX_TRUST_CONFIGURATION_BYTES
      || decoded.toString('base64') !== encoded) {
    throw new TypeError('RaID trusted public-key configuration encoding is invalid.');
  }
  return decoded.toString('utf8');
}

export function parseRaIDTrustedPublicKeys(value) {
  if (value === undefined || value === null || value === '') return Object.freeze({});
  let parsed;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new TypeError('BSS_RAID_MODEL_TRUSTED_PUBLIC_KEYS_JSON must be valid JSON.');
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new TypeError('BSS_RAID_MODEL_TRUSTED_PUBLIC_KEYS_JSON must contain a JSON object.');
  }
  const entries = Object.entries(parsed);
  if (entries.length === 0 || entries.length > MAX_TRUSTED_KEYS) {
    throw new TypeError('RaID trusted public-key configuration has an invalid key count.');
  }
  for (const [keyId, pem] of entries) {
    if (!KEY_ID_RE.test(keyId)) throw new TypeError('RaID trusted public-key configuration has an invalid key ID.');
    if (typeof pem !== 'string' || pem.length === 0 || Buffer.byteLength(pem, 'utf8') > MAX_PEM_BYTES
        || !pem.includes('-----BEGIN PUBLIC KEY-----') || !pem.includes('-----END PUBLIC KEY-----')) {
      throw new TypeError('RaID trusted public-key configuration contains an invalid PEM.');
    }
  }
  return Object.freeze(Object.fromEntries(entries));
}

export function createRaIDReleaseTrustVerifier(value) {
  const trustedPublicKeys = parseRaIDTrustedPublicKeys(value);
  return Object.freeze({
    configured: Object.keys(trustedPublicKeys).length > 0,
    verify(release) {
      return verifyModelReleaseSignature(release, trustedPublicKeys);
    },
  });
}
