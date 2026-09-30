const { requireOperatorToken } = require('./operator-auth');
const apiCache = require('./owner-api-token-cache');
const { bearerToken, requireApiAccessToken, verifyApiAccessToken } = require('./api-access-token');
// Transitional sessions authorize reads only. Mutations call requireApiAccessToken directly.
async function requireOwnerRead(context, req) {
  const token = bearerToken(req);
  if (token.split('.').length === 3) {
    const principal = await requireApiAccessToken(context, req, 'Owner.Read');
    return principal ? { ok: true, principal, apiAccessToken: token } : { ok: false };
  }
  const auth = requireOperatorToken(context, req);
  if (!auth.ok || !process.env.BLUE_SWALLOW_ENTRA_API_CLIENT_ID) return auth;
  try {
    const apiAccessToken = await apiCache.acquire(auth.rawToken);
    const principal = await verifyApiAccessToken(apiAccessToken, 'Owner.Read');
    return { ...auth, principal, apiAccessToken };
  } catch (error) {
    context.res = { status: error.status || 503, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }, body: { ok: false, error: error.code || 'session_expired' } };
    return { ok: false };
  }
}
module.exports = { requireOwnerRead };
