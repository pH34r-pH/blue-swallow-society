import assert from 'node:assert/strict';
import http from 'node:http';
import test from 'node:test';

import { createCybermapApiServer } from '../src/server.mjs';
import { withServer } from './helpers.mjs';

const BACKEND_READ_TOKEN = 'test-global-viewport-backend-read-token';
const GLOBAL_VIEWPORT_PATH = '/api/v1/cybermap/global-viewport';
const VALID_REQUEST = Object.freeze({
  schema_version: 'bss.godeye.global_viewport.v1',
  bbox: { west: -123, south: 47, east: -122, north: 48 },
  zoom: 7,
  layer_ids: ['usgs-earthquakes'],
  since: '2026-07-21T00:00:00.000Z',
  max_cells: 17,
});
const VALID_RESPONSE = Object.freeze({
  ok: true,
  schema_version: 'bss.godeye.global_viewport.v1',
  mode: 'global',
  generated_at: '2026-07-22T20:00:00.000Z',
  bbox: VALID_REQUEST.bbox,
  requested_zoom: VALID_REQUEST.zoom,
  selected_resolution: 7,
  aggregation_applied: false,
  cells: [{
    h3_cell: '872830828ffffff',
    resolution: 7,
    centroid: { lat: 47.61, lon: -122.33 },
    source_classes: ['green_public'],
    observation_count: 12,
    entity_count: 0,
    first_seen_at: '2026-07-22T19:00:00.000Z',
    last_seen_at: '2026-07-22T19:55:00.000Z',
    layers: { 'usgs-earthquakes': { observation_count: 12 } },
    freshness: { 'usgs-earthquakes': { state: 'fresh', age_seconds: 300 } },
    caveats: ['public_report_not_local_observation'],
    salience: 0.62,
  }],
  source_health: [{
    layer_id: 'usgs-earthquakes',
    display_name: 'USGS earthquakes',
    source_class: 'green_public',
    health: 'fresh',
    last_success_at: '2026-07-22T19:55:00.000Z',
    next_retry_at: '2026-07-22T20:00:00.000Z',
    terms_url: 'https://earthquake.usgs.gov/',
    attribution: 'U.S. Geological Survey',
    caveat_count: 1,
  }],
  intelligence_gaps: [],
});

class GlobalViewportStore {
  queries = [];

  async queryGlobalViewport(request) {
    this.queries.push(structuredClone(request));
    return structuredClone(VALID_RESPONSE);
  }
}

test('TST-003 fails closed when the global viewport backend credential is missing or invalid', async () => {
  await withGlobalReadToken(async () => {
    const store = new GlobalViewportStore();
    const server = createCybermapApiServer({ store });
    await withServer(server, async (baseUrl) => {
      for (const token of [null, 'invalid-global-viewport-token']) {
        const response = await postGlobalViewport(baseUrl, VALID_REQUEST, token);
        assert.equal(response.statusCode, 403);
        assert.equal(response.headers['cache-control'], 'no-store');
        assert.deepEqual(response.body, { ok: false, error: 'forbidden' });
      }
    });
    assert.deepEqual(store.queries, []);
  });
});

test('TST-003 maps malformed, invalid-bounds, and oversized global viewport bodies to fixed errors', async () => {
  await withGlobalReadToken(async () => {
    const store = new GlobalViewportStore();
    const server = createCybermapApiServer({ store });
    await withServer(server, async (baseUrl) => {
      const malformed = await postGlobalViewport(baseUrl, '{malformed-json', BACKEND_READ_TOKEN);
      assert.equal(malformed.statusCode, 400);
      assert.equal(malformed.headers['cache-control'], 'no-store');
      assert.deepEqual(malformed.body, { ok: false, error: 'invalid_global_viewport' });

      const wrappedBounds = await postGlobalViewport(baseUrl, {
        ...VALID_REQUEST,
        bbox: { west: 170, south: -10, east: -170, north: 10 },
      }, BACKEND_READ_TOKEN);
      assert.equal(wrappedBounds.statusCode, 400);
      assert.deepEqual(wrappedBounds.body, { ok: false, error: 'invalid_global_viewport' });

      const oversized = await postGlobalViewport(baseUrl, { ...VALID_REQUEST, max_cells: 1_001 }, BACKEND_READ_TOKEN);
      assert.equal(oversized.statusCode, 413);
      assert.deepEqual(oversized.body, { ok: false, error: 'viewport_too_large' });
    });
    assert.deepEqual(store.queries, []);
  });
});

test('TST-003 returns no-store aggregate data through the backend-read route without a provider fetch', async () => {
  await withGlobalReadToken(async () => {
    const store = new GlobalViewportStore();
    const server = createCybermapApiServer({ store });
    const originalFetch = globalThis.fetch;
    let providerFetches = 0;
    globalThis.fetch = async () => {
      providerFetches += 1;
      throw new Error('A global viewport read must not fetch a provider.');
    };

    try {
      await withServer(server, async (baseUrl) => {
        const response = await postGlobalViewport(baseUrl, VALID_REQUEST, BACKEND_READ_TOKEN);
        assert.equal(response.statusCode, 200);
        assert.equal(response.headers['cache-control'], 'no-store');
        assert.deepEqual(response.body, VALID_RESPONSE);
      });
    } finally {
      globalThis.fetch = originalFetch;
    }

    assert.equal(providerFetches, 0);
    assert.deepEqual(store.queries, [VALID_REQUEST]);
  });
});

async function withGlobalReadToken(run) {
  const previousToken = process.env.BSS_CYBERMAP_READ_TOKEN;
  process.env.BSS_CYBERMAP_READ_TOKEN = BACKEND_READ_TOKEN;
  try {
    return await run();
  } finally {
    if (previousToken === undefined) delete process.env.BSS_CYBERMAP_READ_TOKEN;
    else process.env.BSS_CYBERMAP_READ_TOKEN = previousToken;
  }
}

function postGlobalViewport(baseUrl, body, token) {
  const url = new URL(GLOBAL_VIEWPORT_PATH, baseUrl);
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  const headers = {
    'content-type': 'application/json; charset=utf-8',
    'content-length': String(Buffer.byteLength(payload)),
  };
  if (token !== null) headers['x-blue-swallow-cybermap-read-token'] = token;

  return new Promise((resolve, reject) => {
    const request = http.request(url, { method: 'POST', headers }, (response) => {
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('error', reject);
      response.on('end', () => {
        try {
          resolve({
            statusCode: response.statusCode,
            headers: response.headers,
            body: JSON.parse(Buffer.concat(chunks).toString('utf8')),
          });
        } catch (error) {
          reject(error);
        }
      });
    });
    request.on('error', reject);
    request.end(payload);
  });
}
