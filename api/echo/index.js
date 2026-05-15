module.exports = async function (context, req) {
  const base = process.env.BACKEND_ECHO_BASE_URL;

  if (!base) {
    context.res = {
      status: 500,
      body: { ok: false, error: 'Missing BACKEND_ECHO_BASE_URL' }
    };
    return;
  }

  // Strip trailing slash so we always produce `${base}/echo?...`.
  const cleanBase = base.replace(/\/+$/, '');
  const msg = req.query.msg || 'empty';
  const url = `${cleanBase}/echo?msg=${encodeURIComponent(msg)}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);

    const text = await response.text();
    context.res = {
      status: response.status,
      headers: { 'Content-Type': 'application/json' },
      body: text
    };
  } catch (err) {
    context.res = {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
      body: { ok: false, error: `Echo backend failed: ${err.message}` }
    };
  }
};
