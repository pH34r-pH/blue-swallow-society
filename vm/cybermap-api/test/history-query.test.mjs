import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHistoryQuery, historyCursor, HISTORY_SOURCES } from '../src/history-query.mjs';
import { queryHistory, projectHistoryRow } from '../src/history-store.mjs';
const now = Date.parse('2026-09-30T12:00:00Z');
const input = { from: '2026-09-01T00:00:00Z', to: '2026-09-30T00:00:00Z', limit: 1 };
const id = '10000000-0000-4000-8000-000000000001';
const row = { id, observed_at: '2026-09-20T00:00:00.123456Z', ingested_at: '2026-09-21T00:00:00.000000Z',
  session_id: null, producer_device_id: 'installation-1', kind: 'wifi_ap', lat: null, lon: null,
  signal_dbm: 0, frequency_mhz: null, channel: null, confidence: null, accuracy_m: null,
  payload: { bssid: 'never-return', ssid: 'never-return', bssid_hmac: 'never-return' }, provenance: { private: 'never-return' } };

test('history rejects unbounded or ambiguous filters and preserves exact cursor timestamp ties', () => {
  for (const patch of [{ limit: 0 }, { limit: 201 }, { limit: '2' }, { kind: 'public' }, { deviceId: 'invalid\nvalue' },
    { sessionId: 'invented-trip' }, { selectedId: 'raw-radio-address' }, { from: '2020-01-01T00:00:00Z' }, { to: input.from }, { unknown: 1 }]) {
    assert.throws(() => parseHistoryQuery({ ...input, ...patch }, now), /Invalid history/);
  }
  const query = parseHistoryQuery(input, now);
  const cursor = historyCursor(query, row);
  assert.deepEqual(parseHistoryQuery({ ...input, cursor }, now).after, { at: row.observed_at, id });
  assert.throws(() => parseHistoryQuery({ ...input, cursor, kind: 'ble_device' }, now));
  assert.throws(() => parseHistoryQuery({ ...input, cursor: 'invalid' }, now));
  assert.deepEqual(HISTORY_SOURCES, ['owned_device', 'local_observation', 'green_owned']);
});

test('history projection preserves unknown measurements and zero, never raw payload or HMAC identity', () => {
  const result = projectHistoryRow(row);
  assert.equal(result.signalDbm, 0);
  assert.equal(result.frequencyMhz, null);
  assert.equal(result.confidence, null);
  assert.deepEqual(result.captureLocation, { latitude: null, longitude: null, accuracyMeters: null });
  assert.equal(result.emitterLocation, null);
  assert.equal(result.sessionId, null);
  assert.doesNotMatch(JSON.stringify(result), /never-return|bssid|ssid|payload|provenance/);
  for (const value of [null, undefined, '', ' ', true, [], {}, Infinity, NaN]) assert.equal(projectHistoryRow({ ...row, lat: value }).captureLocation.latitude, null);
  assert.equal(projectHistoryRow({ ...row, lat: '0' }).captureLocation.latitude, 0);
});

test('history SQL uses personal sources, exact keyset, bound filters, read-only timeout and an independent filtered selection', async () => {
  const calls = [];
  let released = false;
  const selectedId = '10000000-0000-4000-8000-000000000003';
  const client = { async query(sql, values) {
    calls.push({ sql, values });
    if (sql.includes('ORDER BY')) return { rows: [row, { ...row, id: selectedId }] };
    if (sql.includes('AND id =')) return { rows: [{ ...row, id: selectedId }] };
    return { rows: [] };
  }, release() { released = true; } };
  const result = await queryHistory({ connect: async () => client }, parseHistoryQuery({ ...input, selectedId }, now));
  assert.equal(released, true);
  assert.equal(calls[0].sql, 'BEGIN READ ONLY');
  assert.match(calls[1].sql, /statement_timeout = '3s'/);
  assert.match(calls[2].sql, /\(observed_at, id\) < \(\$8::timestamptz, \$9::uuid\)/);
  assert.equal(calls[2].values.at(-1), 2);
  assert.deepEqual(calls[2].values[0], HISTORY_SOURCES);
  assert.match(calls[3].sql, /source_class = ANY/);
  assert.equal(calls.at(-1).sql, 'COMMIT');
  assert.equal(result.observations.length, 1);
  assert.equal(result.selected.id, selectedId);
  assert.equal(parseHistoryQuery({ ...input, cursor: result.nextCursor }, now).after.at, row.observed_at);
});

test('history timeout rolls back and releases without returning partial data', async () => {
  const calls = [];
  const client = { async query(sql) { calls.push(sql); if (sql.startsWith('SELECT')) throw new Error('statement timeout'); return { rows: [] }; }, release() { calls.push('release'); } };
  await assert.rejects(queryHistory({ connect: async () => client }, parseHistoryQuery(input, now)), /timeout/);
  assert.deepEqual(calls.slice(-2), ['ROLLBACK', 'release']);
});
