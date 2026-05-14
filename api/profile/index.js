module.exports = async function (context, req) {
  const principal = req?.headers?.['x-ms-client-principal'];
  if (!principal) {
    context.res = { status: 401, body: { message: 'Not authenticated.' } };
    return;
  }
  let decoded = null;
  try {
    decoded = JSON.parse(Buffer.from(principal, 'base64').toString('utf8'));
  } catch (error) {
    context.res = { status: 400, body: { message: 'Failed to decode principal.', error: error.message } };
    return;
  }
  context.res = {
    headers: { 'Content-Type': 'application/json' },
    body: {
      ok: true,
      provider: decoded.identityProvider ?? null,
      userId: decoded.userId ?? null,
      userDetails: decoded.userDetails ?? null,
      userRoles: decoded.userRoles ?? []
    }
  };
};
