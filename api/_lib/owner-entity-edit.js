const crypto = require('node:crypto');
const owner = require('../shared/owner-session.cjs');
const login = require('./owner-login');
const cache = require('./owner-api-token-cache');
const { verifyApiAccessToken } = require('./api-access-token');
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };
const json = (status, body) => ({ status, headers: { ...headers, 'Content-Type': 'application/json' }, body });
function sessionFor(req, config, now) {
  return owner.verifyOwnerSession(owner.cookieValue(req.headers?.cookie), { config, now });
}
async function beginEdit(req, config, clientFactory, now) {
  const session = sessionFor(req, config, now);
  if (!session.ok) return json(session.status, { ok: false, error: session.error });
  if (req.method === 'GET') return json(200, { ok: true, configured: !!config.apiClientId, editing: cache.status(session.rawToken, now).editing });
  if (req.method !== 'POST') return json(405, { ok: false, error: 'method_not_allowed' });
  if (req.headers?.origin !== config.origin) return json(403, { ok: false, error: 'owner_denied' });
  if (!config.apiClientId || !cache.status(session.rawToken, now).active) return json(503, { ok: false, error: 'editing_unavailable' });
  cache.downgrade(session.rawToken);
  const transaction = { ...login.newTransaction('/operator/entities', config, now), purpose: 'entity-edit', ownerSession: session.rawToken };
  const url = await clientFactory(config).getAuthCodeUrl({ scopes: login.loginScopes(config, true), redirectUri: config.redirectUri,
    state: transaction.state, nonce: transaction.nonce, responseMode: 'query',
    codeChallenge: crypto.createHash('sha256').update(transaction.verifier).digest('base64url'), codeChallengeMethod: 'S256' });
  return { ...json(200, { ok: true, authorizationUrl: url }), cookies: [login.transactionCookieOptions(login.sealTransaction(transaction, config))] };
}
function finishFailure(transaction, config, now, error = 'denied') {
  const session = owner.verifyOwnerSession(transaction.ownerSession, { config, now });
  cache.downgrade(transaction.ownerSession);
  const remaining = session.ok && cache.status(transaction.ownerSession, now).active;
  const original = remaining ? { token: session.rawToken, ttlSeconds: Math.max(0, session.token.exp - Math.floor(now / 1000)) } : undefined;
  return { status: 302, headers: { ...headers, Location: remaining ? `/operator/entities?editing=${error}` : '/?auth=expired' },
    cookies: [login.transactionCookieOptions(), owner.sessionCookieOptions(original)], body: '' };
}
async function completeEdit(req, transaction, config, { clientFactory, verify, now, verifyApi = verifyApiAccessToken }) {
  const valid = owner.verifyOwnerSession(transaction.ownerSession, { config, now: now() });
  if (!valid.ok || !cache.status(transaction.ownerSession, now()).active) return finishFailure(transaction, config, now(), 'expired');
  if (req.query?.error || typeof req.query?.code !== 'string' || !req.query.code) return finishFailure(transaction, config, now());
  try {
    const client = clientFactory(config);
    const result = await client.acquireTokenByCode({ code: req.query.code, codeVerifier: transaction.verifier,
      scopes: login.loginScopes(config, true), redirectUri: config.redirectUri });
    const claims = await verify(result.idToken, config, transaction.nonce, { now: now() });
    await verifyApi(result.accessToken, 'Owner.Read');
    await verifyApi(result.accessToken, 'Entities.Write');
    if (!owner.verifyOwnerSession(transaction.ownerSession, { config, now: now() }).ok || !cache.status(transaction.ownerSession, now()).active) throw new Error();
    const session = owner.createOwnerSession(claims, config, now());
    cache.store(session, client, result.account, login.apiScopes(config, true), now());
    cache.forget(transaction.ownerSession);
    return { status: 302, headers: { ...headers, Location: '/operator/entities?editing=enabled' },
      cookies: [login.transactionCookieOptions(), owner.sessionCookieOptions(session)], body: '' };
  } catch { return finishFailure(transaction, config, now()); }
}
module.exports = { beginEdit, completeEdit };
