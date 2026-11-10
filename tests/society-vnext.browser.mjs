import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { startCompanionServer } from './helpers/companion-server.mjs';
import { releaseFixture } from './fixtures/wardriver-development.mjs';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { chromium } = require('@playwright/test');

async function setup(t, width = 1440) {
  const server = await startCompanionServer();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width, height: 1000 } });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  t.after(async () => { await browser.close(); await server.close(); assert.deepEqual(errors, []); });
  return { ...server, context, page };
}
async function signIn(page, origin, password) {
  await page.goto(origin);
  await page.getByRole('button', { name: 'Login' }).click();
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.waitForURL('**/operator/map');
  await page.getByRole('heading', { name: 'Map', exact: true }).waitFor();
}
test('admin sign-in starts only from the explicit operator action', async (t) => {
  const f = await setup(t); let attempts = 0; let forwarded = false; let available = false;
  await f.page.route('**/api/owner-auth/login?*', async (route) => {
    attempts++; forwarded = Boolean(route.request().headers()['x-blue-swallow-operator-token']);
    await route.fulfill({ status: available ? 200 : 503, contentType: 'application/json',
      body: available ? JSON.stringify({ authorizationUrl: 'https://login.microsoftonline.com/test-authorize' }) : '{}' });
  });
  await signIn(f.page, f.origin, f.password);
  assert.equal(attempts, 0);
  assert.equal(f.state.reads.some((path) => path.startsWith('/api/owner-auth/')), false);
  await f.page.getByRole('link', { name: 'Downloads & devices' }).click();
  await f.page.getByRole('link', { name: 'Download Android APK' }).waitFor();
  assert.equal(attempts, 0);
  await f.page.getByRole('button', { name: 'Admin login' }).click();
  await f.page.getByText('Admin sign-in is unavailable. Try again later.').waitFor();
  assert.equal(attempts, 1); assert.equal(forwarded, false);
  available = true;
  await f.page.route('https://login.microsoftonline.com/**', (route) => route.abort());
  const redirected = f.page.waitForRequest('https://login.microsoftonline.com/**');
  await f.page.getByRole('button', { name: 'Admin login' }).click();
  assert.equal((await redirected).url(), 'https://login.microsoftonline.com/test-authorize');
  assert.equal(attempts, 2); assert.equal(forwarded, false);
});
test('friend downloads the exact selected APK through a fresh authorized redirect and can check for updates', async (t) => {
  const f = await setup(t); const old = f.state.currentRelease;
  const path = `/api/companion-downloads/${old.versionCode}/${old.sourceCommit}/${old.apk.fileName}`;
  assert.equal((await f.page.request.get(f.origin + path, { maxRedirects: 0 })).status(), 401);
  assert.equal(f.state.grants.length, 0);
  await signIn(f.page, f.origin, f.password);
  await f.page.getByRole('link', { name: 'Downloads & devices' }).click();
  const link = f.page.getByRole('link', { name: 'Download Android APK' }); await link.waitFor();
  const stable = await f.page.getByLabel('Open this private page on your phone').inputValue();
  assert.equal(stable, f.origin + '/operator/downloads');
  assert.doesNotMatch(stable, /[?&]|sig=|token|password/i);
  await f.page.evaluate(() => { Object.defineProperty(navigator, 'clipboard', { configurable: true,
    value: { writeText: async (value) => { window.copiedDownloadLink = value; } } }); });
  await f.page.getByRole('button', { name: 'Copy page link' }).click();
  assert.equal(await f.page.evaluate(() => window.copiedDownloadLink), stable);
  const phone = await f.page.context().browser().newContext({ viewport: { width: 390, height: 844 } });
  const phonePage = await phone.newPage(); await phonePage.goto(stable);
  await phonePage.getByLabel('Password', { exact: true }).fill(f.password);
  await phonePage.getByRole('button', { name: 'Continue' }).click();
  await phonePage.waitForURL('**/operator/downloads');
  await phonePage.getByRole('link', { name: 'Download Android APK' }).waitFor();
  assert.equal(await phonePage.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await phone.close();
  const next = releaseFixture(21, 'b'.repeat(40)); f.state.currentRelease = next;
  f.state.releases.set(`${next.versionCode}/${next.sourceCommit}`, next);
  let credentialForwarded = false;
  const artifactServer = createServer((req, res) => {
    credentialForwarded = Boolean(req.headers.cookie || req.headers.authorization || req.headers['x-blue-swallow-operator-token']);
    res.writeHead(200, { 'Content-Type': 'application/vnd.android.package-archive',
      'Content-Disposition': `attachment; filename="${old.apk.fileName}"` }); res.end('synthetic test bytes');
  });
  await new Promise((resolve) => artifactServer.listen(0, resolve));
  t.after(() => new Promise((resolve) => { artifactServer.closeAllConnections(); artifactServer.close(resolve); }));
  f.state.grantUrl = (name) => `http://localhost:${artifactServer.address().port}/${name}?sig=synthetic`;
  const waiting = f.page.waitForEvent('download', { timeout: 10000 }); await link.click(); const download = await waiting;
  assert.equal(download.suggestedFilename(), old.apk.fileName); assert.equal(credentialForwarded, false);
  assert.deepEqual(f.state.grants, [{ versionCode: old.versionCode, sourceCommit: old.sourceCommit, name: old.apk.fileName }]);
  await f.page.getByRole('button', { name: 'Check for a newer build' }).click();
  await f.page.getByRole('heading', { name: 'Wardriver ' + next.versionName }).waitFor();
  assert.match(await f.page.getByRole('link', { name: 'Download Android APK' }).getAttribute('href'), /\/21\//);
  await f.page.getByRole('button', { name: 'Lock', exact: false }).click(); await f.page.waitForURL('**/?auth=locked');
  assert.equal((await f.page.request.get(f.origin + path, { maxRedirects: 0 })).status(), 401);
  assert.equal(f.state.grants.length, 1);
});
test('journal remains public with cookies; explicit login, private routes, downloads, renewal and cross-tab lock', async (t) => {
  const f = await setup(t);
  await f.page.goto(f.origin);
  await f.page.getByText('The notebook is open.').waitFor();
  assert.equal(f.state.reads.some((path) => /companion-auth|companion-ui|companion-downloads/.test(path)), false);
  assert.equal((await f.page.request.get(f.origin + '/api/companion-ui/shell.html')).status(), 401);
  assert.equal(f.state.privateReads, 0);
  await f.page.getByRole('button', { name: 'Login' }).click();
  await f.page.getByLabel('Password', { exact: true }).fill('wrong');
  await f.page.getByRole('button', { name: 'Continue' }).click();
  await f.page.getByText('That password was not accepted.', { exact: false }).waitFor();
  await f.page.keyboard.press('Escape');
  assert.equal(await f.page.locator('#loginButton').evaluate((element) => element === document.activeElement), true);
  await signIn(f.page, f.origin, f.password);
  assert.equal((await f.page.request.get(f.origin + '/api/operator-shell')).status() >= 400, true);
  const divider = f.page.getByRole('separator', { name: 'Resize explore panel' });
  await divider.focus(); await divider.press('ArrowRight');
  assert.equal(await divider.getAttribute('aria-valuenow'), '300');
  await f.page.getByRole('link', { name: 'Encounters', exact: true }).click();
  await f.page.getByRole('heading', { name: 'No encounters loaded' }).waitFor();
  await f.page.getByRole('link', { name: 'Downloads & devices' }).click();
  const apk = f.page.getByRole('link', { name: 'Download Android APK' });
  await apk.waitFor();
  assert.match(await apk.getAttribute('href'), /^\/api\/companion-downloads\/20\/[a-f0-9]{40}\/wardriver-vnext-20.apk$/);
  await f.page.goBack(); await f.page.getByRole('heading', { name: 'No encounters loaded' }).waitFor();
  await f.page.getByRole('button', { name: 'Extend session' }).click();
  await f.page.getByText('Session extended.').waitFor();
  const second = await f.context.newPage();
  const before = f.state.privateReads;
  await second.goto(f.origin);
  await second.getByText('The notebook is open.').waitFor();
  assert.equal(f.state.privateReads, before);
  await second.getByRole('button', { name: 'Login' }).click();
  await second.waitForURL('**/operator/map');
  await second.getByRole('heading', { name: 'Map', exact: true }).waitFor();
  await f.page.getByRole('button', { name: 'Lock' }).click();
  await f.page.waitForURL('**/?auth=locked');
  await second.waitForURL('**/?auth=locked');
  assert.equal((await f.page.request.get(f.origin + '/api/companion-ui/shell.html')).status(), 401);
  assert.equal(await f.page.locator('.companion-header').count(), 0);
});
test('safe deep links, unavailable assets, cancelled restore, expiry and mobile shell', async (t) => {
  const f = await setup(t, 390);
  await f.page.goto(f.origin + '/?returnTo=https://attacker.test/operator/map');
  await f.page.getByRole('button', { name: 'Login' }).click();
  await f.page.getByLabel('Password', { exact: true }).fill(f.password);
  await f.page.getByRole('button', { name: 'Continue' }).click();
  await f.page.waitForURL('**/operator/map');
  await f.page.getByRole('heading', { name: 'Map', exact: true }).waitFor();
  assert.equal(await f.page.locator('#scopeControls').isHidden(), true);
  assert.equal(await f.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await f.page.goto(f.origin + '/operator/trips');
  await f.page.getByRole('heading', { name: 'No trips loaded' }).waitFor();
  f.state.releaseUnavailable = true;
  await f.page.getByRole('link', { name: 'Downloads & devices' }).click();
  await f.page.getByRole('heading', { name: 'Downloads are temporarily unavailable' }).waitFor();
  f.state.releaseUnavailable = false;
  await f.page.getByRole('button', { name: 'Retry release check' }).click();
  await f.page.getByRole('link', { name: 'Download Android APK' }).waitFor();
  await f.page.goto(f.origin);
  f.state.sessionDelay = 200;
  const before = f.state.privateReads;
  await f.page.getByRole('button', { name: 'Login' }).click(); await f.page.keyboard.press('Escape');
  await f.page.waitForTimeout(300);
  assert.equal(f.state.privateReads, before);
  f.state.sessionDelay = 0;
  await f.page.clock.install();
  await f.page.goto(f.origin + '/operator/map');
  await f.page.getByRole('heading', { name: 'Map', exact: true }).waitFor();
  await f.page.clock.fastForward(901000);
  await f.page.waitForURL('**/?auth=expired');
  await f.page.clock.setSystemTime(new Date());
  f.state.failShell = true;
  await f.page.getByRole('button', { name: 'Login' }).click();
  await f.page.waitForURL('**/?auth=unavailable');
  assert.equal(await f.page.locator('.companion-header').count(), 0);
  assert.equal((await f.page.request.get(f.origin + '/api/companion-auth/session')).status(), 401);
});
test('published journal renders text safely, filters archives and distinguishes presence-only sightings', async (t) => {
  const f = await setup(t);
  f.state.publication = { version: 1, posts: [
    { published: true, id: 'synthetic-walk', title: '<img src=x onerror=alert(1)>', summary: 'Synthetic field note', place: 'Test region',
      observedOn: '2026-11-01', publishedOn: '2026-11-10', paragraphs: ['Synthetic narrative.'] },
    { published: false, id: 'private-draft', title: 'NEVER PUBLIC', publishedOn: '2026-11-10' }], sightings: [
    { published: true, id: 'synthetic-sighting', speciesId: 'test-bird', commonName: 'Synthetic bird', scientificName: 'Test species',
      observedOn: '2026-11-01', count: null, latitude: 47.123, longitude: -122.123, source: 'eBird' }] };
  await f.page.goto(f.origin);
  await f.page.getByRole('heading', { name: '<img src=x onerror=alert(1)>' }).waitFor();
  assert.equal(await f.page.locator('#journalView img').count(), 0);
  assert.equal(await f.page.getByText('NEVER PUBLIC').count(), 0);
  await f.page.getByRole('link', { name: 'Read field note' }).click();
  await f.page.getByText('Synthetic narrative.').waitFor();
  await f.page.getByRole('link', { name: 'Species', exact: true }).click();
  await f.page.getByRole('link', { name: /Synthetic bird/ }).click();
  await f.page.getByText('Present', { exact: true }).waitFor();
  const json = await (await f.page.request.get(f.origin + '/api/bird-journal')).text();
  assert.doesNotMatch(json, /latitude|longitude|NEVER PUBLIC/);
  await f.page.getByRole('link', { name: 'Archive', exact: true }).click();
  await f.page.getByLabel('Search field notes').fill('missing');
  await f.page.getByRole('button', { name: 'Filter', exact: true }).click();
  await f.page.getByText('No matching entries').waitFor();
});

test('failed server logout hides private content, supports retry, and Back cannot revive a revoked session', async (t) => {
  const f = await setup(t);
  await signIn(f.page, f.origin, f.password);
  await f.page.getByRole('link', { name: 'Downloads & devices' }).click();
  await f.page.getByRole('link', { name: 'Download Android APK' }).waitFor();
  f.table.fail = true;
  await f.page.getByRole('button', { name: 'Lock' }).click();
  await f.page.getByRole('heading', { name: 'Workspace hidden' }).waitFor();
  assert.equal(await f.page.locator('.companion-header').count(), 0);
  assert.equal(await f.page.locator('#companionStyles').count(), 0);
  f.table.fail = false;
  await f.page.getByRole('button', { name: 'Retry sign out' }).click();
  await f.page.waitForURL('**/?auth=locked');
  const before = f.state.privateReads;
  await f.page.goBack();
  await f.page.getByLabel('Password', { exact: true }).waitFor();
  assert.equal(f.state.privateReads, before);
  assert.equal(await f.page.locator('.companion-header').count(), 0);
});
