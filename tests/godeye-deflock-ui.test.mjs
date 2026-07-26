import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const shell = readFileSync(new URL('../api/_private/operator/shell.html', import.meta.url), 'utf8');
const main = readFileSync(new URL('../api/_private/operator/assets/main.js', import.meta.url), 'utf8');
const styles = readFileSync(new URL('../api/_private/operator/assets/styles.css', import.meta.url), 'utf8');

test('Godeye embeds a separate attributed public-reports aggregate panel', () => {
  assert.ok(shell.includes('id="deflockGlobalMap"'));
  assert.ok(shell.includes('id="deflockGlobalStatus"'));
  assert.ok(shell.includes('id="deflockGlobalRefreshBtn"'));
  assert.match(shell, /Public-reported ALPR aggregate/);
  assert.match(shell, /not verified or live/i);
  assert.match(shell, /OpenStreetMap contributors/i);
  assert.ok(main.includes("'/api/cybermap/global-viewport'"));
  assert.ok(main.includes('refreshDeflockGlobalViewport'));
  assert.ok(main.includes('renderDeflockGlobalMap'));
  assert.ok(styles.includes('.deflock-global-map'));
});

test('Global panel is fixed-viewport and does not couple to Field geolocation state', () => {
  const requestBuilder = main.match(/function buildDeflockGlobalRequest\(\) \{(?<body>[\s\S]*?)\n\}/)?.groups?.body || '';
  const refresh = main.match(/async function refreshDeflockGlobalViewport\([^)]*\) \{(?<body>[\s\S]*?)\n\}/)?.groups?.body || '';
  assert.ok(requestBuilder.includes('DEFLOCK_GLOBAL_BBOX'));
  assert.ok(requestBuilder.includes('layer_ids'));
  assert.equal(requestBuilder.includes('currentLocation'), false);
  assert.equal(requestBuilder.includes('navigator.geolocation'), false);
  assert.equal(refresh.includes('navigator.geolocation'), false);
  assert.ok(main.includes('Public-reports layer is disabled by catalog configuration'));
  assert.ok(main.includes('Public-reports layer is stale'));
  assert.ok(main.includes('Public-reports aggregate unavailable'));
});

test('Godeye browser assets do not embed a provider URL, raw DeFlock reports, or avoidance behavior', () => {
  const browserSources = `${shell}\n${main}\n${styles}`.toLowerCase();
  assert.equal(browserSources.includes('data.dontgetflocked.com'), false);
  assert.equal(browserSources.includes('cameras.geojson'), false);
  assert.equal(browserSources.includes('avoidance route'), false);
  assert.equal(browserSources.includes('turn-by-turn'), false);
});
