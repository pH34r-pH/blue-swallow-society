import test from 'node:test';
import assert from 'node:assert/strict';

import { PostgresObservationStore } from '../src/postgres-store.mjs';

const APPROVED_GLOBAL_SOURCE_CLASSES = Object.freeze([
  'green_public',
  'green_owned',
  'green_authorized',
]);
const ALL_SOURCE_CLASSES = Object.freeze([
  ...APPROVED_GLOBAL_SOURCE_CLASSES,
  'owned_device',
  'local_observation',
  'grey_enrichment',
  'orange_exposure',
  'red_restricted',
]);
const RAW_OBSERVATION_FIELDS = Object.freeze([
  'bssid',
  'ssid',
  'device_id',
  'person_label',
  'exact_track',
  'raw_frame',
  'payload',
]);
const SAFE_CELL_FIELDS = Object.freeze([
  'h3_cell',
  'resolution',
  'centroid',
  'source_classes',
  'observation_count',
  'entity_count',
  'first_seen_at',
  'last_seen_at',
  'layers',
  'freshness',
  'caveats',
  'salience',
]);
const AUTHORIZED_GREEN_SOURCE_GUARD = /\bAND\s*\(\s*source\.source_class\s*<>\s*'green_authorized'\s+OR\s+source\.authorized_scope_ref\s+IS\s+NOT\s+NULL\s*\)/i;
const ZOOM_BANDS = Object.freeze([
  { zoom: 0, resolution: 5 },
  { zoom: 3, resolution: 5 },
  { zoom: 4, resolution: 7 },
  { zoom: 7, resolution: 7 },
  { zoom: 8, resolution: 9 },
  { zoom: 11, resolution: 9 },
  { zoom: 12, resolution: 11 },
  { zoom: 16, resolution: 11 },
]);
const SEEDED_SOURCES = Object.freeze([
  approvedSource({ layer_id: 'usgs-earthquakes', source_class: 'green_public' }),
  approvedSource({ layer_id: 'owned-greenfeed', source_class: 'green_owned' }),
  approvedSource({ layer_id: 'authorized-greenfeed', source_class: 'green_authorized', authorized_scope_ref: 'scope:global-map' }),
  approvedSource({ layer_id: 'disabled-greenfeed', source_class: 'green_public', enabled: false }),
  approvedSource({ layer_id: 'unreviewed-greenfeed', source_class: 'green_public', terms_reviewed_at: null }),
  approvedSource({ layer_id: 'owned-device', source_class: 'owned_device', allowed_preload: false }),
  approvedSource({ layer_id: 'local-observation', source_class: 'local_observation', allowed_preload: false }),
  approvedSource({ layer_id: 'grey-enrichment', source_class: 'grey_enrichment', allowed_preload: false }),
  approvedSource({ layer_id: 'orange-exposure', source_class: 'orange_exposure', allowed_preload: false }),
  approvedSource({ layer_id: 'red-restricted', source_class: 'red_restricted', allowed_preload: false }),
]);
const GLOBAL_VIEWPORT_REQUEST = Object.freeze({
  bbox: { west: -123, south: 47, east: -122, north: 48 },
  layer_ids: ['usgs-earthquakes', 'owned-greenfeed', 'authorized-greenfeed'],
  since: '2026-07-21T00:00:00.000Z',
  max_cells: 17,
});

class SourceSeededGlobalViewportPool {
  constructor({ rows, sources = SEEDED_SOURCES, migrations = [] } = {}) {
    this.rows = rows ?? [];
    this.sources = sources;
    this.migrations = migrations;
    this.calls = [];
  }

  async query(sql, values = []) {
    this.calls.push({ sql, values });
    if (/\bschema_migrations\b/i.test(sql)) {
      return { rows: this.migrations.map((version) => ({ version })), rowCount: this.migrations.length };
    }
    if (!/\bcybermap_cells\b/i.test(sql)) return { rows: [], rowCount: 0 };

    const eligibleLayerIds = new Set(this.sources.filter(isGloballyEligible).map((source) => source.layer_id));
    const rows = queryConstrainedToApprovedSources(sql)
      ? this.rows.filter((row) => Object.keys(row.layers).every((layerId) => eligibleLayerIds.has(layerId)))
      : this.rows;
    return { rows, rowCount: rows.length };
  }

  async connect() {
    throw new Error('TST-002 global viewport reads must not open a write transaction.');
  }
}

test('TST-002 treats the global-cell migration as a read-readiness prerequisite', async () => {
  const pool = new SourceSeededGlobalViewportPool({
    migrations: ['0001_cybermap_core', '0002_device_ingest_contract', '0003_paper_state'],
  });
  const ready = await new PostgresObservationStore({ pool }).ready();

  assert.equal(ready.ok, false);
  assert.equal(ready.migrations, 'pending');
  assert.ok(pool.calls[0].values[0].includes('0004_godeye_global_cells_and_sources'));
});

for (const { zoom, resolution } of ZOOM_BANDS) {
  test(`TST-002 selects H3 resolution ${resolution} for global viewport zoom ${zoom}`, async () => {
    const { pool, response } = await queryGlobalViewport({ zoom, resolution });
    const cellQuery = findCellQuery(pool);

    assert.equal(response.selected_resolution, resolution);
    assert.equal(response.aggregation_applied, false);
    assert.equal(response.cells[0].resolution, resolution);
    assert.ok(cellQuery.values.includes(resolution), 'the selected H3 resolution is bound as a query parameter');
  });
}

test('TST-002 returns only catalog-approved Green aggregate cells', async () => {
  const { pool, response } = await queryGlobalViewport({ zoom: 7, resolution: 7 });
  const cellQuery = findCellQuery(pool);

  assert.deepEqual(
    new Set(SEEDED_SOURCES.map((source) => source.source_class)),
    new Set(ALL_SOURCE_CLASSES),
    'the fixture seeds every canonical source class',
  );
  assert.deepEqual(response.cells, [expectedAggregateCell(7)]);
  assert.deepEqual(response.cells[0].source_classes, ['green_public']);
  assert.ok(cellQuery.values.some((value) => arraysEqual(value, APPROVED_GLOBAL_SOURCE_CLASSES)));
  assert.match(cellQuery.sql, /JOIN\s+source_catalog\s+AS\s+source/i);
  assert.match(cellQuery.sql, /source\.enabled\s*=\s*true/i);
  assert.match(cellQuery.sql, /source\.global_layer\s*=\s*true/i);
  assert.match(cellQuery.sql, /source\.terms_reviewed_at\s+IS\s+NOT\s+NULL/i);
  assert.match(cellQuery.sql, /source\.allowed_preload\s*=\s*true/i);
  assert.match(cellQuery.sql, /source\.source_class\s*=\s*ANY\s*\(/i);
  assert.match(cellQuery.sql, /source\.layer_id\s*=\s*ANY\s*\(/i);
  assert.match(cellQuery.sql, AUTHORIZED_GREEN_SOURCE_GUARD);
});

test('TST-002 rejects an ungrouped authorized-source catalog guard', () => {
  const unsafeSql = `
    SELECT cell.h3_cell
    FROM cybermap_cells AS cell
    JOIN source_catalog AS source ON source.layer_id = ANY($1::text[])
    WHERE source.enabled = true
      AND source.global_layer = true
      AND source.terms_reviewed_at IS NOT NULL
      AND source.allowed_preload = true
      AND source.source_class = ANY($2::source_class[])
      AND source.layer_id = ANY($1::text[])
      AND source.source_class <> 'green_authorized' OR source.authorized_scope_ref IS NOT NULL
  `;

  assert.equal(queryConstrainedToApprovedSources(unsafeSql), false);
});

test('TST-002 binds a bounded aggregate result limit', async () => {
  const { pool, response } = await queryGlobalViewport({ zoom: 7, resolution: 7 });
  const cellQuery = findCellQuery(pool);

  assert.equal(response.cells.length, 1);
  assert.ok(cellQuery.values.includes(GLOBAL_VIEWPORT_REQUEST.max_cells));
  assert.match(cellQuery.sql, /LIMIT\s+\$\d+/i);
});

test('TST-002 binds ordered viewport bounds and the optional evidence cutoff', async () => {
  const { pool } = await queryGlobalViewport({ zoom: 7, resolution: 7 });
  const cellQuery = findCellQuery(pool);

  assert.match(cellQuery.sql, /ST_Intersects\s*\(\s*cell\.geom\s*,\s*ST_MakeEnvelope\s*\(/i);
  assert.match(cellQuery.sql, /cell\.last_seen_at\s*>=\s*\$\d+::timestamptz/i);
  for (const value of [
    GLOBAL_VIEWPORT_REQUEST.bbox.west,
    GLOBAL_VIEWPORT_REQUEST.bbox.south,
    GLOBAL_VIEWPORT_REQUEST.bbox.east,
    GLOBAL_VIEWPORT_REQUEST.bbox.north,
    GLOBAL_VIEWPORT_REQUEST.since,
  ]) {
    assert.ok(cellQuery.values.includes(value), `the aggregate query binds ${value}`);
  }
});

test('TST-002 returns aggregate fields without raw observation values', async () => {
  const { pool, response } = await queryGlobalViewport({ zoom: 7, resolution: 7 });
  const cellQuery = findCellQuery(pool);

  assert.deepEqual(Object.keys(response.cells[0]).sort(), [...SAFE_CELL_FIELDS].sort());
  for (const field of RAW_OBSERVATION_FIELDS) {
    assert.equal(field in response.cells[0], false, `${field} must not cross the global aggregate boundary`);
    assert.doesNotMatch(cellQuery.sql, new RegExp(`\\b${field}\\b`, 'i'));
  }
  assert.doesNotMatch(cellQuery.sql, /\bobservations\b/i);
});

async function queryGlobalViewport({ zoom, resolution }) {
  const pool = new SourceSeededGlobalViewportPool({
    rows: [
      {
        ...expectedAggregateCell(resolution),
        bssid: '00:11:22:33:44:55',
        ssid: 'forbidden-test-network',
        device_id: 'forbidden-device-id',
        person_label: 'forbidden-person-label',
        exact_track: { lat: 47.6101, lon: -122.3301 },
        raw_frame: 'base64:forbidden-frame',
        payload: { raw_location: { lat: 47.6101, lon: -122.3301 } },
      },
      {
        ...expectedAggregateCell(resolution),
        h3_cell: '872830829ffffff',
        source_classes: ['orange_exposure'],
        layers: { 'orange-exposure': { observation_count: 1 } },
        freshness: { 'orange-exposure': { state: 'fresh', age_seconds: 300 } },
      },
    ],
  });
  const store = new PostgresObservationStore({ pool });
  const response = await store.queryGlobalViewport({
    ...GLOBAL_VIEWPORT_REQUEST,
    zoom,
    now: new Date('2026-07-22T20:00:00.000Z'),
  });
  return { pool, response };
}

function expectedAggregateCell(resolution) {
  return {
    h3_cell: '872830828ffffff',
    resolution,
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
  };
}

function approvedSource({
  layer_id,
  source_class,
  enabled = true,
  global_layer = true,
  terms_reviewed_at = '2026-07-22T00:00:00.000Z',
  allowed_preload = true,
  authorized_scope_ref = null,
}) {
  return Object.freeze({
    layer_id,
    source_class,
    enabled,
    global_layer,
    terms_reviewed_at,
    allowed_preload,
    authorized_scope_ref,
  });
}

function isGloballyEligible(source) {
  return source.enabled
    && source.global_layer
    && source.terms_reviewed_at !== null
    && source.allowed_preload
    && APPROVED_GLOBAL_SOURCE_CLASSES.includes(source.source_class)
    && (source.source_class !== 'green_authorized' || source.authorized_scope_ref !== null);
}

function queryConstrainedToApprovedSources(sql) {
  const normalized = sql.replace(/\s+/g, ' ').trim();
  return /JOIN source_catalog AS source/i.test(normalized)
    && /source\.enabled = true/i.test(normalized)
    && /source\.global_layer = true/i.test(normalized)
    && /source\.terms_reviewed_at IS NOT NULL/i.test(normalized)
    && /source\.allowed_preload = true/i.test(normalized)
    && /source\.source_class = ANY\(/i.test(normalized)
    && /source\.layer_id = ANY\(/i.test(normalized)
    && AUTHORIZED_GREEN_SOURCE_GUARD.test(normalized);
}

function findCellQuery(pool) {
  const call = pool.calls.find(({ sql }) => /\bcybermap_cells\b/i.test(sql));
  assert.ok(call, 'the global viewport store must query materialized cybermap_cells');
  return call;
}

function arraysEqual(value, expected) {
  return Array.isArray(value)
    && value.length === expected.length
    && value.every((entry, index) => entry === expected[index]);
}
