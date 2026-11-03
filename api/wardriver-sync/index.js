'use strict';

const { ACTIONS, SyncAccessError, challenge, parseBody, readConfig, verifyProof } = require('../_lib/wardriver-sync-auth');
const { createSyncStore } = require('../_lib/wardriver-sync-store');

const PRIVATE_HEADERS = Object.freeze({
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'Content-Type': 'application/json; charset=utf-8',
});

function response(status, body, headers = {}) {
  return { status, headers: { ...PRIVATE_HEADERS, ...headers }, body };
}

async function handle(context, req, { env = process.env, createStore = createSyncStore,
  now = () => Math.floor(Date.now() / 1000) } = {}) {
  if (String(req?.method || '').toUpperCase() !== 'POST') {
    context.res = response(405, { error: { code: 'method_not_allowed' } }, { Allow: 'POST' });
    return;
  }
  const action = req?.params?.action;
  if (action !== 'challenge' && !ACTIONS.has(action)) {
    context.res = response(404, { error: { code: 'route_not_found' } });
    return;
  }
  try {
    const config = readConfig(env);
    const body = parseBody(req);
    if (action === 'challenge') {
      context.res = response(200, await challenge(body, config, now()));
      return;
    }
    const proof = await verifyProof(body, action, config, now());
    const result = await createStore({ config, now }).execute(proof);
    context.res = response(200, result);
  } catch (error) {
    const status = error instanceof SyncAccessError ? error.status : 503;
    const code = error instanceof SyncAccessError ? error.code : 'sync_unavailable';
    // Never pass exceptions, request bodies, invitations, identities, or SDK
    // URLs to logs; SDK errors may contain bearer capabilities in their URL.
    if (status >= 500) context.log?.error?.('Wardriver sync access is unavailable.');
    context.res = response(status, { error: { code } });
  }
}

module.exports = (context, req) => handle(context, req);
module.exports._internals = { handle };
