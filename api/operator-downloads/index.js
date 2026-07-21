'use strict';

const { buildOperatorSessionCookie, requireOperatorToken } = require('../_lib/operator-auth');
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

  return handleAuthorized(context, req, dependencies, auth);
}

async function handle(context, req, dependencies) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) {
    return;
  }

  return handleAuthorized(context, req, dependencies, auth);
}

async function handleAuthorized(context, req, dependencies, auth) {
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
    context.res = metadataResponse(req, release, auth);
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

function metadataResponse(req, release, auth) {
  const sessionCookie = refreshOperatorSessionCookie(auth);
  return {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(sessionCookie ? { 'Set-Cookie': sessionCookie } : {}),
    },
    body: req.method === 'HEAD' ? undefined : {
      ok: true,
      artifact: toOperatorMetadata(release),
    },
  };
}

function refreshOperatorSessionCookie(auth) {
  const token = typeof auth?.rawToken === 'string' ? auth.rawToken : '';
  const expiresAt = Number(auth?.token?.exp);
  const ttlSeconds = Number.isFinite(expiresAt) ? expiresAt - Math.floor(Date.now() / 1000) : 0;
  return token && ttlSeconds > 0 ? buildOperatorSessionCookie({ token, ttlSeconds }) : '';
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
