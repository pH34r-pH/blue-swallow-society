const fs = require('node:fs/promises');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

let wigleModulePromise;

function getWigleModule() {
  if (!wigleModulePromise) {
    const modulePath = path.resolve(__dirname, '../../app/wigle.mjs');
    wigleModulePromise = import(pathToFileURL(modulePath).href);
  }

  return wigleModulePromise;
}

function getRequestValue(req, name, fallback = null) {
  return req?.query?.[name] ?? req?.body?.[name] ?? fallback;
}

function parseNumber(value, fallback = null) {
  if (value === null || value === undefined || value === '') {
    return fallback;
  }

  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function clampNumber(value, minimum, maximum, fallback) {
  const numeric = parseNumber(value, fallback);
  if (!Number.isFinite(numeric)) {
    return fallback;
  }

  return Math.min(maximum, Math.max(minimum, numeric));
}

function parseRequestedLocation(req) {
  const lat = parseNumber(getRequestValue(req, 'lat'));
  const lon = parseNumber(getRequestValue(req, 'lon'));

  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }

  return {
    lat,
    lon,
  };
}

function buildBounds(location, radiusMeters) {
  const safeRadius = clampNumber(radiusMeters, 25, 5_000, 100);
  const latitudeDelta = safeRadius / 111_320;
  const longitudeScale = Math.max(Math.cos((location.lat * Math.PI) / 180), 0.01);
  const longitudeDelta = safeRadius / (111_320 * longitudeScale);

  return {
    latrange1: location.lat - latitudeDelta,
    latrange2: location.lat + latitudeDelta,
    longrange1: location.lon - longitudeDelta,
    longrange2: location.lon + longitudeDelta,
    radiusMeters: safeRadius,
  };
}

function normalizeUpstreamPayload(payload) {
  if (payload === null || payload === undefined) {
    return payload;
  }

  if (typeof payload === 'string') {
    return payload;
  }

  if (Array.isArray(payload)) {
    return { accessPoints: payload };
  }

  if (typeof payload === 'object') {
    if (Array.isArray(payload.accessPoints)) {
      return payload;
    }

    if (Array.isArray(payload.results)) {
      return { ...payload, accessPoints: payload.results };
    }

    if (Array.isArray(payload.networks)) {
      return { ...payload, accessPoints: payload.networks };
    }

    if (Array.isArray(payload.data)) {
      return { ...payload, accessPoints: payload.data };
    }
  }

  return payload;
}

async function fetchBody(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    const error = new Error(`HTTP ${response.status}`);
    error.status = response.status;
    throw error;
  }

  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function readLocalSource() {
  const localPath = process.env.WIGLE_LOCAL_DB_PATH;
  const localUrl = process.env.WIGLE_LOCAL_DB_URL;

  if (localPath) {
    return fs.readFile(localPath, 'utf8');
  }

  if (localUrl) {
    return fetchBody(localUrl, {
      headers: {
        Accept: 'application/json, text/plain, */*',
      },
    });
  }

  throw new Error('Set WIGLE_LOCAL_DB_PATH or WIGLE_LOCAL_DB_URL to expose the local WiGLE database.');
}

async function loadLiveBridge() {
  const bridgeUrl = process.env.WIGLE_LIVE_BRIDGE_URL;
  if (!bridgeUrl) {
    return null;
  }

  return fetchBody(bridgeUrl, {
    headers: {
      Accept: 'application/json, text/plain, */*',
    },
  });
}

async function loadWigleApi(location, radiusMeters, limit) {
  const apiName = process.env.WIGLE_API_NAME;
  const apiToken = process.env.WIGLE_API_TOKEN;

  if (!apiName || !apiToken) {
    return null;
  }

  if (!location) {
    const error = new Error('WiGLE API search requires lat/lon query parameters.');
    error.status = 422;
    throw error;
  }

  const bounds = buildBounds(location, radiusMeters);
  const searchUrl = new URL('https://api.wigle.net/api/v2/network/search');
  searchUrl.searchParams.set('latrange1', String(bounds.latrange1));
  searchUrl.searchParams.set('latrange2', String(bounds.latrange2));
  searchUrl.searchParams.set('longrange1', String(bounds.longrange1));
  searchUrl.searchParams.set('longrange2', String(bounds.longrange2));
  searchUrl.searchParams.set('resultsPerPage', String(clampNumber(limit, 1, 100, 25)));
  searchUrl.searchParams.set('variance', '0.02');
  searchUrl.searchParams.set('closestLat', String(location.lat));
  searchUrl.searchParams.set('closestLong', String(location.lon));

  const auth = Buffer.from(`${apiName}:${apiToken}`).toString('base64');
  const raw = await fetchBody(searchUrl.toString(), {
    headers: {
      Authorization: `Basic ${auth}`,
      Accept: 'application/json',
    },
  });

  return normalizeUpstreamPayload(raw);
}

async function buildSnapshot({
  context,
  mode,
  location,
  radiusMeters,
  limit,
}) {
  const { parseWiglePayload, filterWigleRecordsByRadius, isLiveWigleSnapshot } = await getWigleModule();

  let rawPayload = null;
  let source = null;
  let live = false;

  if (mode === 'database') {
    rawPayload = await readLocalSource();
    source = process.env.WIGLE_LOCAL_DB_PATH ? 'local-db' : 'local-url';
  } else {
    rawPayload = await loadLiveBridge();
    if (rawPayload !== null && rawPayload !== undefined) {
      source = 'bridge';
      live = typeof rawPayload === 'string' || Array.isArray(rawPayload) || isLiveWigleSnapshot(rawPayload);
    }

    if (rawPayload === null || rawPayload === undefined) {
      const apiPayload = await loadWigleApi(location, radiusMeters, limit);
      if (apiPayload !== null && apiPayload !== undefined) {
        rawPayload = apiPayload;
        source = 'api';
        live = true;
      }
    }
  }

  if (rawPayload === null || rawPayload === undefined) {
    const sourceError = mode === 'database'
      ? 'Local WiGLE database not configured. Set WIGLE_LOCAL_DB_PATH or WIGLE_LOCAL_DB_URL.'
      : 'Live WiGLE is not configured. Set WIGLE_LIVE_BRIDGE_URL or WIGLE_API_NAME/WIGLE_API_TOKEN.';
    const error = new Error(sourceError);
    error.status = 503;
    throw error;
  }

  const normalizedPayload = normalizeUpstreamPayload(rawPayload);
  const parseSource = mode === 'database' ? 'database' : 'live';
  const parsed = parseWiglePayload(normalizedPayload, { source: parseSource });
  const effectiveLocation = location || parsed.location || null;
  const effectiveRadius = clampNumber(radiusMeters, 25, 5_000, 100);
  const accessPoints = effectiveLocation
    ? filterWigleRecordsByRadius(parsed.accessPoints, effectiveLocation, effectiveRadius)
    : parsed.accessPoints.slice();
  const limitedAccessPoints = Number.isFinite(limit) && limit > 0 ? accessPoints.slice(0, limit) : accessPoints;
  const responseLocation = effectiveLocation || parsed.location || null;
  const updatedAt = parsed.updatedAt || new Date().toISOString();

  return {
    ok: true,
    mode,
    live: mode === 'live' ? live : false,
    source,
    location: responseLocation,
    radiusMeters: effectiveLocation ? effectiveRadius : null,
    totalResults: limitedAccessPoints.length,
    accessPoints: limitedAccessPoints,
    updatedAt,
    message: mode === 'database'
      ? 'Local WiGLE database snapshot ready.'
      : live
        ? 'Live WiGLE stream ready.'
        : 'WiGLE feed returned a non-live snapshot.',
  };
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

module.exports = async function wigle(context, req) {
  const requestMode = String(getRequestValue(req, 'mode', 'live') || 'live').toLowerCase();
  const mode = requestMode === 'database' ? 'database' : 'live';
  const radiusMeters = clampNumber(getRequestValue(req, 'radiusMeters'), 25, 5_000, 100);
  const limit = clampNumber(getRequestValue(req, 'limit'), 1, 100, 25);
  const location = parseRequestedLocation(req);

  try {
    const snapshot = await buildSnapshot({
      context,
      mode,
      location,
      radiusMeters,
      limit,
    });

    return sendJson(context, 200, snapshot);
  } catch (error) {
    const status = Number.isFinite(error.status) ? error.status : 500;
    if (context?.log?.error) {
      context.log.error('WiGLE API error', error);
    } else if (context?.log?.warn) {
      context.log.warn('WiGLE API error', error);
    }

    return sendJson(context, status, {
      ok: false,
      mode,
      live: false,
      message: error.message || 'WiGLE request failed.',
    });
  }
};
