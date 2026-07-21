const { requireOperatorToken } = require('../_lib/operator-auth');

const PATH_RE = /^(?:[a-z0-9][a-z0-9-]{2,120}(?:\/artifacts\/[a-z0-9][a-z0-9-]{1,120})?)?$/;

module.exports = async function morningBriefProxy(context, req) {
  const auth = requireOperatorToken(context, req);
  if (!auth.ok) return;
  const method = String(req?.method || 'GET').toUpperCase();
  if (!['GET', 'HEAD'].includes(method)) {
    context.res = json(405, { ok: false, error: 'method_not_allowed' }, { allow: 'GET, HEAD' });
    return;
  }
  try {
    const path = normalizePath(req?.params?.path);
    const response = await fetch(backendUrl(path), {
      method,
      headers: {
        accept: 'application/json, text/html, image/png',
        'x-blue-swallow-morning-brief-token': configuredToken(),
      },
      signal: AbortSignal.timeout(15_000),
    });
    const headers = {
      'Content-Type': response.headers.get('content-type') || 'application/octet-stream',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    };
    const upstreamHash = response.headers.get('x-blue-swallow-artifact-sha256');
    if (upstreamHash) headers['X-Blue-Swallow-Artifact-SHA256'] = upstreamHash;
    const upstreamLength = response.headers.get('content-length');
    if (/^\d{1,12}$/.test(upstreamLength || '')) headers['Content-Length'] = upstreamLength;
    if (method === 'HEAD') {
      context.res = { status: response.status, headers };
      return;
    }
    const contentType = headers['Content-Type'].toLowerCase();
    if (contentType.includes('application/json')) {
      let payload;
      try { payload = await response.json(); } catch { payload = { ok: false, error: 'invalid_backend_payload' }; }
      context.res = { status: response.status, headers, body: payload };
      return;
    }
    context.res = { status: response.status, headers, isRaw: true, body: Buffer.from(await response.arrayBuffer()) };
  } catch (error) {
    context.log.error(`Morning-brief proxy failed: ${error.message}`);
    context.res = json(Number.isFinite(error.status) ? error.status : 502, { ok: false, error: 'morning_brief_unavailable' });
  }
};

function normalizePath(value) {
  const path = String(value || '').replace(/^\/+|\/+$/g, '');
  if (!PATH_RE.test(path)) {
    const error = new Error('Invalid morning-brief path.');
    error.status = 404;
    throw error;
  }
  return path;
}

function configuredToken() {
  const token = String(process.env.BSS_MORNING_BRIEF_TOKEN || '').trim();
  if (!/^[A-Za-z0-9._~-]{32,256}$/.test(token)) {
    const error = new Error('Morning-brief backend authentication is unavailable.');
    error.status = 503;
    throw error;
  }
  return token;
}

function backendUrl(path) {
  const base = String(process.env.BACKEND_MORNING_BRIEF_BASE_URL || process.env.BACKEND_CYBERMAP_BASE_URL || '').trim();
  if (!base) {
    const error = new Error('Morning-brief backend is unavailable.');
    error.status = 503;
    throw error;
  }
  const url = new URL(`api/v1/morning-briefs${path ? `/${path}` : ''}`, base.endsWith('/') ? base : `${base}/`);
  if (url.protocol !== 'https:') {
    const error = new Error('Morning-brief backend must use HTTPS.');
    error.status = 503;
    throw error;
  }
  return url;
}

function json(status, body, headers = {}) {
  return {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store', ...headers },
    body,
  };
}

module.exports._internals = { normalizePath, backendUrl, configuredToken };
