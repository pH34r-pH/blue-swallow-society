const crypto = require('node:crypto');
const { ownerConfig, same } = require('../shared/owner-session.cjs');
const TRANSACTION_COOKIE = '__Host-bss_owner_login';
const TRANSACTION_TTL = 300;

function loginConfig() {
  const config = ownerConfig();
  const origin = new URL(process.env.BLUE_SWALLOW_PUBLIC_ORIGIN || '');
  const clientSecret = process.env.BLUE_SWALLOW_ENTRA_CLIENT_SECRET || '';
  if (origin.protocol !== 'https:' || origin.origin !== process.env.BLUE_SWALLOW_PUBLIC_ORIGIN || !clientSecret) throw new Error('owner_auth_unavailable');
  return { ...config, origin: origin.origin, clientSecret, redirectUri: `${origin.origin}/api/owner-auth/callback` };
}
function msalClient(config) {
  const { ConfidentialClientApplication } = require('@azure/msal-node');
  return new ConfidentialClientApplication({ auth: { clientId: config.audience,
    authority: `https://login.microsoftonline.com/${config.tenant}`, clientSecret: config.clientSecret },
    system: { loggerOptions: { piiLoggingEnabled: false, loggerCallback() {} } } });
}
function transactionKey(config) {
  return crypto.hkdfSync('sha256', Buffer.from(config.key), Buffer.alloc(0), Buffer.from('bss.owner.login.v1'), 32);
}
function sealTransaction(value, config) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', transactionKey(config), iv);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(value)), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64url');
}
function openTransaction(value, state, config, now = Date.now()) {
  if (!value || value.length > 8192 || typeof state !== 'string') throw new Error('owner_denied');
  const data = Buffer.from(value, 'base64url');
  const decipher = crypto.createDecipheriv('aes-256-gcm', transactionKey(config), data.subarray(0, 12));
  decipher.setAuthTag(data.subarray(12, 28));
  const transaction = JSON.parse(Buffer.concat([decipher.update(data.subarray(28)), decipher.final()]).toString('utf8'));
  if (!same(transaction.state, state) || transaction.issuedAt > now || now - transaction.issuedAt >= TRANSACTION_TTL * 1000) throw new Error('owner_denied');
  return transaction;
}
function transactionCookieOptions(value = '') {
  return { name: TRANSACTION_COOKIE, value, path: '/', maxAge: value ? TRANSACTION_TTL : 0, httpOnly: true, secure: true, sameSite: 'Lax' };
}
function transactionCookie(value = '') {
  return `${TRANSACTION_COOKIE}=${value}; Path=/; Max-Age=${value ? TRANSACTION_TTL : 0}; HttpOnly; Secure; SameSite=Lax`;
}
function safeReturnPath(value, origin) {
  const url = new URL(typeof value === 'string' ? value : '/operator/travels', origin);
  if (url.origin !== origin || !/^\/operator\/(travels|entities|world|devices)$/.test(url.pathname) || url.search.length > 2048) return '/operator/travels';
  return url.pathname + url.search;
}
function newTransaction(returnTo, config, now = Date.now()) {
  return { state: crypto.randomBytes(32).toString('base64url'), nonce: crypto.randomBytes(32).toString('base64url'),
    verifier: crypto.randomBytes(32).toString('base64url'), issuedAt: now, returnTo: safeReturnPath(returnTo, config.origin) };
}
module.exports = { loginConfig, msalClient, sealTransaction, openTransaction, transactionCookie, transactionCookieOptions, newTransaction, safeReturnPath, TRANSACTION_COOKIE };
