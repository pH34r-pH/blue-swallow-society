'use strict';

const { requireCompanion } = require('../_lib/companion-auth');
const { createDatasetStore, readDatasetConfig } = require('../_lib/companion-dataset-store');
const { exactKeys, DEVICE_ID } = require('../_lib/wardriver-sync-auth');
const { header } = require('../_lib/viewer-session');
const headers = Object.freeze({ 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store',
  'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff',
  Vary: 'Cookie, Authorization, X-Blue-Swallow-Operator-Token' });
const response = (status, body, method) => ({ status, headers, body: method === 'HEAD' ? undefined : body });
function invalid() { return Object.assign(new Error('invalid_request'), { status: 400 }); }
function requestJson(req) {
  if (header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') throw invalid();
  const raw = req.rawBody ?? (typeof req.body === 'string' || Buffer.isBuffer(req.body) ? req.body : JSON.stringify(req.body));
  if ((typeof raw !== 'string' && !Buffer.isBuffer(raw)) || Buffer.byteLength(raw) > 1024) throw invalid();
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(Buffer.from(raw)));
}
function parseReference(req) {
  const value = requestJson(req);
  if (!exactKeys(value, ['version', 'revision', 'rosterSha256', 'deviceId', 'object']) || value.version !== 1
    || !Number.isSafeInteger(value.revision) || value.revision < 1
    || !['rosterSha256', 'deviceId', 'object'].every((key) => typeof value[key] === 'string')
    || !DEVICE_ID.test(value.rosterSha256) || !DEVICE_ID.test(value.deviceId)
    || (value.object !== 'head' && !DEVICE_ID.test(value.object))) throw invalid();
  return value;
}
function validateRequest(req, config, principal) {
  if (principal.role !== 'owner' && (principal.role !== 'viewer' || principal.token?.group !== config.groupId)) {
    throw Object.assign(new Error('group_forbidden'), { status: 403 });
  }
  if (req.method !== 'POST') return undefined;
  if (header(req, 'origin') !== config.origin) throw Object.assign(new Error('origin_forbidden'), { status: 403 });
  try { return parseReference(req); } catch (error) { if (error.status === 403) throw error; throw invalid(); }
}
function createCompanionDatasetsHandler({ authorize = requireCompanion, createStore = createDatasetStore,
  getConfig = readDatasetConfig, env = process.env } = {}) {
  return async (context, req) => {
    const principal = await authorize(context, req);
    if (!principal.ok) { if (req.method === 'HEAD') context.res.body = undefined; return; }
    const action = req.params?.action;
    if (!['roster', 'object'].includes(action) || Object.keys(req.query || {}).length) {
      context.res = response(404, { error: 'not_found' }, req.method); return;
    }
    if (!(action === 'roster' ? ['GET', 'HEAD'] : ['POST']).includes(req.method)) {
      context.res = response(405, { error: 'method_not_allowed' }, req.method); return;
    }
    try {
      const config = getConfig(env); const reference = validateRequest(req, config, principal);
      const store = createStore({ config });
      if (action === 'roster') context.res = response(200, await store.roster(), req.method);
      else context.res = { status: 200, body: await store.object(reference), isRaw: true,
        headers: { ...headers, 'Content-Type': 'application/octet-stream',
          'X-Blue-Swallow-Roster-Revision': String(reference.revision), 'X-Blue-Swallow-Roster-Sha256': reference.rosterSha256 } };
    } catch (error) {
      const status = [400, 403, 404, 409].includes(error?.status) ? error.status : 503;
      const code = { 400: 'invalid_request', 403: 'forbidden', 404: 'not_found', 409: 'roster_changed', 503: 'datasets_unavailable' }[status];
      context.res = response(status, { error: code }, req.method);
    }
  };
}
module.exports = createCompanionDatasetsHandler();
module.exports.createCompanionDatasetsHandler = createCompanionDatasetsHandler;
