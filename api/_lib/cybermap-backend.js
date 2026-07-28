const SENSITIVE_LOCATION_QUERY_KEYS = new Set(['lat', 'lon', 'latitude', 'longitude']);

function hasSensitiveLocationQuery(req) {
  const query = req?.query || {};
  return [...SENSITIVE_LOCATION_QUERY_KEYS].some((name) => query[name] !== undefined && query[name] !== null && query[name] !== '');
}

function buildViewportPayload(req) {
  const lat = parseNumber(getBodyValue(req, 'lat', getBodyValue(req, 'latitude')));
  const lon = parseNumber(getBodyValue(req, 'lon', getBodyValue(req, 'longitude')));
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    const error = new Error('lat and lon must be sent in the POST body.');
    error.status = 400;
    throw error;
  }

  const payload = {
    lat,
    lon,
    radiusMeters: clampNumber(getBodyValue(req, 'radiusMeters'), 25, 5_000, 100),
    limit: Math.trunc(clampNumber(getBodyValue(req, 'limit'), 1, 500, 100)),
  };
  const maxAgeMs = parseNumber(getBodyValue(req, 'maxAgeMs'));
  const now = getBodyValue(req, 'now');
  if (Number.isFinite(maxAgeMs)) payload.maxAgeMs = maxAgeMs;
  if (now !== null && now !== undefined && now !== '') payload.now = String(now);
  return payload;
}

function buildBackendUrl(path) {
  const base = String(process.env.BACKEND_CYBERMAP_BASE_URL || '').trim();
  if (!base) {
    const error = new Error('BACKEND_CYBERMAP_BASE_URL is not configured.');
    error.status = 503;
    throw error;
  }
  const root = base.endsWith('/') ? base : `${base}/`;
  const url = new URL(path.replace(/^\/+/, ''), root);
  if (url.protocol !== 'https:') {
    const error = new Error('BACKEND_CYBERMAP_BASE_URL must use HTTPS.');
    error.status = 503;
    throw error;
  }
  if (url.search) {
    const error = new Error('Cybermap backend base URL must not contain query parameters.');
    error.status = 503;
    throw error;
  }
  return url;
}

async function postCybermapJson(path, payload) {
  const readToken = String(process.env.BSS_CYBERMAP_READ_TOKEN || '').trim();
  if (!readToken) {
    const error = new Error('BSS_CYBERMAP_READ_TOKEN is not configured.');
    error.status = 503;
    throw error;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const response = await fetch(buildBackendUrl(path), {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-blue-swallow-cybermap-read-token': readToken,
      },
      body: JSON.stringify(payload),
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

function getBodyValue(req, name, fallback = null) {
  return req?.body?.[name] ?? fallback;
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

module.exports = {
  buildViewportPayload,
  hasSensitiveLocationQuery,
  postCybermapJson,
};
