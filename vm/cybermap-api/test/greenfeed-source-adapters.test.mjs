import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { runGreenfeedWorker } from '../src/greenfeed-worker.mjs';
import { GDACS_ALERTS_ADAPTER } from '../src/sources/gdacs-alerts.mjs';
import { NASA_EONET_EVENTS_ADAPTER } from '../src/sources/nasa-eonet-events.mjs';
import { USGS_EARTHQUAKES_ADAPTER } from '../src/sources/usgs-earthquakes.mjs';

const FIXTURE_DIRECTORY = new URL('./fixtures/greenfeeds/', import.meta.url);
const ADAPTERS = [
  {
    adapter: USGS_EARTHQUAKES_ADAPTER,
    fixture: 'usgs-earthquakes-adapter.json',
    moduleUrl: new URL('../src/sources/usgs-earthquakes.mjs', import.meta.url),
    expected: [
      {
        provider_event_id: 'us7000fixture-a',
        observed_at: '2026-07-22T18:45:00.000Z',
        location: { latitude: 47.6062, longitude: -122.3321 },
        summary: { classification: 'earthquake', magnitude: 4.2 },
      },
      {
        provider_event_id: 'us7000fixture-b',
        observed_at: '2026-07-22T19:15:00.000Z',
        location: { latitude: 47.6097, longitude: -122.3331 },
        summary: { classification: 'earthquake', magnitude: 2.8 },
      },
    ],
  },
  {
    adapter: GDACS_ALERTS_ADAPTER,
    fixture: 'gdacs-alerts-adapter.json',
    moduleUrl: new URL('../src/sources/gdacs-alerts.mjs', import.meta.url),
    expected: [
      {
        provider_event_id: 'gdacs-fixture-001',
        observed_at: '2026-07-22T17:30:00.000Z',
        location: { latitude: 41.9028, longitude: 12.4964 },
        summary: { classification: 'earthquake', alert_level: 'orange' },
      },
      {
        provider_event_id: 'gdacs-fixture-002',
        observed_at: '2026-07-22T18:00:00.000Z',
        location: { latitude: 14.5995, longitude: 120.9842 },
        summary: { classification: 'flood', alert_level: 'red' },
      },
    ],
  },
  {
    adapter: NASA_EONET_EVENTS_ADAPTER,
    fixture: 'nasa-eonet-events-adapter.json',
    moduleUrl: new URL('../src/sources/nasa-eonet-events.mjs', import.meta.url),
    expected: [
      {
        provider_event_id: 'EONET_fixture_a:2026-07-22T18:20:00.000Z',
        observed_at: '2026-07-22T18:20:00.000Z',
        location: { latitude: 37.7749, longitude: -122.4194 },
        summary: { classification: 'wildfires' },
      },
      {
        provider_event_id: 'EONET_fixture_b:2026-07-22T19:30:00.000Z',
        observed_at: '2026-07-22T19:30:00.000Z',
        location: { latitude: -33.8688, longitude: 151.2093 },
        summary: { classification: 'severe_storms' },
      },
    ],
  },
];

async function loadFixture(name) {
  const fixture = JSON.parse(await readFile(new URL(name, FIXTURE_DIRECTORY), 'utf8'));
  assert.deepEqual(fixture.fixture, {
    owner: 'Blue Swallow Society',
    provenance: 'synthetic source-normalization contract fixture',
    version: 1,
  });
  return fixture.payload;
}

function sourceFor(adapter) {
  return Object.freeze({
    id: `source-${adapter.source.layer_id}`,
    ...adapter.source,
  });
}

function reverseProviderRecords(payload) {
  const replay = structuredClone(payload);
  if (Array.isArray(replay.features)) replay.features.reverse();
  if (Array.isArray(replay.events)) replay.events.reverse();
  return replay;
}

test('P0 adapters remain disabled with explicit attribution and caveat metadata', () => {
  assert.deepEqual(ADAPTERS.map(({ adapter }) => adapter.source.layer_id), [
    'usgs-earthquakes',
    'gdacs-alerts',
    'nasa-eonet-events',
  ]);

  for (const { adapter } of ADAPTERS) {
    const { source } = adapter;
    assert.equal(Object.isFrozen(source), true);
    assert.equal(source.source_class, 'green_public');
    assert.equal(source.enabled, false);
    assert.equal(source.allowed_preload, false);
    assert.equal(
      source.terms_reviewed_at,
      source.layer_id === 'usgs-earthquakes' ? '2026-07-22T20:18:30.000Z' : null,
    );
    assert.match(source.provider_url, /^https:\/\//);
    assert.equal(typeof source.attribution_text, 'string');
    assert.ok(source.attribution_text.length > 0);
    assert.ok(Array.isArray(source.caveats));
    assert.ok(source.caveats.length > 0);
    assert.equal(new Set(source.caveats).size, source.caveats.length);
    assert.equal(Object.hasOwn(source, 'credential'), false);
    assert.equal(Object.hasOwn(source, 'credentials'), false);
    assert.equal(Object.hasOwn(source, 'schedule'), false);
  }
});

test('TST-009 runs reviewed USGS fixture data only, then records the source as disabled', async () => {
  const payload = await loadFixture('usgs-earthquakes-adapter.json');
  assert.equal(
    USGS_EARTHQUAKES_ADAPTER.source.terms_url,
    'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
  );
  assert.equal(USGS_EARTHQUAKES_ADAPTER.source.terms_reviewed_at, '2026-07-22T20:18:30.000Z');
  assert.equal(USGS_EARTHQUAKES_ADAPTER.source.attribution_text, 'U.S. Geological Survey');
  const source = Object.freeze({
    ...sourceFor(USGS_EARTHQUAKES_ADAPTER),
    enabled: true,
    allowed_preload: true,
  });
  const sourceRuns = [];
  const snapshotWrites = [];
  let fetchCalls = 0;

  const recordRun = async (run) => sourceRuns.push(structuredClone(run));
  const writeSnapshots = async ({ snapshots }) => {
    snapshotWrites.push(structuredClone(snapshots));
    return { accepted_count: snapshots.length, duplicate_count: 0, rejected_count: 0 };
  };
  const fetch = async () => {
    fetchCalls += 1;
    return { ok: true, status: 200, json: async () => structuredClone(payload) };
  };

  const success = await runGreenfeedWorker({
    source,
    fetch,
    normalize: USGS_EARTHQUAKES_ADAPTER.normalize,
    writeSnapshots,
    recordRun,
    now: () => new Date('2026-07-22T20:18:30.000Z'),
  });

  assert.deepEqual(success, {
    source_id: source.id,
    started_at: '2026-07-22T20:18:30.000Z',
    completed_at: '2026-07-22T20:18:30.000Z',
    outcome: 'success',
    response_class: 'http_200',
    fetched_count: 2,
    accepted_count: 2,
    duplicate_count: 0,
    rejected_count: 0,
    next_retry_at: null,
    error_code: null,
  });
  assert.equal(fetchCalls, 1);
  assert.equal(snapshotWrites.length, 1);

  const disabled = await runGreenfeedWorker({
    source: Object.freeze({ ...source, enabled: false, allowed_preload: false }),
    fetch: async () => assert.fail('disabled source must not fetch'),
    normalize: USGS_EARTHQUAKES_ADAPTER.normalize,
    writeSnapshots: async () => assert.fail('disabled source must not write snapshots'),
    recordRun,
    now: () => new Date('2026-07-22T20:18:31.000Z'),
  });

  assert.deepEqual(disabled, {
    source_id: source.id,
    started_at: '2026-07-22T20:18:31.000Z',
    completed_at: '2026-07-22T20:18:31.000Z',
    outcome: 'disabled',
    response_class: 'source_disabled',
    fetched_count: 0,
    accepted_count: 0,
    duplicate_count: 0,
    rejected_count: 0,
    next_retry_at: null,
    error_code: 'source_disabled',
  });
  assert.equal(fetchCalls, 1);
  assert.deepEqual(sourceRuns, [success, disabled]);
  assert.equal(GDACS_ALERTS_ADAPTER.source.enabled, false);
  assert.equal(GDACS_ALERTS_ADAPTER.source.allowed_preload, false);
  assert.equal(GDACS_ALERTS_ADAPTER.source.terms_reviewed_at, null);
  assert.equal(NASA_EONET_EVENTS_ADAPTER.source.enabled, false);
  assert.equal(NASA_EONET_EVENTS_ADAPTER.source.allowed_preload, false);
  assert.equal(NASA_EONET_EVENTS_ADAPTER.source.terms_reviewed_at, null);
});

test('P0 adapters normalize owned fixtures deterministically without raw provider records', async () => {
  for (const { adapter, fixture, expected } of ADAPTERS) {
    const source = sourceFor(adapter);
    const payload = await loadFixture(fixture);

    const normalized = adapter.normalize(payload, { source });
    const replay = adapter.normalize(reverseProviderRecords(payload), { source });

    assert.deepEqual(normalized, replay, `${adapter.source.layer_id} normalization changes when provider records are reordered`);
    assert.deepEqual(
      normalized.map(({ provider_event_id, observed_at, location, summary }) => ({ provider_event_id, observed_at, location, summary })),
      expected,
    );
    for (const snapshot of normalized) {
      assert.deepEqual(snapshot, {
        source_id: source.id,
        source_class: 'green_public',
        layer_id: adapter.source.layer_id,
        provider_event_id: snapshot.provider_event_id,
        observed_at: snapshot.observed_at,
        location: snapshot.location,
        entity_count: 1,
        summary: snapshot.summary,
        caveats: adapter.source.caveats,
        provenance: {
          provider: adapter.source.provider,
          provider_url: adapter.source.provider_url,
          normalizer_version: adapter.source.normalizer_version,
        },
      });
      assert.equal(JSON.stringify(snapshot).includes('raw_evidence'), false);
    }
  }
});

test('P0 adapters reject malformed payloads and mismatched source bindings', async () => {
  for (const { adapter, fixture } of ADAPTERS) {
    const source = sourceFor(adapter);
    const payload = await loadFixture(fixture);

    assert.throws(
      () => adapter.normalize({}, { source }),
      (error) => error?.code === 'invalid_payload',
      `${adapter.source.layer_id} must reject an invalid provider payload`,
    );
    assert.throws(
      () => adapter.normalize(payload, { source: { ...source, layer_id: 'wrong-layer' } }),
      (error) => error?.code === 'invalid_payload',
      `${adapter.source.layer_id} must reject a mismatched source binding`,
    );
  }
});

test('P0 adapters contain no transport, scheduler, or runtime fallback surface', async () => {
  for (const { adapter, moduleUrl } of ADAPTERS) {
    assert.deepEqual(Object.keys(adapter).sort(), ['normalize', 'source']);
    const sourceCode = await readFile(moduleUrl, 'utf8');
    assert.doesNotMatch(sourceCode, /\bfetch\s*\(/);
    assert.doesNotMatch(sourceCode, /\b(?:setInterval|setTimeout)\s*\(/);
  }
});
