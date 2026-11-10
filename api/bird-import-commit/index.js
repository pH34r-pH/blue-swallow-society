'use strict';
const { authMode } = require('../shared/owner-session.cjs');
const { requireOperatorToken } = require('../_lib/operator-auth');
const { header } = require('../_lib/viewer-session');
const { readInput } = require('../bird-import-preview');
const { applyDraftImport } = require('../_lib/bird-draft-import');
const { createBirdSnapshotStore, config } = require('../_lib/bird-snapshot-store');
const MAX_REQUEST = Math.ceil(10 * 1024 * 1024 / 3) * 4 + 16384;
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', Vary: 'Cookie, Authorization, X-Blue-Swallow-Operator-Token' };
function response(status, body) { return { status, headers, body }; }
function input(req) {
  const raw = req.rawBody ?? (typeof req.body === 'string' ? req.body : JSON.stringify(req.body));
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_REQUEST) throw new Error('invalid_request');
  let value;
  try { value = JSON.parse(raw); } catch { throw new Error('invalid_request'); }
  const keys = ['csvBase64', 'revision', 'digest', 'selectedRows'];
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).length !== keys.length
    || !keys.every((key) => Object.hasOwn(value, key))) throw new Error('invalid_request');
  return { bytes: readInput({ body: { csvBase64: value.csvBase64 } }), request: value };
}
function createHandler({ authorize = requireOperatorToken, mode = authMode, env = process.env,
  createStore = () => createBirdSnapshotStore({ settings: config(env) }) } = {}) {
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
      const value = input(req);
      context.res = response(200, await applyDraftImport(createStore(), value.bytes, value.request));
    } catch (error) {
      const invalid = ['invalid_request', 'invalid_bird_selection', 'invalid_export_size', 'invalid_export_encoding', 'invalid_export_csv', 'unsupported_export'];
      const code = invalid.includes(error.message) ? error.message : error.message === 'bird_snapshot_conflict' ? error.message : 'import_unavailable';
      context.res = response(code === 'bird_snapshot_conflict' ? 409 : code === 'import_unavailable' ? 503 : 400, { error: code });
    }
  };
}
module.exports = createHandler();
module.exports.createHandler = createHandler;
