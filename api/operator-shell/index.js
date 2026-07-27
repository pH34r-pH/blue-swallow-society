const fs = require('node:fs');
const path = require('node:path');
const { requireOperatorToken } = require('../_lib/operator-auth');

const PRIVATE_OPERATOR_DIR = path.join(__dirname, '..', '_private', 'operator');
const SHELL_PATH = path.join(PRIVATE_OPERATOR_DIR, 'shell.html');

function renderPrivateOperatorShell() {
  return fs.readFileSync(SHELL_PATH, 'utf8');
}

module.exports = async function (context, req) {
  const method = String(req?.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    context.res = {
      status: 405,
      headers: {
        Allow: 'GET',
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
      body: { ok: false, error: 'Method not allowed.' },
    };
    return;
  }

  const auth = requireOperatorToken(context, req);
  if (!auth.ok) {
    return;
  }

  const requestedView = typeof req.query?.view === 'string' ? req.query.view.trim().toLowerCase() : '';
  if (requestedView) {
    context.res = {
      status: 400,
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
      body: { ok: false, error: 'Unsupported private operator view.' },
    };
    return;
  }

  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: renderPrivateOperatorShell(),
  };
};

module.exports.renderPrivateOperatorShell = renderPrivateOperatorShell;
