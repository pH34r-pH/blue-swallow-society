'use strict';

const crypto = require('node:crypto');
const { createReleaseStore, toReleaseProbeMetadata } = require('../_lib/wardriver-release-store');

const MAX_PROBE_VALUE_LENGTH = 256;

async function handler(context, req, options = {}) {
  const authorization = authorizeReleaseProbe(req);
  if (!authorization.ok) {
    context.res = response(authorization.status, { ok: false, error: authorization.error });
    return;
  }
  if (!isGetRequest(req)) {
    context.res = response(405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  const releaseStoreFactory = typeof options?.createReleaseStore === 'function'
    ? options.createReleaseStore
    : createReleaseStore;
  let dependencies;
  try {
    dependencies = releaseStoreFactory();
  } catch (error) {
    logReleaseError(context, error);
    context.res = response(503, { ok: false, error: 'Wardriver release probe is unavailable.' });
    return;
  }

  return handleAuthorized(context, req, dependencies);
}

async function handleAuthorized(context, req, dependencies) {
  if (!isGetRequest(req)) {
    context.res = response(405, { ok: false, error: 'Method not allowed.' });
    return;
  }

  try {
    const release = await dependencies.getRelease();
    context.res = response(200, { ok: true, release: toReleaseProbeMetadata(release) });
  } catch (error) {
    logReleaseError(context, error);
    context.res = response(503, { ok: false, error: 'Wardriver release probe is unavailable.' });
  }
}

function isGetRequest(req) {
  return String(req?.method || 'GET').toUpperCase() === 'GET';
}

function authorizeReleaseProbe(req, { env = process.env } = {}) {
  const configured = configuredProbeValue(env);
  if (!configured) {
    return { ok: false, status: 503, error: 'Wardriver release probe is unavailable.' };
  }

  const supplied = readHeader(req, 'x-blue-swallow-release-probe');
  if (!equalProbeValues(configured, supplied)) {
    return { ok: false, status: 403, error: 'Release probe authorization required.' };
  }

  return { ok: true };
}

function configuredProbeValue(env) {
  const value = typeof env?.BSS_WARDRIVER_RELEASE_PROBE_SECRET === 'string'
    ? env.BSS_WARDRIVER_RELEASE_PROBE_SECRET.trim()
    : '';
  return isBoundedProbeValue(value) ? value : '';
}

function equalProbeValues(expected, actual) {
  if (!isBoundedProbeValue(expected) || !isBoundedProbeValue(actual)) {
    return false;
  }

  const expectedBytes = Buffer.from(expected, 'utf8');
  const actualBytes = Buffer.from(actual, 'utf8');
  return expectedBytes.length === actualBytes.length && crypto.timingSafeEqual(expectedBytes, actualBytes);
}

function isBoundedProbeValue(value) {
  return typeof value === 'string' && value.length > 0 && value.length <= MAX_PROBE_VALUE_LENGTH;
}

function readHeader(req, name) {
  const headers = req?.headers || {};
  const lowerName = name.toLowerCase();
  if (typeof headers.get === 'function') {
    return headerValue(headers.get(name) ?? headers.get(lowerName));
  }

  const direct = headers[name] ?? headers[lowerName] ?? headers[name.toUpperCase()];
  if (direct !== undefined) {
    return headerValue(direct);
  }

  for (const [key, value] of Object.entries(headers)) {
    if (String(key).toLowerCase() === lowerName) {
      return headerValue(value);
    }
  }
  return '';
}

function headerValue(value) {
  if (Array.isArray(value)) return headerValue(value[0]);
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (typeof value.value === 'string') return value.value;
  if (typeof value.toString === 'function' && value.toString !== Object.prototype.toString) return value.toString();
  return '';
}

function response(status, body) {
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
  context.log?.error?.('Wardriver release probe failed.', { name: error?.name || 'Error' });
}

module.exports = handler;
module.exports._internals = {
  authorizeReleaseProbe,
  configuredProbeValue,
  equalProbeValues,
  handleAuthorized,
  isBoundedProbeValue,
  readHeader,
  response,
};
