'use strict';
const { header } = require('./viewer-session');
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', Vary: 'Cookie, Authorization, X-Blue-Swallow-Operator-Token' };
function response(status, body) { return { status, headers, body }; }
function authorizeRequest(context, req, { mode, authorize, env }) {
  if (!['entra', 'password'].includes(mode())) { context.res = response(403, { error: 'owner_required' }); return false; }
  if (!authorize(context, req).ok) return false;
  if (req.method !== 'POST' || Object.keys(req.query || {}).length) { context.res = response(405, { error: 'method_not_allowed' }); return false; }
  if (!env.BLUE_SWALLOW_PUBLIC_ORIGIN || header(req, 'origin') !== env.BLUE_SWALLOW_PUBLIC_ORIGIN) {
    context.res = response(403, { error: 'origin_forbidden' }); return false;
  }
  if (header(req, 'content-type').split(';')[0].trim().toLowerCase() !== 'application/json') {
    context.res = response(415, { error: 'unsupported_media_type' }); return false;
  }
  return true;
}
module.exports = { authorizeRequest, response };
