import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { cellToParent, latLngToCell } from 'h3-js';
import { materializeGreenfeedSnapshots } from '../src/greenfeed-materializer.mjs';

const FIXTURE_URL = new URL('./fixtures/greenfeeds/materializer-snapshots.json', import.meta.url);
const MATERIALIZED_AT = '2026-07-22T20:00:00.000Z';
const FORBIDDEN_RAW_FIELDS = new Set([
  'bssid',
  'ssid',
  'device_id',
  'person_label',
  'raw_frame',
  'exact_track',
  'location',
  'latitude',
  'longitude',
]);
const FORBIDDEN_RAW_VALUES = [
  '00:11:22:33:44:55',
  'Fixture Broadcast Name',
  'fixture-device-01',
  'fixture-person',
  'fixture-frame-bytes',
  '66:77:88:99:aa:bb',
  'Second Fixture Broadcast Name',
  'fixture-device-02',
  'fixture-person-two',
  'second-fixture-frame-bytes',
];

async function loadFixture() {
  return JSON.parse(await readFile(FIXTURE_URL, 'utf8'));
}

function materialize(snapshots) {
  return materializeGreenfeedSnapshots(snapshots, { materializedAt: MATERIALIZED_AT });
}

function expectedCells(snapshots) {
  const uniqueSnapshots = new Map();
  for (const snapshot of snapshots) {
    const key = `${snapshot.source_id}:${snapshot.provider_event_id}`;
    uniqueSnapshots.set(key, snapshot);
  }

  const cells = new Map();
  for (const snapshot of uniqueSnapshots.values()) {
    const h3_11 = latLngToCell(snapshot.location.latitude, snapshot.location.longitude, 11);
    for (const resolution of [5, 7, 9, 11]) {
      const h3_cell = resolution === 11 ? h3_11 : cellToParent(h3_11, resolution);
      const key = `${resolution}:${h3_cell}`;
      const cell = cells.get(key) ?? {
        resolution,
        h3_cell,
        observation_count: 0,
        entity_count: 0,
      };
      cell.observation_count += 1;
      cell.entity_count += snapshot.entity_count;
      cells.set(key, cell);
    }
  }

  return [...cells.values()].sort((left, right) => (
    left.resolution - right.resolution || left.h3_cell.localeCompare(right.h3_cell)
  ));
}

function assertNoRawEvidence(value) {
  if (Array.isArray(value)) {
    for (const item of value) assertNoRawEvidence(item);
    return;
  }
  if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      assert.equal(FORBIDDEN_RAW_FIELDS.has(key), false, `materialized cell leaks raw field ${key}`);
      assertNoRawEvidence(child);
    }
  }
}

test('returns an explicit empty aggregate when no snapshots are available', () => {
  assert.deepEqual(materialize([]), {
    observations: [],
    cells: [],
  });
});

test('derives deterministic external event keys from source and provider identity', async () => {
  const { snapshots } = await loadFixture();

  const materialized = materialize(snapshots);

  assert.deepEqual(
    materialized.observations.map(({ external_event_key }) => external_event_key),
    [
      'greenfeed:usgs-earthquakes:us7000test-a',
      'greenfeed:usgs-earthquakes:us7000test-b',
    ],
  );
});

test('materializes H3 5, 7, 9, and 11 cells using parent aggregation', async () => {
  const { snapshots } = await loadFixture();

  const materialized = materialize(snapshots);
  const actualCells = materialized.cells.map((cell) => ({
    resolution: cell.resolution,
    h3_cell: cell.h3_cell,
    observation_count: cell.observation_count,
    entity_count: cell.entity_count,
  })).sort((left, right) => left.resolution - right.resolution || left.h3_cell.localeCompare(right.h3_cell));

  assert.deepEqual(actualCells, expectedCells(snapshots));
  for (const cell of materialized.cells) {
    assert.deepEqual(cell.source_classes, ['green_public']);
    assert.equal(cell.layers['usgs-earthquakes'].observation_count, cell.observation_count);
  }
});

test('removes raw evidence fields from materialized output', async () => {
  const { snapshots } = await loadFixture();

  const materialized = materialize(snapshots);
  const encodedMaterialized = JSON.stringify(materialized);

  assertNoRawEvidence(materialized);
  for (const rawValue of FORBIDDEN_RAW_VALUES) assert.equal(encodedMaterialized.includes(rawValue), false);
});

test('is idempotent for repeated provider snapshots', async () => {
  const { snapshots } = await loadFixture();

  const first = materialize(snapshots);
  const replay = materialize(structuredClone(snapshots));

  assert.deepEqual(replay, first);
  assert.equal(first.observations.length, 2);
  assert.equal(first.cells.find((cell) => cell.resolution === 9).observation_count, 2);
});
