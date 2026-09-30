const crypto = require('node:crypto');
const { authMode, createOwnerSession, verifyOwnerSession, cookieValue, sessionCookieOptions } = require('../shared/owner-session.cjs');
const login = require('../_lib/owner-login');
const { verifyIdToken } = require('../_lib/owner-id-token');
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer', 'X-Content-Type-Options': 'nosniff' };

function json(status, body) { return { status, headers: { ...headers, 'Content-Type': 'application/json' }, body }; }
function redirect(location, cookies) { return { status: 302, headers: { ...headers, Location: location }, cookies, body: '' }; }
function failedLogin(reason) { return redirect(`/?auth=${reason}`, [login.transactionCookieOptions(), sessionCookieOptions()]); }
function readSession(req, now) {
  const result = verifyOwnerSession(cookieValue(req.headers?.cookie), { now });
  return result.ok ? json(200, { ok: true, operatorSession: { token: result.rawToken, expiresAt: new Date(result.token.exp * 1000).toISOString() } })
    : json(result.status, { ok: false, error: result.error });
}
async function beginLogin(req, config, clientFactory, now) {
  const transaction = login.newTransaction(req.query?.returnTo, config, now);
  const url = await clientFactory(config).getAuthCodeUrl({ scopes: ['openid', 'profile'], redirectUri: config.redirectUri,
    state: transaction.state, nonce: transaction.nonce, prompt: 'select_account', responseMode: 'query',
    codeChallenge: crypto.createHash('sha256').update(transaction.verifier).digest('base64url'), codeChallengeMethod: 'S256' });
  const cookie = login.transactionCookie(login.sealTransaction(transaction, config));
  return req.headers?.accept === 'application/json'
    ? { ...json(200, { ok: true, authorizationUrl: url }), headers: { ...headers, 'Content-Type': 'application/json', 'Set-Cookie': cookie } }
    : redirect(url, [login.transactionCookieOptions(login.sealTransaction(transaction, config))]);
}
async function completeLogin(req, config, { clientFactory, verify, now }) {
  let transaction;
  try {
    transaction = login.openTransaction(cookieValue(req.headers?.cookie, login.TRANSACTION_COOKIE), req.query?.state, config, now());
    if (typeof req.query?.code !== 'string' || !req.query.code || req.query.error) throw new Error();
  } catch { return failedLogin('denied'); }
  let result;
  try {
    result = await clientFactory(config).acquireTokenByCode({ code: req.query.code, codeVerifier: transaction.verifier,
      scopes: ['openid', 'profile'], redirectUri: config.redirectUri });
  } catch { return failedLogin('unavailable'); }
  try {
    const claims = await verify(result.idToken, config, transaction.nonce, { now: now() });
    const session = createOwnerSession(claims, config, now());
    return redirect(transaction.returnTo, [login.transactionCookieOptions(), sessionCookieOptions(session)]);
  } catch (error) {
    return failedLogin(['ERR_JWKS_TIMEOUT', 'ERR_JOSE_GENERIC', 'ENOTFOUND', 'ECONNRESET'].includes(error.code) ? 'unavailable' : 'denied');
  }
}
function createOwnerAuthHandler({ getConfig = login.loginConfig, clientFactory = login.msalClient, verify = verifyIdToken, now = Date.now } = {}) {
  return async function ownerAuth(context, req) {
    if (req.method && req.method !== 'GET') { context.res = json(405, { ok: false, error: 'method_not_allowed' }); return; }
    if (authMode() !== 'entra') { context.res = json(503, { ok: false, error: 'owner_auth_unavailable' }); return; }
    const action = req.params?.action;
    if (action === 'logout') { context.res = failedLogin('signed-out'); return; }
    if (action === 'session') { context.res = readSession(req, now()); return; }
    try {
      const config = getConfig();
      if (action === 'login') context.res = await beginLogin(req, config, clientFactory, now());
      else if (action === 'callback') context.res = await completeLogin(req, config, { clientFactory, verify, now });
      else context.res = json(404, { ok: false, error: 'not_found' });
    } catch { context.res = json(503, { ok: false, error: 'owner_auth_unavailable' }); }
  };
}
module.exports = createOwnerAuthHandler();
module.exports.createOwnerAuthHandler = createOwnerAuthHandler;
