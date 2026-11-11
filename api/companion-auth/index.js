'use strict';

const viewer = require('../_lib/viewer-session');
const { createViewerSessionStore } = require('../_lib/viewer-session-store');
const { createPasscodeRateLimiter, callerKeyForRequest, getPasscodeRateLimitConfig } = require('../_lib/passcode-rate-limit');
const HEADERS = Object.freeze({ 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' });
function response(status, body, cookies = []) { return { status, headers: { ...HEADERS }, body, cookies }; }
function validateRequest(req, settings) {
  const action = req.params?.action;
  if (!['login', 'session', 'renew', 'logout'].includes(action)) return response(404, { ok: false, error: 'not_found' });
  if (req.method !== (action === 'session' ? 'GET' : 'POST')) return response(405, { ok: false, error: 'method_not_allowed' });
  if (action === 'session') return null;
  if (!viewer.sameOrigin(req, settings)) return response(403, { ok: false, error: 'origin_denied' });
  if (!/^application\/json(?:\s*;|$)/i.test(viewer.header(req, 'content-type'))) return response(415, { ok: false, error: 'json_required' });
  if (!req.body || typeof req.body !== 'object' || Array.isArray(req.body)) return response(400, { ok: false, error: 'invalid_request' });
  if (Buffer.byteLength(JSON.stringify(req.body)) > 4096 || Number(viewer.header(req, 'content-length')) > 4096) return response(413, { ok: false, error: 'request_too_large' });
  const allowed = action === 'login' ? ['password'] : [];
  if (Object.keys(req.body).some((key) => !allowed.includes(key))) return response(400, { ok: false, error: 'invalid_request' });
  return null;
}
async function login(req, settings, dependencies) {
  const { createLimiter, createStore, now } = dependencies;
  if (typeof req.body.password !== 'string' || !req.body.password || Buffer.byteLength(req.body.password) > 1024) {
    return response(400, { ok: false, error: 'invalid_request' });
  }
  const limiter = createLimiter();
  // Global ceiling cannot be bypassed by changing forwarded address headers.
  for (const [key, policy] of [['viewer-login-global', { maxAttempts: 30, windowMs: 300000 }],
    [callerKeyForRequest(req), getPasscodeRateLimitConfig()]]) {
    const attempt = await limiter.reserveAttempt(key, { ...policy, now: now() });
    if (attempt.limited) return { ...response(429, { ok: false, error: 'rate_limited' }),
      headers: { ...HEADERS, 'Retry-After': String(attempt.retryAfterSeconds) } };
  }
  // Do not reset the global reservation: successful logins also consume KDF work.
  if (!await viewer.verifyPassword(req.body.password, settings)) return response(401, { ok: false, error: 'invalid_password' });
  const record = await createStore().create(settings, now());
  const session = viewer.signSession(record, settings, now());
  return response(200, { ok: true, operatorSession: session }, [viewer.sessionCookie(session)]);
}
async function sessionAction(req, settings, { createStore, now }) {
  const action = req.params.action;
  const raw = viewer.requestToken(req);
  if (action === 'logout' && !raw) return response(200, { ok: true }, [viewer.sessionCookie()]);
  const claims = viewer.verifyToken(raw, settings, now());
  const store = createStore();
  if (action === 'logout') {
    await store.revoke(claims);
    return response(200, { ok: true }, [viewer.sessionCookie()]);
  }
  const record = action === 'renew' ? await store.renew(claims, now()) : await store.validate(claims, now());
  // A GET restores the existing token; only an explicit POST renews idle time.
  const session = action === 'renew' ? viewer.signSession(record, settings, now())
    : { token: raw, expiresAt: new Date(claims.exp * 1000).toISOString(), absoluteExpiresAt: record.expiresAt, role: 'viewer' };
  return response(200, { ok: true, operatorSession: session }, action === 'renew' ? [viewer.sessionCookie(session)] : []);
}
function createCompanionAuthHandler({ getConfig = viewer.config, createStore = createViewerSessionStore,
  createLimiter = createPasscodeRateLimiter, now = Date.now } = {}) {
  return async (context, req) => {
    try {
      const settings = getConfig();
      const invalid = validateRequest(req, settings);
      if (invalid) { context.res = invalid; return; }
      const dependencies = { createStore, createLimiter, now };
      context.res = req.params.action === 'login' ? await login(req, settings, dependencies)
        : await sessionAction(req, settings, dependencies);
    } catch (error) {
      const status = error.status === 401 ? 401 : 503;
      context.res = response(status, { ok: false, error: status === 401 ? 'session_expired' : 'viewer_unavailable' },
        status === 401 ? [viewer.sessionCookie()] : []);
    }
  };
}
module.exports = createCompanionAuthHandler();
module.exports.createCompanionAuthHandler = createCompanionAuthHandler;
