const fs = require('node:fs');
const path = require('node:path');
const { requireOperatorToken } = require('../_lib/operator-auth');

const PRIVATE_OPERATOR_DIR = path.join(__dirname, '..', '_private', 'operator');
const SHELL_PATH = path.join(PRIVATE_OPERATOR_DIR, 'shell.html');
const AGENT_PATH = path.join(PRIVATE_OPERATOR_DIR, 'agent.html');
const NACRE_STYLE_PATH = path.join(PRIVATE_OPERATOR_DIR, 'nacre-moire.css');
const NACRE_MARK_PATH = path.join(PRIVATE_OPERATOR_DIR, 'nacre-moire-mark.svg');

function renderPrivateOperatorView(templatePath) {
  const template = fs.readFileSync(templatePath, 'utf8');
  const style = fs.readFileSync(NACRE_STYLE_PATH, 'utf8');
  const mark = fs.readFileSync(NACRE_MARK_PATH, 'utf8');
  const markup = template.replaceAll('{{NACRE_MOIRE_MARK}}', mark);
  return `<style id="nacre-moire-operator-style" data-private-operator-layer>${style}</style>\n${markup}`;
}

module.exports = async function (context, req) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) {
    return;
  }

  const requestedView = typeof req.query?.view === 'string' ? req.query.view.trim().toLowerCase() : '';
  if (requestedView && requestedView !== 'agent') {
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

  const templatePath = requestedView === 'agent' ? AGENT_PATH : SHELL_PATH;
  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
    body: renderPrivateOperatorView(templatePath),
  };
};

module.exports.renderPrivateOperatorView = renderPrivateOperatorView;
