import { HISTORY_SOURCES, historyCursor } from './history-query.mjs';

// Select explicit measurement fields; never return raw identifiers, payloads or provenance.
const SELECT = `SELECT observations.id::text, session_id::text,
  COALESCE(observations.producer_device_id, identity_scope.producer_device_id) AS producer_device_id, kind::text,
  to_char(observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS observed_at,
  to_char(ingested_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS ingested_at,
  CASE WHEN ST_GeometryType(geom) = 'ST_Point' THEN ST_Y(geom) END AS lat,
  CASE WHEN ST_GeometryType(geom) = 'ST_Point' THEN ST_X(geom) END AS lon,
  confidence, payload->'rssi_dbm' AS signal_dbm,
  payload->'frequency_mhz' AS frequency_mhz, payload->'channel' AS channel,
  provenance->'server_ingest'->'location_accuracy_m' AS accuracy_m
  FROM observations LEFT JOIN observation_identity_scopes AS identity_scope
    ON identity_scope.observation_id = observations.id
  WHERE source_class = ANY($1::source_class[])
  AND observed_at >= $2::timestamptz AND observed_at < $3::timestamptz
  AND ingested_at <= $4::timestamptz
  AND ($5::text IS NULL OR COALESCE(observations.producer_device_id, identity_scope.producer_device_id) = $5)
  AND ($6::uuid IS NULL OR session_id = $6)
  AND ($7::text IS NULL OR kind::text = $7)`;
function finite(value) {
  if (typeof value !== 'number' && (typeof value !== 'string' || !value.trim())) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
export function projectHistoryRow(row) {
  return { id: row.id, sessionId: row.session_id ?? null, deviceId: row.producer_device_id ?? null,
    kind: row.kind, observedAt: row.observed_at, ingestedAt: row.ingested_at,
    captureLocation: { latitude: finite(row.lat), longitude: finite(row.lon), accuracyMeters: finite(row.accuracy_m) },
    emitterLocation: null, signalDbm: finite(row.signal_dbm), frequencyMhz: finite(row.frequency_mhz),
    channel: finite(row.channel), confidence: finite(row.confidence), redactionClass: 'identifier_suppressed' };
}
function parameters(query) {
  return [HISTORY_SOURCES, query.from, query.to, query.cutoff, query.deviceId, query.sessionId, query.kind];
}
export async function queryHistory(pool, query) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN READ ONLY');
    await client.query("SET LOCAL statement_timeout = '3s'");
    const values = [...parameters(query), query.after?.at ?? null, query.after?.id ?? null, query.limit + 1];
    const result = await client.query(`${SELECT}
      AND ($8::timestamptz IS NULL OR (observed_at, id) < ($8::timestamptz, $9::uuid))
      ORDER BY observed_at DESC, id DESC LIMIT $10`, values);
    const rows = result.rows.slice(0, query.limit);
    let selected = rows.find((row) => row.id === query.selectedId) ?? null;
    if (query.selectedId && !selected) {
      const detail = await client.query(`${SELECT} AND id = $8::uuid LIMIT 1`, [...parameters(query), query.selectedId]);
      selected = detail.rows[0] ?? null;
    }
    await client.query('COMMIT');
    return { schemaVersion: 'bss.observation_history.v1', ok: true, mode: 'historical',
      retrievedAt: query.retrievedAt, snapshotAt: query.cutoff, filters: { from: query.from, to: query.to, deviceId: query.deviceId, sessionId: query.sessionId, kind: query.kind },
      observations: rows.map(projectHistoryRow), selected: selected ? projectHistoryRow(selected) : null,
      nextCursor: result.rows.length > query.limit ? historyCursor(query, rows.at(-1)) : null,
      grouping: 'Stored session IDs only; page contents are not complete journeys.',
      warning: 'Capture location is not emitter location. Historical observations do not establish current presence.' };
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}
