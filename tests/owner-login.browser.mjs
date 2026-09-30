import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const { SignJWT, createLocalJWKSet, exportJWK } = await import(require.resolve('jose'));
const { createOwnerAuthHandler } = require('./owner-auth');
const { loginConfig } = require('./_lib/owner-login');
const { verifyIdToken } = require('./_lib/owner-id-token');
const shell = require('./operator-shell');
const assets = require('./operator-assets');
const logout = require('./operator-logout');
const { requireOperatorToken } = require('./_lib/operator-auth');

Object.assign(process.env, { BLUE_SWALLOW_AUTH_MODE: 'entra', BLUE_SWALLOW_ENTRA_TENANT_ID: '11111111-1111-1111-1111-111111111111',
  BLUE_SWALLOW_ENTRA_CLIENT_ID: '22222222-2222-2222-2222-222222222222', BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID: '33333333-3333-3333-3333-333333333333',
  BLUE_SWALLOW_OWNER_SESSION_KEY: 'test-browser-owner-session-key-at-least-thirty-two-bytes', BLUE_SWALLOW_PUBLIC_ORIGIN: 'https://owner.example.test', BLUE_SWALLOW_ENTRA_CLIENT_SECRET: 'test-only-client-secret' });
const config = loginConfig();
const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = await exportJWK(pair.publicKey);
jwk.kid = 'test';
const keySet = createLocalJWKSet({ keys: [jwk] });
let wrongOwner = false;
const logins = new Map();
const ownerHandler = createOwnerAuthHandler({
  clientFactory: () => ({
    async getAuthCodeUrl(request) { logins.set(request.state, request); return `https://login.microsoftonline.com/${config.tenant}/authorize?state=${request.state}`; },
    async acquireTokenByCode({ code, codeVerifier }) {
      const request = logins.get(code);
      assert.equal(crypto.createHash('sha256').update(codeVerifier).digest('base64url'), request.codeChallenge);
      const now = Math.floor(Date.now() / 1000);
      return { idToken: await new SignJWT({ iss: config.issuer, aud: config.audience, tid: config.tenant,
        oid: wrongOwner ? '44444444-4444-4444-4444-444444444444' : config.owner, iat: now, exp: now + 3600, nonce: request.nonce })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(pair.privateKey) };
    },
  }),
  verify: (token, config, nonce) => verifyIdToken(token, config, nonce, { keySet }),
});

async function serve(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const request = { method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams), params: { action: url.pathname.split('/').at(-1), asset: url.pathname.split('/').at(-1) } };
  const context = {};
  if (url.pathname.startsWith('/api/owner-auth/')) await ownerHandler(context, request);
  else if (url.pathname === '/api/operator-shell') await shell(context, request);
  else if (url.pathname.startsWith('/api/operator-assets/')) await assets(context, request);
  else if (url.pathname === '/api/operator-logout') await logout(context, request);
  else if (url.pathname.startsWith('/api/')) {
    if (requireOperatorToken(context, request).ok) context.res = { status: 503, body: { ok: false } };
  } else {
    const staticPaths = { '/': 'index.html', '/main.js': 'main.js', '/styles.css': 'styles.css', '/operator/loader.js': 'operator/loader.js', '/operator/loader.css': 'operator/loader.css', '/operator/operator-session.mjs': 'operator/operator-session.mjs' };
    const file = staticPaths[url.pathname] || (url.pathname.startsWith('/operator/') ? 'operator/index.html' : null);
    if (!file) context.res = { status: 404, body: '' };
    else context.res = { status: 200, headers: { 'Content-Type': /\.m?js$/.test(file) ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' }, body: await readFile(new URL('../app/' + file, import.meta.url), 'utf8') };
  }
  if (context.res.cookies) context.res.headers['Set-Cookie'] = context.res.cookies.map((cookie) => `${cookie.name}=${cookie.value}; Path=${cookie.path}; Max-Age=${cookie.maxAge}; HttpOnly; Secure; SameSite=${cookie.sameSite}`);
  res.writeHead(context.res.status, context.res.headers || { 'Content-Type': 'application/json' });
  res.end(typeof context.res.body === 'string' ? context.res.body : JSON.stringify(context.res.body));
}

test('Chromium owner login, wrong user, unavailable config, deep-link restoration, expiry and logout', async (t) => {
  const server = createServer((req, res) => serve(req, res).catch(() => { res.writeHead(500); res.end('unavailable'); }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://login.microsoftonline.com/**', (route) => {
    const state = new URL(route.request().url()).searchParams.get('state');
    return route.fulfill({ status: 302, headers: { Location: `${origin}/api/owner-auth/callback?state=${state}&code=${state}` } });
  });
  await page.goto(origin);
  await page.getByText('Sign in with the approved owner account.', { exact: true }).waitFor();
  wrongOwner = true;
  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();
  await page.getByText('This account is not authorized.', { exact: false }).waitFor();
  assert.equal((await page.request.get(origin + '/api/operator-shell')).status(), 401);
  wrongOwner = false;
  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();
  await page.locator('#godeye-tab.active').waitFor();
  await page.getByRole('link', { name: 'Devices / Utilities' }).click();
  await page.reload();
  await page.locator('#devices-tab.active').waitFor();
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await page.getByText('Sign in with the approved owner account.', { exact: true }).waitFor();
  assert.equal((await page.request.get(origin + '/api/operator-shell')).status(), 401);
  await page.clock.install();
  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();
  await page.locator('#godeye-tab.active').waitFor();
  await page.clock.fastForward(300000);
  await page.getByText('Your session expired. Sign in again.', { exact: true }).waitFor();
  await page.route('**/api/owner-auth/session', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'session_expired' }) }));
  await page.goto(origin);
  await page.getByText('Your session expired. Sign in again.', { exact: true }).waitFor();
  await page.unroute('**/api/owner-auth/session');
  delete process.env.BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID;
  await page.goto(origin);
  await page.getByText('Sign-in is unavailable.', { exact: false }).waitFor();
  process.env.BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID = config.owner;
  await page.goto(origin + '/?auth=expired');
  await page.getByText('Your session expired. Sign in again.', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
});
