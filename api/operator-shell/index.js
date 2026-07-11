const fs = require('node:fs');
const path = require('node:path');
const { requireOperatorToken } = require('../_lib/operator-auth');

const SHELL_PATH = path.join(__dirname, '..', '_private', 'operator', 'shell.html');

module.exports = async function (context, req) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) {
    return;
  }

  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: fs.readFileSync(SHELL_PATH, 'utf8'),
  };
};
