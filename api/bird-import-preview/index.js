'use strict';
const { authMode } = require('../shared/owner-session.cjs');
const { requireOperatorToken } = require('../_lib/operator-auth');
const { header } = require('../_lib/viewer-session');
const { previewBirdExport } = require('../_lib/bird-export-preview');
const { planBirdReconciliation } = require('../_lib/bird-reconciliation');
const { createBirdSnapshotStore, config: snapshotConfig } = require('../_lib/bird-snapshot-store');
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_JSON = Math.ceil(MAX_BYTES / 3) * 4 + 128;
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', Vary: 'Cookie, Authorization, X-Blue-Swallow-Operator-Token' };
function response(status, body) { return { status, headers, body }; }
function validPayload(value) {
  return value && !Array.isArray(value) && typeof value === 'object' && Object.keys(value).length === 1
    && typeof value.csvBase64 === 'string' && value.csvBase64.length % 4 === 0
    && /^[A-Za-z0-9+/]*={0,2}$/.test(value.csvBase64);
}
function readInput(req) {
  const raw = req.rawBody ?? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_JSON) throw new Error('invalid_export_size');
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('invalid_request'); }
  if (!validPayload(value)) throw new Error('invalid_request');
  const bytes = Buffer.from(value.csvBase64, 'base64');
  if (bytes.length === 0 || bytes.length > MAX_BYTES) throw new Error('invalid_export_size');
  if (bytes.toString('base64') !== value.csvBase64) throw new Error('invalid_request');
  return bytes;
}
function createHandler({ authorize = requireOperatorToken, mode = authMode, preview = previewBirdExport, env = process.env,
  createStore = () => createBirdSnapshotStore({ settings: snapshotConfig(env) }) } = {}) {
  return async (context, req) => {
    if (!['entra', 'password'].includes(mode())) { context.res = response(403, { error: 'owner_required' }); return; }
    if (!authorize(context, req).ok) return;
    if (req.method !== 'POST' || Object.keys(req.query || {}).length) { context.res = response(405, { error: 'method_not_allowed' }); return; }
    if (!env.BLUE_SWALLOW_PUBLIC_ORIGIN || header(req, 'origin') !== env.BLUE_SWALLOW_PUBLIC_ORIGIN) {
      context.res = response(403, { error: 'origin_forbidden' }); return;
    }
    if (header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') {
      context.res = response(415, { error: 'unsupported_media_type' }); return;
    }
    try {
      const value = preview(readInput(req));
      if (env.BSS_BIRD_HISTORY_ENABLED === 'true') {
        const { snapshot } = await createStore().read();
        value.comparison = { status: 'available', revision: snapshot.revision, plan: planBirdReconciliation(snapshot, value) };
      } else value.comparison = { status: 'not_configured' };
      context.res = response(200, value);
    }
    catch (error) {
      const allowed = ['invalid_request', 'invalid_export_size', 'invalid_export_encoding', 'invalid_export_csv', 'unsupported_export'];
      const code = allowed.includes(error.message) ? error.message : 'preview_unavailable';
      context.res = response(code === 'preview_unavailable' ? 503 : 400, { error: code });
    }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
