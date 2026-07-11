import { createHash, timingSafeEqual } from 'node:crypto';
import {
  CLIENT_TYPES,
  SOURCE_CLASSES,
  normalizeClientType,
  normalizeScopes,
  normalizeSourceClasses,
  normalizeSourceIds,
} from './source-registry.mjs';

const SHA256_TOKEN_HASH = /^sha256:[0-9a-f]{64}$/;

function uniqueStrings(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .flatMap((value) => (typeof value === 'string' && value.includes(',') ? value.split(',') : [value]))
    .map((value) => String(value ?? '').trim())
    .filter(Boolean))];
}

function constantTimeStringEquals(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function normalizeTokenHash(value) {
  const tokenHash = String(value || '').trim().toLowerCase();
  if (!SHA256_TOKEN_HASH.test(tokenHash)) {
    throw new Error('Cybermap token registry entries must use sha256:<64 hex chars> tokenHash values');
  }
  return tokenHash;
}

function normalizeOptionalIso(fieldName, value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Cybermap token registry ${fieldName} must be a valid ISO timestamp`);
  }
  return date.toISOString();
}

function requiredRecordValue(record, keys, label) {
  for (const key of keys) {
    if (record[key] !== undefined && record[key] !== null && String(record[key]).trim() !== '') {
      return record[key];
    }
  }
  throw new Error(`Cybermap token registry entries must include ${label}`);
}

export function hashToken(token) {
  return `sha256:${createHash('sha256').update(String(token), 'utf8').digest('hex')}`;
}

export function extractBearerToken(req) {
  const rawAuthorization = req?.headers?.authorization || '';
  const authorization = Array.isArray(rawAuthorization) ? rawAuthorization[0] : rawAuthorization;
  const bearer = String(authorization || '').match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  const headerToken = req?.headers?.['x-cybermap-token'] || req?.headers?.['x-blue-swallow-operator-token'];
  const fallback = Array.isArray(headerToken) ? headerToken[0] : headerToken;
  return bearer || String(fallback || '').trim();
}

export function createTokenRegistry(records = []) {
  const seenTokenHashes = new Set();
  const seenTokenIds = new Set();
  const normalized = records.map((record, index) => {
    if (record.token) {
      throw new Error('Cybermap token registry entries must include tokenHash, not plaintext token values');
    }
    const tokenHash = normalizeTokenHash(requiredRecordValue(record, ['tokenHash', 'token_hash'], 'tokenHash'));
    const clientType = normalizeClientType(requiredRecordValue(record, ['clientType', 'client_type'], 'client type'));
    const scopes = normalizeScopes(requiredRecordValue(record, ['scopes'], 'scopes'));
    const sourceClasses = normalizeSourceClasses(
      record.sourceClasses || record.source_classes || (clientType === 'operator_admin' ? SOURCE_CLASSES : []),
    );
    const tokenId = String(record.tokenId || record.token_id || record.id || `token-${index + 1}`).trim();
    if (seenTokenHashes.has(tokenHash)) {
      throw new Error(`duplicate Cybermap tokenHash entry for tokenId ${tokenId}`);
    }
    if (seenTokenIds.has(tokenId)) {
      throw new Error(`duplicate Cybermap tokenId entry: ${tokenId}`);
    }
    seenTokenHashes.add(tokenHash);
    seenTokenIds.add(tokenId);
    return Object.freeze({
      tokenId,
      tokenHash,
      clientType,
      subject: record.subject || record.subjectRef || record.subject_ref || null,
      scopes: Object.freeze(scopes),
      sourceIds: Object.freeze(normalizeSourceIds(record.sourceIds || record.source_ids || [])),
      sourceClasses: Object.freeze(sourceClasses),
      createdAt: normalizeOptionalIso('createdAt', record.createdAt || record.created_at),
      expiresAt: normalizeOptionalIso('expiresAt', record.expiresAt || record.expires_at),
      revokedAt: normalizeOptionalIso('revokedAt', record.revokedAt || record.revoked_at),
      disabled: record.disabled === true || record.active === false || String(record.status || '').toLowerCase() === 'revoked',
    });
  });

  return Object.freeze({
    version: 1,
    records: Object.freeze(normalized),
  });
}

function legacyPlaintextRecordsFromEnv(env = process.env) {
  const tokens = [env.CYBERMAP_API_TOKEN, env.CYBERMAP_API_TOKENS, env.BLUE_SWALLOW_OPERATOR_TOKEN]
    .filter(Boolean)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean);

  return tokens.map((token, index) => ({
    tokenHash: hashToken(token),
    tokenId: index === 0 ? 'legacy-operator' : `legacy-operator-${index + 1}`,
    clientType: 'operator_admin',
    scopes: ['*'],
    sourceClasses: SOURCE_CLASSES,
  }));
}

export function loadTokenRecordsFromEnv(env = process.env) {
  if (env.CYBERMAP_AUTH_REGISTRY_JSON) {
    const parsed = JSON.parse(env.CYBERMAP_AUTH_REGISTRY_JSON);
    if (!Array.isArray(parsed)) {
      throw new Error('CYBERMAP_AUTH_REGISTRY_JSON must be a JSON array');
    }
    return parsed;
  }

  if (env.CYBERMAP_AUTH_TOKEN_HASHES) {
    return uniqueStrings(env.CYBERMAP_AUTH_TOKEN_HASHES).map((tokenHash, index) => ({
      tokenHash,
      tokenId: `env-token-${index + 1}`,
      clientType: env.CYBERMAP_AUTH_DEFAULT_CLIENT_TYPE || 'operator_admin',
      scopes: uniqueStrings(env.CYBERMAP_AUTH_DEFAULT_SCOPES || '*'),
      sourceClasses: uniqueStrings(env.CYBERMAP_AUTH_DEFAULT_SOURCE_CLASSES || SOURCE_CLASSES.join(',')),
      sourceIds: uniqueStrings(env.CYBERMAP_AUTH_DEFAULT_SOURCE_IDS || ''),
    }));
  }

  // Compatibility shim: old deployments may still inject plaintext env tokens.
  // They are immediately hashed into the in-memory registry and are never logged,
  // returned, or documented as the preferred configuration path.
  return legacyPlaintextRecordsFromEnv(env);
}

export function createTokenRegistryFromEnv(env = process.env) {
  return createTokenRegistry(loadTokenRecordsFromEnv(env));
}

function isRecordActive(record, now = new Date()) {
  if (record.disabled || record.revokedAt) return false;
  if (record.expiresAt && new Date(record.expiresAt).getTime() <= now.getTime()) return false;
  return true;
}

export function authenticateToken(token, registry, now = new Date()) {
  const records = registry?.records || [];
  if (!records.length) {
    return {
      ok: false,
      statusCode: 503,
      code: 'auth_not_configured',
      message: 'Cybermap API auth registry is not configured.',
    };
  }
  if (!token) {
    return {
      ok: false,
      statusCode: 401,
      code: 'auth_required',
      message: 'Bearer token required for /api/v1 endpoints.',
    };
  }

  const candidateHash = hashToken(token);
  const record = records.find((entry) => constantTimeStringEquals(entry.tokenHash, candidateHash));
  if (!record || !isRecordActive(record, now)) {
    return {
      ok: false,
      statusCode: 403,
      code: 'auth_forbidden',
      message: 'Bearer token was not accepted.',
    };
  }

  return {
    ok: true,
    identity: Object.freeze({
      tokenId: record.tokenId,
      clientType: record.clientType,
      subject: record.subject,
      scopes: [...record.scopes],
      sourceIds: [...record.sourceIds],
      sourceClasses: [...record.sourceClasses],
    }),
  };
}

export function authenticateApiRequest(req, registry, now = new Date()) {
  return authenticateToken(extractBearerToken(req), registry, now);
}

export const authDefaults = Object.freeze({
  CLIENT_TYPES,
  SOURCE_CLASSES,
  SHA256_TOKEN_HASH: SHA256_TOKEN_HASH.source,
});
