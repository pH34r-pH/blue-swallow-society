import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const operatorMain = read('app/operator/main.js');
const operatorShell = read('api/_private/operator/shell.html');
const operatorStyles = read('app/operator/styles.css');
const globalModuleUrl = new URL('../app/operator/godeye-global.mjs', import.meta.url);
const globalViewportRequest = {
  schema_version: 'bss.godeye.global_viewport.v1',
  bbox: { west: -180, south: -85, east: 180, north: 85 },
  zoom: 2,
  layer_ids: ['usgs-earthquakes'],
  max_cells: 1_000,
};
const globalViewportResponse = {
  ok: true,
  schema_version: 'bss.godeye.global_viewport.v1',
  mode: 'global',
  generated_at: '2026-07-22T20:00:00.000Z',
  cells: [{
    h3_cell: '85283473fffffff',
    centroid: { lat: 37.35, lon: -121.98 },
    source_classes: ['green_public'],
    observation_count: 12,
    entity_count: 0,
    layers: { 'usgs-earthquakes': { observation_count: 12 } },
    freshness: { 'usgs-earthquakes': { state: 'fresh', age_seconds: 300 } },
    caveats: ['public_report_not_local_observation'],
  }],
  source_health: [{
    layer_id: 'usgs-earthquakes',
    display_name: 'USGS earthquakes',
    source_class: 'green_public',
    health: 'fresh',
    last_success_at: '2026-07-22T19:55:00.000Z',
    next_retry_at: '2026-07-22T20:00:00.000Z',
    terms_url: 'provider-terms-visible-in-response',
    attribution: 'U.S. Geological Survey',
    caveat_count: 1,
  }],
  intelligence_gaps: [],
};

function readGlobalModule() {
  assert.equal(
    existsSync(globalModuleUrl),
    true,
    'Global mode must use its own app/operator/godeye-global.mjs renderer module',
  );
  return readFileSync(globalModuleUrl, 'utf8');
}

async function loadGlobalModule() {
  readGlobalModule();
  return import(globalModuleUrl.href);
}

function jsonResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function makeElement() {
  return {
    children: [],
    className: '',
    textContent: '',
    replaceChildren(...children) {
      this.children = children;
    },
  };
}

test('Godeye dispatches future explicit Field and Global controls while retaining the 100 m Field viewport flow', () => {
  assert.match(
    operatorMain,
    /data-godeye-mode/,
    'main controller must dispatch explicit Godeye modes when authenticated controls exist',
  );
  assert.match(operatorMain, /godeye-global\.mjs/);
  assert.match(operatorMain, /GODEYE_VIEWPORT_ENDPOINT\s*=\s*['"]\/api\/cybermap\/viewport['"]/);
  assert.match(operatorMain, /radiusMeters:\s*100/);
  assert.match(operatorMain, /startGodeyeFeed/);
});

test('authenticated Godeye shell exposes Field and Global controls with bounded provenance regions', () => {
  assert.match(operatorShell, /data-godeye-mode="field"/);
  assert.match(operatorShell, /data-godeye-mode="global"/);
  assert.match(operatorShell, /data-godeye-global-cells/);
  assert.match(operatorShell, /data-godeye-global-ledger/);
  assert.match(operatorShell, /data-godeye-global-intelligence-gaps/);
  assert.match(operatorShell, /Global source provenance ledger/);
  for (const term of ['Source class', 'Attribution', 'Freshness', 'Caveat']) {
    assert.match(operatorShell, new RegExp(term), `Global surface must label ${term} for operator provenance review`);
  }
});

test('Global evidence styles visibly distinguish unavailable, empty, stale, and error states', () => {
  assert.match(operatorStyles, /\.godeye-mode-controls/);
  assert.match(operatorStyles, /\.godeye-global-evidence/);
  for (const state of ['unavailable', 'empty', 'stale', 'error']) {
    assert.match(
      operatorStyles,
      new RegExp(`\\.godeye-global-(?:cell|source|gap)-${state}`),
      `Global styles must visibly distinguish ${state} evidence`,
    );
  }
});

test('Global viewport client uses only the authenticated BSS proxy and caches a successful bounded response', async () => {
  const { GODEYE_GLOBAL_VIEWPORT_ENDPOINT, createGlobalViewportClient } = await loadGlobalModule();
  const requests = [];
  const client = createGlobalViewportClient({
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse(globalViewportResponse);
    },
    getHeaders: () => ({ 'X-Blue-Swallow-Operator-Token': 'operator-session-token' }),
  });

  const first = await client.load(globalViewportRequest);
  const second = await client.load(globalViewportRequest);

  assert.equal(GODEYE_GLOBAL_VIEWPORT_ENDPOINT, '/api/cybermap/global-viewport');
  assert.equal(first.state, 'fresh');
  assert.equal(first.cells.length, 1);
  assert.equal(second.cacheState, 'hit');
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/cybermap/global-viewport');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.equal(requests[0].options.headers['X-Blue-Swallow-Operator-Token'], 'operator-session-token');
  assert.equal(requests[0].options.body, JSON.stringify(globalViewportRequest));
});

test('Global viewport client aborts a superseded request and applies only the newest response', async () => {
  const { createGlobalViewportClient } = await loadGlobalModule();
  const pending = [];
  const client = createGlobalViewportClient({
    fetchImpl: (_url, options) => new Promise((resolve) => {
      options.signal.addEventListener('abort', () => resolve(jsonResponse({}, 499)), { once: true });
      pending.push({ options, resolve });
    }),
  });

  const firstRequest = client.load(globalViewportRequest);
  const secondRequest = client.load({ ...globalViewportRequest, zoom: 3 });
  pending[1].resolve(jsonResponse(globalViewportResponse));

  const [first, second] = await Promise.all([firstRequest, secondRequest]);
  assert.equal(pending[0].options.signal.aborted, true);
  assert.equal(first.cancelled, true);
  assert.equal(second.state, 'fresh');
});

test('Global viewport client distinguishes an unavailable BSS read from an error in a materialized layer', async () => {
  const { createGlobalViewportClient } = await loadGlobalModule();
  const client = createGlobalViewportClient({
    fetchImpl: async () => jsonResponse({}, 503),
  });

  const result = await client.load(globalViewportRequest);

  assert.equal(result.state, 'unavailable');
  assert.deepEqual(result.intelligence_gaps, [{ state: 'unavailable', reason: 'global_viewport_unavailable' }]);
});

test('Global renderer preserves source health and explicit stale, error, disabled, and empty intelligence gaps', async () => {
  const { normalizeGlobalViewportResponse } = await loadGlobalModule();
  const fresh = normalizeGlobalViewportResponse(globalViewportResponse);
  assert.deepEqual(fresh.source_health, globalViewportResponse.source_health);
  assert.deepEqual(fresh.intelligence_gaps, []);
  assert.equal(fresh.state, 'fresh');

  for (const state of ['stale', 'error', 'disabled']) {
    const result = normalizeGlobalViewportResponse({
      ...globalViewportResponse,
      cells: [],
      source_health: [{ ...globalViewportResponse.source_health[0], health: state }],
      intelligence_gaps: [{ state }],
    });
    assert.equal(result.state, state);
    assert.deepEqual(result.intelligence_gaps, [{ state }]);
  }

  const empty = normalizeGlobalViewportResponse({
    ...globalViewportResponse,
    cells: [],
    source_health: [],
    intelligence_gaps: [{ state: 'empty' }],
  });
  assert.equal(empty.state, 'empty');
});

test('Global renderer labels layer provenance fields in the operator ledger', async () => {
  const { normalizeGlobalViewportResponse, renderGlobalViewportResult } = await loadGlobalModule();
  const ledger = makeElement();
  const documentRef = {
    createElement: makeElement,
    querySelector(selector) {
      return selector === '[data-godeye-global-ledger]' ? ledger : null;
    },
  };

  renderGlobalViewportResult(normalizeGlobalViewportResponse(globalViewportResponse), documentRef);

  assert.equal(ledger.children.length, 1);
  assert.match(ledger.children[0].textContent, /Source class: green_public/);
  assert.match(ledger.children[0].textContent, /Freshness: fresh/);
  assert.match(ledger.children[0].textContent, /Attribution: U\.S\. Geological Survey/);
  assert.match(ledger.children[0].textContent, /Caveats: 1/);
});

test('Global renderer keeps source class, attribution, freshness, and caveats with each aggregate cell', async () => {
  const { normalizeGlobalViewportResponse, renderGlobalViewportResult } = await loadGlobalModule();
  const cells = makeElement();
  const documentRef = {
    createElement: makeElement,
    querySelector(selector) {
      return selector === '[data-godeye-global-cells]' ? cells : null;
    },
  };

  renderGlobalViewportResult(normalizeGlobalViewportResponse(globalViewportResponse), documentRef);

  assert.equal(cells.children.length, 1);
  assert.match(cells.children[0].textContent, /Source class: green_public/);
  assert.match(cells.children[0].textContent, /Attribution: U\.S\. Geological Survey/);
  assert.match(cells.children[0].textContent, /Freshness: fresh/);
  assert.match(cells.children[0].textContent, /Caveats: public_report_not_local_observation/);
});

test('Global renderer renders aggregate cell summaries without a raw-observation fallback', async () => {
  const { normalizeGlobalViewportResponse, renderGlobalViewportResult } = await loadGlobalModule();
  const cells = makeElement();
  const documentRef = {
    createElement: makeElement,
    querySelector(selector) {
      return selector === '[data-godeye-global-cells]' ? cells : null;
    },
  };

  renderGlobalViewportResult(normalizeGlobalViewportResponse(globalViewportResponse), documentRef);

  assert.equal(cells.children.length, 1);
  assert.match(cells.children[0].textContent, /85283473fffffff/);
  assert.match(cells.children[0].textContent, /12 observations/);
  assert.doesNotMatch(cells.children[0].textContent, /bssid|ssid|device|raw/i);
});

test('Global renderer requests only the BSS global viewport path and never browser geolocation or a provider URL', () => {
  const globalModule = readGlobalModule();

  assert.match(globalModule, /['"]\/api\/cybermap\/global-viewport['"]/);
  assert.doesNotMatch(globalModule, /\bnavigator\s*\.\s*geolocation\b/);
  assert.doesNotMatch(globalModule, /\bgetCurrentPosition\b|\bwatchPosition\b/);
  assert.match(globalModule, /\bsource_health\b/);
  assert.match(globalModule, /\bintelligence_gaps\b/);
  assert.match(globalModule, /\b(last_success_at|next_retry_at)\b/);
  assert.match(globalModule, /\b(attribution|terms_url|caveat_count)\b/);
  ['fresh', 'stale', 'error', 'disabled', 'empty'].forEach((state) => {
    assert.match(globalModule, new RegExp(`\\b${state}\\b`), `Global renderer must visibly handle ${state}`);
  });
  assert.doesNotMatch(globalModule, /https?:\/\//i);
});
