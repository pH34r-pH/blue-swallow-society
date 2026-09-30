const { requireOperatorToken } = require('../_lib/operator-auth');
module.exports = async function (context, req) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) return;
  context.res = {
    status: 200,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: { ok: true, operatorId: auth.token.operatorId },
  };
};
