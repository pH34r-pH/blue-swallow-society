module.exports = async function (context, req) {
  const base = process.env.BACKEND_ECHO_BASE_URL;

  if (!base) {
    context.res = {
      status: 500,
      body: "Missing BACKEND_ECHO_BASE_URL"
    };
    return;
  }

  const msg = req.query.msg || "empty";
  const url = `${base}/?msg=${encodeURIComponent(msg)}`;

  try {
    const response = await fetch(url);
    const data = await response.text();

    context.res = {
      headers: { "Content-Type": "application/json" },
      body: data
    };
  } catch (err) {
    context.res = {
      status: 500,
      body: `Echo backend failed: ${err.message}`
    };
  }
};
