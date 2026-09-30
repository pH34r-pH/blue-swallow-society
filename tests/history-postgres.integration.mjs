import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { parseHistoryQuery } from '../vm/cybermap-api/src/history-query.mjs';
import { queryHistory } from '../vm/cybermap-api/src/history-store.mjs';
const require = createRequire(new URL('../vm/cybermap-api/package.json', import.meta.url));
const { Pool } = require('pg');
const url = new URL(process.env.HISTORY_TEST_DATABASE_URL || 'invalid');
if (!['localhost', '127.0.0.1'].includes(url.hostname) || url.pathname !== '/bss_history_synthetic') throw new Error('History tests require the disposable local synthetic database.');
const now = Date.parse('2026-09-30T12:00:00Z');
const filter = { from: '2026-09-01T00:00:00Z', to: '2026-09-30T00:00:00Z', limit: 2 };
const source = '10000000-0000-4000-8000-000000000001';
const publicSource = '10000000-0000-4000-8000-000000000002';
const session = '20000000-0000-4000-8000-000000000001';
const id = (i) => `30000000-0000-4000-8000-${String(i).padStart(12, '0')}`;

test('real PostGIS history paginates exact ties, filters canonical sessions/devices, preserves null/zero and excludes public/late rows', async (t) => {
  const pool = new Pool({ connectionString: url.href }); t.after(() => pool.end());
  await pool.query(`INSERT INTO source_catalog(id, source_class, source_key, name) VALUES
    ($1, 'owned_device', 'synthetic-history-own', 'Synthetic'), ($2, 'green_public', 'synthetic-history-public', 'Synthetic public')`, [source, publicSource]);
  await pool.query("INSERT INTO sensorium_sessions(id, source_id, session_kind) VALUES($1,$2,'direct_observation')", [session, source]);
  for (let i = 1; i <= 6; i++) {
    await pool.query(`INSERT INTO observations(id,source_id,source_class,session_id,producer_device_id,external_observation_key,
      kind,observed_at,ingested_at,payload,geom,h3_7,h3_9,h3_11) VALUES($1,$2,$3,$4,$5,$6,'wifi_ap',$7,$8,$9,
      CASE WHEN $10::boolean THEN ST_SetSRID(ST_MakePoint(0,0),4326) ELSE NULL END,
      CASE WHEN $10::boolean THEN 'synthetic' END, CASE WHEN $10::boolean THEN 'synthetic' END, CASE WHEN $10::boolean THEN 'synthetic' END)`,
    [id(i), i === 6 ? publicSource : source, i === 6 ? 'green_public' : 'owned_device', i === 6 ? null : session,
      i === 5 ? null : 'synthetic-installation', `synthetic-${i}`, `2026-09-20T00:00:00.12345${i}Z`, '2026-09-30T11:00:00Z',
      { bssid: 'private-do-not-return', ssid: 'private-do-not-return', rssi_dbm: i === 2 ? 0 : null }, i === 2]);
  }
  await pool.query(`INSERT INTO observation_identity_scopes(observation_id,source_id,producer_device_id,external_observation_key)
    VALUES($1,$2,'synthetic-legacy-installation','synthetic-5')`, [id(5), source]);
  const first = await queryHistory(pool, parseHistoryQuery(filter, now));
  assert.deepEqual(first.observations.map((row) => row.id), [id(5), id(4)]);
  assert.equal(first.observations[0].deviceId, 'synthetic-legacy-installation');
  assert.equal(first.observations[0].sessionId, session);
  assert.equal(first.observations[0].captureLocation.latitude, null);
  await pool.query(`INSERT INTO observations(id,source_id,source_class,kind,observed_at,ingested_at)
    VALUES($1,$2,'owned_device','wifi_ap','2026-09-19T00:00:00Z','2026-09-30T12:00:01Z')`, [id(7), source]);
  const second = await queryHistory(pool, parseHistoryQuery({ ...filter, cursor: first.nextCursor }, now + 2000));
  const third = await queryHistory(pool, parseHistoryQuery({ ...filter, cursor: second.nextCursor }, now + 2000));
  const rows = [...first.observations, ...second.observations, ...third.observations];
  assert.deepEqual(rows.map((row) => row.id), [5,4,3,2,1].map(id));
  assert.equal(third.nextCursor, null);
  assert.equal(rows.find((row) => row.id === id(2)).signalDbm, 0);
  assert.equal(rows.find((row) => row.id === id(2)).captureLocation.latitude, 0);
  assert.doesNotMatch(JSON.stringify(rows), /private-do-not-return|bssid|ssid|payload|provenance/);
  const detail = await queryHistory(pool, parseHistoryQuery({ ...filter, selectedId: id(1) }, now));
  assert.equal(detail.selected.id, id(1));
  assert.equal((await queryHistory(pool, parseHistoryQuery({ ...filter, selectedId: id(6) }, now))).selected, null);
  const scoped = await queryHistory(pool, parseHistoryQuery({ ...filter, deviceId: 'synthetic-legacy-installation', sessionId: session }, now));
  assert.deepEqual(scoped.observations.map((row) => row.id), [id(5)]);
  const empty = await queryHistory(pool, parseHistoryQuery({ ...filter, kind: 'ble_device' }, now));
  assert.deepEqual(empty.observations, []);
});
