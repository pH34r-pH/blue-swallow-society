import { latLngToCell } from 'h3-js';

import { forbidden, hashToken, IngestError } from './auth.mjs';
import { hashCanonicalJson, hashPersistedObservation } from './contracts.mjs';

const REQUIRED_MIGRATIONS = Object.freeze(['0001_cybermap_core', '0002_device_ingest_contract']);

/** Durable PostgreSQL/PostGIS implementation of the authenticated observation store contract. */
export class PostgresObservationStore {
  #pool;

  constructor({ pool } = {}) {
    if (!pool || typeof pool.query !== 'function' || typeof pool.connect !== 'function') {
      throw new TypeError('A pg-compatible pool is required.');
    }
    this.#pool = pool;
  }

  async ready() {
    try {
      const result = await this.#pool.query(
        'SELECT version FROM schema_migrations WHERE version = ANY($1::text[])',
        [REQUIRED_MIGRATIONS],
      );
      const versions = new Set(result.rows.map((row) => row.version));
      const migrationsReady = REQUIRED_MIGRATIONS.every((version) => versions.has(version));
      return {
        ok: migrationsReady,
        database: 'ready',
        migrations: migrationsReady ? 'ready' : 'pending',
      };
    } catch {
      return { ok: false, database: 'unavailable', migrations: 'unknown' };
    }
  }

  async authenticate({ deviceId, token, requiredScope }) {
    const result = await this.#pool.query(
      `SELECT
         credential.id AS credential_id,
         credential.device_id,
         credential.source_id::text AS source_id,
         source.source_class::text AS source_class,
         credential.scopes
       FROM device_ingest_credentials AS credential
       JOIN source_catalog AS source ON source.id = credential.source_id
       WHERE credential.device_id = $1
         AND credential.token_sha256 = $2
         AND $3 = ANY(credential.scopes)
         AND credential.enabled = true
         AND (credential.expires_at IS NULL OR credential.expires_at > now())
         AND source.enabled = true
       LIMIT 1`,
      [deviceId, hashToken(token), requiredScope],
    );
    if (result.rows.length !== 1) throw forbidden();
    const row = result.rows[0];
    return Object.freeze({
      credential_id: row.credential_id,
      device_id: row.device_id,
      source_id: row.source_id,
      source_class: row.source_class,
      scopes: Object.freeze([...(row.scopes ?? [])]),
    });
  }

  async applyBatch({ credential, batch }) {
    if (!credential || credential.device_id !== batch.device_id) throw forbidden();
    const client = await this.#pool.connect();
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query("SET LOCAL lock_timeout TO '2s'; SET LOCAL statement_timeout TO '3s'; SET LOCAL idle_in_transaction_session_timeout TO '10s'");

      const liveCredential = await client.query(
        `SELECT credential.id AS credential_id
         FROM device_ingest_credentials AS credential
         JOIN source_catalog AS source ON source.id = credential.source_id
         WHERE credential.id = $1
           AND credential.device_id = $2
           AND credential.source_id = $3
           AND 'observations:write' = ANY(credential.scopes)
           AND credential.enabled = true
           AND (credential.expires_at IS NULL OR credential.expires_at > now())
           AND source.enabled = true
         FOR NO KEY UPDATE OF credential, source`,
        [credential.credential_id, credential.device_id, credential.source_id],
      );
      if (liveCredential.rows.length !== 1) throw forbidden();

      const batchLockKey = `${credential.source_id}:${batch.device_id}:${batch.idempotency_key}`;
      const batchLock = await client.query('SELECT pg_try_advisory_xact_lock(hashtextextended($1, 0)) AS locked', [batchLockKey]);
      if (batchLock.rows[0]?.locked !== true) {
        throw new IngestError('batch_in_progress', 'The batch is already being applied.', { statusCode: 409 });
      }

      const payloadHash = hashCanonicalJson(batch);
      const existingBatch = await client.query(
        `SELECT payload_hash, receipt
         FROM sync_batches
         WHERE source_id = $1 AND client_id = $2 AND idempotency_key = $3
         FOR UPDATE`,
        [credential.source_id, batch.device_id, batch.idempotency_key],
      );
      if (existingBatch.rows.length > 0) {
        const row = existingBatch.rows[0];
        if (row.payload_hash !== payloadHash) {
          throw new IngestError('idempotency_key_reused', 'Idempotency key was reused with changed content.', { statusCode: 409 });
        }
        if (!row.receipt) {
          throw new IngestError('batch_in_progress', 'The batch is already being applied.', { statusCode: 409 });
        }
        const receipt = parseDurableReceipt(row.receipt, batch);
        await touchCredential(client, credential.credential_id);
        await client.query('COMMIT');
        transactionOpen = false;
        return { statusCode: 200, replayed: true, receipt };
      }

      if (batch.session_id) {
        const session = await client.query(
          `SELECT id
           FROM sensorium_sessions
           WHERE id = $1
             AND source_id = $2
             AND ended_at IS NULL
             AND (device_ref = $3 OR client_id = $3)
           FOR SHARE`,
          [batch.session_id, credential.source_id, credential.device_id],
        );
        if (session.rows.length !== 1) {
          throw new IngestError('session_not_owned', 'Session does not belong to the authenticated source.', { statusCode: 422 });
        }
      }

      const sortedKeys = batch.observations
        .map((observation) => observation.external_observation_key)
        .sort();
      await client.query(
        `SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || observation_key, 1))
         FROM unnest($2::text[]) AS observation_key
         ORDER BY observation_key`,
        [credential.source_id, sortedKeys],
      );

      const existingObservations = await client.query(
        `SELECT external_observation_key, content_hash
         FROM observations
         WHERE source_id = $1 AND external_observation_key = ANY($2::text[])`,
        [credential.source_id, sortedKeys],
      );
      const existingByKey = new Map(
        existingObservations.rows.map((row) => [row.external_observation_key, row.content_hash]),
      );
      const pending = [];
      let duplicateCount = 0;
      for (const observation of batch.observations) {
        const contentHash = hashPersistedObservation(batch, observation);
        if (!existingByKey.has(observation.external_observation_key)) {
          pending.push({ observation, contentHash });
          continue;
        }
        if (existingByKey.get(observation.external_observation_key) !== contentHash) {
          throw new IngestError('observation_key_reused', 'Observation key was reused with changed content.', { statusCode: 409 });
        }
        duplicateCount += 1;
      }

      const insertedBatch = await client.query(
        `INSERT INTO sync_batches (
           source_id, client_id, idempotency_key, status, observation_count, payload_hash,
           session_id, request_metadata, provenance
         ) VALUES ($1, $2, $3, 'received', $5, $4, $6, $7::jsonb, $8::jsonb)
         RETURNING id::text AS id`,
        [
          credential.source_id,
          batch.device_id,
          batch.idempotency_key,
          payloadHash,
          batch.observations.length,
          batch.session_id,
          JSON.stringify({
            schema_version: batch.schema_version,
            client_clock: batch.client_clock,
            redaction_class: batch.redaction_class,
            retention_class: batch.retention_class,
          }),
          JSON.stringify({
            authenticated_device_id: batch.device_id,
            credential_id: credential.credential_id,
          }),
        ],
      );
      const batchId = insertedBatch.rows[0].id;

      if (pending.length > 0) {
        await insertObservations(client, {
          credential,
          batch,
          batchId,
          entries: pending,
        });
      }

      const clockResult = await client.query('SELECT clock_timestamp() AS server_clock');
      const serverClock = new Date(clockResult.rows[0].server_clock).toISOString();
      const receipt = Object.freeze({
        schema_version: 'bss.sync_receipt.v1',
        server_batch_id: batchId,
        idempotency_key: batch.idempotency_key,
        status: 'applied',
        accepted_count: pending.length,
        rejected_count: 0,
        duplicate_count: duplicateCount,
        validation_errors: [],
        server_clock: serverClock,
      });
      await client.query(
        `UPDATE sync_batches
         SET status = 'applied', completed_at = $2, accepted_count = $3,
             rejected_count = 0, duplicate_count = $4, observation_count = $5,
             response_status = 201, receipt = $6::jsonb
         WHERE id = $1`,
        [batchId, serverClock, pending.length, duplicateCount, batch.observations.length, JSON.stringify(receipt)],
      );
      await touchCredential(client, credential.credential_id);

      await client.query('COMMIT');
      transactionOpen = false;
      return { statusCode: 201, replayed: false, receipt: structuredClone(receipt) };
    } catch (error) {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // The original failure is more actionable than a rollback failure.
        }
      }
      throw normalizeDatabaseError(error);
    } finally {
      client.release();
    }
  }
  async queryViewport({ lat, lon, radiusMeters = 100, limit = 100, maxAgeMs = null, now = new Date() } = {}) {
    const center = { lat, lon };
    const cutoff = Number.isFinite(maxAgeMs) ? new Date(new Date(now).getTime() - maxAgeMs).toISOString() : null;
    const result = await this.#pool.query(
      `SELECT
         id::text AS id,
         external_observation_key,
         source_class::text AS source_class,
         kind::text AS kind,
         observed_at,
         ingested_at,
         ST_Y(geom)::float8 AS lat,
         ST_X(geom)::float8 AS lon,
         confidence::float8 AS confidence,
         payload,
         provenance,
         h3_7,
         h3_9,
         h3_11,
         ST_Distance(
           geom::geography,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
         )::float8 AS distance_meters
       FROM observations
       WHERE source_class = ANY($5::source_class[])
         AND ST_DWithin(
           geom::geography,
           ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
           $3
         )
         AND ($6::timestamptz IS NULL OR observed_at >= $6::timestamptz)
       ORDER BY observed_at DESC, ingested_at DESC
       LIMIT $4`,
      [
        lat,
        lon,
        radiusMeters,
        limit,
        ['green_public', 'green_owned', 'green_authorized', 'owned_device', 'local_observation'],
        cutoff,
      ],
    );

    const accessPoints = result.rows.map((row) => rowToAccessPoint(row));
    return {
      ok: true,
      mode: 'viewport',
      live: true,
      current: Number.isFinite(maxAgeMs),
      source: 'cybermap-postgis',
      location: center,
      radiusMeters,
      maxAgeMs: Number.isFinite(maxAgeMs) ? maxAgeMs : undefined,
      totalResults: accessPoints.length,
      accessPoints,
      updatedAt: accessPoints[0]?.lastSeen || new Date(now).toISOString(),
      message: accessPoints.length > 0
        ? 'Cybermap PostGIS viewport ready.'
        : 'Cybermap PostGIS viewport returned no observations for this fix.',
    };
  }
}

function rowToAccessPoint(row) {
  const payload = parseJsonObject(row.payload || {});
  const provenance = parseJsonObject(row.provenance || {});
  const lastSeen = toIsoString(row.observed_at);
  return {
    id: row.external_observation_key || row.id,
    kind: row.kind,
    ssid: stringOrNull(payload.ssid ?? payload.ssid_hmac) || 'hashed Wi-Fi AP',
    bssid: stringOrNull(payload.bssid ?? payload.bssid_hmac),
    signalDbm: finiteOrNull(payload.rssi_dbm ?? payload.signalDbm ?? payload.signal_dbm),
    frequencyMhz: finiteOrNull(payload.frequency_mhz ?? payload.frequencyMhz),
    channel: finiteOrNull(payload.channel),
    security: stringOrNull(payload.security),
    lat: finiteOrNull(row.lat),
    lon: finiteOrNull(row.lon),
    accuracyMeters: finiteOrNull(provenance?.server_ingest?.location_accuracy_m),
    confidence: finiteOrNull(row.confidence),
    source: row.source_class,
    sourceClass: row.source_class,
    lastSeen,
    observedAt: lastSeen,
    current: false,
    distanceMeters: finiteOrNull(row.distance_meters),
    h3: {
      r7: row.h3_7,
      r9: row.h3_9,
      r11: row.h3_11,
    },
    provenance,
  };
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function stringOrNull(value) {
  return typeof value === 'string' && value ? value : null;
}

function toIsoString(value) {
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

async function insertObservations(client, { credential, batch, batchId, entries }) {
  const rows = entries.map(({ observation, contentHash }) => {
    const latitude = observation.location.latitude;
    const longitude = observation.location.longitude;
    return {
      external_observation_key: observation.external_observation_key,
      content_hash: contentHash,
      kind: observation.kind,
      observed_at: observation.observed_at,
      longitude,
      latitude,
      h3_7: latLngToCell(latitude, longitude, 7),
      h3_9: latLngToCell(latitude, longitude, 9),
      h3_11: latLngToCell(latitude, longitude, 11),
      confidence: observation.confidence,
      payload: observation.payload,
      provenance: {
        ...observation.provenance,
        server_ingest: {
          location_accuracy_m: observation.location.accuracy_m,
          ...(observation.location.altitude_m === undefined ? {} : { altitude_m: observation.location.altitude_m }),
        },
      },
    };
  });

  await client.query(
    `INSERT INTO observations (
       source_id, source_class, session_id, sync_batch_id,
       external_observation_key, content_hash, idempotency_key,
       kind, observed_at, geom, h3_7, h3_9, h3_11,
       confidence, pii_status, retention_class, payload, provenance
     )
     SELECT
       $1, $2::source_class, $3, $4,
       row.external_observation_key, row.content_hash, row.external_observation_key,
       row.kind::observation_kind, row.observed_at,
       ST_SetSRID(ST_MakePoint(row.longitude, row.latitude), 4326),
       row.h3_7, row.h3_9, row.h3_11,
       row.confidence, $6, $7::cyber_retention_class, row.payload, row.provenance
     FROM jsonb_to_recordset($5::jsonb) AS row(
       external_observation_key text,
       content_hash text,
       kind text,
       observed_at timestamptz,
       longitude double precision,
       latitude double precision,
       h3_7 text,
       h3_9 text,
       h3_11 text,
       confidence numeric,
       payload jsonb,
       provenance jsonb
     )`,
    [
      credential.source_id,
      credential.source_class,
      batch.session_id,
      batchId,
      JSON.stringify(rows),
      batch.redaction_class,
      batch.retention_class,
    ],
  );
}

async function touchCredential(client, credentialId) {
  await client.query(
    'UPDATE device_ingest_credentials SET last_used_at = clock_timestamp() WHERE id = $1',
    [credentialId],
  );
}

function normalizeDatabaseError(error) {
  if (error instanceof IngestError) return error;
  if (error?.code === '40P01' || error?.code === '55P03' || error?.code === '57014') {
    return new IngestError('ingest_busy', 'The ingest store is busy; retry the identical batch later.', { statusCode: 503 });
  }
  if (error?.code === '22P02' || error?.code === '23503' || error?.code === '23514') {
    return new IngestError('storage_contract_rejected', 'The batch violates the durable storage contract.', { statusCode: 422 });
  }
  if (error?.code === '23505') {
    return new IngestError('idempotency_conflict', 'A concurrent identity conflict prevented batch application.', { statusCode: 409 });
  }
  return error;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RFC3339_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})$/;

function parseDurableReceipt(value, batch) {
  let receipt;
  try {
    receipt = parseJsonObject(value);
  } catch {
    throw storageContractRejected();
  }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt)) {
    throw storageContractRejected();
  }
  const acceptedCount = receipt.accepted_count;
  const rejectedCount = receipt.rejected_count;
  const duplicateCount = receipt.duplicate_count;
  if (receipt.schema_version !== 'bss.sync_receipt.v1'
      || !UUID_RE.test(String(receipt.server_batch_id ?? ''))
      || receipt.idempotency_key !== batch.idempotency_key
      || receipt.status !== 'applied'
      || !Number.isInteger(acceptedCount) || acceptedCount < 0
      || !Number.isInteger(rejectedCount) || rejectedCount < 0
      || !Number.isInteger(duplicateCount) || duplicateCount < 0
      || acceptedCount + rejectedCount + duplicateCount !== batch.observations.length
      || !Array.isArray(receipt.validation_errors)
      || !validTimestamp(receipt.server_clock)) {
    throw storageContractRejected();
  }
  return receipt;
}

function validTimestamp(value) {
  return typeof value === 'string' && RFC3339_RE.test(value) && Number.isFinite(Date.parse(value));
}

function storageContractRejected() {
  return new IngestError('storage_contract_rejected', 'The durable receipt violates the storage contract.', { statusCode: 422 });
}

function parseJsonObject(value) {
  return typeof value === 'string' ? JSON.parse(value) : structuredClone(value);
}
