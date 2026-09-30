const { requireOwnerRead } = require('../_lib/owner-read-auth');
const { postCybermapJson } = require('../_lib/cybermap-backend');
function respond(context, status, body) {
  context.res = { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }, body };
}
module.exports = async function history(context, req) {
  const auth = await requireOwnerRead(context, req);
  if (!auth.ok) return;
  if (req.method !== 'POST' || Object.keys(req.query || {}).length) {
    respond(context, 400, { ok: false, error: 'History requires POST filters without URL query parameters.' }); return;
  }
  try {
    const data = await postCybermapJson('api/v1/cybermap/history', req.body, auth);
    respond(context, 200, data);
  } catch (error) {
    // Do not log filter values, private endpoint URLs, credentials or upstream bodies.
    respond(context, error.status === 400 ? 400 : 503, { ok: false, error: 'Observation history is unavailable or the filters are invalid.' });
  }
};
