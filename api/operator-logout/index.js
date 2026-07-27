const { buildClearOperatorSessionCookieOptions } = require('../_lib/operator-auth');

module.exports = async function (context) {
  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    cookies: [buildClearOperatorSessionCookieOptions()],
    body: {
      ok: true,
    },
  };
};
