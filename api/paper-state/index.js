const crypto = require('node:crypto');

const MAX_BODY_BYTES = 1_500_000;
const IDEMPOTENCY_KEY_RE = /^[A-Za-z0-9._:~-]{1,200}$/;

function sendJson(context, status, body, headers = {}) {
  context.res = {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
    body,
  };
  return context.res;
}

function getHeader(req, name) {
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(req?.headers || {})) {
    if (key.toLowerCase() === wanted) return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function configuredToken() {
  const token = String(process.env.BSS_PAPER_STATE_TOKEN || '').trim();
  if (!/^[A-Za-z0-9._~-]{32,256}$/.test(token)) {
    const error = new Error('Paper-state edge authentication is unavailable.');
    error.status = 503;
    throw error;
  }
  return token;
}

function requireClientToken(req) {
  const actual = String(getHeader(req, 'x-blue-swallow-paper-state-token') || '').trim();
  const expected = configuredToken();
  const actualBuffer = Buffer.from(actual, 'utf8');
  const expectedBuffer = Buffer.from(expected, 'utf8');
  return actualBuffer.length === expectedBuffer.length && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function backendUrl() {
  const base = String(process.env.BACKEND_PAPER_STATE_BASE_URL || process.env.BACKEND_CYBERMAP_BASE_URL || '').trim();
  if (!base) {
    const error = new Error('BACKEND_PAPER_STATE_BASE_URL is not configured.');
    error.status = 503;
    throw error;
  }
  const url = new URL('api/v1/paper/state', base.endsWith('/') ? base : `${base}/`);
  if (url.protocol !== 'https:') {
    const error = new Error('BACKEND_PAPER_STATE_BASE_URL must use HTTPS.');
    error.status = 503;
    throw error;
  }
  return url;
}

function requestBody(req) {
  const body = typeof req?.rawBody === 'string'
    ? req.rawBody
    : typeof req?.body === 'string'
      ? req.body
      : JSON.stringify(req?.body ?? null);
  if (!body || body === 'null') {
    const error = new Error('Canonical paper-state JSON body is required.');
    error.status = 400;
    throw error;
  }
  if (Buffer.byteLength(body, 'utf8') > MAX_BODY_BYTES) {
    const error = new Error('Canonical paper-state body exceeds the edge limit.');
    error.status = 413;
    throw error;
  }
  return body;
}

function idempotencyKey(req) {
  const value = String(getHeader(req, 'idempotency-key') || '').trim();
  if (!IDEMPOTENCY_KEY_RE.test(value)) {
    const error = new Error('A header-safe Idempotency-Key is required.');
    error.status = 400;
    throw error;
  }
  return value;
}

async function fetchBackend(req, method) {
  const token = configuredToken();
  const options = {
    method,
    headers: {
      accept: 'application/json',
      'x-blue-swallow-paper-state-token': token,
    },
  };
  if (method === 'PUT') {
    options.headers['content-type'] = 'application/json; charset=utf-8';
    options.headers['idempotency-key'] = idempotencyKey(req);
    options.body = requestBody(req);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    return await fetch(backendUrl(), { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function paperStateProxy(context, req) {
  const method = String(req?.method || 'GET').toUpperCase();
  if (!['GET', 'PUT'].includes(method)) {
    return sendJson(context, 405, { ok: false, message: 'GET or PUT required.' }, { allow: 'GET, PUT' });
  }

  try {
    if (!requireClientToken(req)) {
      return sendJson(context, 401, { ok: false, message: 'Valid paper-state client token required.' });
    }
    const response = await fetchBackend(req, method);
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { ok: response.ok, message: text };
    }
    const replayed = response.headers?.get?.('idempotent-replayed');
    if (replayed !== null && replayed !== undefined && !['true', 'false'].includes(replayed.toLowerCase())) {
      return sendJson(context, 502, { ok: false, message: 'Paper-state backend returned a malformed replay acknowledgement.' });
    }
    return sendJson(
      context,
      response.status,
      payload,
      replayed ? { 'idempotent-replayed': replayed.toLowerCase() } : {},
    );
  } catch (error) {
    const status = Number.isFinite(error.status) ? error.status : 502;
    context?.log?.error?.('Paper-state proxy error', { message: error.message, status, code: error.code });
    return sendJson(context, status, { ok: false, message: error.message || 'Paper-state proxy failed.' });
  }
};
