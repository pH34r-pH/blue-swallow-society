'use strict';

const crypto = require('node:crypto');
const { promisify } = require('node:util');
const scrypt = promisify(crypto.scrypt);
const COOKIE = '__Host-bss_viewer_session';
const IDLE_SECONDS = 900;
const ABSOLUTE_SECONDS = 28800;
const TYPE = 'bss.viewer.v1';
const KDF = Object.freeze({ N: 131072, r: 8, p: 1, maxmem: 160 * 1024 * 1024 });
let activeKdfs = 0;

function unavailable() { return Object.assign(new Error('viewer_unavailable'), { status: 503 }); }
function denied() { return Object.assign(new Error('session_expired'), { status: 401 }); }
function readHeader(req, name) {
  if (typeof req?.headers?.get === 'function') return req.headers.get(name) ?? undefined;
  const entries = Object.entries(req?.headers || {}).filter(([key]) => key.toLowerCase() === name.toLowerCase());
  if (entries.length > 1 || (entries.length && typeof entries[0][1] !== 'string')) throw denied();
  return entries[0]?.[1];
}
function header(req, name) { return readHeader(req, name) ?? ''; }
function cookie(req, name = COOKIE) {
  const entries = header(req, 'cookie').split(';').map((value) => value.trim());
  const matches = entries.filter((value) => value.startsWith(`${name}=`));
  if (matches.length > 1) throw denied();
  try { return decodeURIComponent(matches[0]?.slice(name.length + 1) || ''); } catch { throw denied(); }
}
function requestToken(req, cookieName = COOKIE) {
  // An explicit token always wins. Never fall through to a privileged cookie.
  const explicit = readHeader(req, 'x-blue-swallow-operator-token');
  const authorization = readHeader(req, 'authorization');
  const bearer = authorization?.match(/^Bearer ([A-Za-z0-9_.-]+)$/i)?.[1];
  if ((explicit !== undefined && !/^[A-Za-z0-9_.-]+$/.test(explicit))
    || (authorization !== undefined && !bearer) || (explicit && bearer && explicit !== bearer)) throw denied();
  return explicit ?? bearer ?? cookie(req, cookieName);
}
function verifier(value) {
  const match = typeof value === 'string' && /^scrypt\$131072\$8\$1\$([a-f0-9]{32})\$([a-f0-9]{64})$/.exec(value);
  if (!match) throw unavailable();
  return { salt: Buffer.from(match[1], 'hex'), digest: Buffer.from(match[2], 'hex') };
}
function sessionKey(value) {
  if (!/^[A-Za-z0-9_-]{43}$/.test(value) || Buffer.from(value, 'base64url').length !== 32
    || Buffer.from(value, 'base64url').toString('base64url') !== value) throw unavailable();
  return Buffer.from(value, 'base64url');
}
function config(env = process.env) {
  if (env.BLUE_SWALLOW_AUTH_MODE !== 'password') throw unavailable();
  const password = verifier(env.BLUE_SWALLOW_VIEWER_PASSWORD_SCRYPT);
  const keyText = env.BLUE_SWALLOW_VIEWER_SESSION_KEY || '';
  const epoch = env.BLUE_SWALLOW_VIEWER_SESSION_EPOCH || '';
  const originText = env.BLUE_SWALLOW_PUBLIC_ORIGIN || '';
  const group = env.BSS_WARDRIVER_SYNC_GROUP_ID || '';
  let origin;
  try { origin = new URL(originText); } catch { throw unavailable(); }
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(epoch) || origin.protocol !== 'https:' || origin.origin !== originText
    || (group && !/^[A-Za-z0-9_-]{1,64}$/.test(group))) throw unavailable();
  const key = sessionKey(keyText);
  const generation = crypto.createHmac('sha256', key).update(JSON.stringify([
    TYPE, env.BLUE_SWALLOW_VIEWER_PASSWORD_SCRYPT, epoch, originText, group,
  ])).digest('base64url');
  return { password, key, generation, origin: originText, group };
}
async function verifyPassword(value, settings) {
  if (typeof value !== 'string' || !value || Buffer.byteLength(value) > 1024) return false;
  if (activeKdfs >= 2) throw unavailable();
  activeKdfs++;
  try {
    const actual = await scrypt(value, settings.password.salt, 32, KDF);
    return crypto.timingSafeEqual(actual, settings.password.digest);
  } finally { activeKdfs--; }
}
async function encodePassword(value) {
  if (typeof value !== 'string' || Buffer.byteLength(value) < 12 || Buffer.byteLength(value) > 1024) throw new Error('password_length');
  const salt = crypto.randomBytes(16);
  const digest = await scrypt(value, salt, 32, KDF);
  return `scrypt$131072$8$1$${salt.toString('hex')}$${digest.toString('hex')}`;
}
function signature(encoded, settings) {
  return crypto.createHmac('sha256', settings.key).update(`${TYPE}:${encoded}`).digest('base64url');
}
function signSession(record, settings, now = Date.now()) {
  const seconds = Math.floor(now / 1000);
  const exp = Math.min(seconds + IDLE_SECONDS, Math.floor(Date.parse(record.expiresAt) / 1000),
    Math.floor(Date.parse(record.idleExpiresAt) / 1000));
  if (exp <= seconds) throw denied();
  const claims = { typ: TYPE, sid: record.sid, generation: settings.generation,
    group: settings.group, iat: seconds, exp };
  const encoded = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return { token: `${encoded}.${signature(encoded, settings)}`, expiresAt: new Date(exp * 1000).toISOString(),
    absoluteExpiresAt: record.expiresAt, ttlSeconds: exp - seconds, role: 'viewer' };
}
function authenticatedClaims(raw, settings) {
  if (typeof raw !== 'string' || raw.length > 2048) throw denied();
  const [encoded, signed, extra] = raw.split('.');
  if (!/^[A-Za-z0-9_-]+$/.test(encoded) || !/^[A-Za-z0-9_-]{43}$/.test(signed) || extra !== undefined) throw denied();
  const expected = Buffer.from(signature(encoded, settings));
  if (!crypto.timingSafeEqual(expected, Buffer.from(signed))) throw denied();
  let claims;
  try { claims = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')); } catch { throw denied(); }
  if (claims?.typ !== TYPE || claims.generation !== settings.generation || claims.group !== settings.group
    || !/^[a-f0-9]{64}$/.test(claims.sid)) throw denied();
  return claims;
}
function verifyToken(raw, settings, now = Date.now()) {
  const claims = authenticatedClaims(raw, settings);
  const seconds = Math.floor(now / 1000);
  if (!Number.isSafeInteger(claims.iat) || !Number.isSafeInteger(claims.exp) || claims.iat > seconds
    || claims.exp <= seconds || claims.exp <= claims.iat || claims.exp - claims.iat > IDLE_SECONDS) throw denied();
  return claims;
}
function sessionCookie(session) {
  return { name: COOKIE, value: session?.token || '', path: '/', maxAge: session?.ttlSeconds || 0,
    httpOnly: true, secure: true, sameSite: 'Strict' };
}
function sameOrigin(req, settings) { return header(req, 'origin') === settings.origin; }

module.exports = { COOKIE, IDLE_SECONDS, ABSOLUTE_SECONDS, TYPE, config, verifier, encodePassword,
  verifyPassword, signSession, verifyToken, requestToken, cookie, header, sessionCookie, sameOrigin, unavailable, denied };
