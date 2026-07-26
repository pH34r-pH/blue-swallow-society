import test from 'node:test';
import assert from 'node:assert/strict';

import { materializeDeflockReports } from '../src/deflock-materializer.mjs';

const reports = [
  { latitude: 47.6062, longitude: -122.3321 },
  { latitude: 47.6062, longitude: -122.3321 },
  { latitude: 47.6205, longitude: -122.3493 },
];

test('materializes synthetic DeFlock reports to H3 2/4/5 aggregate cells only', () => {
  const cells = materializeDeflockReports(reports, { observedAt: '2026-07-23T00:00:00.000Z' });
  assert.ok(cells.length >= 3);
  assert.deepEqual([...new Set(cells.map((cell) => cell.resolution))].sort((a, b) => a - b), [2, 4, 5]);
  assert.ok(cells.every((cell) => cell.source_ids.length === 1 && cell.source_ids[0] === 'deflock-osm-alpr-reports'));
  assert.ok(cells.every((cell) => cell.source_classes.length === 1 && cell.source_classes[0] === 'green_public'));
  assert.ok(cells.every((cell) => cell.evidence_class === 'public_reported'));
  assert.ok(cells.every((cell) => Number.isInteger(cell.report_count) && cell.report_count > 0));
  assert.ok(cells.every((cell) => !('osm_id' in cell) && !('brand' in cell) && !('operator' in cell) && !('direction' in cell)));
  assert.ok(cells.every((cell) => Object.keys(cell.centroid).sort().join(',') === 'latitude,longitude'));
});

test('rejects invalid report coordinates before materialization', () => {
  assert.throws(() => materializeDeflockReports([{ latitude: 91, longitude: 0 }]));
});
