import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync } from 'node:fs';

const FIXTURE_SOURCE_ID = '00000000-0000-4000-8000-000000000001';
const RED_SOURCE_ID = '00000000-0000-4000-8000-000000000002';
const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RESTRICTED_SOURCE_CLASSES = new Set(['grey_enrichment', 'orange_exposure', 'red_restricted']);

function redactedFixtureToken(label) {
  return `[REDACTED:${label}]`;
}

const WARD_TOKEN = redactedFixtureToken('wardriver');
const RED_TOKEN = redactedFixtureToken('red-enrichment');

function request(server, options = {}) {
  const address = server.address();
  const body = options.body || '';
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      path: options.path || '/',
      method: options.method || 'GET',
      headers: {
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...(options.headers || {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text,
          json: text ? JSON.parse(text) : null,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function withServer(options, fn) {
  const { createCybermapApiServer } = await import('../vm/cybermap-api/server.mjs');
  const server = createCybermapApiServer({
    env: { CYBERMAP_DATABASE_URL: 'postgresql://cybermap:***@127.0.0.1:6432/cybermap' },
    logger: () => {},
    now: () => new Date('2026-07-10T12:00:00.000Z'),
    ...options,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await fn(server);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function makeTokenRecords(hashToken) {
  return [
    {
      tokenHash: hashToken(WARD_TOKEN),
      tokenId: 'wardriver-alpha',
      clientType: 'wardriver_device',
      subject: 'device:wardriver-alpha',
      scopes: ['observations:write'],
      sourceIds: [FIXTURE_SOURCE_ID],
      sourceClasses: ['owned_device'],
    },
    {
      tokenHash: hashToken(RED_TOKEN),
      tokenId: 'red-enrichment-worker',
      clientType: 'operator_admin',
      scopes: ['observations:write'],
      sourceIds: [RED_SOURCE_ID],
      sourceClasses: ['red_restricted'],
    },
  ];
}

function makeBatch(overrides = {}) {
  return {
    source_id: FIXTURE_SOURCE_ID,
    source_class: 'owned_device',
    client_id: 'wardriver-alpha-client',
    provenance: { adapter: 'wardriver-raid', chain: ['device-local'] },
    observations: [
      {
        external_observation_key: 'wardriver-alpha:2026-07-10T12:00:00Z:wifi:1',
        idempotency_key: 'item-001',
        kind: 'wifi_ap',
        observed_at: '2026-07-10T11:59:00.000Z',
        lat: 47.6205,
        lon: -122.3493,
        confidence: 0.875,
        pii_status: 'redacted',
        retention_class: 'summary_only',
        payload: { ssid_hash: 'sha256:fixture', bssid_hash: 'sha256:bssid-fixture', channel: 11 },
        provenance: { sensor: 'wardriver' },
      },
    ],
    ...overrides,
  };
}

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function readWardriverRaidFixture() {
  return JSON.parse(readFileSync(new URL('./fixtures/wardriver-raid-batch-v1.json', import.meta.url), 'utf8'));
}

function createIngestPool() {
  const batches = new Map();
  const observations = [];
  const cyberEntities = new Map();
  const entityObservations = new Map();
  const transactions = [];
  let batchSequence = 0;
  let entitySequence = 0;
  const pool = {
    batches,
    observations,
    cyberEntities,
    entityObservations,
    transactions,
    queries: [],
    ended: false,
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      this.queries.push({ sql: text, params });
      if (/^BEGIN$/i.test(text)) {
        transactions.push('BEGIN');
        return { rows: [] };
      }
      if (/^COMMIT$/i.test(text)) {
        transactions.push('COMMIT');
        return { rows: [] };
      }
      if (/^ROLLBACK$/i.test(text)) {
        transactions.push('ROLLBACK');
        return { rows: [] };
      }
      if (/from sync_batches/i.test(text) && /idempotency_key/i.test(text)) {
        const [sourceId, clientId, idempotencyKey] = params;
        const row = batches.get(`${sourceId}|${clientId}|${idempotencyKey}`);
        return { rows: row ? [row] : [] };
      }
      if (/insert into sync_batches/i.test(text)) {
        const [sourceId, sessionId, clientId, idempotencyKey, requestMetadata, provenance] = params;
        const key = `${sourceId}|${clientId}|${idempotencyKey}`;
        if (batches.has(key) && /on conflict/i.test(text)) return { rows: [] };
        assert.equal(batches.has(key), false, 'duplicate insert should be conflict-safe');
        const row = {
          id: `batch-${++batchSequence}`,
          source_id: sourceId,
          session_id: sessionId,
          client_id: clientId,
          idempotency_key: idempotencyKey,
          status: 'received',
          observation_count: 0,
          payload_hash: null,
          request_metadata: typeof requestMetadata === 'string' ? JSON.parse(requestMetadata) : requestMetadata,
          provenance: typeof provenance === 'string' ? JSON.parse(provenance) : provenance,
          received_at: '2026-07-10T12:00:00.000Z',
          completed_at: null,
        };
        batches.set(key, row);
        return { rows: [row] };
      }
      if (/insert into observations/i.test(text)) {
        assert.match(text, /st_setsrid\s*\(\s*st_makepoint/i, 'geometry should be normalized in SQL with lon/lat point');
        const [
          sourceId,
          sourceClass,
          sessionId,
          triggerObservationId,
          authorizedScopeRef,
          kind,
          externalObservationKey,
          idempotencyKey,
          observedAt,
          lon,
          lat,
          h3_7,
          h3_9,
          h3_11,
          confidence,
          piiStatus,
          retentionClass,
          rawPayloadRef,
          operatorApprovedRawRef,
          payload,
          provenance,
        ] = params;
        const row = {
          id: `obs-${observations.length + 1}`,
          sourceId,
          sourceClass,
          sessionId,
          triggerObservationId,
          authorizedScopeRef,
          kind,
          externalObservationKey,
          idempotencyKey,
          observedAt,
          lon,
          lat,
          h3_7,
          h3_9,
          h3_11,
          confidence,
          piiStatus,
          retentionClass,
          rawPayloadRef,
          operatorApprovedRawRef,
          payload: typeof payload === 'string' ? JSON.parse(payload) : payload,
          provenance: typeof provenance === 'string' ? JSON.parse(provenance) : provenance,
        };
        if (row.sessionId) assert.match(row.sessionId, UUIDISH, 'session_id must be validated before DB write');
        if (row.triggerObservationId) assert.match(row.triggerObservationId, UUIDISH, 'trigger_observation_id must be validated before DB write');
        if (RESTRICTED_SOURCE_CLASSES.has(row.sourceClass)) {
          assert.ok(
            row.sessionId || row.triggerObservationId || row.authorizedScopeRef,
            'restricted source classes must satisfy the DB trigger/reference constraint before insert',
          );
        }
        observations.push(row);
        return { rows: [{ id: row.id }] };
      }
      if (/insert into cyber_entities/i.test(text)) {
        assert.match(text, /on conflict\s*\(\s*stable_key\s*\)/i, 'entity insert should upsert by stable_key');
        const [
          entityKind,
          stableKey,
          displayName,
          sourceClass,
          firstSeenAt,
          lastSeenAt,
          lon,
          lat,
          h3_7,
          h3_9,
          h3_11,
          confidence,
          labels,
          properties,
          provenance,
        ] = params;
        const existing = cyberEntities.get(stableKey);
        const row = existing || { id: `entity-${++entitySequence}`, stableKey, labels: [] };
        row.entityKind = entityKind;
        row.displayName = displayName;
        row.sourceClass = sourceClass;
        row.firstSeenAt = existing && existing.firstSeenAt < firstSeenAt ? existing.firstSeenAt : firstSeenAt;
        row.lastSeenAt = existing && existing.lastSeenAt > lastSeenAt ? existing.lastSeenAt : lastSeenAt;
        row.lon = lon;
        row.lat = lat;
        row.h3_7 = h3_7;
        row.h3_9 = h3_9;
        row.h3_11 = h3_11;
        row.confidence = Math.max(existing?.confidence ?? 0, confidence);
        row.labels = [...new Set([...(existing?.labels || []), ...labels])];
        row.properties = { ...(existing?.properties || {}), ...parseJson(properties) };
        row.provenance = { ...(existing?.provenance || {}), ...parseJson(provenance) };
        cyberEntities.set(stableKey, row);
        return { rows: [{ id: row.id }] };
      }
      if (/insert into entity_observations/i.test(text)) {
        assert.match(text, /on conflict\s*\(\s*entity_id\s*,\s*observation_id\s*,\s*relationship\s*\)/i, 'entity edge insert should upsert by entity/observation/relationship');
        const [
          entityId,
          observationId,
          relationship,
          sourceClass,
          weight,
          confidence,
          firstSeenAt,
          lastSeenAt,
          sourceObservationRefs,
          provenance,
        ] = params;
        const key = `${entityId}|${observationId}|${relationship}`;
        const existing = entityObservations.get(key);
        const row = existing || { entityId, observationId, relationship };
        row.sourceClass = sourceClass;
        row.weight = Math.max(existing?.weight ?? 0, weight);
        row.confidence = Math.max(existing?.confidence ?? 0, confidence);
        row.firstSeenAt = existing && existing.firstSeenAt < firstSeenAt ? existing.firstSeenAt : firstSeenAt;
        row.lastSeenAt = existing && existing.lastSeenAt > lastSeenAt ? existing.lastSeenAt : lastSeenAt;
        row.sourceObservationRefs = [...new Set([...(existing?.sourceObservationRefs || []), ...parseJson(sourceObservationRefs)])];
        row.provenance = { ...(existing?.provenance || {}), ...parseJson(provenance) };
        entityObservations.set(key, row);
        return { rows: [{ entity_id: entityId }] };
      }
      if (/update sync_batches/i.test(text)) {
        const [batchId, completedAt, observationCount, payloadHash, requestMetadata] = params;
        const row = [...batches.values()].find((candidate) => candidate.id === batchId);
        assert.ok(row, `missing batch row ${batchId}`);
        row.status = 'applied';
        row.completed_at = completedAt;
        row.observation_count = observationCount;
        row.payload_hash = payloadHash;
        row.request_metadata = typeof requestMetadata === 'string' ? JSON.parse(requestMetadata) : requestMetadata;
        return { rows: [row] };
      }
      assert.fail(`unexpected SQL: ${text}`);
    },
    async end() {
      this.ended = true;
    },
  };
  return pool;
}

async function ingestRequest(server, token, body, idempotencyKey = 'batch-alpha-001', extraHeaders = {}) {
  return request(server, {
    method: 'POST',
    path: '/api/v1/observations/batch',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
}

test('observation batch ingest requires bearer auth and a batch Idempotency-Key before storage', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');
  const pool = createIngestPool();

  await withServer({
    tokenRecords: makeTokenRecords(hashToken),
    dbPoolFactory: () => pool,
  }, async (server) => {
    const missingAuth = await request(server, {
      method: 'POST',
      path: '/api/v1/observations/batch',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(makeBatch()),
    });
    assert.equal(missingAuth.status, 401);
    assert.equal(missingAuth.json.error.code, 'auth_required');

    const missingIdempotency = await ingestRequest(server, WARD_TOKEN, makeBatch(), null);
    assert.equal(missingIdempotency.status, 400);
    assert.equal(missingIdempotency.json.error.code, 'idempotency_key_required');
    assert.equal(pool.observations.length, 0);
    assert.equal(pool.batches.size, 0);
  });
});

test('observation batch ingest stores normalized rows once and returns the previous receipt for duplicate idempotency keys', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');
  const pool = createIngestPool();

  await withServer({
    tokenRecords: makeTokenRecords(hashToken),
    dbPoolFactory: () => pool,
  }, async (server) => {
    const first = await ingestRequest(server, WARD_TOKEN, makeBatch(), 'batch-alpha-001');
    assert.equal(first.status, 201);
    assert.equal(first.json.ok, true);
    assert.equal(first.json.duplicate, false);
    assert.equal(first.json.receipt.client_id, 'wardriver-alpha');
    assert.equal(first.json.receipt.idempotency_key, 'batch-alpha-001');
    assert.equal(first.json.receipt.observation_count, 1);
    assert.deepEqual(first.json.receipt.observation_ids, ['obs-1']);

    assert.equal(pool.observations.length, 1);
    const stored = pool.observations[0];
    assert.equal(stored.sourceId, FIXTURE_SOURCE_ID);
    assert.equal(stored.sourceClass, 'owned_device');
    assert.equal(stored.kind, 'wifi_ap');
    assert.equal(stored.observedAt, '2026-07-10T11:59:00.000Z');
    assert.equal(stored.lon, -122.3493);
    assert.equal(stored.lat, 47.6205);
    assert.match(stored.h3_7, /^gh7:[0-9bcdefghjkmnpqrstuvwxyz]{7}$/);
    assert.match(stored.h3_9, /^gh9:[0-9bcdefghjkmnpqrstuvwxyz]{9}$/);
    assert.match(stored.h3_11, /^gh11:[0-9bcdefghjkmnpqrstuvwxyz]{11}$/);
    assert.equal(stored.confidence, 0.875);
    assert.equal(stored.piiStatus, 'redacted');
    assert.equal(stored.retentionClass, 'summary_only');

    assert.equal(pool.cyberEntities.size, 1, 'wifi observation should materialize one cyber_entities row');
    const [entity] = pool.cyberEntities.values();
    assert.equal(entity.entityKind, 'network');
    assert.equal(entity.stableKey, 'wifi_ap:bssid_hash:sha256:bssid-fixture');
    assert.equal(entity.sourceClass, 'owned_device');
    assert.equal(entity.firstSeenAt, '2026-07-10T11:59:00.000Z');
    assert.equal(entity.lastSeenAt, '2026-07-10T11:59:00.000Z');
    assert.equal(entity.properties.bssid_hash, 'sha256:bssid-fixture');
    assert.equal(entity.provenance.source_observation.id, 'obs-1');

    assert.equal(pool.entityObservations.size, 1, 'wifi observation should materialize one entity_observations edge');
    const [edge] = pool.entityObservations.values();
    assert.equal(edge.observationId, 'obs-1');
    assert.equal(edge.relationship, 'observed_as');
    assert.equal(edge.sourceClass, 'owned_device');
    assert.equal(edge.confidence, 0.875);
    assert.equal(edge.firstSeenAt, '2026-07-10T11:59:00.000Z');
    assert.equal(edge.lastSeenAt, '2026-07-10T11:59:00.000Z');
    assert.deepEqual(edge.sourceObservationRefs, ['obs-1']);

    const duplicate = await ingestRequest(server, WARD_TOKEN, makeBatch({ client_id: 'client-controlled-partition' }), 'batch-alpha-001');
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.json.ok, true);
    assert.equal(duplicate.json.duplicate, true);
    assert.deepEqual(duplicate.json.receipt, first.json.receipt);
    assert.equal(pool.observations.length, 1, 'duplicate request must not insert another immutable observation');
    assert.equal(pool.cyberEntities.size, 1, 'duplicate request must not insert another entity');
    assert.equal(pool.entityObservations.size, 1, 'duplicate request must not insert another entity edge');

    const canonicalDuplicate = await ingestRequest(server, WARD_TOKEN, {
      observations: [
        {
          provenance: { sensor: 'wardriver' },
          payload: { channel: 11, bssid_hash: 'sha256:bssid-fixture', ssid_hash: 'sha256:fixture' },
          retention_class: 'summary_only',
          pii_status: 'redacted',
          confidence: 0.875,
          lon: -122.3493,
          lat: 47.6205,
          observed_at: '2026-07-10T11:59:00.000Z',
          kind: 'wifi_ap',
          idempotency_key: 'item-001',
          external_observation_key: 'wardriver-alpha:2026-07-10T12:00:00Z:wifi:1',
        },
      ],
      provenance: { chain: ['device-local'], adapter: 'wardriver-raid' },
      client_id: 'another-client-controlled-partition',
      source_class: 'owned_device',
      source_id: FIXTURE_SOURCE_ID,
    }, 'batch-alpha-001');
    assert.equal(canonicalDuplicate.status, 200);
    assert.equal(canonicalDuplicate.json.duplicate, true);
    assert.deepEqual(canonicalDuplicate.json.receipt, first.json.receipt);
    assert.equal(pool.observations.length, 1, 'canonical duplicate request must not insert another observation');
    assert.equal(pool.cyberEntities.size, 1, 'canonical duplicate request must not insert another entity');
    assert.equal(pool.entityObservations.size, 1, 'canonical duplicate request must not insert another entity edge');

    const conflictingReplay = await ingestRequest(server, WARD_TOKEN, makeBatch({
      observations: [{ ...makeBatch().observations[0], confidence: 0.5 }],
    }), 'batch-alpha-001');
    assert.equal(conflictingReplay.status, 409);
    assert.equal(conflictingReplay.json.error.code, 'idempotency_key_conflict');
    assert.equal(pool.observations.length, 1, 'conflicting replay must not insert another observation');
    assert.deepEqual(pool.transactions, ['BEGIN', 'COMMIT', 'BEGIN', 'COMMIT', 'BEGIN', 'COMMIT', 'BEGIN', 'COMMIT']);
  });
});

test('observation batch ingest rejects invalid source policy, stale geometry/time, and unsafe product entities before DB writes', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');
  const pool = createIngestPool();

  await withServer({
    tokenRecords: makeTokenRecords(hashToken),
    dbPoolFactory: () => pool,
  }, async (server) => {
    const redWithoutTrigger = await ingestRequest(server, RED_TOKEN, makeBatch({
      source_id: RED_SOURCE_ID,
      source_class: 'red_restricted',
    }), 'red-batch-001');
    assert.equal(redWithoutTrigger.status, 422);
    assert.equal(redWithoutTrigger.json.error.code, 'source_policy_forbidden');

    const redWithSelfAssertedTrigger = await ingestRequest(server, RED_TOKEN, makeBatch({
      source_id: RED_SOURCE_ID,
      source_class: 'red_restricted',
      session_id: '00000000-0000-4000-8000-000000000011',
      authorized_scope_ref: 'self-asserted-scope',
    }), 'red-batch-self-asserted');
    assert.equal(redWithSelfAssertedTrigger.status, 422);
    assert.equal(redWithSelfAssertedTrigger.json.error.code, 'source_policy_forbidden');

    const redWithTrustedTrigger = await ingestRequest(server, RED_TOKEN, makeBatch({
      source_id: RED_SOURCE_ID,
      source_class: 'red_restricted',
      provenance: {
        adapter: 'red-enrichment',
        trigger: { source_class: 'owned_device', observation_id: '00000000-0000-4000-8000-000000000101' },
      },
      observations: [
        {
          ...makeBatch().observations[0],
          provenance: { sensor: 'red-enrichment' },
        },
      ],
    }), 'red-batch-trusted-trigger');
    assert.equal(redWithTrustedTrigger.status, 201);
    assert.equal(pool.observations[0].triggerObservationId, '00000000-0000-4000-8000-000000000101');

    const invalidSessionUuid = await ingestRequest(server, WARD_TOKEN, makeBatch({
      session_id: 'not-a-uuid',
    }), 'invalid-session-uuid-001');
    assert.equal(invalidSessionUuid.status, 400);
    assert.equal(invalidSessionUuid.json.error.code, 'invalid_observation');
    assert.match(invalidSessionUuid.json.error.message, /session_id/i);

    const badLatLon = await ingestRequest(server, WARD_TOKEN, makeBatch({
      observations: [
        {
          ...makeBatch().observations[0],
          lat: 91,
          lon: -181,
        },
      ],
    }), 'bad-geo-001');
    assert.equal(badLatLon.status, 400);
    assert.equal(badLatLon.json.error.code, 'invalid_observation');
    assert.match(badLatLon.json.error.message, /lat/i);

    const futureTime = await ingestRequest(server, WARD_TOKEN, makeBatch({
      observations: [
        {
          ...makeBatch().observations[0],
          observed_at: '2026-07-10T12:10:01.000Z',
        },
      ],
    }), 'future-time-001');
    assert.equal(futureTime.status, 400);
    assert.equal(futureTime.json.error.code, 'invalid_observation');
    assert.match(futureTime.json.error.message, /observed_at/i);

    const unsafeEntity = await ingestRequest(server, WARD_TOKEN, makeBatch({
      observations: [
        {
          ...makeBatch().observations[0],
          payload: { product_entities: [{ kind: 'face' }] },
        },
      ],
    }), 'unsafe-entity-001');
    assert.equal(unsafeEntity.status, 422);
    assert.equal(unsafeEntity.json.error.code, 'unsafe_product_entity');

    const unsafeScalarEntity = await ingestRequest(server, WARD_TOKEN, makeBatch({
      observations: [
        {
          ...makeBatch().observations[0],
          payload: { product_entity: 'license-plate' },
        },
      ],
    }), 'unsafe-scalar-entity-001');
    assert.equal(unsafeScalarEntity.status, 422);
    assert.equal(unsafeScalarEntity.json.error.code, 'unsafe_product_entity');

    const unsafeRawPiiKey = await ingestRequest(server, WARD_TOKEN, makeBatch({
      observations: [
        {
          ...makeBatch().observations[0],
          payload: { rawPii: 'not-stored' },
        },
      ],
    }), 'unsafe-raw-pii-key-001');
    assert.equal(unsafeRawPiiKey.status, 422);
    assert.equal(unsafeRawPiiKey.json.error.code, 'unsafe_payload');

    assert.equal(pool.batches.size, 1);
    assert.equal(pool.observations.length, 1);
  });
});

test('observation batch ingest enforces payload, request, and batch limits plus retention/provenance fields', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');
  const pool = createIngestPool();

  await withServer({
    tokenRecords: makeTokenRecords(hashToken),
    dbPoolFactory: () => pool,
    observationPayloadLimitBytes: 256,
    observationBatchMaxItems: 1,
    bodyLimitBytes: 4096,
  }, async (server) => {
    const tooLargeBody = await request(server, {
      method: 'POST',
      path: '/api/v1/observations/batch',
      headers: {
        Authorization: `Bearer ${WARD_TOKEN}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'too-large-request',
      },
      body: JSON.stringify({ filler: 'x'.repeat(5000) }),
    });
    assert.equal(tooLargeBody.status, 413);
    assert.equal(tooLargeBody.json.error.code, 'body_too_large');

    const tooMany = await ingestRequest(server, WARD_TOKEN, makeBatch({
      observations: [makeBatch().observations[0], { ...makeBatch().observations[0], idempotency_key: 'item-002' }],
    }), 'too-many-001');
    assert.equal(tooMany.status, 400);
    assert.equal(tooMany.json.error.code, 'batch_too_large');

    const emptyBatch = await ingestRequest(server, WARD_TOKEN, makeBatch({ observations: [] }), 'empty-batch-001');
    assert.equal(emptyBatch.status, 400);
    assert.equal(emptyBatch.json.error.code, 'empty_batch');

    const tooLargePayload = await ingestRequest(server, WARD_TOKEN, makeBatch({
      observations: [
        {
          ...makeBatch().observations[0],
          payload: { summary: 'x'.repeat(400) },
        },
      ],
    }), 'payload-too-large-001');
    assert.equal(tooLargePayload.status, 413);
    assert.equal(tooLargePayload.json.error.code, 'observation_payload_too_large');

    const missingProvenance = await ingestRequest(server, WARD_TOKEN, makeBatch({ provenance: {}, observations: [{ ...makeBatch().observations[0], provenance: {} }] }), 'missing-prov-001');
    assert.equal(missingProvenance.status, 400);
    assert.equal(missingProvenance.json.error.code, 'invalid_provenance');

    const invalidRetention = await ingestRequest(server, WARD_TOKEN, makeBatch({
      observations: [
        {
          ...makeBatch().observations[0],
          retention_class: 'forever_raw',
        },
      ],
    }), 'invalid-retention-001');
    assert.equal(invalidRetention.status, 400);
    assert.equal(invalidRetention.json.error.code, 'invalid_observation');
    assert.match(invalidRetention.json.error.message, /retention_class/i);

    const selfAssertedRawRetention = await ingestRequest(server, WARD_TOKEN, makeBatch({
      observations: [
        {
          ...makeBatch().observations[0],
          retention_class: 'raw_frame_explicit',
          pii_status: 'operator_explicit',
          raw_payload_ref: 'artifact://raw/frame-001',
          operator_approved_raw_ref: 'approval://operator/self-asserted',
          authorized_scope_ref: 'scope://self-asserted',
        },
      ],
    }), 'self-asserted-raw-retention-001');
    assert.equal(selfAssertedRawRetention.status, 403);
    assert.equal(selfAssertedRawRetention.json.error.code, 'raw_retention_forbidden');

    assert.equal(pool.batches.size, 0);
    assert.equal(pool.observations.length, 0);
  });
});

test('Wardriver RaID v1 contract fixture ingests idempotently without raw-frame defaults', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');
  const fixture = readWardriverRaidFixture();
  const pool = createIngestPool();

  await withServer({
    tokenRecords: makeTokenRecords(hashToken),
    dbPoolFactory: () => pool,
  }, async (server) => {
    const idempotencyKey = fixture.request.headers['Idempotency-Key'];
    const first = await ingestRequest(server, WARD_TOKEN, fixture.body, idempotencyKey);
    assert.equal(first.status, 201);
    assert.equal(first.json.ok, true);
    assert.equal(first.json.duplicate, false);
    assert.equal(first.json.receipt.source_class, 'owned_device');
    assert.equal(first.json.receipt.source_id, FIXTURE_SOURCE_ID);
    assert.equal(first.json.receipt.idempotency_key, idempotencyKey);
    assert.equal(first.json.receipt.observation_count, fixture.body.observations.length);

    assert.equal(pool.observations.length, fixture.body.observations.length);
    const batch = [...pool.batches.values()][0];
    assert.equal(batch.session_id, fixture.body.session_id);
    assert.equal(batch.request_metadata.request.contract_version, 'bss.wardriver.batch.v1');
    assert.equal(batch.request_metadata.request.context.heading_deg, 184.5);
    assert.equal(batch.request_metadata.request.context.map.zoom, 17);
    assert.equal(batch.provenance.adapter_contract_version, 'bss.wardriver.batch.v1');
    assert.equal(batch.provenance.raw_frames_default, 'omitted');

    const wifiObservation = pool.observations.find((observation) => observation.kind === 'wifi_ap');
    assert.ok(wifiObservation, 'fixture should include an enhanced WiGLE/Wi-Fi observation');
    assert.equal(wifiObservation.sessionId, fixture.body.session_id);
    assert.equal(wifiObservation.idempotencyKey, 'wardriver-alpha-session-0001-wifi-0001');
    assert.equal(wifiObservation.payload.wigle_enhanced, true);
    assert.equal(wifiObservation.payload.raw_frame_present, false);
    assert.equal(wifiObservation.rawPayloadRef, null);
    assert.equal(wifiObservation.operatorApprovedRawRef, null);
    assert.equal(wifiObservation.retentionClass, 'summary_only');
    assert.equal(JSON.stringify(wifiObservation.payload).includes('raw_frame_bytes'), false);

    const raidSummary = pool.observations.find((observation) => observation.kind === 'visual_summary');
    assert.ok(raidSummary, 'fixture should include a RaID sight summary observation');
    assert.equal(raidSummary.payload.raid_sight_summary.category, 'local-context');
    assert.equal(raidSummary.provenance.contract_version, 'bss.wardriver.batch.v1');

    const duplicate = await ingestRequest(server, WARD_TOKEN, fixture.body, idempotencyKey);
    assert.equal(duplicate.status, 200);
    assert.equal(duplicate.json.duplicate, true);
    assert.deepEqual(duplicate.json.receipt, first.json.receipt);
    assert.equal(pool.observations.length, fixture.body.observations.length, 'duplicate fixture replay must not insert observations');
  });
});

test('Wardriver contract rejects source-class spoofing and raw-frame default uploads', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');
  const fixture = readWardriverRaidFixture();
  const pool = createIngestPool();

  await withServer({
    tokenRecords: makeTokenRecords(hashToken),
    dbPoolFactory: () => pool,
  }, async (server) => {
    const spoofedClass = await ingestRequest(server, WARD_TOKEN, {
      ...fixture.body,
      source_class: 'green_public',
    }, 'wardriver-spoof-class-001');
    assert.equal(spoofedClass.status, 403);
    assert.equal(spoofedClass.json.error.code, 'source_scope_forbidden');

    const rawFrameUpload = await ingestRequest(server, WARD_TOKEN, {
      ...fixture.body,
      observations: [{
        ...fixture.body.observations[0],
        payload: {
          ...fixture.body.observations[0].payload,
          raw_frame: 'base64-forbidden-by-default',
        },
      }],
    }, 'wardriver-raw-frame-001');
    assert.equal(rawFrameUpload.status, 422);
    assert.equal(rawFrameUpload.json.error.code, 'unsafe_payload');
    assert.equal(pool.observations.length, 0);
  });
});

test('VM docs describe the observation ingest contract, idempotency, geohash cells, and policy gates', () => {
  const docs = readFileSync(new URL('../docs/vm-api.md', import.meta.url), 'utf8').toLowerCase();

  for (const needle of [
    'post /api/v1/observations/batch',
    'idempotency-key',
    'source_policy_forbidden',
    'h3_7',
    'h3_9',
    'h3_11',
    'geohash',
    'cybermap_observation_batch_max_items',
    'cybermap_observation_payload_limit_bytes',
    'retention_class',
    'pii_status',
    'private-person',
    'face',
    'license-plate',
    'private-residence',
    'observations:raw-retention',
    'raw_retention_forbidden',
  ]) {
    assert.ok(docs.includes(needle), `docs should include ${needle}`);
  }
});
