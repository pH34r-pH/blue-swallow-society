import test from 'node:test';
import assert from 'node:assert/strict';

import {
  DeflockViewportError,
  buildDeflockViewportResponse,
  validateDeflockViewportRequest,
} from '../src/deflock-viewport-contract.mjs';

const validRequest = {
  schema_version: 'bss.global_viewport_request.v1',
  bbox: { west: -125, south: 24, east: -66, north: 50 },
  zoom: 4,
  layer_ids: ['deflock-osm-alpr-reports'],
};

test('validates a bounded DeFlock global viewport request and maps its zoom to H3 resolution 2', () => {
  const request = validateDeflockViewportRequest(validRequest);
  assert.deepEqual(request, {
    ...validRequest,
    bbox: { west: -125, south: 24, east: -66, north: 50 },
    layer_ids: ['deflock-osm-alpr-reports'],
    resolution: 2,
    cell_limit: 1000,
  });
});

test('rejects wrapped or oversized global viewport requests and unknown layers', () => {
  for (const [payload, code] of [
    [{ ...validRequest, bbox: { west: 170, south: -10, east: -170, north: 10 } }, 'wrapped_bbox'],
    [{ ...validRequest, zoom: 4.5 }, 'invalid_zoom'],
    [{ ...validRequest, layer_ids: ['unknown'] }, 'unknown_layer'],
    [{ ...validRequest, cell_limit: 1001 }, 'cell_limit_exceeded'],
  ]) {
    assert.throws(() => validateDeflockViewportRequest(payload), (error) => error instanceof DeflockViewportError && error.code === code);
  }
});

test('shapes aggregate-only global responses and rejects raw report fields', () => {
  const response = buildDeflockViewportResponse({
    request: validateDeflockViewportRequest(validRequest),
    cells: [{
      h3_cell: '822837fffffffff',
      resolution: 2,
      centroid: { latitude: 39.1, longitude: -98.3 },
      report_count: 12,
      first_seen_at: '2026-07-23T00:00:00.000Z',
      last_seen_at: '2026-07-23T00:00:00.000Z',
      salience: 0.12,
      source_ids: ['deflock-osm-alpr-reports'],
      source_classes: ['green_public'],
      evidence_class: 'public_reported',
      caveats: ['Public OSM-tagged ALPR reports; not verified or live.'],
    }],
    sources: [{
      source_id: 'deflock-osm-alpr-reports',
      source_class: 'green_public',
      status: 'disabled',
      allowed_preload: false,
      last_success_at: null,
      attribution: '© OpenStreetMap contributors; data available under ODbL. DeFlock delivery reference.',
      caveats: ['Terms review pending.'],
    }],
    now: '2026-07-23T00:00:00.000Z',
  });

  assert.equal(response.ok, true);
  assert.equal(response.cells[0].report_count, 12);
  assert.equal(response.cells[0].centroid.latitude, 39.1);
  assert.equal('lat' in response.cells[0], false);
  assert.equal('lon' in response.cells[0], false);
  assert.equal(response.sources[0].status, 'disabled');

  assert.throws(() => buildDeflockViewportResponse({
    request: validateDeflockViewportRequest(validRequest),
    cells: [{ ...response.cells[0], lat: 47.6 }],
    sources: [],
  }), (error) => error instanceof DeflockViewportError && error.code === 'raw_cell_field');
});
