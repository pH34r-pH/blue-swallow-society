const {
  createOperatorToken,
  getConfiguredDigest,
  getOperatorTokenSigningKey,
  verifyPasscode,
} = require('../_lib/operator-auth');
const {
  PasscodeRateLimitUnavailableError,
  callerKeyForRequest,
  createPasscodeRateLimiter,
  getPasscodeRateLimitConfig,
} = require('../_lib/passcode-rate-limit');

let limiterOverrideForTests = null;

module.exports = async function validatePasscode(context, req) {
  const passcode = typeof req.body?.passcode === 'string' ? req.body.passcode : '';

  if (!getConfiguredDigest()) {
    context.log?.error?.('Passcode validation is not configured. Set BLUE_SWALLOW_PASSCODE_SHA256.');
    context.res = jsonResponse(503, {
      ok: false,
      message: 'Passcode validation is not configured.',
    });
    return;
  }

  if (!getOperatorTokenSigningKey()) {
    context.log?.error?.('Operator token signing is not configured. Set BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY.');
    context.res = jsonResponse(503, {
      ok: false,
      message: 'Operator token signing is not configured.',
    });
    return;
  }

  const callerKey = callerKeyForRequest(req);
  const limiter = limiterOverrideForTests || createPasscodeRateLimiter();
  const config = getPasscodeRateLimitConfig();
  try {
    const rateStatus = await limiter.check(callerKey, config);
    if (rateStatus.limited) {
      context.res = jsonResponse(429, {
        ok: false,
        message: 'Too many failed attempts.',
      }, {
        'Retry-After': String(rateStatus.retryAfterSeconds),
      });
      return;
    }

    if (verifyPasscode(passcode)) {
      await limiter.reset(callerKey);
      const session = createOperatorToken();
      context.res = jsonResponse(200, {
        ok: true,
        operatorSession: session,
      });
      return;
    }

    await limiter.recordFailure(callerKey, config);
    context?.log?.warn?.('Passcode verification failed.', {
      callerKeyPrefix: callerKey.slice(0, 16),
      rateLimitWindowMs: config.windowMs,
    });
    context.res = jsonResponse(401, {
      ok: false,
      message: 'Invalid passcode.',
    });
  } catch (error) {
    if (!(error instanceof PasscodeRateLimitUnavailableError)) {
      context.log?.error?.('Passcode rate-limit operation failed.');
    }
    context.res = jsonResponse(503, {
      ok: false,
      message: 'Passcode validation is temporarily unavailable.',
    });
  }
};

function jsonResponse(status, body, headers = {}) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...headers,
    },
    body,
  };
}

module.exports._setRateLimiterForTests = (limiter) => {
  limiterOverrideForTests = limiter || null;
};
module.exports._resetRateLimitForTests = () => {
  limiterOverrideForTests = null;
};
module.exports._internals = { verifyPasscode, getConfiguredDigest };
