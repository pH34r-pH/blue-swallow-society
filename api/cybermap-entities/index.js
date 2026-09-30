const { requireEntityOwner } = require('../_lib/entity-owner-auth');
const { postCybermapJson } = require('../_lib/cybermap-backend');
const operations = Object.freeze({ list: 'Owner.Read', detail: 'Owner.Read', preview: 'Entities.Write', mutate: 'Entities.Write' });
const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' };
function createEntityProxy({ authorize = requireEntityOwner, post = postCybermapJson } = {}) {
return async function entityProxy(context, req) {
  const operation = req.params?.operation;
  if (!Object.hasOwn(operations, operation)) { context.res = { status: 404, headers, body: { ok: false, error: 'not_found' } }; return; }
  if (req.method !== 'POST') { context.res = { status: 405, headers, body: { ok: false, error: 'method_not_allowed' } }; return; }
  const auth = await authorize(context, req, operations[operation]);
  if (!auth) return;
  try {
    if (Object.keys(req.query || {}).length || Buffer.byteLength(JSON.stringify(req.body ?? null)) > 65536) {
      context.res = { status: 400, headers, body: { ok: false, error: 'invalid_entity_request' } }; return;
    }
    const body = await post(`/api/v1/entities/${operation}`, req.body, auth);
    context.res = { status: 200, headers, body };
  } catch (error) {
    context.res = { status: error.status || 503, headers, body: { ok: false, error: error.body?.error || 'entity_unavailable' } };
  }
};
}
module.exports = createEntityProxy();
module.exports.createEntityProxy = createEntityProxy;
