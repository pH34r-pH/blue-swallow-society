const { requireOperatorToken } = require('../_lib/operator-auth');

const BACKEND_PATH = 'api/v1/cybermap/global-viewport';
const REQUEST_TIMEOUT_MS = 5_000;

function sendJson(context, status, body, headers = {}) {
  context.res = {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
    body,
  };
  return context.res;
}

function unavailable(context) {
  return sendJson(context, 503, {
    ok: false,
    error: 'global_viewport_unavailable',
  });
}

function backendUrl() {
  const base = String(process.env.BACKEND_CYBERMAP_BASE_URL || '').trim();
  if (!base) throw new Error('backend_unavailable');

  const root = base.endsWith('/') ? base : `${base}/`;
  const url = new URL(BACKEND_PATH, root);
  if (url.protocol !== 'https:') throw new Error('backend_unavailable');
  return url;
}

function requestBody(req) {
  if (typeof req?.rawBody === 'string') return req.rawBody;
  if (typeof req?.body === 'string') return req.body;
  if (req?.body && typeof req.body === 'object') return JSON.stringify(req.body);
  return undefined;
}

async function fetchGlobalViewport(url, body) {
  const readToken = String(process.env.BSS_CYBERMAP_READ_TOKEN || '').trim();
  if (!readToken) throw new Error('backend_unavailable');

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'x-blue-swallow-cybermap-read-token': readToken,
      },
      body,
    });
    if (!response.ok) throw new Error('backend_unavailable');
    return JSON.parse(await response.text());
  } finally {
    clearTimeout(timeout);
  }
}

module.exports = async function cybermapGlobalViewport(context, req) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) return context.res;

  if (req?.method && req.method.toUpperCase() !== 'POST') {
    return sendJson(context, 405, { ok: false, error: 'post_required' }, { allow: 'POST' });
  }

  try {
    const payload = await fetchGlobalViewport(backendUrl(), requestBody(req));
    return sendJson(context, 200, payload);
  } catch {
    context?.log?.error?.('Cybermap global viewport API unavailable.');
    return unavailable(context);
  }
};
