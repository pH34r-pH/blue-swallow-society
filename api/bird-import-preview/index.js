'use strict';
const { authMode } = require('../shared/owner-session.cjs');
const { requireOperatorToken } = require('../_lib/operator-auth');
const { authorizeRequest, response } = require('../_lib/bird-owner-request');
const { previewBirdExport } = require('../_lib/bird-export-preview');
const { planBirdReconciliation } = require('../_lib/bird-reconciliation');
const { fingerprintDraft, changeDetails } = require('../_lib/bird-draft-import');
const { createBirdSnapshotStore, config: snapshotConfig } = require('../_lib/bird-snapshot-store');
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_JSON = Math.ceil(MAX_BYTES / 3) * 4 + 128;
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
    if (!authorizeRequest(context, req, { mode, authorize, env })) return;
    try {
      const bytes = readInput(req); const value = preview(bytes);
      if (env.BSS_BIRD_HISTORY_ENABLED === 'true') {
        const { snapshot } = await createStore().read();
        const plan = planBirdReconciliation(snapshot, value);
        value.comparison = { status: 'available', revision: snapshot.revision, plan,
          digest: fingerprintDraft(bytes, snapshot, plan), changes: changeDetails(snapshot, value, plan) };
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
module.exports.readInput = readInput;
