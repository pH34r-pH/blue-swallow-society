const { requireOwnerRead } = require('../_lib/owner-read-auth');
const { postCybermapJson } = require('../_lib/cybermap-backend');
function send(context, status, body) {
  context.res = { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }, body };
}
function createWorldContextHandler({ authorize = requireOwnerRead, read = (auth) => postCybermapJson('api/v1/world/context', {}, auth) } = {}) {
  return async function worldContext(context, req) {
    const auth = await authorize(context, req);
    if (!auth?.ok) return;
    // Public-feed access uses the common API token; legacy/custom proof cannot authorize this new route.
    if (!auth.apiAccessToken || !auth.principal) { send(context, 403, { ok: false, error: 'api_owner_denied' }); return; }
    if (req.method !== 'GET' || Object.keys(req.query || {}).length || req.body != null) {
      send(context, 400, { ok: false, error: 'world_request_invalid' }); return;
    }
    try { send(context, 200, await read(auth)); }
    catch { send(context, 503, { ok: false, error: 'world_context_unavailable' }); }
  };
}
module.exports = createWorldContextHandler();
module.exports.createWorldContextHandler = createWorldContextHandler;
