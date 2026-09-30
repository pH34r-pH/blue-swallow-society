const crypto = require('node:crypto');
const COOKIE = '__Host-bss_owner_session';
const TTL_MS = 300_000;
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function authMode() { return process.env.BLUE_SWALLOW_AUTH_MODE || 'entra'; }
function ownerConfig() {
  const tenant = process.env.BLUE_SWALLOW_ENTRA_TENANT_ID || '';
  const audience = process.env.BLUE_SWALLOW_ENTRA_CLIENT_ID || '';
  const owner = process.env.BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID || '';
  const key = process.env.BLUE_SWALLOW_OWNER_SESSION_KEY || '';
  if (![tenant, audience, owner].every((value) => GUID.test(value)) || Buffer.byteLength(key) < 32) {
    throw new Error('owner_auth_unavailable');
  }
  return { tenant, audience, owner, key, issuer: `https://login.microsoftonline.com/${tenant}/v2.0` };
}
function same(left, right) {
  const a = Buffer.from(String(left)); const b = Buffer.from(String(right));
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
function ownerClaims(claims, config) {
  return claims?.iss === config.issuer && claims.aud === config.audience
    && claims.tid === config.tenant && claims.oid === config.owner;
}
function signature(payload, config) {
  return crypto.createHmac('sha256', config.key).update(`bss.owner.v1:${payload}`).digest('base64url');
}
function createOwnerSession(claims, config = ownerConfig(), now = Date.now()) {
  if (!ownerClaims(claims, config) || !Number.isFinite(claims.exp) || claims.exp * 1000 <= now) throw new Error('owner_denied');
  const exp = Math.min(claims.exp, Math.floor((now + TTL_MS) / 1000));
  const payload = { v: 'bss.owner.v1', iss: claims.iss, aud: claims.aud, tid: claims.tid, oid: claims.oid,
    iat: Math.floor(now / 1000), exp, nonce: crypto.randomBytes(16).toString('hex') };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return { token: `${encoded}.${signature(encoded, config)}`, expiresAt: new Date(exp * 1000).toISOString(), ttlSeconds: exp - payload.iat };
}
function verifyOwnerSession(rawToken, { now = Date.now(), config } = {}) {
  try { config ||= ownerConfig(); } catch { return { ok: false, status: 503, error: 'owner_auth_unavailable' }; }
  if (typeof rawToken !== 'string' || !rawToken || rawToken.length > 8192) return { ok: false, status: 401, error: 'signed_out' };
  try {
    const [encoded, signed, extra] = rawToken.split('.');
    if (extra !== undefined || !same(signature(encoded, config), signed)) throw new Error();
    const token = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
    if (token.v !== 'bss.owner.v1' || !ownerClaims(token, config)) throw new Error();
    if (!validSessionTime(token, now)) throw new Error();
    if (token.exp * 1000 <= now) return { ok: false, status: 401, error: 'session_expired' };
    return { ok: true, rawToken, token: { ...token, operatorId: `${token.tid}:${token.oid}` } };
  } catch { return { ok: false, status: 403, error: 'owner_denied' }; }
}
function validSessionTime(token, now) {
  return Number.isFinite(token.iat) && Number.isFinite(token.exp) && token.iat * 1000 <= now
    && token.exp > token.iat && (token.exp - token.iat) * 1000 <= TTL_MS;
}
function cookieValue(header, name = COOKIE) {
  for (const part of String(header || '').split(';')) {
    const at = part.indexOf('=');
    if (part.slice(0, at).trim() === name) return part.slice(at + 1).trim();
  }
  return '';
}
function sessionCookie(session) {
  return `${COOKIE}=${session?.token || ''}; Path=/; Max-Age=${session?.ttlSeconds || 0}; HttpOnly; Secure; SameSite=Strict`;
}
module.exports = { authMode, ownerConfig, ownerClaims, createOwnerSession, verifyOwnerSession, cookieValue, sessionCookie, same, COOKIE, TTL_MS };
