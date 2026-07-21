'use strict';

const { requireOperatorToken } = require('../_lib/operator-auth');
const { createReleaseStore, toOperatorMetadata } = require('../_lib/wardriver-release-store');

async function handler(context, req) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) {
    return;
  }

  let dependencies;
  try {
    dependencies = createReleaseStore();
  } catch (error) {
    logReleaseError(context, error);
    context.res = jsonResponse(503, { ok: false, error: 'Wardriver release is unavailable.' });
    return;
  }

  return handleAuthorized(context, req, dependencies);
}

async function handle(context, req, dependencies) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) {
    return;
  }

  return handleAuthorized(context, req, dependencies);
}

async function handleAuthorized(context, req, dependencies) {
  const artifact = normalizeArtifact(req.params?.artifact);
  if (artifact !== 'metadata' && artifact !== 'apk') {
    context.res = jsonResponse(404, { ok: false, error: 'Unknown operator download artifact.' });
    return;
  }

  let release;
  try {
    release = await dependencies.getRelease();
  } catch (error) {
    logReleaseError(context, error);
    context.res = jsonResponse(503, { ok: false, error: 'Wardriver release is unavailable.' });
    return;
  }

  if (artifact === 'metadata') {
    context.res = metadataResponse(req, release);
    return;
  }

  try {
    const location = await dependencies.createDownloadUrl(release);
    if (!isHttpsBlobUrl(location)) {
      throw new Error('Release download URL is invalid.');
    }
    context.res = {
      status: 302,
      headers: {
        Location: location,
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    };
  } catch (error) {
    logReleaseError(context, error);
    context.res = jsonResponse(503, { ok: false, error: 'Wardriver release is unavailable.' });
  }
}

function normalizeArtifact(value) {
  return String(value || '').trim().toLowerCase();
}

function metadataResponse(req, release) {
  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: req.method === 'HEAD' ? undefined : {
      ok: true,
      artifact: toOperatorMetadata(release),
    },
  };
}

function isHttpsBlobUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname.endsWith('.blob.core.windows.net')
      && url.searchParams.get('sp') === 'r'
      && url.searchParams.get('spr') === 'https';
  } catch {
    return false;
  }
}

function jsonResponse(status, body) {
  return {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body,
  };
}

function logReleaseError(context, error) {
  context.log?.error?.('Wardriver release delivery failed.', {
    name: error?.name || 'Error',
  });
}

module.exports = handler;
module.exports._internals = {
  handle,
  isHttpsBlobUrl,
  metadataResponse,
  normalizeArtifact,
};
