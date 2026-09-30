import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
const require = createRequire(new URL('../api/package.json', import.meta.url));
const { chromium } = require('@playwright/test');
const assets = new Set(['world-view.mjs', 'world-state.mjs', 'world-map.mjs', 'world.css', 'world-land.geojson', 'maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css']);
// Synthetic test-only snapshot. All titles disclose fixture provenance; runtime has no fixture import.
function snapshot(count = 3) {
  const fetchedAt = new Date().toISOString();
  return { version: 'bss.world.v1', boundary: 'public_context_not_entity_evidence', generatedAt: fetchedAt,
    sources: [{ id: 'usgs-earthquakes', name: 'USGS earthquakes', enabled: true, state: count ? 'fresh' : 'empty', fetchedAt,
      attribution: 'Synthetic USGS test data', coverage: 'Synthetic test coverage', staleMs: 900000, maxAgeMs: 86400000,
      url: 'https://earthquake.usgs.gov/' },
    { id: 'nws-alerts', name: 'NWS alerts', enabled: true, state: 'empty', fetchedAt, attribution: 'Synthetic NWS test data', coverage: 'Synthetic test coverage', url: 'https://www.weather.gov/' },
    { id: 'celestrak', name: 'CelesTrak satellites', enabled: false, state: 'disabled', reason: 'Pending epoch and actual altitude qualification', url: 'https://celestrak.org/usage-policy.php' }],
    items: Array.from({ length: count }, (_, i) => ({ id: `synthetic-${i}`, sourceId: 'usgs-earthquakes', title: `Synthetic fixture event ${String(i).padStart(4, '0')}`,
      semantics: i % 2 ? 'reported' : 'observed', freshness: 'fresh', eventAt: fetchedAt, updatedAt: null, fetchedAt, expiresAt: null,
      geometry: { type: 'Point', coordinates: [-122 + (i % 15) / 100, 47 + (i % 15) / 100] }, detail: 'Synthetic fixture only.',
      uncertainty: 'Synthetic fixture uncertainty.', attribution: 'Synthetic test data', sourceUrl: 'https://earthquake.usgs.gov/', regions: [] })) };
}
async function harness(t) {
  let payload = snapshot(); let failed = false;
  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (url.pathname === '/api/world/context') { res.writeHead(failed ? 503 : 200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(payload)); return; }
      const file = url.pathname.split('/').at(-1);
      if (assets.has(file)) {
        res.writeHead(200, { 'Content-Type': file.endsWith('.css') ? 'text/css' : file.endsWith('.geojson') ? 'application/json' : 'text/javascript' });
        res.end(await readFile(new URL(`../api/_private/operator/assets/${file}`, import.meta.url))); return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#101923;color:#edf3f5;font-family:system-ui}</style></head><body><main id="world"></main><script type="module">import {createWorldView} from '/api/operator-assets/world-view.mjs'; window.world = createWorldView({root:document.querySelector('#world')}); window.world.activate();</script></body></html>`);
    } catch (error) { res.writeHead(500); res.end(error.message); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve)); t.after(() => server.close());
  const browser = await chromium.launch({ headless: true, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}) });
  t.after(() => browser.close());
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion: 'reduce' });
  const errors = []; const urls = [];
  page.on('pageerror', (error) => errors.push(error.message)); page.on('request', (request) => urls.push(request.url()));
  return { page, errors, urls, origin: `http://127.0.0.1:${server.address().port}`, payload: (data) => { payload = data; }, fail: (value) => { failed = value; } };
}
test('World mobile keyboard/reduced-motion, empty/stale/failure, 4000 records and lazy local globe', async (t) => {
  const h = await harness(t); const { page } = h;
  await page.goto(h.origin); await page.getByText(/Public context loaded at/).waitFor();
  assert.equal(h.urls.some((url) => /maplibre-gl\.mjs/.test(url)), false);
  const checkbox = page.getByRole('checkbox', { name: 'USGS earthquakes', exact: true });
  await checkbox.focus(); await page.keyboard.press('Space');
  await page.getByRole('button', { name: /Synthetic fixture event 0000/ }).focus(); await page.keyboard.press('Enter');
  await page.getByRole('region', { name: 'Selected report details' }).waitFor();
  assert.match(await page.locator('.world-detail').textContent(), /Provider update \/ publication timeUnknown/);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.equal(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches), true);
  assert.equal(await page.getByRole('checkbox', { name: 'CelesTrak satellites', exact: true }).isDisabled(), true);
  await page.getByRole('searchbox').fill('not in fixture'); await page.getByText(/No matching reports/).waitFor();
  await page.getByRole('searchbox').fill('');
  h.fail(true); await page.getByRole('button', { name: 'Reload context' }).click(); await page.getByText('Context reload failed; retained reports are stale.').waitFor();
  assert.match(await page.locator('.world-items').textContent(), /stale/);
  h.fail(false); const stale = snapshot(); stale.sources[0].state = 'stale'; stale.sources[0].fetchedAt = new Date(Date.now() - 1000000).toISOString();
  stale.items = stale.items.map((item) => ({ ...item, fetchedAt: stale.sources[0].fetchedAt, freshness: 'stale' })); h.payload(stale);
  await page.getByRole('button', { name: 'Reload context' }).click(); await page.getByText(/USGS earthquakes · stale/).waitFor();
  h.payload(snapshot(0)); await page.getByRole('button', { name: 'Reload context' }).click(); await page.getByText(/USGS earthquakes · empty/).waitFor();
  const before = performance.now(); h.payload(snapshot(4000)); await page.getByRole('button', { name: 'Reload context' }).click(); await page.getByText(/4000 reports · page 1 of 80/).waitFor();
  t.diagnostic(`Synthetic 4000-record reload to visible page: ${Math.round(performance.now() - before)} ms (headless desktop runner, not phone performance).`);
  assert.equal(await page.locator('.world-items button').count(), 50);
  await page.getByRole('button', { name: 'Next page' }).click(); await page.getByText(/page 2 of 80/).waitFor();
  await page.getByRole('combobox', { name: 'Region', exact: true }).selectOption('global');
  const globeBefore = performance.now(); const heapBefore = await page.evaluate(() => performance.memory?.usedJSHeapSize || null);
  await page.getByRole('button', { name: 'Show globe' }).click(); await page.getByText(/Ground context globe\. Made with/).waitFor({ timeout: 20000 });
  assert.equal(await page.evaluate(() => window.world.diagnostics().projection), 'globe');
  const frames = await page.evaluate(async () => {
    const values = []; let last = performance.now();
    for (let i = 0; i < 30; i++) await new Promise((resolve) => requestAnimationFrame((now) => { values.push(now - last); last = now; resolve(); }));
    return { intervals: values, heap: performance.memory?.usedJSHeapSize || null };
  });
  t.diagnostic(`Local globe ready: ${Math.round(performance.now() - globeBefore - frames.intervals.reduce((a,b) => a+b,0))} ms; 30 rAF intervals median ${frames.intervals.sort((a,b) => a-b)[15].toFixed(1)} ms; JS heap before/after ${heapBefore}/${frames.heap} bytes. Headless Chromium software WebGL; excludes GPU memory and is not phone performance or map FPS.`);
  assert.ok(h.urls.some((url) => url.endsWith('world-land.geojson')));
  assert.equal(h.urls.some((url) => !url.startsWith(h.origin) && !url.startsWith('blob:')), false);
  await page.screenshot({ path: process.env.WORLD_SCREENSHOT_PATH || '/tmp/world-mobile.png', fullPage: true });
  await page.locator('.maplibregl-canvas').evaluate((canvas) => canvas.dispatchEvent(new Event('webglcontextlost')));
  await page.getByText('Globe unavailable. Use the searchable report list.').waitFor();
  assert.equal(await page.locator('.world-items button').count(), 50);
  await page.evaluate(() => window.world.destroy()); assert.deepEqual(h.errors, []);
});
