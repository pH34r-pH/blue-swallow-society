import test from 'node:test';
import assert from 'node:assert/strict';

import { MemoryObservationStore } from '../src/memory-store.mjs';

const SOURCE = {
  source_key: 'deflock-osm-alpr-reports',
  source_class: 'green_public',
  enabled: true,
  allowed_preload: true,
  terms_reviewed: false,
  attribution: '© OpenStreetMap contributors; data available under ODbL. DeFlock delivery reference.',
  last_success_at: '2026-07-23T00:00:00.000Z',
  cache_ttl_seconds: 86400,
};

const CELL = {
  h3_cell: '822837fffffffff', resolution: 2,
  centroid: { latitude: 39.1, longitude: -98.3 }, report_count: 7,
  first_seen_at: '2026-07-23T00:00:00.000Z', last_seen_at: '2026-07-23T00:00:00.000Z', salience: 0.07,
  source_ids: ['deflock-osm-alpr-reports'], source_classes: ['green_public'], evidence_class: 'public_reported',
  caveats: ['Public OSM-tagged ALPR reports; not verified or live.'],
};

test('memory DeFlock read model returns enabled aggregate cells without a terms-review gate', async () => {
  const store = new MemoryObservationStore({
    deflockSources: [SOURCE],
    now: () => new Date('2026-07-23T12:00:00.000Z'),
  });
  await store.replaceDeflockSourceCells({ source_id: SOURCE.source_key, observed_at: '2026-07-23T00:00:00.000Z', cells: [CELL] });
  const result = await store.queryDeflockGlobalViewport({
    bbox: { west: -125, south: 24, east: -66, north: 50 }, resolution: 2,
    layer_ids: [SOURCE.source_key], cell_limit: 1000,
  });
  assert.equal(result.cells.length, 1);
  assert.equal(result.cells[0].report_count, 7);
  assert.equal(result.sources[0].status, 'fresh');
  assert.equal('boundary' in result.cells[0], false);
});

test('memory DeFlock read model retains disabled source health but hides its cells', async () => {
  const store = new MemoryObservationStore({ deflockSources: [{ ...SOURCE, enabled: false }] });
  await store.replaceDeflockSourceCells({ source_id: SOURCE.source_key, observed_at: '2026-07-23T00:00:00.000Z', cells: [CELL] });
  const result = await store.queryDeflockGlobalViewport({
    bbox: { west: -125, south: 24, east: -66, north: 50 }, resolution: 2,
    layer_ids: [SOURCE.source_key], cell_limit: 1000,
  });
  assert.deepEqual(result.cells, []);
  assert.equal(result.sources[0].status, 'disabled');
});
