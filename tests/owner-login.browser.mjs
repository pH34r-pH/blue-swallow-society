import { pathToFileURL } from 'node:url';
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const { SignJWT, createLocalJWKSet, exportJWK } = await import(pathToFileURL(require.resolve('jose')).href);
const { createOwnerAuthHandler } = require('./owner-auth');
const { loginConfig } = require('./_lib/owner-login');
const { createApiTokenValidator } = require('./_lib/api-access-token');
const { verifyIdToken } = require('./_lib/owner-id-token');
const shell = require('./operator-shell');
const assets = require('./operator-assets');
const logout = require('./operator-logout');
const journal = require('./bird-journal');
const { createHandler: createBirdPreview } = require('./bird-import-preview');
const { createHandler: createBirdCommit } = require('./bird-import-commit');
const { previewBirdExport } = require('./_lib/bird-export-preview');
const { requireOperatorToken } = require('./_lib/operator-auth');

Object.assign(process.env, { BLUE_SWALLOW_AUTH_MODE: 'entra', BLUE_SWALLOW_ENTRA_TENANT_ID: '11111111-1111-1111-1111-111111111111',
  BLUE_SWALLOW_ENTRA_CLIENT_ID: '22222222-2222-2222-2222-222222222222', BLUE_SWALLOW_ENTRA_API_CLIENT_ID: '55555555-5555-5555-5555-555555555555', BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID: '33333333-3333-3333-3333-333333333333',
  BLUE_SWALLOW_OWNER_SESSION_KEY: 'test-browser-owner-session-key-at-least-thirty-two-bytes', BLUE_SWALLOW_PUBLIC_ORIGIN: 'https://owner.example.test', BLUE_SWALLOW_ENTRA_CLIENT_SECRET: 'test-only-client-secret' });
const config = loginConfig();
const pair = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = await exportJWK(pair.publicKey);
jwk.kid = 'test';
const keySet = createLocalJWKSet({ keys: [jwk] });
let wrongOwner = false, cancelEdit = false, runtimeOrigin, birdSnapshot = null, birdEtag = null;
const birdStore = { async read() { return { snapshot: structuredClone(birdSnapshot), etag: birdEtag }; },
  async write(next, expected) {
    if (expected.etag !== birdEtag || expected.revision !== birdSnapshot.revision) throw new Error('bird_snapshot_conflict');
    birdSnapshot = structuredClone(next); birdEtag = `synthetic-${next.revision}`; return { revision: next.revision };
  } };
const logins = new Map();
const ownerHandler = createOwnerAuthHandler({
  getConfig: () => ({ ...loginConfig(), origin: runtimeOrigin || config.origin, redirectUri: `${runtimeOrigin || config.origin}/api/owner-auth/callback` }),
  verifyApi: createApiTokenValidator({ keySet, loadJose: () => import(pathToFileURL(require.resolve('jose')).href) }),
  clientFactory: () => { let apiToken; return ({
    async getAuthCodeUrl(request) { logins.set(request.state, request); return `https://login.microsoftonline.com/${config.tenant}/authorize?state=${request.state}`; },
    async acquireTokenByCode({ code, codeVerifier }) {
      const request = logins.get(code);
      assert.equal(crypto.createHash('sha256').update(codeVerifier).digest('base64url'), request.codeChallenge);
      const now = Math.floor(Date.now() / 1000);
      apiToken = await new SignJWT({ iss: config.issuer, aud: config.apiClientId, tid: config.tenant, oid: config.owner, ver: '2.0', iat: now, nbf: now, exp: now + 3600,
        scp: request.scopes.some((scope) => scope.endsWith('/Entities.Write')) ? 'Owner.Read Entities.Write' : 'Owner.Read' }).setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(pair.privateKey);
      return { accessToken: apiToken, account: { homeAccountId: 'synthetic' }, idToken: await new SignJWT({ iss: config.issuer, aud: config.audience, tid: config.tenant,
        oid: wrongOwner ? '44444444-4444-4444-4444-444444444444' : config.owner, iat: now, exp: now + 3600, nonce: request.nonce })
        .setProtectedHeader({ alg: 'RS256', kid: 'test' }).sign(pair.privateKey) };
    }, async acquireTokenSilent() { return { accessToken: apiToken }; },
  }); },
  verify: (token, config, nonce) => verifyIdToken(token, config, nonce, { keySet }),
});

async function serve(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const request = { method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams), params: { action: url.pathname.split('/').at(-1), asset: url.pathname.split('/').at(-1) } };
  const context = {};
  if (['/api/bird-import-preview', '/api/bird-import-commit'].includes(url.pathname)) {
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    request.rawBody = Buffer.concat(chunks).toString('utf8');
  }
  if (url.pathname.startsWith('/api/owner-auth/')) await ownerHandler(context, request);
  else if (url.pathname === '/api/operator-shell') await shell(context, request);
  else if (url.pathname.startsWith('/api/operator-assets/')) await assets(context, request);
  else if (url.pathname === '/api/bird-journal') await journal(context, request);
  else if (url.pathname === '/api/bird-import-preview') await createBirdPreview({
    env: { BLUE_SWALLOW_PUBLIC_ORIGIN: runtimeOrigin, BSS_BIRD_HISTORY_ENABLED: birdSnapshot ? 'true' : 'false' },
    createStore: () => birdStore })(context, request);
  else if (url.pathname === '/api/bird-import-commit') await createBirdCommit({
    env: { BLUE_SWALLOW_PUBLIC_ORIGIN: runtimeOrigin, BSS_BIRD_HISTORY_ENABLED: 'true' }, createStore: () => birdStore })(context, request);
  else if (url.pathname === '/api/operator-logout') await logout(context, request);
  else if (url.pathname.startsWith('/api/')) {
    if (requireOperatorToken(context, request).ok) context.res = { status: 503, body: { ok: false } };
  } else {
    const staticPaths = { '/': 'index.html', '/owner': 'owner/index.html', '/owner/birds': 'owner/birds.html', '/owner/birds.mjs': 'owner/birds.mjs', '/owner/main.js': 'owner/main.js', '/owner/login.css': 'owner/login.css', '/journal.css': 'journal.css', '/journal-view.mjs': 'journal-view.mjs', '/companion-loader.mjs': 'companion-loader.mjs', '/main.js': 'main.js', '/styles.css': 'styles.css', '/operator/loader.js': 'operator/loader.js', '/operator/loader.css': 'operator/loader.css', '/operator/operator-session.mjs': 'operator/operator-session.mjs' };
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
  runtimeOrigin = origin;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.route('https://login.microsoftonline.com/**', (route) => {
    const state = new URL(route.request().url()).searchParams.get('state');
    return route.fulfill({ status: 302, headers: { Location: `${origin}/api/owner-auth/callback?state=${state}&${cancelEdit ? 'error=access_denied' : `code=${state}`}` } });
  });
  await page.goto(origin + '/owner/birds');
  await page.waitForURL('**/owner?auth=expired&returnTo=%2Fowner%2Fbirds');
  assert.equal(await page.locator('#birdWorkspace').count(), 0);
  await page.goto(origin + '/owner');
  await page.getByText('Sign in with the approved owner account.', { exact: true }).waitFor();
  wrongOwner = true;
  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();
  await page.getByText('This account is not authorized.', { exact: false }).waitFor();
  assert.equal((await page.request.get(origin + '/api/operator-shell')).status(), 401);
  wrongOwner = false;
  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();
  await page.locator('#godeye-tab.active').waitFor();
  await page.goto(origin + '/owner/birds');
  await page.getByText('Owner session active.', { exact: false }).waitFor();
  await page.getByLabel('Personal CSV export (up to 10 MiB)').setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv',
    buffer: Buffer.from('Submission ID,Common Name,Scientific Name,Count,Date,Location\nS1,<img src=x>,Test avis,X,2026-01-02,Private place\n') });
  await page.getByRole('button', { name: 'Preview export' }).click();
  await page.getByText('Preview ready.', { exact: false }).waitFor();
  await page.getByText('Comparison is unavailable until private history storage is configured.').waitFor();
  await page.getByText('2026-01-02 · <img src=x> (Test avis) · Present').waitFor();
  await page.getByText('Private location: Private place', { exact: false }).waitFor();
  assert.equal(await page.locator('#birdResults img').count(), 0);
  assert.doesNotMatch(await (await page.request.get(origin + '/api/bird-journal')).text(), /Test avis|Private place/);
  await page.getByLabel('Personal CSV export (up to 10 MiB)').setInputFiles({ name: 'other.csv', mimeType: 'text/csv', buffer: Buffer.from('different') });
  assert.equal(await page.locator('#birdResults li').count(), 0);
  await page.getByText('File selected. Preview it before saving.').waitFor();
  await page.getByRole('button', { name: 'Clear preview' }).click();
  assert.equal(await page.locator('#birdResults li').count(), 0);
  const unchangedCsv = 'Submission ID,Common Name,Scientific Name,Count,Date,Location\nS1,<img src=x>,Test avis,X,2026-01-02,Private place\n';
  birdSnapshot = { version: 1, revision: 1, records: previewBirdExport(Buffer.from(unchangedCsv)).candidates }; birdEtag = 'synthetic-1';
  const changedCsv = unchangedCsv + 'S2,Another bird,Test altera,2,2026-01-03,Private place\n';
  await page.getByLabel('Personal CSV export (up to 10 MiB)').setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(changedCsv) });
  await page.getByRole('button', { name: 'Preview export' }).click();
  await page.getByText('Compared with draft revision 1:', { exact: false }).waitFor();
  assert.match(await page.locator('#birdResults').textContent(), /1 unchanged/);
  await page.getByText('Review fields for row 3').click();
  await page.getByText('Scientific name: Test altera').waitFor();
  await page.getByRole('checkbox', { name: 'Select row 3 for draft import' }).check();
  await page.getByRole('button', { name: 'Save selected as private drafts' }).click();
  await page.getByText('1 private drafts saved. Nothing was published.').waitFor();
  assert.equal(birdSnapshot.records.length, 2); assert.equal(birdSnapshot.records[1].publication, 'draft');
  assert.doesNotMatch(await (await page.request.get(origin + '/api/bird-journal')).text(), /Test altera|Private place/);
  const correction = changedCsv.replace(',X,', ',3,');
  await page.getByLabel('Personal CSV export (up to 10 MiB)').setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(correction) });
  await page.getByRole('button', { name: 'Preview export' }).click();
  await page.getByText('Compared with draft revision 2:', { exact: false }).waitFor();
  await page.getByText('Review fields for row 2').click();
  await page.getByText('countKind: presence → exact').waitFor();
  await page.getByRole('checkbox', { name: 'Select row 2 for draft import' }).check();
  birdSnapshot.revision++;
  await page.getByRole('button', { name: 'Save selected as private drafts' }).click();
  await page.getByText('The history changed. Preview the export again before saving.').waitFor();
  assert.equal(birdSnapshot.records[0].count, null);
  const many = 'Submission ID,Common Name,Scientific Name,Count,Date\n' + Array.from({ length: 101 }, (_, index) =>
    `S${index + 1000},Synthetic bird,Test avis,1,2026-01-02\n`).join('');
  await page.getByLabel('Personal CSV export (up to 10 MiB)').setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(many) });
  await page.getByRole('button', { name: 'Preview export' }).click();
  await page.getByText('Page 1 of 2').waitFor();
  await page.getByRole('checkbox', { name: 'Select row 2 for draft import' }).check();
  await page.getByRole('button', { name: 'Next page' }).click();
  await page.getByRole('checkbox', { name: 'Select row 102 for draft import' }).check();
  await page.getByRole('button', { name: 'Previous page' }).click();
  assert.equal(await page.getByRole('checkbox', { name: 'Select row 2 for draft import' }).isChecked(), true);
  await page.getByRole('button', { name: 'Save selected as private drafts' }).click();
  await page.getByText('2 private drafts saved. Nothing was published.').waitFor();
  assert.equal(birdSnapshot.records.length, 4);
  const pendingCsv = 'Submission ID,Common Name,Scientific Name,Count,Date\nS4000,Test bird,Test avis,1,2026-01-02\n';
  await page.getByLabel('Personal CSV export (up to 10 MiB)').setInputFiles({ name: 'synthetic.csv', mimeType: 'text/csv', buffer: Buffer.from(pendingCsv) });
  await page.getByRole('button', { name: 'Preview export' }).click();
  await page.getByRole('checkbox', { name: 'Select row 2 for draft import' }).check();
  let release, reached; const gate = new Promise((resolve) => { release = resolve; });
  const started = new Promise((resolve) => { reached = resolve; });
  await page.route('**/api/bird-import-commit', async (route) => { reached(); await gate; await route.abort().catch(() => {}); });
  await page.getByRole('button', { name: 'Save selected as private drafts' }).click(); await started;
  assert.equal(await page.getByLabel('Personal CSV export (up to 10 MiB)').isDisabled(), true);
  assert.equal(await page.getByRole('checkbox', { name: 'Select row 2 for draft import' }).isDisabled(), true);
  await page.getByRole('button', { name: 'Clear preview' }).click();
  await page.getByText('The save was interrupted and may have completed. Preview again before retrying.').waitFor();
  release(); await page.unroute('**/api/bird-import-commit'); assert.equal(birdSnapshot.records.length, 4);
  birdSnapshot = null; birdEtag = null;
  await page.goto(origin + '/operator/travels'); await page.locator('#godeye-tab.active').waitFor();
  await page.getByRole('link', { name: 'Entities', exact: true }).click();
  await page.getByText('Read-only access. Enable editing to request permission for corrections.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Preview correction' }).isDisabled(), true);
  cancelEdit = true;
  await page.getByRole('button', { name: 'Enable editing', exact: true }).click();
  await page.waitForURL('**/operator/entities?editing=denied');
  await page.getByText('Read-only access. Enable editing to request permission for corrections.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Preview correction' }).isDisabled(), true);
  cancelEdit = false;
  await page.getByRole('button', { name: 'Enable editing', exact: true }).click();
  await page.waitForURL('**/operator/entities?editing=enabled');
  await page.getByText('Editing enabled for this session.', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: 'Preview correction' }).isDisabled(), false);
  await page.getByRole('link', { name: 'Devices / Utilities' }).click();
  await page.reload();
  await page.locator('#devices-tab.active').waitFor();
  await page.getByRole('button', { name: 'Lock', exact: true }).click();
  await page.getByRole('heading', { name: 'A little closer to the wild.' }).waitFor();
  await page.goto(origin + '/owner');
  await page.getByText('Sign in with the approved owner account.', { exact: true }).waitFor();
  assert.equal((await page.request.get(origin + '/api/operator-shell')).status(), 401);
  await page.clock.install();
  await page.getByRole('button', { name: 'Sign in with Microsoft' }).click();
  await page.locator('#godeye-tab.active').waitFor();
  await page.clock.fastForward(300000);
  await page.getByText('Your session expired. Sign in again.', { exact: true }).waitFor();
  await page.route('**/api/owner-auth/session', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'session_expired' }) }));
  await page.goto(origin + '/owner');
  await page.getByText('Your session expired. Sign in again.', { exact: true }).waitFor();
  await page.unroute('**/api/owner-auth/session');
  delete process.env.BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID;
  await page.goto(origin + '/owner');
  await page.getByText('Sign-in is unavailable.', { exact: false }).waitFor();
  process.env.BLUE_SWALLOW_ENTRA_OWNER_OBJECT_ID = config.owner;
  await page.goto(origin + '/owner?auth=expired');
  await page.getByText('Your session expired. Sign in again.', { exact: true }).waitFor();
  assert.deepEqual(errors, []);
});

test('owner entry bounds stalled requests and keeps a newer login ahead of session restoration', { timeout: 45000 }, async (t) => {
  const server = createServer((req, res) => serve(req, res).catch(() => { res.writeHead(500); res.end('unavailable'); }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage();
  let sessionRoute, loginRoute, sessionRequested, loginRequested;
  await page.route('**/api/owner-auth/session', (route) => { sessionRoute = route; sessionRequested?.(); });
  await page.route('**/api/owner-auth/login?*', (route) => { loginRoute = route; loginRequested?.(); });
  const unavailable = page.getByText('Sign-in is unavailable. Configuration or the identity service needs attention.', { exact: true });
  const button = page.getByRole('button', { name: 'Sign in with Microsoft' });

  await page.goto(origin + '/owner');
  await unavailable.waitFor({ timeout: 12000 });
  assert.equal(await button.isEnabled(), true);
  await sessionRoute.abort().catch(() => {});

  await page.goto(origin + '/owner?auth=signed-out');
  await button.click();
  await page.getByText('Opening Microsoft sign-in…', { exact: true }).waitFor();
  await unavailable.waitFor({ timeout: 17000 });
  assert.equal(await button.isEnabled(), true);
  await loginRoute.abort().catch(() => {});

  const restoring = new Promise((resolve) => { sessionRequested = resolve; });
  await page.goto(origin + '/owner');
  await restoring;
  const opening = new Promise((resolve) => { loginRequested = resolve; });
  await button.click();
  await opening;
  const restored = page.waitForResponse('**/api/owner-auth/session');
  await sessionRoute.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'signed_out' }) });
  await (await restored).finished();
  await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  assert.equal(await page.locator('#authStatus').textContent(), 'Opening Microsoft sign-in…');
  assert.equal(await button.isDisabled(), true);
  await loginRoute.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ ok: false, error: 'owner_auth_unavailable' }) });
  await unavailable.waitFor();
  assert.equal(await button.isEnabled(), true);
});
