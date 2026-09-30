const { sessionCookie } = require('../shared/owner-session.cjs');
module.exports = async function operatorLogout(context) {
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
