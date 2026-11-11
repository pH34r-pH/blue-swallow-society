'use strict';

const viewer = require('./viewer-session');
const { verifyOperatorRequest } = require('./operator-auth');
const { createViewerSessionStore } = require('./viewer-session-store');

function denial(error) {
  return { status: error.status || 503, headers: { 'Cache-Control': 'private, no-store',
    'Content-Type': 'application/json', 'Referrer-Policy': 'no-referrer' },
  body: { ok: false, error: error.status === 401 ? 'session_expired' : 'viewer_unavailable' } };
}
function createCompanionGuard({ getConfig = viewer.config, createStore = createViewerSessionStore, now = Date.now,
  verifyOwner = verifyOperatorRequest } = {}) {
  return async function requireCompanion(context, req) {
    // Existing owner/legacy authorization is retained. Explicit viewer tokens
    // fail that verifier; only this guard can subsequently admit them.
    const owner = verifyOwner(req, { now: now() });
    if (owner.ok) return { ...owner, role: 'owner' };
    try {
      const settings = getConfig();
      if (!['GET', 'HEAD'].includes(req.method || 'GET') && !viewer.sameOrigin(req, settings)) throw viewer.denied();
      const rawToken = viewer.requestToken(req);
      const claims = viewer.verifyToken(rawToken, settings, now());
      const record = await createStore().validate(claims, now());
      return { ok: true, role: 'viewer', token: claims, rawToken, record };
    } catch (error) {
      context.res = process.env.BLUE_SWALLOW_AUTH_MODE === 'password' ? denial(error)
        : { status: owner.status || 403, headers: { 'Cache-Control': 'private, no-store', 'Content-Type': 'application/json' },
          body: { ok: false, error: owner.error || 'Operator session required.' } };
      return { ok: false };
    }
  };
}
module.exports = { createCompanionGuard, requireCompanion: createCompanionGuard(), denial };
