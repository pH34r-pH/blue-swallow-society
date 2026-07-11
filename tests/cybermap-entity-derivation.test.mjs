import test from 'node:test';
import assert from 'node:assert/strict';

const SOURCE_ID = '00000000-0000-4000-8000-000000000001';
const OBSERVATION_ID = '10000000-0000-4000-8000-000000000001';
const TRIGGER_OBSERVATION_ID = '10000000-0000-4000-8000-000000000099';

function baseObservation(overrides = {}) {
  return {
    id: OBSERVATION_ID,
    sourceId: SOURCE_ID,
    sourceClass: 'owned_device',
    kind: 'wifi_ap',
    externalObservationKey: 'wardriver-alpha:2026-07-10T11:59:00Z:wifi:1',
    idempotencyKey: 'item-001',
    observedAt: '2026-07-10T11:59:00.000Z',
    lon: -122.3493,
    lat: 47.6205,
    h3_7: 'gh7:c23nb62',
    h3_9: 'gh9:c23nb62w7',
    h3_11: 'gh11:c23nb62w7e1',
    confidence: 0.875,
    payload: { ssid_hash: 'sha256:ssid-fixture', bssid_hash: 'sha256:bssid-fixture', channel: 11 },
    provenance: { sensor: 'wardriver' },
    ...overrides,
  };
}

function parseJson(value) {
  return typeof value === 'string' ? JSON.parse(value) : value;
}

function createEntityPool() {
  let entitySequence = 0;
  const cyberEntities = new Map();
  const entityObservations = new Map();
  return {
    cyberEntities,
    entityObservations,
    queries: [],
    async query(sql, params = []) {
      const text = String(sql).replace(/\s+/g, ' ').trim();
      this.queries.push({ sql: text, params });

      if (/insert into cyber_entities/i.test(text)) {
        assert.match(text, /on conflict\s*\(\s*stable_key\s*\)/i, 'entity upsert must be stable-key idempotent');
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
        const row = existing || {
          id: `entity-${++entitySequence}`,
          stableKey,
          firstSeenAt,
          labels: [],
        };
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
        assert.match(text, /on conflict\s*\(\s*entity_id\s*,\s*observation_id\s*,\s*relationship\s*\)/i, 'edge upsert must be entity/observation/relationship idempotent');
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

      assert.fail(`unexpected SQL: ${text}`);
    },
  };
}

test('entity derivation creates a stable Wi-Fi AP network entity with source-policy provenance', async () => {
  const { deriveEntitiesForObservation } = await import('../vm/cybermap-api/entity-derivation.mjs');

  const entities = deriveEntitiesForObservation(baseObservation());

  assert.equal(entities.length, 1);
  const [entity] = entities;
  assert.equal(entity.entityKind, 'network');
  assert.equal(entity.stableKey, 'wifi_ap:bssid_hash:sha256:bssid-fixture');
  assert.equal(entity.displayName, 'Wi-Fi AP sha256:bssid-fixture');
  assert.equal(entity.sourceClass, 'owned_device');
  assert.deepEqual(entity.labels, ['wifi', 'access-point']);
  assert.equal(entity.properties.ssid_hash, 'sha256:ssid-fixture');
  assert.equal(entity.properties.bssid_hash, 'sha256:bssid-fixture');
  assert.equal(entity.properties.channel, 11);
  assert.equal(entity.provenance.source_observation.id, OBSERVATION_ID);
  assert.equal(entity.provenance.source_policy.source_class, 'owned_device');
  assert.equal(entity.edge.relationship, 'observed_as');
  assert.equal(entity.edge.confidence, 0.875);
});

test('entity derivation creates Greenfeed source and claim/event anchor entities', async () => {
  const { deriveEntitiesForObservation } = await import('../vm/cybermap-api/entity-derivation.mjs');

  const [feed] = deriveEntitiesForObservation(baseObservation({
    kind: 'greenfeed_snapshot',
    sourceClass: 'green_public',
    payload: {
      source_key: 'seattle-open-data:alerts',
      provider: 'seattle-open-data',
      feed_url: 'https://data.seattle.gov/api/views/example',
      title: 'Seattle open alerts',
    },
  }));
  assert.equal(feed.entityKind, 'feed');
  assert.equal(feed.stableKey, 'greenfeed:source:seattle-open-data:alerts');
  assert.equal(feed.sourceClass, 'green_public');
  assert.equal(feed.properties.allowed_preload, true);
  assert.equal(feed.properties.provider, 'seattle-open-data');

  const anchorEntities = deriveEntitiesForObservation(baseObservation({
    kind: 'claim_anchor',
    payload: {
      claim_key: 'claim:wintermute:signal',
      claim_label: 'Wintermute signal observed',
      event_key: 'event:bellevue-raid',
      event_label: 'Bellevue RaID sweep',
    },
  }));
  assert.deepEqual(anchorEntities.map((entity) => entity.entityKind), ['claim', 'event']);
  assert.deepEqual(anchorEntities.map((entity) => entity.stableKey), [
    'claim:claim:wintermute:signal',
    'event:event:bellevue-raid',
  ]);
  assert.ok(anchorEntities.every((entity) => entity.edge.relationship === 'supports'));
});

test('entity materialization upserts cyber_entities and entity_observations idempotently with edge recency/confidence refs', async () => {
  const { materializeObservationEntities } = await import('../vm/cybermap-api/entity-derivation.mjs');
  const pool = createEntityPool();
  const observation = baseObservation({
    sourceClass: 'orange_exposure',
    triggerObservationId: TRIGGER_OBSERVATION_ID,
    authorizedScopeRef: 'scope://owned/triggered-exposure',
    provenance: {
      sensor: 'exposure-worker',
      trigger: { source_class: 'owned_device', observation_id: TRIGGER_OBSERVATION_ID },
    },
  });

  const first = await materializeObservationEntities(pool, observation);
  const second = await materializeObservationEntities(pool, observation);

  assert.equal(first.entityCount, 1);
  assert.equal(first.edgeCount, 1);
  assert.equal(second.entityCount, 1);
  assert.equal(second.edgeCount, 1);
  assert.equal(pool.cyberEntities.size, 1, 'same observation must not duplicate entity rows');
  assert.equal(pool.entityObservations.size, 1, 'same observation must not duplicate edge rows');

  const [entity] = pool.cyberEntities.values();
  assert.equal(entity.sourceClass, 'orange_exposure');
  assert.equal(entity.provenance.source_policy.restricted, true);
  assert.equal(entity.provenance.source_policy.trigger_observation_id, TRIGGER_OBSERVATION_ID);

  const [edge] = pool.entityObservations.values();
  assert.equal(edge.relationship, 'observed_as');
  assert.equal(edge.sourceClass, 'orange_exposure');
  assert.equal(edge.weight, 0.875);
  assert.equal(edge.confidence, 0.875);
  assert.equal(edge.firstSeenAt, '2026-07-10T11:59:00.000Z');
  assert.equal(edge.lastSeenAt, '2026-07-10T11:59:00.000Z');
  assert.deepEqual(edge.sourceObservationRefs, [OBSERVATION_ID]);
  assert.equal(edge.provenance.source_policy.authorized_scope_ref, 'scope://owned/triggered-exposure');
});

test('entity derivation rejects private-person, face, license-plate, and private-residence product entities by default', async () => {
  const { deriveEntitiesForObservation } = await import('../vm/cybermap-api/entity-derivation.mjs');

  for (const forbiddenKind of ['private-person', 'face', 'license-plate', 'private-residence']) {
    const entities = deriveEntitiesForObservation(baseObservation({
      kind: 'claim_anchor',
      payload: {
        claim_key: `claim:${forbiddenKind}`,
        product_entities: [{ kind: forbiddenKind, stable_key: `${forbiddenKind}:fixture` }],
      },
    }));
    assert.deepEqual(entities, [], `${forbiddenKind} must not produce cyber_entities`);
  }
});
