const crypto = require('node:crypto');

const DEFAULT_TOKEN_TTL_MS = 8 * 60 * 60 * 1000;
const TOKEN_VERSION = 1;
const OPERATOR_SESSION_COOKIE = 'bss_operator_session';

function getConfiguredDigest() {
  const digest = (process.env.BLUE_SWALLOW_PASSCODE_SHA256 || '').trim().toLowerCase();
  if (/^[a-f0-9]{64}$/.test(digest)) {
    return digest;
  }

  const legacyPlaintext = process.env.BLUE_SWALLOW_PASSCODE;
  if (typeof legacyPlaintext === 'string' && legacyPlaintext.length > 0) {
    return crypto.createHash('sha256').update(legacyPlaintext, 'utf8').digest('hex');
  }

  return '';
}

function verifyPasscode(passcode) {
  const configuredDigest = getConfiguredDigest();
  if (!configuredDigest || typeof passcode !== 'string' || !passcode) {
    return false;
  }

  const expected = Buffer.from(configuredDigest, 'hex');
  if (expected.length !== 32) {
    return false;
  }

  const actual = crypto.createHash('sha256').update(passcode, 'utf8').digest();
  return actual.length === expected.length && crypto.timingSafeEqual(actual, expected);
}

function createOperatorToken({ now = Date.now(), ttlMs = getTokenTtlMs(), operatorId = getOperatorId() } = {}) {
  const digest = getConfiguredDigest();
  if (!digest) {
    const error = new Error('Passcode validation is not configured.');
    error.statusCode = 503;
    throw error;
  }

  const signingKey = getOperatorTokenSigningKey();
  if (!signingKey) {
    const error = new Error('Operator token signing is not configured.');
    error.statusCode = 503;
    throw error;
  }

  const issuedAt = Math.floor(now / 1000);
  const expiresAt = Math.floor((now + ttlMs) / 1000);
  const payload = {
    v: TOKEN_VERSION,
    sub: 'operator',
    operatorId: normalizeOperatorId(operatorId),
    iat: issuedAt,
    exp: expiresAt,
    nonce: crypto.randomBytes(12).toString('hex'),
  };
  const encodedPayload = base64UrlEncode(JSON.stringify(payload));
  const signature = signPayload(encodedPayload, signingKey);

  return {
    token: `${encodedPayload}.${signature}`,
    expiresAt: new Date(expiresAt * 1000).toISOString(),
    ttlSeconds: Math.max(0, expiresAt - issuedAt),
  };
}

function requireOperatorToken(context, req) {
  const result = verifyOperatorRequest(req);
  if (result.ok) {
    return result;
  }

  context.res = {
    status: result.status || 403,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: {
      ok: false,
      error: result.error || 'Operator session required.',
    },
  };
  return result;
}

function verifyOperatorRequest(req, { now = Date.now() } = {}) {
  const token = extractBearerToken(req);
  if (!token) {
    return { ok: false, status: 403, error: 'Operator session required.' };
  }

  const signingKey = getOperatorTokenSigningKey();
  if (!signingKey) {
    return { ok: false, status: 503, error: 'Operator token signing is not configured.' };
  }

  const [encodedPayload, signature, extra] = String(token).split('.');
  if (!encodedPayload || !signature || extra !== undefined) {
    return { ok: false, status: 403, error: 'Invalid operator session token.' };
  }

  const expected = signPayload(encodedPayload, signingKey);
  if (!safeEqual(signature, expected)) {
    return { ok: false, status: 403, error: 'Invalid operator session token.' };
  }

  let payload;
  try {
    payload = JSON.parse(base64UrlDecode(encodedPayload));
  } catch {
    return { ok: false, status: 403, error: 'Invalid operator session token.' };
  }

  if (payload?.v !== TOKEN_VERSION || payload.sub !== 'operator') {
    return { ok: false, status: 403, error: 'Invalid operator session token.' };
  }

  if (!Number.isFinite(payload.exp) || payload.exp * 1000 <= now) {
    return { ok: false, status: 403, error: 'Operator session expired.' };
  }

  return { ok: true, token: payload };
}

function extractBearerToken(req) {
  const explicitOperatorToken = toHeader(req, 'x-blue-swallow-operator-token').trim();
  if (explicitOperatorToken) {
    return explicitOperatorToken;
  }

  const authorization = toHeader(req, 'authorization');
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (match) {
    return match[1].trim();
  }

  return extractCookieValue(toHeader(req, 'cookie'), OPERATOR_SESSION_COOKIE);
}

function buildOperatorSessionCookie(session) {
  const token = typeof session?.token === 'string' ? session.token : '';
  const ttlSeconds = Number.isFinite(session?.ttlSeconds) ? Math.max(0, Math.floor(session.ttlSeconds)) : 0;
  if (!token || ttlSeconds <= 0) {
    return buildClearOperatorSessionCookie();
  }

  return [
    `${OPERATOR_SESSION_COOKIE}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${ttlSeconds}`,
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

function buildClearOperatorSessionCookie() {
  return [
    `${OPERATOR_SESSION_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'Secure',
    'SameSite=Strict',
  ].join('; ');
}

function extractCookieValue(cookieHeader, name) {
  if (!cookieHeader || !name) {
    return '';
  }

  for (const part of String(cookieHeader).split(';')) {
    const [rawKey, ...rawValueParts] = part.split('=');
    if (rawKey?.trim() !== name) {
      continue;
    }

    const rawValue = rawValueParts.join('=').trim();
    try {
      return decodeURIComponent(rawValue);
    } catch {
      return rawValue;
    }
  }

  return '';
}

function toHeader(req, name) {
  const headers = req?.headers || {};
  const lowerName = name.toLowerCase();

  if (typeof headers.get === 'function') {
    return headerValueToString(headers.get(name) ?? headers.get(lowerName));
  }

  const direct = headers[name] ?? headers[lowerName] ?? headers[name.toUpperCase()];
  if (direct !== undefined) {
    return headerValueToString(direct);
  }

  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === lowerName) {
      return headerValueToString(value);
    }
  }
  return '';
}

function headerValueToString(value) {
  if (Array.isArray(value)) {
    return headerValueToString(value[0]);
  }
  if (value === null || value === undefined) {
    return '';
  }
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (typeof value.value === 'string') {
    return value.value;
  }
  if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) {
    return value.toString();
  }
  return '';
}

function getTokenTtlMs() {
  const parsed = Number.parseInt(process.env.BLUE_SWALLOW_OPERATOR_TOKEN_TTL_MS || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_TOKEN_TTL_MS;
}

function getOperatorId() {
  return normalizeOperatorId(process.env.BLUE_SWALLOW_OPERATOR_ID || 'operator');
}

function normalizeOperatorId(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || 'operator';
}

function getOperatorTokenSigningKey() {
  const configured = (process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY || '').trim();
  if (!configured) {
    return null;
  }

  if (/^[a-f0-9]{64,}$/i.test(configured) && configured.length % 2 === 0) {
    return Buffer.from(configured, 'hex');
  }

  const raw = Buffer.from(configured, 'utf8');
  return raw.length >= 32 ? raw : null;
}

function signPayload(encodedPayload, signingKey) {
  return crypto.createHmac('sha256', signingKey).update(encodedPayload).digest('base64url');
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  return leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer);
}

function base64UrlEncode(value) {
  return Buffer.from(value, 'utf8').toString('base64url');
}

function base64UrlDecode(value) {
  return Buffer.from(value, 'base64url').toString('utf8');
}

module.exports = {
  buildClearOperatorSessionCookie,
  buildOperatorSessionCookie,
  createOperatorToken,
  getConfiguredDigest,
  getOperatorTokenSigningKey,
  requireOperatorToken,
  verifyOperatorRequest,
  verifyPasscode,
};
