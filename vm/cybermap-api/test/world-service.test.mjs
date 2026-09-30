import test from 'node:test';
import assert from 'node:assert/strict';
import { createWorldService } from '../src/world-service.mjs';
import { normalizeNws, normalizeExistingWorldSource, WORLD_LIMITS } from '../src/world-sources.mjs';
import { createWorldAcquisition } from '../src/world-acquisition.mjs';
// Synthetic provider-shaped fixtures; no real events or credentials. Never imported by runtime modules.
const at = Date.parse('2026-09-30T08:00:00Z');
const quake = { features: [{ id: 'synthetic-quake', geometry: { type: 'Point', coordinates: [-122, 47, 8] }, properties: { type: 'earthquake', mag: 2, time: at, updated: at + 1000, title: 'Synthetic USGS test event' } }] };
const alert = { features: [{ id: 'synthetic-nws', geometry: null, properties: { id: 'synthetic-nws', status: 'Actual', sent: new Date(at).toISOString(), onset: new Date(at + 10000).toISOString(), expires: new Date(at + 60000).toISOString(), certainty: 'Likely', severity: 'Minor', headline: 'Synthetic zone-only alert', geocode: { UGC: ['WAZ001'] } } }] };
const json = (body) => new Response(JSON.stringify(body), { status: 200 });
test('existing normalizer preserves source/event/update/fetch bindings; NWS never fabricates point geometry', () => {
  const fetchAt = new Date(at + 20000).toISOString();
  const record = normalizeExistingWorldSource('usgs-earthquakes', quake, fetchAt).items[0];
  assert.equal(record.eventAt, new Date(at).toISOString()); assert.equal(record.updatedAt, new Date(at + 1000).toISOString()); assert.equal(record.fetchedAt, fetchAt);
  const nws = normalizeNws(alert, fetchAt).items[0];
  assert.equal(nws.geometry, null); assert.equal(nws.semantics, 'predicted'); assert.deepEqual(nws.regions, ['WA']);
  assert.equal(normalizeNws({ features: [{ ...alert.features[0], geometry: { type: 'Point', coordinates: [0, 0] } }] }, fetchAt).rejected, 1);
  assert.throws(() => normalizeNws({ features: Array(WORLD_LIMITS.items + 1).fill(null) }, fetchAt));
});
test('snapshot reads never fetch; coalescing and cooldown prevent map-read/provider fan-out', async () => {
  let clock = at; let calls = 0; let release;
  const service = createWorldService({ now: () => clock, fetchImpl: async (url, options) => {
    calls++; assert.equal(url, 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson');
    assert.equal(options.redirect, 'error'); assert.equal(options.headers.Authorization, undefined);
    await new Promise((resolve) => { release = resolve; }); return json(quake);
  } });
  assert.equal(service.read().sources[0].state, 'unavailable'); assert.equal(calls, 0);
  await service.refresh('celestrak'); assert.equal(calls, 0);
  const a = service.refresh('usgs-earthquakes'); const b = service.refresh('usgs-earthquakes'); assert.equal(a, b);
  release(); await a; service.read(); await service.refresh('usgs-earthquakes'); assert.equal(calls, 1);
  clock += 900001; assert.equal(service.read().sources[0].state, 'stale');
  clock += 86400000; assert.equal(service.read().sources[0].state, 'expired'); assert.equal(service.read().items.length, 0);
});
test('non-200 failures retain stale source-bound context and bounded Retry-After cooldown', async () => {
  let clock = at; let calls = 0;
  const service = createWorldService({ now: () => clock, fetchImpl: async () => ++calls === 1 ? json(quake) : new Response('private error text', { status: 429, headers: { 'Retry-After': '900' } }) });
  await service.refresh('usgs-earthquakes'); clock += 300001; await service.refresh('usgs-earthquakes');
  const result = service.read(); assert.equal(result.sources[0].state, 'failure'); assert.equal(result.items[0].freshness, 'stale');
  assert.equal(result.sources[0].error, 'http_429'); assert.equal(JSON.stringify(result).includes('private error text'), false);
  clock += 300000; await service.refresh('usgs-earthquakes'); assert.equal(calls, 2);
});
test('malformed/oversized acquisition cannot erase a successful snapshot as empty; expiry becomes historical', async () => {
  let clock = at; let payload = alert;
  const service = createWorldService({ now: () => clock, fetchImpl: async () => json(payload) });
  await service.refresh('nws-alerts'); clock += 60001; assert.equal(service.read().items[0].semantics, 'historical');
  payload = { features: [null] }; clock += 300000; await service.refresh('nws-alerts'); assert.equal(service.read().items.length, 1); assert.equal(service.read().sources[1].error, 'invalid_payload');
  const huge = createWorldService({ fetchImpl: async () => new Response('x', { headers: { 'content-length': String(WORLD_LIMITS.bytes + 1) } }) });
  await huge.refresh('nws-alerts'); assert.equal(huge.read().sources[1].error, 'response_too_large');
  const streamed = createWorldService({ fetchImpl: async () => new Response(new Uint8Array(WORLD_LIMITS.bytes + 1)) });
  await streamed.refresh('nws-alerts'); assert.equal(streamed.read().sources[1].error, 'response_too_large');
});
test('explicit acquisition lifecycle has no construction/read side effects and bounded cadence', async () => {
  const calls = []; let callback; let interval; let cleared = false;
  const worker = createWorldAcquisition({ refresh: async (id) => calls.push(id) }, { intervalMs: 1, setTimer: (cb, ms) => { callback = cb; interval = ms; return 1; }, clearTimer: () => { cleared = true; } });
  assert.equal(calls.length, 0); worker.start(); worker.start(); await new Promise((r) => setImmediate(r));
  assert.deepEqual(calls, ['usgs-earthquakes', 'nws-alerts']); assert.equal(interval, 300000);
  worker.stop(); assert.equal(cleared, true); await callback(); assert.equal(calls.length, 2);
});
