import test from 'node:test';
import assert from 'node:assert/strict';

import { createCybermapApiServer } from '../src/server.mjs';
import { withServer } from './helpers.mjs';

const READ_TOKEN = 'test-cybermap-read-token-32-byte-minimum';
const request = {
  schema_version: 'bss.global_viewport_request.v1',
  bbox: { west: -125, south: 24, east: -66, north: 50 },
  zoom: 4,
  layer_ids: ['deflock-osm-alpr-reports'],
};

function store() {
  return {
    async ready() { return { ok: true, database: 'ready', migrations: 'ready' }; },
    async queryDeflockGlobalViewport(input) {
      return {
        cells: [{
          h3_cell: '822837fffffffff', resolution: input.resolution,
          centroid: { latitude: 39.1, longitude: -98.3 }, report_count: 4,
          first_seen_at: '2026-07-23T00:00:00.000Z', last_seen_at: '2026-07-23T00:00:00.000Z', salience: 0.04,
          source_ids: ['deflock-osm-alpr-reports'], source_classes: ['green_public'], evidence_class: 'public_reported',
          caveats: ['Public OSM-tagged ALPR reports; not verified or live.'],
        }],
        sources: [{
          source_id: 'deflock-osm-alpr-reports', source_class: 'green_public', status: 'fresh', allowed_preload: true,
          last_success_at: '2026-07-23T00:00:00.000Z', attribution: '© OpenStreetMap contributors; data available under ODbL. DeFlock delivery reference.', caveats: [],
        }],
      };
    },
  };
}

test('serves a token-gated, aggregate-only global viewport without an outbound provider request', async () => {
  const previous = process.env.BSS_CYBERMAP_READ_TOKEN;
  process.env.BSS_CYBERMAP_READ_TOKEN = READ_TOKEN;
  try {
    const server = createCybermapApiServer({ store: store(), now: () => Date.parse('2026-07-23T00:00:00.000Z') });
    await withServer(server, async (baseUrl) => {
      const anonymous = await fetch(`${baseUrl}/api/v1/cybermap/global-viewport`, {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request),
      });
      assert.equal(anonymous.status, 403);

      const response = await fetch(`${baseUrl}/api/v1/cybermap/global-viewport`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-blue-swallow-cybermap-read-token': READ_TOKEN },
        body: JSON.stringify(request),
      });
      assert.equal(response.status, 200);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      const body = await response.json();
      assert.equal(body.cells[0].report_count, 4);
      assert.equal('lat' in body.cells[0], false);
    });
  } finally {
    if (previous === undefined) delete process.env.BSS_CYBERMAP_READ_TOKEN;
    else process.env.BSS_CYBERMAP_READ_TOKEN = previous;
  }
});
