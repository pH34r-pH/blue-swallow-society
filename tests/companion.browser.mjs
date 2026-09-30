process.env.BLUE_SWALLOW_AUTH_MODE = 'legacy';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const { createOperatorToken, requireOperatorToken } = require('./_lib/operator-auth.js');
const shellHandler = require('./operator-shell/index.js');
const assetsHandler = require('./operator-assets/index.js');

process.env.BLUE_SWALLOW_PASSCODE_SHA256 = 'a'.repeat(64);
process.env.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY = 'companion-browser-test-signing-key-not-production';
const session = createOperatorToken();
let releaseRequests = 0;
let releaseUnavailable = false;
const artifact = { buildType: 'release', downloadPath: '/api/operator-downloads/wardriver/apk', metadataPath: '/api/operator-downloads/wardriver/metadata', packageId: 'test.wardriver', versionName: 'test-release', versionCode: 1, sizeBytes: 1024, signerSha256: 'b'.repeat(64), sourceTag: 'test-tag', sourceCommit: 'c'.repeat(40), sha256: 'd'.repeat(64), notes: ['Published production release'] };

async function serve(req, res) {
  const url = new URL(req.url, 'http://localhost');
  const context = {};
  const request = { method: req.method, headers: req.headers, query: {}, params: { asset: url.pathname.split('/').at(-1) } };
  if (url.pathname === '/api/operator-shell') await shellHandler(context, request);
  else if (url.pathname.startsWith('/api/operator-assets/')) await assetsHandler(context, request);
  else if (url.pathname.startsWith('/api/operator-downloads/')) {
    if (requireOperatorToken(context, request).ok) {
      releaseRequests++;
      const body = url.pathname.endsWith('/apk') ? { ok: true, downloadUrl: 'https://test.blob.core.windows.net/releases/test.apk?sp=r&spr=https' } : { ok: true, artifact };
      context.res = releaseUnavailable ? { status: 503, body: { ok: false } } : { status: 200, body };
    }
  } else if (url.pathname === '/api/world/context') {
    const at = new Date().toISOString();
    // Synthetic test-only public snapshot: no runtime fixtures or personal observations.
    context.res = { status: 200, body: { version: 'bss.world.v1', boundary: 'public_context_not_entity_evidence', generatedAt: at,
      sources: [{ id: 'usgs-earthquakes', name: 'USGS earthquakes', enabled: true, state: 'fresh', fetchedAt: at, staleMs: 900000, maxAgeMs: 86400000, attribution: 'Synthetic fixture', url: 'https://earthquake.usgs.gov/' }],
      items: [{ id: 'synthetic-shell', sourceId: 'usgs-earthquakes', title: 'Synthetic sealed-shell fixture', semantics: 'observed', freshness: 'fresh', eventAt: at, fetchedAt: at, updatedAt: null, expiresAt: null,
        geometry: { type: 'Point', coordinates: [-122, 47] }, detail: 'Synthetic test fixture only', sourceUrl: 'https://earthquake.usgs.gov/', attribution: 'Synthetic fixture', uncertainty: 'Test only', regions: [] }] } };
  } else if (url.pathname.startsWith('/api/')) context.res = { status: 503, body: { ok: false } };
  else if (['/operator/loader.js', '/operator/operator-session.mjs'].includes(url.pathname)) {
    context.res = { status: 200, headers: { 'Content-Type': 'text/javascript' }, body: await readFile(new URL(`../app${url.pathname}`, import.meta.url), 'utf8') };
  } else {
    context.res = { status: 200, headers: { 'Content-Type': 'text/html' }, body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script type="module">
      import {activateOperatorSession} from '/operator/operator-session.mjs';
      import {bootOperatorSurface} from '/operator/loader.js';
      activateOperatorSession(${JSON.stringify(session)});
      await bootOperatorSurface();
    </script></body></html>` };
  }
  res.writeHead(context.res.status, context.res.headers || { 'Content-Type': 'application/json' });
  res.end(typeof context.res.body === 'string' ? context.res.body : JSON.stringify(context.res.body));
}

test('Chromium companion navigation, Back, mobile layout and gated release states', async (t) => {
  const server = createServer((req, res) => serve(req, res).catch((error) => { res.writeHead(500); res.end(error.message); }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'], ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(`${origin}/?selected=cell-1`);
  await page.locator('#godeye-tab.active').waitFor();
  await page.getByRole('link', { name: 'Devices / Utilities' }).click();
  assert.equal(new URL(page.url()).pathname, '/operator/devices');
  assert.equal(new URL(page.url()).searchParams.get('selected'), 'cell-1');
  await page.getByText('test-release / 1', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-operator-download="apk"]').getAttribute('aria-disabled'), null);
  await page.route('https://test.blob.core.windows.net/**', (route) => route.fulfill({ status: 200, headers: { 'Content-Disposition': 'attachment; filename=test.apk' }, contentType: 'application/octet-stream', body: 'test APK fixture' }));
  const download = page.waitForEvent('download');
  await page.getByRole('link', { name: 'Download signed APK' }).click();
  assert.equal((await download).suggestedFilename(), 'test.apk');
  const before = releaseRequests;
  releaseUnavailable = true;
  await page.getByRole('button', { name: 'Check for updates' }).click();
  await page.getByText('Current signed release record is unavailable.', { exact: false }).waitFor();
  assert.ok(releaseRequests > before);
  assert.equal(await page.locator('[data-operator-download="apk"]').getAttribute('aria-disabled'), 'true');
  await page.getByRole('link', { name: 'Entities', exact: true }).click();
  await page.getByText('Entity request failed', { exact: false }).waitFor();
  await page.goBack();
  await page.locator('#devices-tab.active').waitFor();
  await page.getByRole('link', { name: 'World', exact: true }).click();
  await page.locator('#world-tab.active').waitFor();
  assert.match(await page.locator('#world-tab').textContent(), /Unrelated public context/);
  await page.getByText(/Public context loaded at/).waitFor();
  await page.getByRole('checkbox', { name: 'USGS earthquakes', exact: true }).focus();
  await page.keyboard.press('Space');
  await page.getByRole('button', { name: /Synthetic sealed-shell fixture/ }).focus();
  await page.keyboard.press('Enter');
  await page.getByRole('region', { name: 'Selected report details' }).waitFor();
  await page.getByRole('button', { name: 'Show globe' }).click();
  await page.getByText(/Ground context globe\. Made with/).waitFor({ timeout: 20000 });
  assert.equal(await page.locator('#world-tab .maplibregl-canvas').count(), 1);
  assert.equal(await page.evaluate(() => !!document.querySelector('#bss-world-styles')), true);
  await page.getByRole('link', { name: 'Entities', exact: true }).click();
  assert.equal(await page.locator('#world-tab .maplibregl-canvas').count(), 0);
  await page.getByRole('link', { name: 'World', exact: true }).click();
  await page.getByRole('button', { name: /Synthetic sealed-shell fixture/ }).waitFor();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false);
  const denied = await fetch(`${origin}/api/operator-shell`);
  assert.equal(denied.status, 403);
  assert.deepEqual(errors, []);
});
