import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresObservationStore } from '../src/postgres-store.mjs';
import { projectOperatorSignalSnapshot } from '../src/viewport.mjs';

const fields = ['lat', 'lon', 'accuracyMeters', 'confidence', 'signalDbm', 'frequencyMhz', 'channel', 'distanceMeters'];
const observedAt = '2026-09-30T00:00:00.000Z';

for (const value of [null, undefined, '', ' ', '0', '12.5', NaN, Infinity, -Infinity, true, false, [], [0], {}, 0, -42, 12.5]) {
  test(`operator projection requires finite numbers: ${String(value)} (${typeof value})`, () => {
    const expected = typeof value === 'number' && Number.isFinite(value) ? value : null;
    const snapshot = projectOperatorSignalSnapshot({
      accessPoints: [Object.fromEntries(fields.map((field) => [field, value]))],
      radiusMeters: value,
      maxAgeMs: value,
    });
    for (const field of fields) assert.equal(snapshot.signals[0][field], expected, field);
    assert.equal(snapshot.radiusMeters, expected);
    assert.equal(snapshot.maxAgeMs, expected);
  });
}

async function queryRow(row) {
  const store = new PostgresObservationStore({ pool: {
    async connect() { throw new Error("viewport must use pool query"); },
    async query(sql) {
      assert.match(sql, /confidence::float8/);
      return { rows: [row] };
    },
  } });
  return store.queryViewport({ lat: 0, lon: 0, now: new Date(observedAt) });
}

const baseRow = {
  kind: 'wifi', source_class: 'owned_device', observed_at: observedAt,
  lat: 0, lon: 0, distance_meters: 0, confidence: null,
  payload: { rssi_dbm: null, frequency_mhz: null, channel: null },
  provenance: { server_ingest: { location_accuracy_m: null } },
};

test('nullable PostgreSQL observation measurements stay unknown through operator projection', async () => {
  const viewport = await queryRow(baseRow);
  const snapshot = projectOperatorSignalSnapshot(viewport);
  for (const record of [viewport.accessPoints[0], snapshot.signals[0]]) {
    for (const field of ['accuracyMeters', 'confidence', 'signalDbm', 'frequencyMhz', 'channel']) {
      assert.equal(record[field], null, field);
    }
    for (const field of ['lat', 'lon', 'distanceMeters']) assert.equal(record[field], 0, field);
  }
  assert.equal(snapshot.signals[0].observedAt, observedAt);
  assert.equal(snapshot.signals[0].sourceClass, 'owned_device');
  assert.equal(snapshot.signals[0].redactionClass, 'identifier_suppressed');
  assert.equal('bssid' in snapshot.signals[0], false);
});

for (const value of [null, undefined, '', ' ', 'invalid', NaN, Infinity, -Infinity, true, false, [], [0], {}, 0, -42, 12.5, '0', '12.5']) {
  test(`PostgreSQL mapping preserves numeric compatibility without coercing absence: ${String(value)} (${typeof value})`, async () => {
    const expected = (typeof value === 'number' || (typeof value === 'string' && value.trim() !== '')) && Number.isFinite(Number(value)) ? Number(value) : null;
    // Defensive malformed-row cases supplement the legitimate nullable row above.
    const viewport = await queryRow({ ...baseRow, lat: value, lon: value, confidence: value, distance_meters: value,
      payload: { rssi_dbm: value, frequency_mhz: value, channel: value },
      provenance: { server_ingest: { location_accuracy_m: value } },
    });
    const snapshot = projectOperatorSignalSnapshot(viewport);
    for (const record of [viewport.accessPoints[0], snapshot.signals[0]]) {
      for (const field of fields) assert.equal(record[field], expected, field);
    }
  });
}
