const { requireOperatorToken } = require('../_lib/operator-auth');

function getBodyValue(req, name, fallback = null) {
  return req?.body?.[name] ?? fallback;
}

function hasSensitiveLocationQuery(req) {
  const query = req?.query || {};
  return ['lat', 'lon', 'latitude', 'longitude'].some((name) => query[name] !== undefined && query[name] !== null && query[name] !== '');
}

function parseNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clampNumber(value, minimum, maximum, fallback) {
  const number = parseNumber(value, fallback);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}

function sendJson(context, status, body) {
  context.res = {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body,
  };
  return context.res;
}

function buildBackendUrl(req) {
  const base = String(process.env.BACKEND_CYBERMAP_BASE_URL || '').trim();
  if (!base) {
    const error = new Error('BACKEND_CYBERMAP_BASE_URL is not configured.');
    error.status = 503;
    throw error;
  }

  const lat = parseNumber(getBodyValue(req, 'lat', getBodyValue(req, 'latitude')));
  const lon = parseNumber(getBodyValue(req, 'lon', getBodyValue(req, 'longitude')));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    const error = new Error('lat and lon must be sent in the POST body.');
    error.status = 400;
    throw error;
  }

  const radiusMeters = clampNumber(getBodyValue(req, 'radiusMeters'), 25, 5_000, 100);
  const limit = Math.trunc(clampNumber(getBodyValue(req, 'limit'), 1, 500, 100));
  const maxAgeMs = parseNumber(getBodyValue(req, 'maxAgeMs'));
  const now = getBodyValue(req, 'now');

  const root = base.endsWith('/') ? base : `${base}/`;
  const url = new URL('api/v1/cybermap/viewport', root);
  url.searchParams.set('lat', String(lat));
  url.searchParams.set('lon', String(lon));
  url.searchParams.set('radiusMeters', String(radiusMeters));
  url.searchParams.set('limit', String(limit));
  if (Number.isFinite(maxAgeMs)) url.searchParams.set('maxAgeMs', String(maxAgeMs));
  if (now !== null && now !== undefined && now !== '') url.searchParams.set('now', String(now));
  return url;
}

async function fetchBackendViewport(url) {
  const readToken = String(process.env.BSS_CYBERMAP_READ_TOKEN || '').trim();
  if (!readToken) {
    const error = new Error('BSS_CYBERMAP_READ_TOKEN is not configured.');
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'x-blue-swallow-cybermap-read-token': readToken,
      },
    });
    const text = await response.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = { ok: false, message: text };
    }
    if (!response.ok) {
      const error = new Error(body?.message || body?.error || `Cybermap backend returned HTTP ${response.status}.`);
      error.status = response.status;
      error.body = body;
      throw error;
    }
    return body;
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function cybermapViewport(context, req) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) return context.res;

  if (hasSensitiveLocationQuery(req)) {
    return sendJson(context, 400, {
      ok: false,
      mode: 'viewport',
      live: false,
      message: 'Cybermap location coordinates must be sent in the POST body, not the URL query string.',
    });
  }

  try {
    const url = buildBackendUrl(req);
    const payload = await fetchBackendViewport(url);
    return sendJson(context, 200, payload);
  } catch (error) {
    const status = Number.isFinite(error.status) ? error.status : 502;
    context?.log?.error?.('Cybermap viewport API error', error);
    return sendJson(context, status, {
      ok: false,
      mode: 'viewport',
      live: false,
      message: error.message || 'Cybermap viewport request failed.',
    });
  }
};
