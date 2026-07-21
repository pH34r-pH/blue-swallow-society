'use strict';

const { createReleaseStore, toCurrentReleaseMetadata } = require('../_lib/wardriver-release-store');

async function handler(context, req) {
  let dependencies;
  try {
    dependencies = createReleaseStore();
  } catch (error) {
    context.log?.error?.('Wardriver current-release lookup failed.', { name: error?.name || 'Error' });
    context.res = response(503, { ok: false, error: 'Wardriver release is unavailable.' });
    return;
  }

  return handle(context, req, dependencies);
}

async function handle(context, req, dependencies) {
  if (String(req.method || 'GET').toUpperCase() !== 'GET') {
    context.res = response(405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const release = await dependencies.getRelease();
    context.res = response(200, { ok: true, release: toCurrentReleaseMetadata(release) });
  } catch (error) {
    context.log?.error?.('Wardriver current-release lookup failed.', { name: error?.name || 'Error' });
    context.res = response(503, { ok: false, error: 'Wardriver release is unavailable.' });
  }
}

function response(status, body) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body,
  };
}

module.exports = handler;
module.exports._internals = { handle, response };
