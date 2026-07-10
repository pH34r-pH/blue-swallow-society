const {
  createOperatorToken,
  getConfiguredDigest,
  verifyPasscode,
} = require('../_lib/operator-auth');

const DEFAULT_MAX_ATTEMPTS = 5;
const DEFAULT_WINDOW_MS = 5 * 60 * 1000;
const failuresByCaller = new Map();

module.exports = async function (context, req) {
  const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';
  const callerKey = getCallerKey(req);
  const maxAttempts = getPositiveInt(process.env.BLUE_SWALLOW_PASSCODE_MAX_ATTEMPTS, DEFAULT_MAX_ATTEMPTS);
  const windowMs = getPositiveInt(process.env.BLUE_SWALLOW_PASSCODE_WINDOW_MS, DEFAULT_WINDOW_MS);

  if (!getConfiguredDigest()) {
    context.log?.error?.('Passcode validation is not configured. Set BLUE_SWALLOW_PASSCODE_SHA256.');
    context.res = jsonResponse(503, {
      ok: false,
      message: 'Passcode validation is not configured.',
    });
    return;
  }

  pruneFailures(windowMs);
  if (isRateLimited(callerKey, maxAttempts, windowMs)) {
    context.res = jsonResponse(429, {
      ok: false,
      message: 'Too many failed attempts.',
    });
    return;
  }

  const ok = verifyPasscode(passcode);
  if (ok) {
    failuresByCaller.delete(callerKey);
    const session = createOperatorToken();
    context.res = jsonResponse(200, {
      ok: true,
      operatorSession: session,
    });
    return;
  }

  recordFailure(callerKey);
  context.res = jsonResponse(401, {
    ok: false,
    message: 'Invalid passcode.',
  });
};

function jsonResponse(status, body) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body,
  };
}

function getCallerKey(req) {
  const forwardedFor = toHeader(req, 'x-forwarded-for');
  const clientIp = forwardedFor.split(',')[0]?.trim();
  return clientIp || toHeader(req, 'x-client-ip') || 'unknown';
}

function toHeader(req, name) {
  const headers = req?.headers || {};
  const lowerName = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === lowerName) {
      return Array.isArray(value) ? String(value[0] || '') : String(value || '');
    }
  }
  return '';
}

function getPositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function recordFailure(callerKey) {
  const now = Date.now();
  const entry = failuresByCaller.get(callerKey) || { count: 0, firstFailureAt: now, lastFailureAt: now };
  entry.count += 1;
  entry.lastFailureAt = now;
  failuresByCaller.set(callerKey, entry);
}

function isRateLimited(callerKey, maxAttempts, windowMs) {
  const entry = failuresByCaller.get(callerKey);
  if (!entry) return false;
  if (Date.now() - entry.firstFailureAt > windowMs) {
    failuresByCaller.delete(callerKey);
    return false;
  }
  return entry.count >= maxAttempts;
}

function pruneFailures(windowMs) {
  const now = Date.now();
  for (const [callerKey, entry] of failuresByCaller.entries()) {
    if (now - entry.firstFailureAt > windowMs) {
      failuresByCaller.delete(callerKey);
    }
  }
}

module.exports._resetRateLimitForTests = () => failuresByCaller.clear();
module.exports._internals = { verifyPasscode, getConfiguredDigest };
