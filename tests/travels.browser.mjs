process.env.BLUE_SWALLOW_AUTH_MODE = 'legacy';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const { createOperatorToken } = require('./_lib/operator-auth');
const shell = require('./operator-shell');
const assets = require('./operator-assets');
const historyHandler = require('./cybermap-history');
Object.assign(process.env, { BLUE_SWALLOW_PASSCODE_SHA256: 'a'.repeat(64), BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY: 'synthetic-travels-session-key-at-least-32-bytes',
  BACKEND_CYBERMAP_BASE_URL: 'https://synthetic-history.invalid/', BSS_CYBERMAP_READ_TOKEN: 'synthetic-backend-read-token-only' });
const session = createOperatorToken();
let mode = 'normal';
let requests = [];
const id = (n) => `${String(n).padStart(8, '0')}-0000-4000-8000-000000000001`;
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (!String(url).startsWith('https://synthetic-history.invalid/')) return originalFetch(url, options);
  const query = JSON.parse(options.body); requests.push(query);
  if (mode === 'error') return new Response('{"ok":false}', { status: 503 });
  const rows = [1,2,3].map((n) => ({ id: id(n), observedAt: new Date(Date.parse(query.to) - n * 86400000).toISOString(),
    ingestedAt: new Date().toISOString(), deviceId: 'synthetic-installation', sessionId: n === 3 ? null : id(9), kind: 'wifi_ap',
    captureLocation: { latitude: n === 2 ? null : 0, longitude: n === 2 ? null : 0, accuracyMeters: null },
    emitterLocation: null, signalDbm: n === 1 ? 0 : null, frequencyMhz: null, channel: null, confidence: null }));
  const observations = mode === 'empty' ? [] : query.cursor ? rows.slice(2) : rows.slice(0,2);
  return Response.json({ ok: true, schemaVersion: 'bss.observation_history.v1', mode: 'historical',
    retrievedAt: new Date(Date.now() - (mode === 'stale' ? 120000 : 0)).toISOString(),
    observations, selected: rows.find((row) => row.id === query.selectedId) || null,
    nextCursor: mode !== 'empty' && !query.cursor ? 'synthetic-next-page' : null });
};
async function serve(req, res) {
  const url = new URL(req.url, 'http://localhost');
  let raw = ''; for await (const chunk of req) raw += chunk;
  const request = { method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams), body: raw ? JSON.parse(raw) : null,
    params: { asset: url.pathname.split('/').at(-1) } };
  const context = {};
  if (url.pathname === '/api/operator-shell') await shell(context, request);
  else if (url.pathname.startsWith('/api/operator-assets/')) await assets(context, request);
  else if (url.pathname === '/api/cybermap/history') await historyHandler(context, request);
  else if (url.pathname.startsWith('/api/')) context.res = { status: 503, body: { ok: false } };
  else if (['/operator/loader.js', '/operator/operator-session.mjs'].includes(url.pathname)) {
    context.res = { status: 200, headers: { 'Content-Type': 'text/javascript' }, body: await readFile(new URL('../app' + url.pathname, import.meta.url), 'utf8') };
  } else context.res = { status: 200, headers: { 'Content-Type': 'text/html' }, body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><script type="module">
    import {activateOperatorSession} from '/operator/operator-session.mjs'; import {bootOperatorSurface} from '/operator/loader.js';
    activateOperatorSession(${JSON.stringify(session)}); await bootOperatorSurface();</script></body></html>` };
  res.writeHead(context.res.status, context.res.headers || { 'Content-Type': 'application/json' });
  res.end(typeof context.res.body === 'string' ? context.res.body : JSON.stringify(context.res.body));
}

test('Chromium Travels filters, canonical pages, keyboard detail, reload/Back, empty/error/stale, map fallback and mobile', async (t) => {
  const server = createServer((req, res) => serve(req, res).catch(() => { res.writeHead(500); res.end('unavailable'); }));
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const origin = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch({ headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (['webgl', 'webgl2', 'webgpu'].includes(type)) throw new Error('Synthetic renderer unavailable');
      return original.call(this, type, ...args);
    };
  });
  await page.route('https://tile.openstreetmap.org/**', (route) => route.abort());
  const errors = []; page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(origin + '/operator/travels');
  await page.getByText('2 historical observations on this page.', { exact: false }).waitFor();
  assert.deepEqual(await page.locator('select[name=kind]').evaluate((node) => [...node.options].map((option) => option.value)), ['', 'wifi_ap', 'ble_device', 'cell_signal']);
  const initial = requests.at(-1);
  assert.equal(initial.lat, undefined); assert.equal(initial.lon, undefined);
  const first = page.locator(`[data-observation-id="${id(1)}"]`);
  await first.focus(); await page.keyboard.press('Enter');
  await page.locator('[data-history-detail]').getByText(id(1), { exact: true }).waitFor();
  assert.equal(await page.locator('[data-history-detail]').evaluate((node) => node === document.activeElement), true);
  assert.match(page.url(), /historyId=/);
  assert.match(await page.locator('[data-history-detail]').textContent(), /0 dBm/);
  assert.match(await page.locator('[data-history-detail]').textContent(), /Emitter locationUnknown/);
  await page.reload();
  await page.locator('[data-history-detail]').getByText(id(1), { exact: true }).waitFor();
  assert.equal(requests.at(-1).selectedId, id(1));
  assert.equal(requests.at(-1).from, initial.from); assert.equal(requests.at(-1).to, initial.to);
  await page.getByRole('button', { name: 'Next history page' }).click();
  await page.locator(`[data-observation-id="${id(3)}"]`).waitFor();
  assert.equal(await page.locator('[data-history-list] button').count(), 1);
  await page.goBack(); await first.waitFor();
  mode = 'empty'; await page.getByRole('button', { name: 'Refresh history' }).click();
  await page.getByText('No personal observations match these filters.', { exact: true }).waitFor();
  assert.equal(await page.locator('[data-history-list] button').count(), 0);
  mode = 'error'; await page.getByRole('button', { name: 'Refresh history' }).click();
  await page.getByText('History unavailable.', { exact: false }).waitFor();
  assert.equal(await page.locator('[data-history-list] button').count(), 0);
  mode = 'stale'; await page.getByRole('button', { name: 'Refresh history' }).click();
  await page.getByText('History snapshot is stale.', { exact: false }).waitFor();
  mode = 'normal'; await page.getByRole('button', { name: 'Refresh history' }).click();
  await page.getByText('2 historical observations on this page.', { exact: false }).waitFor();
  await page.getByLabel('Installation ID', { exact: true }).fill('synthetic-installation');
  assert.deepEqual(await page.getByLabel('Radio', { exact: true }).evaluate((node) => [...node.options].map((option) => option.value)), ['', 'wifi_ap', 'ble_device', 'cell_signal']);
  await page.getByLabel('Radio', { exact: true }).selectOption('wifi_ap');
  await page.getByRole('button', { name: 'Apply history filters' }).click();
  await page.getByText('2 historical observations on this page.', { exact: false }).waitFor();
  assert.equal(requests.at(-1).deviceId, 'synthetic-installation'); assert.equal(requests.at(-1).kind, 'wifi_ap');
  await page.getByRole('button', { name: 'Show capture map' }).click();
  await page.getByText('Map unavailable. The observation list and detail remain available.', { exact: true }).waitFor({ timeout: 10000 });
  assert.equal(await page.locator('[data-history-list] button').count(), 2);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  const mapped = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  mapped.on('pageerror', (error) => errors.push(error.message));
  await mapped.route('https://tile.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'image/png', headers: { 'Access-Control-Allow-Origin': '*' }, body: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAAADTED8xAAACwElEQVR4nO3TIQEAIADAMCAHAkH/jMRAfEtw87nPHVC1fgfATwYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQJoBSDMAaQYgzQCkGYA0A5BmANIMQNoDnlQCYFBcN7EAAAAASUVORK5CYII=', 'base64') }));
  await mapped.goto(origin + '/operator/travels');
  await mapped.getByText('2 historical observations on this page.', { exact: false }).waitFor();
  await mapped.getByRole('button', { name: 'Show capture map' }).click();
  await mapped.getByRole('button', { name: 'Hide capture map' }).waitFor({ timeout: 10000 });
  assert.ok(await mapped.locator('[data-history-map] canvas').count() >= 1);
  await mapped.locator(`[data-observation-id="${id(1)}"]`).click();
  await mapped.locator('[data-history-detail]').getByText(id(1), { exact: true }).waitFor();
  assert.equal(await mapped.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await mapped.getByRole('button', { name: 'Hide capture map' }).click();
  assert.equal(await mapped.locator('[data-history-map]').isHidden(), true);
  await mapped.close();
  assert.deepEqual(errors, []);
  assert.equal((await originalFetch(origin + '/api/cybermap/history', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
});
