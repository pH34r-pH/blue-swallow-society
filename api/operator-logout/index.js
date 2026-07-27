module.exports = async function operatorLogout(context) {
  context.res = {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
    body: {
      ok: true,
    },
  };
};
