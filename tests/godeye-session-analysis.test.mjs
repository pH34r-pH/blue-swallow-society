import test from 'node:test';
import assert from 'node:assert/strict';

import {
  clearGodeyeSessionAnalysis,
  deriveGodeyeSessionAnalysis,
} from '../api/_private/operator/assets/godeye-session-analysis.mjs';

function record(index, overrides = {}) {
  return {
    id: `observation-${index}`,
    kind: 'wifi_access_point',
    sourceClass: index % 2 === 0 ? 'owned_device' : 'green_public',
    observedAt: `2026-07-26T12:${String(index % 60).padStart(2, '0')}:00.000Z`,
    lastSeen: `2026-07-26T12:${String(index % 60).padStart(2, '0')}:00.000Z`,
    ssid: `must-not-survive-${index}`,
    bssid: `00:11:22:33:44:${String(index).padStart(2, '0')}`,
    lat: 47.6062,
    lon: -122.3321,
    provenance: { raw: 'must-not-survive' },
    ...overrides,
  };
}

test('session analysis derives bounded provenance-safe state from authorized viewport records', () => {
  const analysis = deriveGodeyeSessionAnalysis({
    accessPoints: Array.from({ length: 30 }, (_, index) => record(index)),
    updatedAt: '2026-07-26T13:00:00.000Z',
  });

  assert.equal(analysis.totalRecords, 30);
  assert.deepEqual(analysis.sourceClassCounts, { green_public: 15, owned_device: 15 });
  assert.equal(analysis.newestObservedAt, '2026-07-26T12:29:00.000Z');
  assert.equal(analysis.timeline.length, 24);
  assert.deepEqual(Object.keys(analysis.timeline[0]).sort(), ['kind', 'observedAt', 'sourceClass']);
  assert.equal(JSON.stringify(analysis).includes('must-not-survive'), false);
  assert.equal(JSON.stringify(analysis).includes('47.6062'), false);
});

test('session analysis ignores malformed records and has a deterministic empty state', () => {
  const analysis = deriveGodeyeSessionAnalysis({
    accessPoints: [
      record(1, { observedAt: 'not-a-date' }),
      null,
      { sourceClass: 'green_public', observedAt: '2026-07-26T12:00:00.000Z' },
      record(2),
    ],
  });

  assert.equal(analysis.totalRecords, 1);
  assert.deepEqual(analysis.sourceClassCounts, { owned_device: 1 });
  assert.equal(analysis.timeline.length, 1);
  assert.deepEqual(deriveGodeyeSessionAnalysis(null), clearGodeyeSessionAnalysis());
  assert.deepEqual(clearGodeyeSessionAnalysis(), {
    totalRecords: 0,
    sourceClassCounts: {},
    newestObservedAt: null,
    timeline: [],
  });
});
