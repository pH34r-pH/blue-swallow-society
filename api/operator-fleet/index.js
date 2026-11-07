'use strict';

const { requireOwnerRead } = require('../_lib/owner-read-auth');
const { authMode } = require('../shared/owner-session.cjs');
const { createFleetSnapshotStore } = require('../_lib/fleet-snapshot-store');

function respond(context, status, body, extraHeaders = {}) {
  context.res = {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff', ...extraHeaders },
    body,
  };
  return context.res;
}

function createFleetHandler({ authorize = requireOwnerRead, getAuthMode = authMode, createStore = createFleetSnapshotStore } = {}) {
  let store;
  return async function operatorFleet(context, req) {
    if (getAuthMode() !== 'entra') return respond(context, 503, { ok: false, error: 'owner_auth_unavailable' });
    let auth;
    try { auth = await authorize(context, req); }
    catch { return respond(context, 503, { ok: false, error: 'owner_auth_unavailable' }); }
    if (!auth?.ok) {
      if (!context.res) return respond(context, 503, { ok: false, error: 'owner_auth_unavailable' });
      context.res.headers = { ...context.res.headers, 'Cache-Control': 'private, no-store' };
      return context.res;
    }
    if (req.method !== 'GET') return respond(context, 405, { ok: false, error: 'method_not_allowed' }, { Allow: 'GET' });
    if (Object.keys(req.query || {}).length || (req.body !== undefined && req.body !== null && req.body !== '')) {
      return respond(context, 400, { ok: false, error: 'invalid_request' });
    }
    try {
      // Only the client is retained; private observations are always read afresh.
      store ||= createStore();
      return respond(context, 200, await store.getSnapshot());
    } catch {
      return respond(context, 503, { ok: false, error: 'fleet_snapshot_unavailable' });
    }
  };
}

module.exports = createFleetHandler();
module.exports.createFleetHandler = createFleetHandler;
