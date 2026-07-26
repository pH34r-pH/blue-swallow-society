import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GlobalViewportContractError,
  validateGlobalViewportRequest,
  validateGlobalViewportResponse,
} from '../src/global-viewport-contract.mjs';

const SUPPORTED_LAYER_IDS = Object.freeze([
  'usgs-earthquakes',
  'gdacs-alerts',
  'nasa-eonet-events',
]);

const VALID_REQUEST = Object.freeze({
  schema_version: 'bss.godeye.global_viewport.v1',
  bbox: { west: -123, south: 47, east: -122, north: 48 },
  zoom: 7,
  layer_ids: ['usgs-earthquakes', 'gdacs-alerts'],
  since: '2026-07-21T00:00:00.000Z',
  max_cells: 1_000,
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

function contractOptions() {
  return { supportedLayerIds: SUPPORTED_LAYER_IDS };
}

function assertGlobalViewportError(code) {
  return (error) => error instanceof GlobalViewportContractError && error.code === code;
}

test('accepts a bounded global viewport request and aggregate-only response', () => {
  const request = validateGlobalViewportRequest(structuredClone(VALID_REQUEST), contractOptions());
  const response = validateGlobalViewportResponse(structuredClone(VALID_RESPONSE), contractOptions());

  assert.deepEqual(request, VALID_REQUEST);
  assert.equal(Object.isFrozen(request), true);
  assert.deepEqual(response, VALID_RESPONSE);
  assert.equal(Object.isFrozen(response), true);
});

test('rejects malformed and antimeridian-wrapped global viewport bounds', () => {
  for (const bbox of [
    { west: -123, south: 47, east: -122 },
    { west: -123, south: 48, east: -122, north: 47 },
    { west: -123, south: 47, east: -123, north: 48 },
    { west: 170, south: -10, east: -170, north: 10 },
    { west: -181, south: 47, east: -122, north: 48 },
  ]) {
    assert.throws(
      () => validateGlobalViewportRequest({ ...VALID_REQUEST, bbox }, contractOptions()),
      assertGlobalViewportError('invalid_global_viewport'),
    );
  }
});

test('rejects unsupported global viewport zoom values', () => {
  for (const zoom of [-1, 16.5, 17]) {
    assert.throws(
      () => validateGlobalViewportRequest({ ...VALID_REQUEST, zoom }, contractOptions()),
      assertGlobalViewportError('invalid_global_viewport'),
    );
  }
});

test('rejects a global viewport request for an unknown layer', () => {
  assert.throws(
    () => validateGlobalViewportRequest({ ...VALID_REQUEST, layer_ids: ['unreviewed-provider'] }, contractOptions()),
    assertGlobalViewportError('invalid_global_viewport'),
  );
});

test('rejects a global viewport request above the cell budget', () => {
  assert.throws(
    () => validateGlobalViewportRequest({ ...VALID_REQUEST, max_cells: 1_001 }, contractOptions()),
    assertGlobalViewportError('viewport_too_large'),
  );
});

test('rejects raw observation fields from global viewport cells', () => {
  for (const rawField of ['bssid', 'ssid', 'device_id', 'raw_frame', 'location']) {
    assert.throws(
      () => validateGlobalViewportResponse({
        ...VALID_RESPONSE,
        cells: [{ ...VALID_RESPONSE.cells[0], [rawField]: 'forbidden-raw-observation-value' }],
      }, contractOptions()),
      assertGlobalViewportError('invalid_global_viewport'),
    );
  }
});
