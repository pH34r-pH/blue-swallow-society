const { requireOperatorToken } = require('../_lib/operator-auth');
const {
  buildViewportPayload,
  hasSensitiveLocationQuery,
  postCybermapJson,
} = require('../_lib/cybermap-backend');

function sendJson(context, status, body) {
  context.res = {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
    },
    body,
  };
  return context.res;
}

module.exports = async function operatorSignals(context, req) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) return context.res;
  if (hasSensitiveLocationQuery(req)) {
    return sendJson(context, 400, { ok: false, error: 'location_query_forbidden' });
  }
  try {
    const snapshot = await postCybermapJson('api/v1/cybermap/operator-signals', buildViewportPayload(req));
    return sendJson(context, 200, snapshot);
  } catch (error) {
    return sendJson(context, Number.isInteger(error.status) ? error.status : 502, {
      ok: false,
      error: 'operator_signal_snapshot_unavailable',
    });
  }
};
