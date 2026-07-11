import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCybermapMapState,
  buildCybermapViewportPath,
  createEmptyCybermapState,
  formatCybermapCellAffordance,
  parseCybermapViewportPayload,
} from '../app/cybermap.mjs';

const FIXTURE_LOCATION = { lat: 47.6154, lon: -122.3362, accuracy: 18, heading: 25 };

function fixtureCell(overrides = {}) {
  return {
    h3_cell: '8928308280fffff',
    resolution: 9,
    geom: {
      type: 'Polygon',
      coordinates: [[
        [-122.3365, 47.6152],
        [-122.3359, 47.6152],
        [-122.3359, 47.6157],
        [-122.3365, 47.6157],
        [-122.3365, 47.6152],
      ]],
    },
    source_classes: ['green_public', 'owned_device'],
    observation_count: 4,
    entity_count: 2,
    freshness: {
      last_observed_at: '2026-07-10T11:58:00.000Z',
      last_ingested_at: '2026-07-10T11:59:00.000Z',
      age_seconds: 120,
      stale: false,
    },
    caveats: [
      { code: 'local_owned_context_not_global_preload', severity: 'info', message: 'Owned-device context is visible only for scoped operators.' },
    ],
    salience: 0.83,
    confidence: 0.76,
    ...overrides,
  };
}

test('buildCybermapViewportPath builds same-origin /api/cybermap viewport requests only', () => {
  const path = buildCybermapViewportPath({
    location: FIXTURE_LOCATION,
    zoom: 15,
    radiusMeters: 250,
    layers: ['green_preload', 'local_owned'],
  });

  assert.match(path, /^\/api\/cybermap\/viewport\?/);
  assert.match(path, /bbox=/);
  assert.match(path, /zoom=15/);
  assert.match(path, /layers=green_preload%2Clocal_owned/);
  assert.doesNotMatch(path, /^https?:\/\//);
});

test('createEmptyCybermapState renders backend-empty or disconnected state without demo cells', () => {
  const empty = createEmptyCybermapState({
    reason: 'backend_unavailable',
    message: 'Cybermap backend unavailable; showing empty degraded map.',
  });

  assert.equal(empty.ready, false);
  assert.equal(empty.state, 'degraded');
  assert.equal(empty.cells.length, 0);
  assert.match(empty.statusText, /backend unavailable/i);
  assert.doesNotMatch(JSON.stringify(empty), /sample|demo|fake|BSS-WorkRouter|WiGLE/i);
});

test('parseCybermapViewportPayload preserves explicit empty backend state without fabricating overlays', () => {
  const parsed = parseCybermapViewportPayload({
    ok: true,
    state: 'degraded',
    cells: [],
    caveats: [{ code: 'backend_empty', severity: 'info', message: 'No materialized cells in this viewport.' }],
    generated_at: '2026-07-10T12:00:00.000Z',
  });

  assert.equal(parsed.ready, false);
  assert.equal(parsed.state, 'degraded');
  assert.equal(parsed.cells.length, 0);
  assert.match(parsed.statusText, /No backend Cybermap cells/i);
  assert.equal(JSON.stringify(parsed).includes('sample'), false);
});

test('buildCybermapMapState renders source class, freshness, confidence/salience, and caveats', () => {
  const state = parseCybermapViewportPayload({
    ok: true,
    cells: [fixtureCell()],
    generated_at: '2026-07-10T12:00:00.000Z',
  });
  const layout = buildCybermapMapState({
    location: FIXTURE_LOCATION,
    cells: state.cells,
    viewportWidth: 1024,
    viewportHeight: 768,
    zoom: 15,
  });

  assert.equal(layout.markers.length, 1);
  const [marker] = layout.markers;
  assert.equal(marker.id, '8928308280fffff');
  assert.match(marker.sourceClassSummary, /green public/i);
  assert.match(marker.sourceClassSummary, /owned device/i);
  assert.match(marker.freshnessLabel, /2m old/i);
  assert.match(marker.confidenceLabel, /76% confidence/i);
  assert.match(marker.confidenceLabel, /salience 0\.83/i);
  assert.match(marker.caveatSummary, /Owned-device context/i);
  assert.ok(marker.left >= 0 && marker.left <= 1024);
  assert.ok(marker.top >= 0 && marker.top <= 768);
});

test('formatCybermapCellAffordance falls back to explicit caveat labels rather than hidden raw data', () => {
  const affordance = formatCybermapCellAffordance(fixtureCell({
    source_classes: ['green_public'],
    caveats: [{ code: 'restricted_layer_filtered', severity: 'warning' }],
    salience: null,
    confidence: null,
  }));

  assert.match(affordance.title, /Cybermap cell/);
  assert.match(affordance.meta, /green public/i);
  assert.match(affordance.detail, /restricted layer filtered/i);
  assert.doesNotMatch(JSON.stringify(affordance), /ssid|bssid|sample|demo/i);
});
