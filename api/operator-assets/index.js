const fs = require('node:fs');
const path = require('node:path');
const { verifyOperatorRequest } = require('../_lib/operator-auth');

const PRIVATE_ASSET_DIR = path.join(__dirname, '..', '_private', 'operator', 'assets');
const ASSET_MANIFEST = Object.freeze({
  'main.js': { file: 'main.js', contentType: 'application/javascript; charset=utf-8' },
  'map-math.mjs': { file: 'map-math.mjs', contentType: 'application/javascript; charset=utf-8' },
  'tzeentch.mjs': { file: 'tzeentch.mjs', contentType: 'application/javascript; charset=utf-8' },
  'tzeentch-dashboard.mjs': { file: 'tzeentch-dashboard.mjs', contentType: 'application/javascript; charset=utf-8' },
  'chained-daemon.mjs': { file: 'chained-daemon.mjs', contentType: 'application/javascript; charset=utf-8' },
  'godeye-controller.mjs': { file: 'godeye-controller.mjs', contentType: 'application/javascript; charset=utf-8' },
  'wigle.mjs': { file: 'wigle.mjs', contentType: 'application/javascript; charset=utf-8' },
  'vision.mjs': { file: 'vision.mjs', contentType: 'application/javascript; charset=utf-8' },
  'vision-controller.mjs': { file: 'vision-controller.mjs', contentType: 'application/javascript; charset=utf-8' },
  'godeye-global.mjs': { file: 'godeye-global.mjs', contentType: 'application/javascript; charset=utf-8' },
  'godeye-layers.mjs': { file: 'godeye-layers.mjs', contentType: 'application/javascript; charset=utf-8' },
  'godeye-session-analysis.mjs': { file: 'godeye-session-analysis.mjs', contentType: 'application/javascript; charset=utf-8' },
  'godeye-map.mjs': { file: 'godeye-map.mjs', contentType: 'application/javascript; charset=utf-8' },
  'maplibre-gl.mjs': { file: 'maplibre-gl.mjs', contentType: 'application/javascript; charset=utf-8' },
  'maplibre-gl-shared.mjs': { file: 'maplibre-gl-shared.mjs', contentType: 'application/javascript; charset=utf-8' },
  'maplibre-gl-worker.mjs': { file: 'maplibre-gl-worker.mjs', contentType: 'application/javascript; charset=utf-8' },
  'maplibre-gl.css': { file: 'maplibre-gl.css', contentType: 'text/css; charset=utf-8' },
  'morning-brief.mjs': { file: 'morning-brief.mjs', contentType: 'application/javascript; charset=utf-8' },
  'osint-applications.mjs': { file: 'osint-applications.mjs', contentType: 'application/javascript; charset=utf-8' },
  'styles.css': { file: 'styles.css', contentType: 'text/css; charset=utf-8' },
  'theme.css': { file: 'theme.css', contentType: 'text/css; charset=utf-8' },
  'operator-mark.svg': { file: 'nacre-moire-mark.svg', contentType: 'image/svg+xml' },
});

function noStoreHeaders(extra = {}) {
  return {
    'Cache-Control': 'private, no-store',
    'X-Content-Type-Options': 'nosniff',
    ...extra,
  };
}

function deny(context, status = 403) {
  context.res = {
    status,
    headers: noStoreHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
    body: { ok: false, error: 'Operator asset unavailable.' },
  };
}

function requestedAssetName(req) {
  if (Object.keys(req?.query || {}).length > 0) {
    return '';
  }

  const asset = typeof req?.params?.asset === 'string' ? req.params.asset : '';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(asset) || asset.includes('..')) {
    return '';
  }
  return asset;
}

function createOperatorAssetHandler({ readFileSync = fs.readFileSync, now = () => Date.now() } = {}) {
  return async function operatorAssets(context, req) {
    const method = String(req?.method || 'GET').toUpperCase();
    if (method !== 'GET' && method !== 'HEAD') {
      context.res = {
        status: 405,
        headers: noStoreHeaders({
          Allow: 'GET, HEAD',
          'Content-Type': 'application/json; charset=utf-8',
        }),
        body: { ok: false, error: 'Method not allowed.' },
      };
      return;
    }

    const auth = verifyOperatorRequest(req, { now: now() });
    if (!auth.ok) {
      deny(context);
      return;
    }

    const assetName = requestedAssetName(req);
    const descriptor = ASSET_MANIFEST[assetName];
    if (!descriptor) {
      deny(context);
      return;
    }

    const assetPath = path.resolve(PRIVATE_ASSET_DIR, descriptor.file);
    if (!assetPath.startsWith(`${PRIVATE_ASSET_DIR}${path.sep}`)) {
      deny(context);
      return;
    }

    try {
      context.res = {
        status: 200,
        headers: noStoreHeaders({ 'Content-Type': descriptor.contentType }),
        body: method === 'HEAD' ? undefined : readFileSync(assetPath, 'utf8'),
      };
    } catch {
      context.res = {
        status: 404,
        headers: noStoreHeaders({ 'Content-Type': 'application/json; charset=utf-8' }),
        body: { ok: false, error: 'Operator asset unavailable.' },
      };
    }
  };
}

const handler = createOperatorAssetHandler();
module.exports = handler;
module.exports.ASSET_MANIFEST = ASSET_MANIFEST;
module.exports.createOperatorAssetHandler = createOperatorAssetHandler;
