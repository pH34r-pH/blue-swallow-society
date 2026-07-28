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

module.exports = async function cybermapViewport(context, req) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) return context.res;

  if (hasSensitiveLocationQuery(req)) {
    return sendJson(context, 400, {
      ok: false,
      mode: 'viewport',
      live: false,
      message: 'Cybermap location coordinates must be sent in the POST body, not the URL query string.',
    });
  }

  try {
    const payload = await postCybermapJson('api/v1/cybermap/viewport', buildViewportPayload(req));
    return sendJson(context, 200, payload);
  } catch (error) {
    const status = Number.isFinite(error.status) ? error.status : 502;
    context?.log?.error?.('Cybermap viewport API error', error);
    return sendJson(context, status, {
      ok: false,
      mode: 'viewport',
      live: false,
      message: error.message || 'Cybermap viewport request failed.',
    });
  }
};
