import { latLngToCell } from 'h3-js';

import { forbidden, hashToken, IngestError } from './auth.mjs';
import { deriveWardriverProgress, hashCanonicalJson, hashPersistedObservation } from './contracts.mjs';

const REQUIRED_MIGRATIONS = Object.freeze([
  '0001_cybermap_core',
  '0002_device_ingest_contract',
  '0003_paper_state',
  '0004_godeye_global_cells_and_sources',
  '0004_morning_brief_archive',
  '0005_device_scoped_observation_identity',
  '0006_best_effort_observation_progress',
]);
const GLOBAL_SOURCE_CLASSES = Object.freeze(['green_public', 'green_owned', 'green_authorized']);
const GREEN_TILE_SOURCE_CLASSES = Object.freeze(['green_public', 'green_owned', 'green_authorized']);
const GLOBAL_MAX_CELLS = 1_000;
const GLOBAL_VIEWPORT_SCHEMA_VERSION = 'bss.godeye.global_viewport.v1';

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

  async authenticateMtls({ deviceId, certificateFingerprint, requiredScope }) {
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
         AND lower(coalesce(credential.metadata ->> 'mtls_certificate_fingerprint', '')) = lower($2)
         AND $3 = ANY(credential.scopes)
         AND credential.enabled = true
         AND (credential.expires_at IS NULL OR credential.expires_at > now())
         AND source.enabled = true
       LIMIT 1`,
      [deviceId, certificateFingerprint, requiredScope],
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
        `SELECT pg_advisory_xact_lock(hashtextextended($1 || ':' || $2 || ':' || observation_key, 1))
         FROM unnest($3::text[]) AS observation_key
         ORDER BY observation_key`,
        [credential.source_id, credential.device_id, sortedKeys],
      );

      const existingObservations = await client.query(
        `SELECT external_observation_key, producer_device_id, content_hash
         FROM observations
         WHERE source_id = $1
           AND producer_device_id = $2
           AND external_observation_key = ANY($3::text[])`,
        [credential.source_id, credential.device_id, sortedKeys],
      );
      const scopedLegacyObservations = await client.query(
        `SELECT observation.external_observation_key, observation.content_hash
         FROM observation_identity_scopes AS scope
         JOIN observations AS observation ON observation.id = scope.observation_id
         WHERE scope.source_id = $1
           AND scope.producer_device_id = $2
           AND scope.external_observation_key = ANY($3::text[])`,
        [credential.source_id, credential.device_id, sortedKeys],
      );
      const scopedObservations = [...existingObservations.rows, ...scopedLegacyObservations.rows];
      if (scopedObservations.some((row) => typeof row.content_hash !== 'string' || !/^[a-f0-9]{64}$/i.test(row.content_hash))) {
        throw new IngestError('observation_identity_unscoped', 'Observation identity ownership is not provable.', {
          statusCode: 409,
          publicCode: 'observation_key_reused',
        });
      }
      const unscopedLegacyObservations = await client.query(
        `SELECT observation.external_observation_key
         FROM observations AS observation
         WHERE observation.source_id = $1
           AND observation.producer_device_id IS NULL
           AND observation.external_observation_key = ANY($2::text[])
           AND NOT EXISTS (
             SELECT 1
             FROM observation_identity_scopes AS scope
             WHERE scope.observation_id = observation.id
           )`,
        [credential.source_id, sortedKeys],
      );
      if (unscopedLegacyObservations.rows.length > 0) {
        throw new IngestError('observation_identity_unscoped', 'Observation identity ownership is not provable.', {
          statusCode: 409,
          publicCode: 'observation_key_reused',
        });
      }
      const existingByKey = new Map();
      for (const row of scopedObservations) {
        const existingHash = existingByKey.get(row.external_observation_key);
        if (existingHash !== undefined && existingHash !== row.content_hash) {
          throw new IngestError('observation_identity_unscoped', 'Observation identity ownership is not provable.', {
            statusCode: 409,
            publicCode: 'observation_key_reused',
          });
        }
        existingByKey.set(row.external_observation_key, row.content_hash);
      }
      const pending = [];
      let duplicateCount = 0;
      let preservedConflictCount = 0;
      const progress = batch.schema_version === 'bss.observation_batch.v2'
        ? Object.freeze({
          schema_version: 'bss.wardriver_progress.v1',
          acknowledged_through: deriveWardriverProgress(batch.observations),
        })
        : null;
      for (const observation of batch.observations) {
        const contentHash = hashPersistedObservation(batch, observation);
        if (!existingByKey.has(observation.external_observation_key)) {
          pending.push({ observation, contentHash });
          continue;
        }
        if (existingByKey.get(observation.external_observation_key) !== contentHash) {
          if (progress) {
            preservedConflictCount += 1;
            continue;
          }
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
            observation_identity_scope: 'source_device_external_observation_key.v1',
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
        schema_version: progress ? 'bss.sync_receipt.v2' : 'bss.sync_receipt.v1',
        server_batch_id: batchId,
        idempotency_key: batch.idempotency_key,
        status: 'applied',
        accepted_count: pending.length,
        rejected_count: 0,
        duplicate_count: duplicateCount,
        ...(progress ? {
          preserved_conflict_count: preservedConflictCount,
          progress,
        } : {}),
        validation_errors: [],
        server_clock: serverClock,
      });
      await client.query(
        `UPDATE sync_batches
         SET status = 'applied', completed_at = $2, accepted_count = $3,
             rejected_count = 0, duplicate_count = $4, observation_count = $5,
             response_status = 201, receipt = $6::jsonb,
             preserved_conflict_count = $7
         WHERE id = $1`,
        [
          batchId,
          serverClock,
          pending.length,
          duplicateCount,
          batch.observations.length,
          JSON.stringify(receipt),
          preservedConflictCount,
        ],
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
  async putPaperState({ idempotencyKey, state }) {
    const client = await this.#pool.connect();
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query("SET LOCAL lock_timeout TO '2s'; SET LOCAL statement_timeout TO '3s'; SET LOCAL idle_in_transaction_session_timeout TO '10s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('mosaic-murmurs-paper-state', 2))");
      const payloadHash = hashCanonicalJson(state);
      const existing = await client.query(
        `SELECT payload_hash, state
         FROM paper_state_updates
         WHERE idempotency_key = $1
         FOR UPDATE`,
        [idempotencyKey],
      );
      if (existing.rows.length > 0) {
        if (existing.rows[0].payload_hash !== payloadHash) {
          throw new IngestError('idempotency_key_reused', 'Idempotency key was reused with changed content.', { statusCode: 409 });
        }
        await client.query('COMMIT');
        transactionOpen = false;
        return { statusCode: 200, replayed: true, state: existing.rows[0].state };
      }
      const current = await client.query(
        `SELECT current.generated_at, updates.payload_hash
         FROM paper_state_current AS current
         JOIN paper_state_updates AS updates ON updates.id = current.update_id
         WHERE current.singleton = true
         FOR UPDATE OF current`,
      );
      if (current.rows.length > 0) {
        const incomingTime = new Date(state.generated_at).getTime();
        const currentTime = new Date(current.rows[0].generated_at).getTime();
        if (incomingTime < currentTime) {
          throw new IngestError('stale_paper_state', 'Older paper state cannot replace the current snapshot.', { statusCode: 409 });
        }
        if (incomingTime === currentTime && current.rows[0].payload_hash !== payloadHash) {
          throw new IngestError('paper_state_conflict', 'Changed paper state cannot reuse the current generated_at timestamp.', { statusCode: 409 });
        }
      }
      const inserted = await client.query(
        `INSERT INTO paper_state_updates (idempotency_key, payload_hash, generated_at, state)
         VALUES ($1, $2, $3, $4::jsonb)
         RETURNING id, applied_at`,
        [idempotencyKey, payloadHash, state.generated_at, JSON.stringify(state)],
      );
      await client.query(
        `INSERT INTO paper_state_current (singleton, update_id, idempotency_key, generated_at, state, updated_at)
         VALUES (true, $1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (singleton) DO UPDATE
         SET update_id = EXCLUDED.update_id,
             idempotency_key = EXCLUDED.idempotency_key,
             generated_at = EXCLUDED.generated_at,
             state = EXCLUDED.state,
             updated_at = EXCLUDED.updated_at`,
        [inserted.rows[0].id, idempotencyKey, state.generated_at, JSON.stringify(state), inserted.rows[0].applied_at],
      );
      await client.query('COMMIT');
      transactionOpen = false;
      return { statusCode: 201, replayed: false, state: structuredClone(state) };
    } catch (error) {
      if (transactionOpen) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the original failure.
        }
      }
      throw normalizeDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async getPaperState() {
    const result = await this.#pool.query(
      `SELECT idempotency_key, state, updated_at
       FROM paper_state_current
       WHERE singleton = true`,
    );
    if (result.rows.length === 0) return null;
    return {
      idempotencyKey: result.rows[0].idempotency_key,
      state: result.rows[0].state,
      appliedAt: new Date(result.rows[0].updated_at).toISOString(),
    };
  }

  async queryGlobalViewport({
    bbox,
    zoom,
    layer_ids: layerIds,
    since = null,
    max_cells: maxCells = GLOBAL_MAX_CELLS,
    now = new Date(),
  } = {}) {
    const selectedResolution = globalResolutionForZoom(zoom);
    const result = await this.#pool.query(
      `SELECT
         cell.h3_cell,
         cell.resolution,
         ST_Y(ST_Centroid(cell.geom))::float8 AS centroid_lat,
         ST_X(ST_Centroid(cell.geom))::float8 AS centroid_lon,
         cell.source_classes::text[] AS source_classes,
         cell.observation_count,
         cell.entity_count,
         cell.first_seen_at,
         cell.last_seen_at,
         cell.layers,
         cell.freshness,
         cell.caveats,
         cell.salience::float8 AS salience
       FROM cybermap_cells AS cell
       WHERE cell.resolution = $1
         AND ST_Intersects(
           cell.geom,
           ST_MakeEnvelope($2, $3, $4, $5, 4326)
         )
         AND ($8::timestamptz IS NULL OR cell.last_seen_at >= $8::timestamptz)
         AND jsonb_object_length(cell.layers) > 0
         AND NOT EXISTS (
           SELECT 1
           FROM jsonb_object_keys(cell.layers) AS cell_layer(layer_id)
           LEFT JOIN source_catalog AS source
             ON source.layer_id = cell_layer.layer_id
            AND source.enabled = true
            AND source.global_layer = true
            AND source.terms_reviewed_at IS NOT NULL
            AND source.allowed_preload = true
            AND source.source_class = ANY($6::source_class[])
            AND source.layer_id = ANY($7::text[])
            AND (
              source.source_class <> 'green_authorized'
              OR source.authorized_scope_ref IS NOT NULL
            )
           WHERE source.layer_id IS NULL
         )
       ORDER BY cell.salience DESC, cell.last_seen_at DESC NULLS LAST, cell.h3_cell ASC
       LIMIT $9`,
      [
        selectedResolution,
        bbox.west,
        bbox.south,
        bbox.east,
        bbox.north,
        GLOBAL_SOURCE_CLASSES,
        layerIds,
        since,
        boundedGlobalLimit(maxCells),
      ],
    );
    const cells = result.rows.map((row) => rowToAggregateCell(row));

    return {
      ok: true,
      schema_version: GLOBAL_VIEWPORT_SCHEMA_VERSION,
      mode: 'global',
      generated_at: new Date(now).toISOString(),
      bbox: structuredClone(bbox),
      requested_zoom: zoom,
      selected_resolution: selectedResolution,
      aggregation_applied: false,
      cells,
      source_health: [],
      intelligence_gaps: [],
    };
  }

  async getDeflockSource(sourceKey = 'deflock-osm-alpr-reports') {
    const result = await this.#pool.query(
      `SELECT source_key, enabled, terms_reviewed
       FROM source_catalog
       WHERE source_key = $1
         AND source_class = 'green_public'::source_class
       LIMIT 1`,
      [sourceKey],
    );
    if (result.rows.length !== 1) throw new IngestError('deflock_source_unknown', 'DeFlock source is not configured.', { statusCode: 422 });
    return {
      source_key: result.rows[0].source_key,
      enabled: result.rows[0].enabled === true,
      terms_reviewed: result.rows[0].terms_reviewed === true,
    };
  }

  async queryDeflockGlobalViewport({ bbox, resolution, layer_ids, cell_limit } = {}) {
    const sourcesResult = await this.#pool.query(
      `SELECT
         source_key AS source_id,
         source_class::text AS source_class,
         CASE
           WHEN enabled = false OR allowed_preload = false THEN 'disabled'
           WHEN last_success_at IS NULL AND last_outcome IN ('network_error', 'http_error', 'timeout', 'rate_limited') THEN 'error'
           WHEN last_success_at IS NULL THEN 'empty'
           WHEN last_success_at < clock_timestamp() - make_interval(secs => cache_ttl_seconds) THEN 'stale'
           ELSE 'fresh'
         END AS status,
         allowed_preload,
         last_success_at,
         COALESCE(attribution, '') AS attribution
       FROM source_catalog
       WHERE source_key = ANY($1::text[])
       ORDER BY source_key ASC`,
      [layer_ids],
    );
    const sources = sourcesResult.rows.map((row) => ({
      source_id: row.source_id,
      source_class: row.source_class,
      status: row.status,
      allowed_preload: row.allowed_preload === true,
      last_success_at: row.last_success_at ? toIsoString(row.last_success_at) : null,
      attribution: row.attribution,
      caveats: row.status === 'disabled'
        ? ['Source disabled by catalog configuration.']
        : ['Public OSM-tagged ALPR reports; not verified or live.'],
    }));
    const cellsResult = await this.#pool.query(
      `SELECT
         cell.h3_cell,
         cell.resolution,
         ST_Y(cell.centroid)::float8 AS latitude,
         ST_X(cell.centroid)::float8 AS longitude,
         cell.report_count,
         cell.first_seen_at,
         cell.last_seen_at,
         cell.salience::float8 AS salience,
         ARRAY[source.source_key]::text[] AS source_ids,
         ARRAY[source.source_class::text]::text[] AS source_classes,
         cell.evidence_class,
         cell.caveats
       FROM global_source_cells AS cell
       JOIN source_catalog AS source ON source.id = cell.source_id
       WHERE source.source_key = ANY($1::text[])
         AND source.enabled = true
         AND source.allowed_preload = true
         AND cell.resolution = $2
         AND ST_Intersects(cell.footprint, ST_MakeEnvelope($3, $4, $5, $6, 4326))
       ORDER BY cell.report_count DESC, cell.h3_cell ASC
       LIMIT $7`,
      [layer_ids, resolution, bbox.west, bbox.south, bbox.east, bbox.north, cell_limit],
    );
    return {
      sources,
      cells: cellsResult.rows.map((row) => ({
        h3_cell: row.h3_cell,
        resolution: Number(row.resolution),
        centroid: { latitude: Number(row.latitude), longitude: Number(row.longitude) },
        report_count: Number(row.report_count),
        first_seen_at: toIsoString(row.first_seen_at),
        last_seen_at: toIsoString(row.last_seen_at),
        salience: Number(row.salience),
        source_ids: [...(row.source_ids ?? [])],
        source_classes: [...(row.source_classes ?? [])],
        evidence_class: row.evidence_class,
        caveats: parseJsonArray(row.caveats),
      })),
    };
  }

  async replaceDeflockSourceCells({ source_id, observed_at, cells } = {}) {
    const client = await this.#pool.connect();
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      const sourceResult = await client.query(
        `SELECT id::text AS id
         FROM source_catalog
         WHERE source_key = $1
           AND source_class = 'green_public'::source_class
         FOR UPDATE`,
        [source_id],
      );
      if (sourceResult.rows.length !== 1) throw new IngestError('deflock_source_unknown', 'DeFlock source is not configured.', { statusCode: 422 });
      const sourceId = sourceResult.rows[0].id;
      const rows = serializeDeflockCells(cells, observed_at);
      await client.query('DELETE FROM global_source_cells WHERE source_id = $1', [sourceId]);
      if (rows.length > 0) {
        await client.query(
          `INSERT INTO global_source_cells (
             source_id, h3_cell, resolution, centroid, footprint, evidence_class,
             report_count, first_seen_at, last_seen_at, salience, caveats, updated_at
           )
           SELECT
             $1, row.h3_cell, row.resolution,
             ST_SetSRID(ST_MakePoint(row.longitude, row.latitude), 4326),
             ST_SetSRID(ST_GeomFromGeoJSON(jsonb_build_object('type', 'Polygon', 'coordinates', jsonb_build_array(row.boundary))::text), 4326),
             'public_reported', row.report_count, row.first_seen_at, row.last_seen_at,
             row.salience, row.caveats, clock_timestamp()
           FROM jsonb_to_recordset($2::jsonb) AS row(
             h3_cell text, resolution smallint, latitude double precision, longitude double precision,
             boundary jsonb, report_count integer, first_seen_at timestamptz, last_seen_at timestamptz,
             salience numeric, caveats jsonb
           )`,
          [sourceId, JSON.stringify(rows)],
        );
      }
      await client.query('COMMIT');
      transactionOpen = false;
    } catch (error) {
      if (transactionOpen) await client.query('ROLLBACK');
      throw normalizeDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async recordDeflockSourceFetchRun(run) {
    const result = await this.#pool.query(
      `WITH source AS (
         SELECT id FROM source_catalog WHERE source_key = $1
       ), inserted AS (
         INSERT INTO source_fetch_runs (
           source_id, outcome, started_at, completed_at, http_status, etag,
           item_count, normalized_count, cell_count
         )
         SELECT source.id, $2, $3, $4, $5, $6, $7, $8, $9
         FROM source
         RETURNING source_id
       )
       UPDATE source_catalog AS catalog
       SET last_outcome = $2,
           last_success_at = CASE WHEN $2 = 'success' THEN $4 ELSE catalog.last_success_at END,
           last_failure_at = CASE WHEN $2 NOT IN ('success', 'disabled') THEN $4 ELSE catalog.last_failure_at END,
           updated_at = clock_timestamp()
       FROM inserted
       WHERE catalog.id = inserted.source_id
       RETURNING catalog.id::text AS source_id`,
      [run.source_id, run.outcome, run.started_at, run.completed_at, run.http_status, run.etag, run.item_count, run.normalized_count, run.cell_count],
    );
    if (result.rows.length !== 1) throw new IngestError('deflock_source_unknown', 'DeFlock source is not configured.', { statusCode: 422 });
  }

  async putMorningBrief({ idempotencyKey, package: packet }) {
    const client = await this.#pool.connect();
    let transactionOpen = false;
    try {
      await client.query('BEGIN');
      transactionOpen = true;
      await client.query("SET LOCAL lock_timeout TO '2s'; SET LOCAL statement_timeout TO '8s'; SET LOCAL idle_in_transaction_session_timeout TO '15s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtextextended('mosaic-murmurs-morning-brief:' || $1, 3))", [packet.run_id]);
      const existing = await client.query(
        `SELECT package_sha256, archived_at
         FROM morning_brief_runs
         WHERE run_id = $1
         FOR UPDATE`,
        [packet.run_id],
      );
      if (existing.rows.length > 0) {
        if (existing.rows[0].package_sha256 !== packet.package_sha256) {
          throw new IngestError('morning_brief_conflict', 'A different package already exists for this run.', { statusCode: 409 });
        }
        await client.query('COMMIT');
        transactionOpen = false;
        return { statusCode: 200, replayed: true, brief: morningBriefResponse(packet, existing.rows[0].archived_at) };
      }
      const inserted = await client.query(
        `INSERT INTO morning_brief_runs (
           run_id, idempotency_key, generated_at, canonical_state_hash, package_sha256, summary
         ) VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING archived_at`,
        [packet.run_id, idempotencyKey, packet.generated_at, packet.canonical_state_hash, packet.package_sha256, packet.summary],
      );
      for (const artifact of packet.artifacts) {
        await client.query(
          `INSERT INTO morning_brief_artifacts (run_id, artifact_id, media_type, sha256, content)
           VALUES ($1, $2, $3, $4, $5)`,
          [packet.run_id, artifact.artifact_id, artifact.media_type, artifact.sha256, artifact.content],
        );
      }
      await pruneExpiredMorningBriefs(client);
      await client.query('COMMIT');
      transactionOpen = false;
      return { statusCode: 201, replayed: false, brief: morningBriefResponse(packet, inserted.rows[0].archived_at) };
    } catch (error) {
      if (transactionOpen) {
        try { await client.query('ROLLBACK'); } catch { /* Preserve original failure. */ }
      }
      throw normalizeDatabaseError(error);
    } finally {
      client.release();
    }
  }

  async listMorningBriefs({ limit = 30 } = {}) {
    const result = await this.#pool.query(
      `SELECT run_id, generated_at, canonical_state_hash, package_sha256, summary, archived_at, artifact_count
       FROM morning_brief_runs
       ORDER BY generated_at DESC
       LIMIT $1`,
      [limit],
    );
    return result.rows.map(rowToMorningBriefSummary);
  }

  async getMorningBrief(runId) {
    const result = await this.#pool.query(
      `SELECT run_id, generated_at, canonical_state_hash, package_sha256, summary, archived_at, artifact_count
       FROM morning_brief_runs
       WHERE run_id = $1`,
      [runId],
    );
    if (result.rows.length === 0) return null;
    const artifacts = await this.#pool.query(
      `SELECT artifact_id, media_type, sha256
       FROM morning_brief_artifacts
       WHERE run_id = $1
       ORDER BY artifact_id`,
      [runId],
    );
    return {
      ...rowToMorningBriefSummary(result.rows[0]),
      artifacts: artifacts.rows.map((row) => ({ artifact_id: row.artifact_id, media_type: row.media_type, sha256: row.sha256 })),
    };
  }

  async getMorningBriefArtifact(runId, artifactId) {
    const result = await this.#pool.query(
      `SELECT artifact_id, media_type, sha256, content
       FROM morning_brief_artifacts
       WHERE run_id = $1 AND artifact_id = $2`,
      [runId, artifactId],
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    return { artifact_id: row.artifact_id, media_type: row.media_type, sha256: row.sha256, content: Buffer.from(row.content) };
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

  async queryVectorTile({ z, x, y } = {}) {
    const result = await this.#pool.query(
      `WITH bounds AS (
         SELECT ST_TileEnvelope($1, $2, $3) AS geom
       ), features AS (
         SELECT
           cell.h3_cell,
           cell.resolution,
           cell.observation_count,
           cell.entity_count,
           cell.salience::float8 AS salience,
           array_to_string(cell.source_classes, ',') AS source_class_summary,
           CASE
             WHEN cell.last_seen_at >= clock_timestamp() - interval '15 minutes' THEN 'fresh'
             ELSE 'stale'
           END AS freshness_status,
           CASE
             WHEN jsonb_array_length(cell.caveats) > 0 THEN 'present'
             ELSE 'none'
           END AS caveat_status,
           ST_AsMVTGeom(ST_Transform(cell.geom, 3857), bounds.geom, 4096, 64, true) AS geom
         FROM cybermap_cells AS cell
         CROSS JOIN bounds
         WHERE cardinality(cell.source_classes) > 0
           AND cell.source_classes <@ $4::source_class[]
           AND ST_Intersects(ST_Transform(cell.geom, 3857), bounds.geom)
       )
       SELECT COALESCE(ST_AsMVT(features, 'green_cells', 4096, 'geom'), ''::bytea) AS tile
       FROM features`,
      [z, x, y, GREEN_TILE_SOURCE_CLASSES],
    );
    return Buffer.from(result.rows[0]?.tile ?? Buffer.alloc(0));
  }
}

async function pruneExpiredMorningBriefs(client) {
  await client.query(
    `DELETE FROM morning_brief_artifacts
     WHERE run_id IN (
       SELECT run_id FROM morning_brief_runs
       WHERE archived_at <= clock_timestamp() - interval '7 days'
     )`,
  );
  await client.query(
    `DELETE FROM morning_brief_runs
     WHERE archived_at <= clock_timestamp() - interval '7 days'`,
  );
}

function rowToMorningBriefSummary(row) {
  return {
    run_id: row.run_id,
    generated_at: toIsoString(row.generated_at),
    canonical_state_hash: row.canonical_state_hash,
    package_sha256: row.package_sha256,
    summary: row.summary,
    artifact_count: Number(row.artifact_count),
    archived_at: toIsoString(row.archived_at),
  };
}

function morningBriefResponse(packet, archivedAt) {
  return {
    run_id: packet.run_id,
    generated_at: packet.generated_at,
    canonical_state_hash: packet.canonical_state_hash,
    package_sha256: packet.package_sha256,
    summary: packet.summary,
    artifact_count: packet.artifacts.length,
    archived_at: toIsoString(archivedAt),
    artifacts: packet.artifacts.map((artifact) => ({ artifact_id: artifact.artifact_id, media_type: artifact.media_type, sha256: artifact.sha256 })),
  };
}

function rowToAccessPoint(row) {
  const payload = parseJsonObject(row.payload || {});
  const provenance = parseJsonObject(row.provenance || {});
  const lastSeen = toIsoString(row.observed_at);
  return {
    id: row.id || row.external_observation_key,
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

function rowToAggregateCell(row) {
  const centroid = parseJsonObject(row.centroid ?? {
    lat: row.centroid_lat,
    lon: row.centroid_lon,
  });
  const layers = aggregateLayers(row.layers);
  return {
    h3_cell: row.h3_cell,
    resolution: finiteInteger(row.resolution),
    centroid: {
      lat: finiteOrNull(centroid.lat),
      lon: finiteOrNull(centroid.lon),
    },
    source_classes: aggregateSourceClasses(row.source_classes),
    observation_count: finiteInteger(row.observation_count),
    entity_count: finiteInteger(row.entity_count),
    first_seen_at: toIsoString(row.first_seen_at),
    last_seen_at: toIsoString(row.last_seen_at),
    layers,
    freshness: aggregateFreshness(row.freshness, Object.keys(layers)),
    caveats: aggregateCaveats(row.caveats),
    salience: finiteOrNull(row.salience),
  };
}

function globalResolutionForZoom(zoom) {
  if (zoom <= 3) return 5;
  if (zoom <= 7) return 7;
  if (zoom <= 11) return 9;
  return 11;
}

function boundedGlobalLimit(value) {
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1) return 1;
  return Math.min(limit, GLOBAL_MAX_CELLS);
}

function aggregateSourceClasses(value) {
  const classes = Array.isArray(value) ? value : parseJsonArray(value);
  return [...new Set(classes.filter((sourceClass) => GLOBAL_SOURCE_CLASSES.includes(sourceClass)))].sort();
}

function aggregateLayers(value) {
  const layers = parseJsonObject(value ?? {});
  return Object.fromEntries(
    Object.entries(layers).map(([layerId, aggregate]) => [
      layerId,
      { observation_count: finiteInteger(aggregate?.observation_count) },
    ]),
  );
}

function aggregateFreshness(value, layerIds) {
  const freshness = parseJsonObject(value ?? {});
  return Object.fromEntries(layerIds.map((layerId) => {
    const record = freshness[layerId] ?? {};
    return [layerId, {
      state: typeof record.state === 'string' ? record.state : 'error',
      age_seconds: finiteInteger(record.age_seconds),
    }];
  }));
}

function aggregateCaveats(value) {
  return parseJsonArray(value ?? []).filter((caveat) => typeof caveat === 'string' && /^[a-z0-9_]{1,64}$/.test(caveat));
}

function finiteOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteInteger(value) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : 0;
}

function stringOrNull(value) {
  return typeof value === 'string' && value ? value : null;
}

function serializeDeflockCells(cells, observedAt) {
  if (!Array.isArray(cells)) throw new TypeError('DeFlock source cells must be an array.');
  const fallbackObservedAt = toIsoString(observedAt);
  if (!fallbackObservedAt) throw new TypeError('DeFlock observation time is invalid.');
  return cells.map((cell) => {
    if (!cell || cell.evidence_class !== 'public_reported' || !Array.isArray(cell.source_ids)
        || cell.source_ids.length !== 1 || cell.source_ids[0] !== 'deflock-osm-alpr-reports') {
      throw new TypeError('DeFlock source cell contract is invalid.');
    }
    const latitude = Number(cell.centroid?.latitude);
    const longitude = Number(cell.centroid?.longitude);
    const boundary = Array.isArray(cell.boundary)
      ? cell.boundary.map((point) => [Number(point?.longitude), Number(point?.latitude)])
      : [];
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude) || boundary.length < 4
        || boundary.some(([boundaryLongitude, boundaryLatitude]) => !Number.isFinite(boundaryLongitude) || !Number.isFinite(boundaryLatitude))) {
      throw new TypeError('DeFlock source cell geometry is invalid.');
    }
    const [firstLongitude, firstLatitude] = boundary[0];
    const [lastLongitude, lastLatitude] = boundary.at(-1);
    if (firstLongitude !== lastLongitude || firstLatitude !== lastLatitude) throw new TypeError('DeFlock source cell boundary is not closed.');
    if (!Number.isInteger(cell.resolution) || ![2, 4, 5].includes(cell.resolution)
        || !Number.isInteger(cell.report_count) || cell.report_count < 1) throw new TypeError('DeFlock source cell aggregate is invalid.');
    const firstSeenAt = toIsoString(cell.first_seen_at ?? fallbackObservedAt);
    const lastSeenAt = toIsoString(cell.last_seen_at ?? fallbackObservedAt);
    if (!firstSeenAt || !lastSeenAt) throw new TypeError('DeFlock source cell timestamp is invalid.');
    const salience = Number(cell.salience);
    if (!Number.isFinite(salience) || salience < 0 || salience > 1) throw new TypeError('DeFlock source cell salience is invalid.');
    return {
      h3_cell: String(cell.h3_cell), resolution: cell.resolution, latitude, longitude, boundary,
      report_count: cell.report_count, first_seen_at: firstSeenAt, last_seen_at: lastSeenAt,
      salience, caveats: JSON.stringify(Array.isArray(cell.caveats) ? cell.caveats : []),
    };
  });
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
       source_id, source_class, producer_device_id, session_id, sync_batch_id,
       external_observation_key, content_hash, idempotency_key,
       kind, observed_at, geom, h3_7, h3_9, h3_11,
       confidence, pii_status, retention_class, payload, provenance
     )
     SELECT
       $1, $2::source_class, $3, $4, $5,
       row.external_observation_key, row.content_hash, row.external_observation_key,
       row.kind::observation_kind, row.observed_at,
       ST_SetSRID(ST_MakePoint(row.longitude, row.latitude), 4326),
       row.h3_7, row.h3_9, row.h3_11,
       row.confidence, $7, $8::cyber_retention_class, row.payload, row.provenance
     FROM jsonb_to_recordset($6::jsonb) AS row(
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
      credential.device_id,
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
  const commonValid = UUID_RE.test(String(receipt.server_batch_id ?? ''))
    && receipt.idempotency_key === batch.idempotency_key
    && receipt.status === 'applied'
    && nonnegativeInteger(acceptedCount)
    && nonnegativeInteger(rejectedCount)
    && nonnegativeInteger(duplicateCount)
    && Array.isArray(receipt.validation_errors)
    && receipt.validation_errors.length === 0
    && validTimestamp(receipt.server_clock);
  if (!commonValid) throw storageContractRejected();

  if (batch.schema_version === 'bss.observation_batch.v1') {
    if (receipt.schema_version !== 'bss.sync_receipt.v1'
        || acceptedCount + rejectedCount + duplicateCount !== batch.observations.length) {
      throw storageContractRejected();
    }
    return receipt;
  }

  if (batch.schema_version === 'bss.observation_batch.v2') {
    const preservedConflictCount = receipt.preserved_conflict_count;
    const acknowledgedThrough = deriveWardriverProgress(batch.observations);
    const progress = receipt.progress;
    if (receipt.schema_version !== 'bss.sync_receipt.v2'
        || !nonnegativeInteger(preservedConflictCount)
        || acceptedCount + rejectedCount + duplicateCount + preservedConflictCount !== batch.observations.length
        || !isPlainObject(progress)
        || progress.schema_version !== 'bss.wardriver_progress.v1'
        || progress.acknowledged_through !== acknowledgedThrough) {
      throw storageContractRejected();
    }
    return receipt;
  }

  throw storageContractRejected();
}

function nonnegativeInteger(value) {
  return Number.isInteger(value) && value >= 0;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
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

function parseJsonArray(value) {
  const parsed = typeof value === 'string' ? JSON.parse(value) : structuredClone(value);
  return Array.isArray(parsed) ? parsed : [];
}
