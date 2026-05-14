const { URL } = require('url');

module.exports = async function (context, req) {
  const baseUrl = process.env.BACKEND_ECHO_BASE_URL;
  const msg = (req.query && req.query.msg) || 'hello';

  if (!baseUrl) {
    context.res = {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: 'BACKEND_ECHO_BASE_URL is not set.' }
    };
    return;
  }

  const target = new URL('/echo', baseUrl);
  target.searchParams.set('msg', msg);

  try {
    const response = await fetch(target.toString(), { method: 'GET', headers: { 'Accept': 'application/json' } });
    const text = await response.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { parsed = { raw: text }; }
    context.res = {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: response.ok, proxiedTo: target.toString(), backendResponse: parsed }
    };
  } catch (error) {
    context.res = {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: 'Failed to reach backend echo service.', detail: error.message, proxiedTo: target.toString() }
    };
  }
};
