const { bearerToken, requireApiAccessToken } = require('./api-access-token');
const { requireOperatorToken } = require('./operator-auth');
const cache = require('./owner-api-token-cache');

// Both direct API bearers and Web sessions ultimately require the canonical scoped API token.
function createEntityOwnerGuard({ apiGuard = requireApiAccessToken, sessionGuard = requireOperatorToken, acquire = cache.acquire } = {}) {
return async function requireEntityOwner(context, req, scope) {
  const direct = bearerToken(req);
  if (direct.split('.').length === 3) {
    const principal = await apiGuard(context, req, scope);
    return principal ? { principal, apiAccessToken: direct } : null;
  }
  const session = sessionGuard(context, req);
  if (!session.ok) return null;
  if (!session.token?.tid || !session.token?.oid) {
    context.res = denial(403, 'api_owner_denied'); return null;
  }
  let token;
  try { token = await acquire(session.rawToken, Date.now(), scope); }
  catch (error) { context.res = denial(error.status === 403 ? 403 : 401, error.status === 403 ? 'api_scope_denied' : 'session_expired'); return null; }
  const principal = await apiGuard(context, { ...req, headers: { authorization: `Bearer ${token}` } }, scope);
  return principal ? { principal, apiAccessToken: token } : null;
};
}
const requireEntityOwner = createEntityOwnerGuard();
function denial(status, error) {
  return { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' }, body: { ok: false, error } };
}
module.exports = { requireEntityOwner, createEntityOwnerGuard };
