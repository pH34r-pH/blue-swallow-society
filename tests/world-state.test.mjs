import test from 'node:test';
import assert from 'node:assert/strict';
import { filterWorld, validateWorldSnapshot, safeWorldLink, worldGeometryBudget } from '../api/_private/operator/assets/world-state.mjs';
const item = (id, lon, lat, sourceId = 'usgs-earthquakes') => ({ id, sourceId, title: id, geometry: { type: 'Point', coordinates: [lon, lat] }, eventAt: '2026-09-30T08:00:00Z', semantics: 'observed', freshness: 'fresh' });
const data = { version: 'bss.world.v1', boundary: 'public_context_not_entity_evidence', sources: [{ id: 'usgs-earthquakes' }, { id: 'nws-alerts' }], items: [item('Seattle', -122, 47), item('Alaska', -150, 64), item('Hawaii', -157, 21), item('Paris', 2, 49), { ...item('zone alert', 0, 0, 'nws-alerts'), geometry: null, regions: ['WA'] }] };
test('World filters are opt-in, include US Alaska/Hawaii and preserve zone-only WA alerts', () => {
  assert.equal(filterWorld(data).total, 0);
  assert.deepEqual(filterWorld(data, { preset: 'wa', sources: ['usgs-earthquakes', 'nws-alerts'], sort: 'title' }).items.map((r) => r.id), ['Seattle', 'zone alert']);
  assert.equal(filterWorld(data, { preset: 'us', sources: ['usgs-earthquakes'] }).total, 3);
  assert.equal(filterWorld(data, { preset: 'global', sources: ['usgs-earthquakes'], search: 'paris' }).total, 1);
  assert.equal(filterWorld(data, { preset: 'global', sources: ['usgs-earthquakes'], semantics: 'predicted' }).total, 0);
});
test('World pages cap DOM inputs at 50, clamp invalid page and reject overlarge/duplicate responses', () => {
  const large = { ...data, items: Array.from({ length: 4000 }, (_, i) => item(`synthetic-${i}`, -122, 47)) };
  assert.equal(filterWorld(large, { sources: ['usgs-earthquakes'], page: 9999 }).items.length, 50);
  assert.equal(filterWorld(large, { sources: ['usgs-earthquakes'], page: 9999 }).page, 79);
  assert.equal(validateWorldSnapshot(large), large);
  assert.throws(() => validateWorldSnapshot({ ...large, items: [...large.items, ...large.items, item('overflow', 0, 0)] }));
  assert.throws(() => validateWorldSnapshot({ ...data, items: [data.items[0], data.items[0]] }));
  assert.equal(safeWorldLink('javascript:alert(1)'), null);
  assert.equal(safeWorldLink('https://user:pass@example.com'), null);
});

test('globe geometry budget caps features and vertices without changing list completeness', () => {
  const items = Array.from({ length: 4000 }, (_, i) => item(`synthetic-${i}`, -122, 47));
  assert.equal(worldGeometryBudget(items).items.length, 1000);
  const ring = Array.from({ length: 1500 }, () => [-122, 47]);
  const polygons = Array.from({ length: 30 }, (_, i) => ({ ...item(`area-${i}`, 0, 0), geometry: { type: 'Polygon', coordinates: [ring] } }));
  assert.equal(worldGeometryBudget(polygons).items.length, 13);
  assert.equal(worldGeometryBudget(polygons).vertices, 19500);
  assert.equal(items.length, 4000);
});
