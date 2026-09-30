import test from 'node:test';
import assert from 'node:assert/strict';
import { createHistoryController, historyRequest, historyUrl, pageStatus } from '../api/_private/operator/assets/travels-state.mjs';
import { captureFeatures } from '../api/_private/operator/assets/travels-map.mjs';
const now = Date.parse('2026-09-30T12:00:00Z');
const row = { id: '10000000-0000-4000-8000-000000000001', observedAt: '2026-09-20T00:00:00Z', captureLocation: { latitude: 0, longitude: 0 }, emitterLocation: null };
const page = { ok: true, schemaVersion: 'bss.observation_history.v1', retrievedAt: new Date(now).toISOString(), observations: [row], selected: null };

test('history state clears failed/empty results, rejects racing loads, and never restamps stale retrieval', async () => {
  const resolves = [];
  const controller = createHistoryController({ fetchPage: () => new Promise((resolve, reject) => resolves.push({ resolve, reject })), render() {}, now: () => now });
  const first = controller.load({}); const second = controller.load({});
  resolves[1].resolve(page); await second;
  resolves[0].resolve({ ...page, observations: [] }); await first;
  assert.equal(controller.getState().data.observations.length, 1);
  assert.match(pageStatus(controller.getState(), now + 60000), /stale/);
  controller.tick(); assert.equal(controller.getState().data.retrievedAt, page.retrievedAt);
  const failed = controller.load({}); assert.equal(controller.getState().data, null);
  resolves[2].reject(new Error()); await failed;
  assert.equal(controller.getState().data, null); assert.match(pageStatus(controller.getState()), /unavailable/);
  const empty = controller.load({}); resolves[3].resolve({ ...page, observations: [] }); await empty;
  assert.match(pageStatus(controller.getState(), now), /No personal observations/);
  controller.destroy(); assert.equal(controller.getState().data, null);
});

test('history URL restores canonical selection/filter/cursor without coordinates or radio identifiers', () => {
  const query = historyRequest('https://example.test/operator/travels', now);
  const url = historyUrl('https://example.test/operator/travels?unrelated=kept', { ...query, selectedId: row.id, cursor: 'synthetic' });
  const restored = historyRequest('https://example.test' + url, now + 99999);
  assert.equal(restored.from, query.from); assert.equal(restored.to, query.to);
  assert.equal(restored.selectedId, row.id); assert.equal(restored.cursor, 'synthetic');
  assert.match(url, /unrelated=kept/); assert.doesNotMatch(url, /latitude|longitude|bssid|ssid/);
});

test('map features share canonical observation IDs and plot finite capture points only', () => {
  const features = captureFeatures([row, { ...row, id: 'unknown', captureLocation: { latitude: null, longitude: null }, emitterLocation: { latitude: 10, longitude: 20 } }]);
  assert.equal(features.features.length, 1); assert.equal(features.features[0].id, row.id);
  assert.deepEqual(features.features[0].geometry.coordinates, [0, 0]);
});
