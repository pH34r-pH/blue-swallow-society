import test from 'node:test';
import assert from 'node:assert/strict';

import { PostgresObservationStore } from '../src/postgres-store.mjs';

class Pool {
  constructor(rows) { this.rows = rows; this.calls = []; }
  async query(sql, values) {
    this.calls.push({ sql, values });
    return { rows: this.rows.shift() ?? [] };
  }
  async connect() { return { query: this.query.bind(this), release() {} }; }
}

test('Postgres global viewport reads catalog health and bounded aggregate cells without provider fan-out', async () => {
  const pool = new Pool([
    [{ source_id: 'deflock-osm-alpr-reports', source_class: 'green_public', status: 'fresh', allowed_preload: true, last_success_at: '2026-07-23T00:00:00.000Z', attribution: '© OpenStreetMap contributors; data available under ODbL. DeFlock delivery reference.', caveats: [] }],
    [{ h3_cell: '822837fffffffff', resolution: 2, latitude: 39.1, longitude: -98.3, report_count: 7, first_seen_at: '2026-07-23T00:00:00.000Z', last_seen_at: '2026-07-23T00:00:00.000Z', salience: 0.07, source_ids: ['deflock-osm-alpr-reports'], source_classes: ['green_public'], evidence_class: 'public_reported', caveats: ['Public OSM-tagged ALPR reports; not verified or live.'] }],
  ]);
  const store = new PostgresObservationStore({ pool });
  const result = await store.queryDeflockGlobalViewport({
    bbox: { west: -125, south: 24, east: -66, north: 50 }, resolution: 2,
    layer_ids: ['deflock-osm-alpr-reports'], cell_limit: 1000,
  });
  assert.equal(result.sources[0].status, 'fresh');
  assert.equal(result.cells[0].report_count, 7);
  assert.equal(pool.calls.length, 2);
  assert.match(pool.calls[1].sql, /FROM global_source_cells/i);
  assert.equal(pool.calls[1].sql.includes('dontgetflocked.com'), false);
  assert.deepEqual(pool.calls[1].values, [['deflock-osm-alpr-reports'], 2, -125, 24, -66, 50, 1000]);
});

test('Postgres source-job lookup returns only the configured DeFlock catalog controls', async () => {
  const pool = new Pool([[
    { source_key: 'deflock-osm-alpr-reports', enabled: true, terms_reviewed: true },
  ]]);
  const store = new PostgresObservationStore({ pool });
  const source = await store.getDeflockSource('deflock-osm-alpr-reports');
  assert.deepEqual(source, { source_key: 'deflock-osm-alpr-reports', enabled: true, terms_reviewed: true });
  assert.match(pool.calls[0].sql, /FROM source_catalog/i);
  assert.deepEqual(pool.calls[0].values, ['deflock-osm-alpr-reports']);
});
