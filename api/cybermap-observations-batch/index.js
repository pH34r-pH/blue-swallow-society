const REQUIRED_HEADERS = Object.freeze([
  'x-blue-swallow-ingest-token',
  'x-blue-swallow-device-id',
  'idempotency-key',
]);

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
  const headers = req?.headers || {};
  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) return Array.isArray(value) ? value[0] : value;
  }
  return undefined;
}

function requiredHeader(req, name) {
  const value = String(getHeader(req, name) || '').trim();
  if (!value) {
    const error = new Error(`${name} is required.`);
    error.status = 401;
    throw error;
  }
  return value;
}

function buildBackendUrl() {
  const base = String(process.env.BACKEND_CYBERMAP_BASE_URL || '').trim();
  if (!base) {
    const error = new Error('BACKEND_CYBERMAP_BASE_URL is not configured.');
    error.status = 503;
    throw error;
  }
  const root = base.endsWith('/') ? base : `${base}/`;
  return new URL('api/v1/observations/batch', root);
}

function requestBody(req) {
  if (typeof req?.rawBody === 'string' && req.rawBody.length > 0) return req.rawBody;
  if (typeof req?.body === 'string') return req.body;
  if (req?.body && typeof req.body === 'object') return JSON.stringify(req.body);
  const error = new Error('Observation batch JSON body is required.');
  error.status = 400;
  throw error;
}

function forwardHeaders(req) {
  const headers = {
    accept: 'application/json',
    'content-type': 'application/json; charset=utf-8',
  };
  for (const header of REQUIRED_HEADERS) {
    headers[header] = requiredHeader(req, header);
  }
  return headers;
}

async function fetchBackendBatch(url, body, headers) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    return await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers,
      body,
    });
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function cybermapObservationsBatch(context, req) {
  if (req?.method && req.method.toUpperCase() !== 'POST') {
    return sendJson(context, 405, { ok: false, message: 'POST required.' }, { allow: 'POST' });
  }

  try {
    const url = buildBackendUrl();
    const body = requestBody(req);
    const headers = forwardHeaders(req);
    const response = await fetchBackendBatch(url, body, headers);
    const text = await response.text();
    let payload;
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { ok: response.ok, message: text };
    }
    const replayed = response.headers?.get?.('idempotent-replayed');
    const responseHeaders = replayed ? { 'idempotent-replayed': replayed } : {};
    return sendJson(context, response.status, payload, responseHeaders);
  } catch (error) {
    const status = Number.isFinite(error.status) ? error.status : 502;
    context?.log?.error?.('Cybermap observation batch API error', {
      message: error.message,
      status,
      code: error.code,
    });
    return sendJson(context, status, {
      ok: false,
      message: error.message || 'Cybermap observation batch request failed.',
    });
  }
};
