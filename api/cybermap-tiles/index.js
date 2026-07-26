const { requireOperatorToken } = require('../_lib/operator-auth');

const MAX_ZOOM = 12;
const TILE_COMPONENT_RE = /^(?:0|[1-9]\d*)$/;

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

function sendTile(context, tile) {
  context.res = {
    status: 200,
    headers: {
      'content-type': 'application/vnd.mapbox-vector-tile',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
    },
    body: tile,
  };
  return context.res;
}

function parseTileParams(req) {
  let hasQuery = Object.keys(req?.query || {}).length > 0;
  if (!hasQuery && typeof req?.url === 'string') {
    try {
      const url = new URL(req.url, 'https://operator.invalid');
      hasQuery = Boolean(url.search);
    } catch {
      hasQuery = true;
    }
  }
  if (hasQuery) {
    const error = new Error('Cybermap tile requests do not accept query parameters.');
    error.status = 400;
    throw error;
  }
  const values = ['z', 'x', 'y'].map((name) => String(req?.params?.[name] ?? ''));
  if (!values.every((value) => TILE_COMPONENT_RE.test(value))) {
    const error = new Error('Tile z, x, and y must be non-negative integers.');
    error.status = 400;
    throw error;
  }
  const [z, x, y] = values.map(Number);
  const width = 2 ** z;
  if (!Number.isSafeInteger(z) || z > MAX_ZOOM || !Number.isSafeInteger(x) || !Number.isSafeInteger(y) || x >= width || y >= width) {
    const error = new Error('Tile coordinates are outside the supported Cybermap range.');
    error.status = 400;
    throw error;
  }
  return { z, x, y };
}

function buildBackendUrl({ z, x, y }) {
  const base = String(process.env.BACKEND_CYBERMAP_BASE_URL || '').trim();
  if (!base) {
    const error = new Error('BACKEND_CYBERMAP_BASE_URL is not configured.');
    error.status = 503;
    throw error;
  }
  const root = base.endsWith('/') ? base : `${base}/`;
  const url = new URL(`api/v1/cybermap/tiles/${z}/${x}/${y}`, root);
  if (url.protocol !== 'https:') {
    const error = new Error('BACKEND_CYBERMAP_BASE_URL must use HTTPS.');
    error.status = 503;
    throw error;
  }
  return url;
}

async function fetchBackendTile(url) {
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
        accept: 'application/vnd.mapbox-vector-tile',
        'x-blue-swallow-cybermap-read-token': readToken,
      },
    });
    if (!response.ok) {
      const error = new Error(`Cybermap backend returned HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return Buffer.from(await response.arrayBuffer());
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function cybermapTiles(context, req) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) return context.res;
  try {
    const params = parseTileParams(req);
    const tile = await fetchBackendTile(buildBackendUrl(params));
    return sendTile(context, tile);
  } catch (error) {
    const status = Number.isFinite(error.status) ? error.status : 502;
    context?.log?.error?.('Cybermap tile API error', error);
    return sendJson(context, status, {
      ok: false,
      mode: 'tile',
      message: error.message || 'Cybermap tile request failed.',
    });
  }
};
