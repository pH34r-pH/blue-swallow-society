import test from 'node:test';
import assert from 'node:assert/strict';

const SEED_PATH = new URL('../vm/cybermap-worker/greenfeeds/greenfeed-seed-catalog.json', import.meta.url);
const NOW = new Date('2026-07-10T12:00:00.000Z');

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function createGreenfeedPool() {
  const sourceCatalog = new Map();
  const batches = new Map();
  const observations = [];
  const cyberEntities = new Map();
  const entityObservations = new Map();
  const transactions = [];
  const queries = [];
  let batchSequence = 0;
  let entitySequence = 0;

  return {
    sourceCatalog,
    batches,
    observations,
    cyberEntities,
    entityObservations,
    transactions,
    queries,
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      queries.push({ sql: text, params });

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

      if (/insert into source_catalog/i.test(text)) {
        assert.match(text, /on conflict\s*\(\s*source_key\s*\)/i, 'Greenfeed source upsert should be keyed by source_key');
        assert.match(text, /st_setsrid\s*\(\s*st_makepoint/i, 'source catalog upsert should persist coordinates as PostGIS point');
        const [
          id,
          sourceClass,
          sourceKey,
          name,
          provider,
          feedUrl,
          termsUrl,
          authorizedScopeRef,
          allowedPreload,
          retainsRawPayload,
          cacheTtlSeconds,
          lon,
          lat,
          footprint,
          provenance,
          enabled,
          lastCheckedAt,
        ] = params;
        assert.equal(typeof allowedPreload, 'boolean', 'Greenfeed source preload policy should be explicit');
        assert.equal(retainsRawPayload, false, 'Greenfeed seed catalog must not retain raw frames/payloads by default');
        const existing = sourceCatalog.get(sourceKey);
        if (existing) {
          assert.match(text, /allowed_preload\s*=\s*source_catalog\.allowed_preload/i, 'catalog upsert must preserve persisted preload revocations');
          assert.match(text, /enabled\s*=\s*source_catalog\.enabled/i, 'catalog upsert must preserve persisted operator disables');
          if (existing.allowed_preload === false) {
            assert.match(text, /jsonb_set\s*\(/i, 'catalog upsert must scrub stale persistent-jack-in provenance for preload revocations');
          }
        }
        const mergedProvenance = existing ? { ...parseJson(provenance), ...existing.provenance } : parseJson(provenance);
        if (existing?.allowed_preload === false) mergedProvenance.persistent_jack_in_allowed = false;
        const row = {
          id: existing?.id ?? id,
          source_class: sourceClass,
          source_key: sourceKey,
          name,
          provider,
          feed_url: feedUrl,
          terms_url: termsUrl,
          authorized_scope_ref: authorizedScopeRef,
          allowed_preload: existing?.allowed_preload ?? allowedPreload,
          retains_raw_payload: retainsRawPayload,
          cache_ttl_seconds: cacheTtlSeconds,
          lon,
          lat,
          footprint: parseJson(footprint),
          provenance: mergedProvenance,
          enabled: existing?.enabled ?? enabled,
          last_checked_at: lastCheckedAt ?? existing?.last_checked_at ?? null,
        };
        sourceCatalog.set(sourceKey, row);
        return { rows: [row] };
      }

      if (/update source_catalog/i.test(text) && /last_checked_at/i.test(text)) {
        const [sourceKey, lastCheckedAt, statusPatch] = params;
        const row = sourceCatalog.get(sourceKey);
        assert.ok(row, `source ${sourceKey} should be upserted before marking checked`);
        row.last_checked_at = lastCheckedAt;
        row.provenance = { ...row.provenance, ...parseJson(statusPatch) };
        return { rows: [row] };
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
        const row = {
          id: `batch-${++batchSequence}`,
          source_id: sourceId,
          session_id: sessionId,
          client_id: clientId,
          idempotency_key: idempotencyKey,
          status: 'received',
          observation_count: 0,
          payload_hash: null,
          request_metadata: parseJson(requestMetadata),
          provenance: parseJson(provenance),
          received_at: NOW.toISOString(),
          completed_at: null,
        };
        batches.set(key, row);
        return { rows: [row] };
      }

      if (/insert into observations/i.test(text)) {
        assert.match(text, /st_setsrid\s*\(\s*st_makepoint/i, 'Greenfeed observations should use the shared ingest geometry write path');
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
          payload: parseJson(payload),
          provenance: parseJson(provenance),
        };
        observations.push(row);
        return { rows: [{ id: row.id }] };
      }

      if (/insert into cyber_entities/i.test(text)) {
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
        const row = cyberEntities.get(stableKey) || { id: `entity-${++entitySequence}` };
        Object.assign(row, {
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
          properties: parseJson(properties),
          provenance: parseJson(provenance),
        });
        cyberEntities.set(stableKey, row);
        return { rows: [{ id: row.id }] };
      }

      if (/insert into entity_observations/i.test(text)) {
        const [entityId, observationId, relationship, sourceClass, weight, confidence, firstSeenAt, lastSeenAt, refs, provenance] = params;
        const key = `${entityId}|${observationId}|${relationship}`;
        const row = {
          entityId,
          observationId,
          relationship,
          sourceClass,
          weight,
          confidence,
          firstSeenAt,
          lastSeenAt,
          sourceObservationRefs: parseJson(refs),
          provenance: parseJson(provenance),
        };
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
        row.request_metadata = parseJson(requestMetadata);
        return { rows: [row] };
      }

      assert.fail(`unexpected SQL: ${text}`);
    },
  };
}

test('seed catalog normalizes a curated Green-only source set and ranks global claim-validation candidates', async () => {
  const {
    loadSeedGreenfeedCatalog,
    normalizeGreenfeedSource,
    rankGreenfeedSourcesForClaim,
  } = await import('../vm/cybermap-worker/greenfeeds/catalog.mjs');

  const seedCatalog = loadSeedGreenfeedCatalog({ path: SEED_PATH });

  assert.ok(seedCatalog.length >= 3, 'seed catalog should choose an explicit first source set');
  for (const source of seedCatalog) {
    assert.match(source.source_id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
    assert.ok(['green_public', 'green_owned', 'green_authorized'].includes(source.source_class));
    assert.equal(source.allowed_preload, true);
    assert.equal(source.persistent_jack_in_allowed, true);
    assert.equal(source.enabled, true);
    assert.equal(source.retains_raw_payload, false);
    assert.equal(typeof source.provider, 'string');
    assert.equal(typeof source.owner_publisher, 'string');
    assert.match(source.feed_url, /^https:\/\//);
    assert.match(source.terms_url, /^https:\/\//);
    assert.equal(typeof source.provenance.terms_summary, 'string');
    assert.equal(typeof source.lat, 'number');
    assert.equal(typeof source.lon, 'number');
    assert.ok(source.cache_ttl_seconds > 0);
    assert.ok(source.update_cadence_seconds > 0);
    assert.ok(['fresh', 'best_effort', 'unknown'].includes(source.freshness_status));
    assert.ok(['nominal', 'best_effort', 'unknown'].includes(source.uptime_status));
    assert.ok(source.view && typeof source.view === 'object', 'footprint/FOV/angle metadata should be explicit even when unavailable');
    assert.equal(typeof source.source_quality_score, 'number');
  }

  const ranked = rankGreenfeedSourcesForClaim({
    lat: 47.6062,
    lon: -122.3321,
    sources: seedCatalog,
    limit: 5,
    now: NOW,
  });

  assert.ok(ranked.length >= 2);
  assert.ok(ranked.every((candidate) => candidate.global_lookup_allowed === true));
  assert.ok(ranked.every((candidate) => candidate.allowed_preload === true));
  assert.ok(ranked.every((candidate) => candidate.distance_meters >= 0));
  assert.ok(ranked.every((candidate) => candidate.bearing_degrees >= 0 && candidate.bearing_degrees <= 360));
  assert.ok(ranked.every((candidate) => candidate.angle_delta_degrees === null || candidate.angle_delta_degrees >= 0));
  assert.ok(ranked.every((candidate) => candidate.source_quality_score > 0));
  assert.ok(ranked.every((candidate) => candidate.claim_validation_score > 0));
  assert.deepEqual(
    ranked.map((candidate) => candidate.claim_validation_score),
    [...ranked.map((candidate) => candidate.claim_validation_score)].sort((a, b) => b - a),
  );

  for (const sourceClass of ['grey_enrichment', 'orange_exposure', 'red_restricted']) {
    assert.throws(() => normalizeGreenfeedSource({
      ...seedCatalog[0],
      source_key: `bad-${sourceClass}`,
      source_class: sourceClass,
      persistent_jack_in_allowed: true,
      authorized_scope_ref: 'scope://not-enough-for-preload',
    }), /Green public\/owned\/authorized/);
  }
  assert.throws(() => normalizeGreenfeedSource({
    ...seedCatalog[0],
    source_key: 'bad-private-camera',
    source_class: 'private_camera',
    access_class: 'private',
    persistent_jack_in_allowed: true,
  }), /Green public\/owned\/authorized/);
  const credentialedFeedUrl = 'https://' + 'operator' + ':' + 'pw' + '@example.test/feed.json';
  assert.throws(() => normalizeGreenfeedSource({
    ...seedCatalog[0],
    source_id: '33333333-3333-4333-8333-333333333333',
    source_key: 'bad-url-credentials',
    feed_url: credentialedFeedUrl,
  }), /credentials/);
});

test('poller upserts Green sources and writes greenfeed_snapshot observations through the shared ingest path', async () => {
  const {
    loadSeedGreenfeedCatalog,
  } = await import('../vm/cybermap-worker/greenfeeds/catalog.mjs');
  const { pollGreenfeeds } = await import('../vm/cybermap-worker/greenfeeds/poller.mjs');
  const pool = createGreenfeedPool();
  const [source] = loadSeedGreenfeedCatalog({ path: SEED_PATH });
  const materializeCalls = [];

  const result = await pollGreenfeeds(pool, {
    sources: [{ ...source, last_checked_at: '2026-07-10T11:00:00.000Z' }],
    now: NOW,
    fetchJson: async (url, options) => {
      assert.equal(url, source.feed_url);
      assert.match(options.headers['User-Agent'], /BlueSwallowCybermapGreenfeed/);
      return {
        ok: true,
        status: 200,
        headers: { 'content-type': 'application/json', 'cache-control': 'max-age=300' },
        json: { properties: { timestamp: '2026-07-10T11:58:00.000Z', textDescription: 'clear' } },
      };
    },
    materializeCells: async (_pool, options) => {
      materializeCalls.push(options);
      return { affectedCellCount: 3, upsertedCellCount: 3, limitReached: false, nextCursor: null };
    },
  });

  assert.equal(result.sourceCount, 1);
  assert.equal(result.polledCount, 1);
  assert.equal(result.ingestedObservationCount, 1);
  assert.equal(result.materialized?.upsertedCellCount, 3);
  assert.equal(pool.sourceCatalog.size, 1);
  assert.equal(pool.transactions.join(','), 'BEGIN,COMMIT');
  assert.equal(pool.observations.length, 1);
  const [observation] = pool.observations;
  assert.equal(observation.sourceId, source.source_id);
  assert.equal(observation.sourceClass, 'green_public');
  assert.equal(observation.kind, 'greenfeed_snapshot');
  assert.equal(observation.piiStatus, 'none');
  assert.equal(observation.retentionClass, 'summary_only');
  assert.equal(observation.rawPayloadRef, null);
  assert.equal(observation.operatorApprovedRawRef, null);
  assert.equal(observation.payload.source_key, source.source_key);
  assert.equal(observation.payload.provider, source.provider);
  assert.equal(observation.payload.feed_url, source.feed_url);
  assert.equal(observation.payload.cache_ttl_seconds, source.cache_ttl_seconds);
  assert.equal(observation.payload.freshness_status, 'fresh');
  assert.equal(observation.payload.snapshot.http_status, 200);
  assert.match(observation.payload.snapshot.response_hash, /^sha256:[0-9a-f]{64}$/);
  assert.equal(observation.payload.claim_validation_ranking.source_quality_score, source.source_quality_score);
  assert.ok(Array.isArray(observation.payload.caveats));
  assert.equal(observation.provenance.adapter, 'greenfeed-poller');
  assert.equal(observation.provenance.no_raw_payload_retention, true);
  assert.deepEqual(materializeCalls.map((call) => call.since), ['2026-07-10T11:55:00.000Z']);
  assert.deepEqual(materializeCalls.map((call) => call.before), ['2026-07-10T12:00:00.001Z']);
});

test('poller honors persisted last_checked_at cache TTL returned by the source catalog upsert', async () => {
  const {
    loadSeedGreenfeedCatalog,
  } = await import('../vm/cybermap-worker/greenfeeds/catalog.mjs');
  const { pollGreenfeeds } = await import('../vm/cybermap-worker/greenfeeds/poller.mjs');
  const pool = createGreenfeedPool();
  const [source] = loadSeedGreenfeedCatalog({ path: SEED_PATH });
  pool.sourceCatalog.set(source.source_key, {
    id: source.source_id,
    source_key: source.source_key,
    last_checked_at: '2026-07-10T11:59:30.000Z',
  });

  const result = await pollGreenfeeds(pool, {
    sources: [{ ...source, last_checked_at: null }],
    now: NOW,
    fetchJson: async () => assert.fail('source should be skipped while persisted cache TTL is fresh'),
    materializeCells: async () => assert.fail('skipped Greenfeed sources should not trigger materialization'),
  });

  assert.equal(result.sourceCount, 1);
  assert.equal(result.polledCount, 0);
  assert.equal(result.skippedCount, 1);
  assert.equal(result.ingestedObservationCount, 0);
  assert.equal(pool.observations.length, 0);
});

test('poller skips non-preloadable and non-persistent Green sources before fetch', async () => {
  const {
    loadSeedGreenfeedCatalog,
  } = await import('../vm/cybermap-worker/greenfeeds/catalog.mjs');
  const { pollGreenfeeds } = await import('../vm/cybermap-worker/greenfeeds/poller.mjs');
  const pool = createGreenfeedPool();
  const [source] = loadSeedGreenfeedCatalog({ path: SEED_PATH });

  const result = await pollGreenfeeds(pool, {
    sources: [
      {
        ...source,
        source_id: '11111111-1111-4111-8111-111111111111',
        source_key: 'green-public-not-preloadable',
        allowed_preload: false,
        persistent_jack_in_allowed: false,
        last_checked_at: null,
      },
      {
        ...source,
        source_id: '22222222-2222-4222-8222-222222222222',
        source_key: 'green-public-not-persistent',
        allowed_preload: true,
        persistent_jack_in_allowed: false,
        last_checked_at: null,
      },
    ],
    now: NOW,
    fetchJson: async () => assert.fail('poller must not fetch sources outside persistent global-preload policy'),
    materializeCells: async () => assert.fail('skipped Greenfeed sources should not trigger materialization'),
  });

  assert.equal(result.sourceCount, 2);
  assert.equal(result.polledCount, 0);
  assert.equal(result.skippedCount, 2);
  assert.equal(result.ingestedObservationCount, 0);
  assert.equal(pool.observations.length, 0);
});

test('poller preserves persisted operator disables and preload revocations across catalog upsert', async () => {
  const {
    loadSeedGreenfeedCatalog,
  } = await import('../vm/cybermap-worker/greenfeeds/catalog.mjs');
  const { pollGreenfeeds } = await import('../vm/cybermap-worker/greenfeeds/poller.mjs');
  const pool = createGreenfeedPool();
  const [source] = loadSeedGreenfeedCatalog({ path: SEED_PATH });
  pool.sourceCatalog.set(source.source_key, {
    id: source.source_id,
    source_key: source.source_key,
    allowed_preload: false,
    enabled: false,
    last_checked_at: null,
    provenance: {
      persistent_jack_in_allowed: false,
      operator_policy: 'disabled-for-review',
    },
  });

  const result = await pollGreenfeeds(pool, {
    sources: [{ ...source, enabled: true, allowed_preload: true, persistent_jack_in_allowed: true, last_checked_at: null }],
    now: NOW,
    fetchJson: async () => assert.fail('operator-disabled Greenfeed source must not be fetched'),
    materializeCells: async () => assert.fail('operator-disabled Greenfeed source should not trigger materialization'),
  });

  const row = pool.sourceCatalog.get(source.source_key);
  assert.equal(result.polledCount, 0);
  assert.equal(result.skippedCount, 1);
  assert.equal(row.enabled, false);
  assert.equal(row.allowed_preload, false);
  assert.equal(row.provenance.operator_policy, 'disabled-for-review');
  assert.equal(pool.observations.length, 0);
});

test('poller treats preload revocations as non-persistent even with stale persistent provenance', async () => {
  const {
    loadSeedGreenfeedCatalog,
  } = await import('../vm/cybermap-worker/greenfeeds/catalog.mjs');
  const { pollGreenfeeds } = await import('../vm/cybermap-worker/greenfeeds/poller.mjs');
  const pool = createGreenfeedPool();
  const [source] = loadSeedGreenfeedCatalog({ path: SEED_PATH });
  pool.sourceCatalog.set(source.source_key, {
    id: source.source_id,
    source_key: source.source_key,
    allowed_preload: false,
    enabled: true,
    last_checked_at: null,
    provenance: {
      persistent_jack_in_allowed: true,
      operator_policy: 'preload-revoked',
    },
  });

  const result = await pollGreenfeeds(pool, {
    sources: [{ ...source, allowed_preload: true, persistent_jack_in_allowed: true, last_checked_at: null }],
    now: NOW,
    fetchJson: async () => assert.fail('preload-revoked Greenfeed source must not be fetched'),
    materializeCells: async () => assert.fail('preload-revoked Greenfeed source should not trigger materialization'),
  });

  const row = pool.sourceCatalog.get(source.source_key);
  assert.equal(result.polledCount, 0);
  assert.equal(result.skippedCount, 1);
  assert.equal(row.allowed_preload, false);
  assert.equal(row.provenance.persistent_jack_in_allowed, false);
  assert.equal(pool.observations.length, 0);
});

test('default Greenfeed fetch uses an abort signal and rejects oversized responses before ingest', async () => {
  const {
    loadSeedGreenfeedCatalog,
  } = await import('../vm/cybermap-worker/greenfeeds/catalog.mjs');
  const { pollGreenfeeds } = await import('../vm/cybermap-worker/greenfeeds/poller.mjs');
  const pool = createGreenfeedPool();
  const [source] = loadSeedGreenfeedCatalog({ path: SEED_PATH });
  const originalFetch = globalThis.fetch;
  let sawAbortSignal = false;
  globalThis.fetch = async (_url, options = {}) => {
    sawAbortSignal = typeof options.signal?.aborted === 'boolean';
    return new Response('{"properties":{"timestamp":"2026-07-10T11:58:00.000Z"}}', {
      status: 200,
      headers: {
        'content-type': 'application/json',
        'content-length': '1024',
      },
    });
  };

  try {
    const result = await pollGreenfeeds(pool, {
      sources: [{ ...source, last_checked_at: '2026-07-10T11:00:00.000Z' }],
      now: NOW,
      maxResponseBytes: 16,
      materialize: false,
    });

    assert.equal(sawAbortSignal, true);
    assert.equal(result.polledCount, 0);
    assert.equal(result.failures.length, 1);
    assert.equal(result.failures[0].code, 'greenfeed_response_too_large');
    assert.equal(pool.observations.length, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('poller surfaces shared-ingest idempotency conflicts as source failures', async () => {
  const {
    loadSeedGreenfeedCatalog,
  } = await import('../vm/cybermap-worker/greenfeeds/catalog.mjs');
  const { pollGreenfeeds } = await import('../vm/cybermap-worker/greenfeeds/poller.mjs');
  const pool = createGreenfeedPool();
  const [source] = loadSeedGreenfeedCatalog({ path: SEED_PATH });
  const observedAt = '2026-07-10T11:58:00.000Z';
  const checkedAt = NOW.toISOString();
  const idempotencyKey = `greenfeed-batch:${source.source_key}:${observedAt}:${checkedAt}`;
  pool.batches.set(`${source.source_id}|greenfeed-worker|${idempotencyKey}`, {
    id: 'batch-existing',
    source_id: source.source_id,
    client_id: 'greenfeed-worker',
    idempotency_key: idempotencyKey,
    status: 'applied',
    observation_count: 1,
    payload_hash: `sha256:${'0'.repeat(64)}`,
    request_metadata: {},
    received_at: '2026-07-10T11:58:01.000Z',
    completed_at: '2026-07-10T11:58:01.000Z',
  });

  const result = await pollGreenfeeds(pool, {
    sources: [{ ...source, last_checked_at: '2026-07-10T11:00:00.000Z' }],
    now: NOW,
    fetchJson: async () => ({
      ok: true,
      status: 200,
      headers: { 'content-type': 'application/json' },
      json: { properties: { timestamp: observedAt, textDescription: 'clear' } },
    }),
    materializeCells: async () => assert.fail('failed ingest should not trigger materialization'),
  });

  assert.equal(result.polledCount, 0);
  assert.equal(result.ingestedObservationCount, 0);
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].code, 'idempotency_key_conflict');
  assert.equal(pool.sourceCatalog.get(source.source_key).provenance.last_poll.status, 'failed');
});

test('poller writes a new snapshot when provider observation time is unchanged but checked_at advances', async () => {
  const {
    loadSeedGreenfeedCatalog,
  } = await import('../vm/cybermap-worker/greenfeeds/catalog.mjs');
  const { pollGreenfeeds } = await import('../vm/cybermap-worker/greenfeeds/poller.mjs');
  const pool = createGreenfeedPool();
  const [source] = loadSeedGreenfeedCatalog({ path: SEED_PATH });
  const observedAt = '2026-07-10T11:58:00.000Z';
  const later = new Date('2026-07-10T12:11:00.000Z');
  const fetchJson = async () => ({
    ok: true,
    status: 200,
    headers: { 'content-type': 'application/json' },
    json: { properties: { timestamp: observedAt, textDescription: 'clear' } },
  });

  const first = await pollGreenfeeds(pool, {
    sources: [{ ...source, last_checked_at: '2026-07-10T11:00:00.000Z' }],
    now: NOW,
    fetchJson,
    materialize: false,
  });
  const second = await pollGreenfeeds(pool, {
    sources: [{ ...source, last_checked_at: null }],
    now: later,
    fetchJson,
    materialize: false,
  });

  assert.equal(first.failures.length, 0);
  assert.equal(second.failures.length, 0);
  assert.equal(first.polledCount, 1);
  assert.equal(second.polledCount, 1);
  assert.equal(pool.observations.length, 2);
  assert.notEqual(pool.observations[0].idempotencyKey, pool.observations[1].idempotencyKey);
  assert.match(pool.observations[0].idempotencyKey, /2026-07-10T12:00:00\.000Z$/);
  assert.match(pool.observations[1].idempotencyKey, /2026-07-10T12:11:00\.000Z$/);
});

test('greenfeed TTL freshness and source caveats propagate into materialized cell summaries', async () => {
  const { buildCybermapCellSummary } = await import('../vm/cybermap-worker/cell-materialization.mjs');

  const summary = buildCybermapCellSummary([
    {
      observation_id: 'obs-green-fresh',
      kind: 'greenfeed_snapshot',
      source_class: 'green_public',
      observed_at: '2026-07-10T11:58:30.000Z',
      ingested_at: '2026-07-10T11:59:00.000Z',
      h3_7: 'gh7:c23nb62',
      h3_9: 'gh9:c23nb62w7',
      h3_11: 'gh11:c23nb62w7e1',
      confidence: 0.91,
      payload: {
        source_key: 'noaa-nws-ksea-latest-observation',
        provider: 'NOAA National Weather Service',
        cache_ttl_seconds: 600,
        update_cadence_seconds: 300,
        freshness_status: 'fresh',
        uptime_status: 'nominal',
        caveats: ['Weather station is point telemetry, not visual coverage.'],
        claim_validation_ranking: {
          distance_meters: 18200,
          angle_delta_degrees: null,
          source_quality_score: 0.93,
        },
      },
      provenance: { adapter: 'greenfeed-poller', terms_summary: 'Public-domain NWS data; attribution requested.' },
    },
    {
      observation_id: 'obs-green-stale',
      kind: 'greenfeed_snapshot',
      source_class: 'green_public',
      observed_at: '2026-07-10T11:30:00.000Z',
      ingested_at: '2026-07-10T11:31:00.000Z',
      h3_7: 'gh7:c23nb62',
      h3_9: 'gh9:c23nb62w7',
      h3_11: 'gh11:c23nb62w7e1',
      confidence: 0.8,
      payload: {
        source_key: 'noaa-coops-seattle-water-level',
        provider: 'NOAA CO-OPS',
        cache_ttl_seconds: 900,
        update_cadence_seconds: 360,
        freshness_status: 'stale',
        uptime_status: 'best_effort',
        caveats: ['Water-level station does not prove nearby street-level conditions.'],
        claim_validation_ranking: {
          distance_meters: 870,
          angle_delta_degrees: null,
          source_quality_score: 0.9,
        },
      },
      provenance: { adapter: 'greenfeed-poller', terms_summary: 'NOAA public data feed.' },
    },
  ], { h3Cell: 'gh9:c23nb62w7', resolution: 9, now: NOW });

  const green = summary.layers.green_preload;
  assert.equal(green.global_preload, true);
  assert.equal(green.cache_ttl_seconds_min, 600);
  assert.equal(green.cache_ttl_seconds_max, 900);
  assert.deepEqual(green.freshness_status_counts, { fresh: 1, stale: 1 });
  assert.deepEqual(green.uptime_status_counts, { best_effort: 1, nominal: 1 });
  assert.deepEqual(green.greenfeed_source_keys, [
    'noaa-coops-seattle-water-level',
    'noaa-nws-ksea-latest-observation',
  ]);
  assert.ok(green.claim_validation_sources.every((source) => typeof source.distance_meters === 'number'));
  assert.ok(green.claim_validation_sources.every((source) => typeof source.source_quality_score === 'number'));
  assert.ok(green.source_caveats.some((caveat) => caveat.includes('point telemetry')));
  assert.ok(summary.caveats.some((caveat) => caveat.code === 'greenfeed_cache_ttl_applies'));
  assert.ok(summary.caveats.some((caveat) => caveat.code === 'greenfeed_snapshot_stale_by_ttl'));
  assert.equal(summary.freshness.greenfeed_cache_ttl_seconds_min, 600);
  assert.equal(summary.freshness.greenfeed_stale_by_cache_ttl, true);
});

test('worker runs enabled Greenfeed polling before affected-cell materialization', async () => {
  const { createCybermapWorker } = await import('../vm/cybermap-worker/worker.mjs');
  const order = [];
  const logs = [];
  const pollerOptions = [];
  const materializeOptions = [];
  const afterGreenfeed = new Date('2026-07-10T12:00:04.000Z');
  let nowCall = 0;
  const worker = createCybermapWorker({
    pool: { async query() { return { rows: [] }; } },
    logger: (entry) => logs.push(entry),
    now: () => {
      nowCall += 1;
      return nowCall === 1 ? NOW : afterGreenfeed;
    },
    greenfeedPollingEnabled: true,
    greenfeedPoller: async (_pool, options) => {
      order.push('greenfeed');
      pollerOptions.push(options);
      return { sourceCount: 2, polledCount: 2, ingestedObservationCount: 2, skippedCount: 0 };
    },
    materializeCells: async (_pool, options) => {
      order.push('materialize');
      materializeOptions.push(options);
      return { affectedCellCount: 3, upsertedCellCount: 3, limitReached: false, nextCursor: null };
    },
  });

  const result = await worker.tick('test-greenfeed-order');

  assert.deepEqual(order, ['greenfeed', 'materialize']);
  assert.equal(pollerOptions[0].materialize, false);
  assert.equal(pollerOptions[0].now.toISOString(), NOW.toISOString());
  assert.equal(materializeOptions[0].before, afterGreenfeed.toISOString());
  assert.equal(materializeOptions[0].now.toISOString(), afterGreenfeed.toISOString());
  assert.equal(result.greenfeed.polledCount, 2);
  assert.equal(result.materialization.upsertedCellCount, 3);
  assert.ok(logs.some((entry) => entry.event === 'job_complete' && entry.job === 'greenfeed-polling'));
  assert.ok(logs.some((entry) => entry.event === 'job_complete' && entry.job === 'cybermap-cell-materialization'));
});
