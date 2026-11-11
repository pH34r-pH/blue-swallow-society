'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { requireCompanion } = require('../_lib/companion-auth');
const FILES = Object.freeze({ 'shell.html': 'text/html', 'theme.css': 'text/css', 'main.mjs': 'text/javascript',
  'dataset-client.mjs': 'text/javascript', 'dataset-worker.js': 'text/javascript',
  'maplibre-gl.mjs': 'text/javascript', 'maplibre-gl-shared.mjs': 'text/javascript',
  'maplibre-gl-worker.mjs': 'text/javascript', 'maplibre-gl.css': 'text/css' });
function createCompanionUiHandler({ authorize = requireCompanion, readFile = fs.readFile } = {}) {
  return async (context, req) => {
    if (!(await authorize(context, req)).ok) { if (req.method === 'HEAD') context.res.body = undefined; return; }
    const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
      Vary: 'Cookie, Authorization, X-Blue-Swallow-Operator-Token' };
    const asset = req.params?.asset;
    if (!['GET', 'HEAD'].includes(req.method) || !Object.hasOwn(FILES, asset || '') || Object.keys(req.query || {}).length) {
      context.res = { status: 404, headers, body: req.method === 'HEAD' ? undefined : 'Unavailable' }; return;
    }
    try {
      const directory = asset.startsWith('maplibre-gl') ? '../_private/operator/assets' : '../_private/companion';
      const body = req.method === 'HEAD' ? undefined : await readFile(path.join(__dirname, directory, asset), 'utf8');
      context.res = { status: 200, headers: { ...headers, 'Content-Type': FILES[asset] + '; charset=utf-8' }, body };
    } catch { context.res = { status: 503, headers, body: req.method === 'HEAD' ? undefined : 'Unavailable' }; }
  };
}
module.exports = createCompanionUiHandler();
module.exports.createCompanionUiHandler = createCompanionUiHandler;
