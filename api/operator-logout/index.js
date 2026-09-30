const apiCache = require('../_lib/owner-api-token-cache');
const { cookieValue, sessionCookie } = require('../shared/owner-session.cjs');
module.exports = async function operatorLogout(context, req) {
  apiCache.forget(cookieValue(req?.headers?.cookie));
  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'Set-Cookie': sessionCookie(),
    },
    body: {
      ok: true,
    },
  };
};
