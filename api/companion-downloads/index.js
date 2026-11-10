'use strict';

const { requireCompanion } = require('../_lib/companion-auth');
const { createDevelopmentStore } = require('../_lib/wardriver-development-store');
const { parseArtifact, deliverAuthorized } = require('../wardriver-development')._internals;
const headers = Object.freeze({ 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff', Vary: 'Cookie, Authorization, X-Blue-Swallow-Operator-Token' });

function createCompanionDownloadsHandler({ authorize = requireCompanion, createStore = createDevelopmentStore, env = process.env } = {}) {
  return async (context, req) => {
    // Do not construct a store, read a manifest or disclose release state first.
    if (!(await authorize(context, req)).ok) {
      if (req.method === 'HEAD') context.res.body = undefined;
      return;
    }
    const method = req.method || 'GET';
    if (!['GET', 'HEAD'].includes(method)) {
      context.res = { status: 405, headers: { ...headers, Allow: 'GET, HEAD' }, body: { ok: false, error: 'method_not_allowed' } }; return;
    }
    const reference = parseArtifact(req.params?.artifact);
    if (!reference || reference.index || Object.keys(req.query || {}).length) {
      context.res = { status: 404, headers, body: method === 'HEAD' ? undefined : { ok: false, error: 'not_found' } }; return;
    }
    try {
      context.res = await deliverAuthorized(reference, method, env, createStore({ env }));
      context.res.headers = { ...context.res.headers, Vary: headers.Vary };
    } catch {
      context.res = { status: 503, headers, body: method === 'HEAD' ? undefined : { ok: false, error: 'release_unavailable' } };
    }
  };
}
module.exports = createCompanionDownloadsHandler();
module.exports.createCompanionDownloadsHandler = createCompanionDownloadsHandler;
