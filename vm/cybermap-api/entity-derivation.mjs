const GREEN_SOURCE_CLASSES = new Set(['green_public', 'green_owned', 'green_authorized']);
const RESTRICTED_SOURCE_CLASSES = new Set(['grey_enrichment', 'orange_exposure', 'red_restricted']);
const DERIVATION_VERSION = 'cybermap-api/entity-derivation:v1';

const UNSAFE_PRODUCT_ENTITY_KINDS = new Set([
  'private-person',
  'private_person',
  'face',
  'license-plate',
  'license_plate',
  'private-residence',
  'private_residence',
]);

const PRODUCT_ENTITY_KEYS = new Set([
  'product-entity',
  'product-entities',
  'entities',
  'productentity',
  'productentities',
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonObject(value) {
  if (isPlainObject(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return isPlainObject(parsed) ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function normalizeUnsafeToken(value) {
  return String(value || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function isProductEntityKey(key) {
  return PRODUCT_ENTITY_KEYS.has(normalizeUnsafeToken(key));
}

function findUnsafeProductEntity(value, inProductEntityContext = false, depth = 0) {
  if (value === null || value === undefined || depth > 8) return null;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = findUnsafeProductEntity(item, inProductEntityContext, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value !== 'object') {
    const token = normalizeUnsafeToken(value);
    return inProductEntityContext && UNSAFE_PRODUCT_ENTITY_KINDS.has(token) ? token : null;
  }

  const context = inProductEntityContext || Object.keys(value).some((key) => isProductEntityKey(key));
  if (context) {
    for (const key of ['kind', 'type', 'entity_kind', 'entityKind', 'category', 'label', 'labels', 'product_entity', 'productEntity']) {
      const candidate = value[key];
      const values = Array.isArray(candidate) ? candidate : [candidate];
      for (const item of values) {
        const token = normalizeUnsafeToken(item);
        if (UNSAFE_PRODUCT_ENTITY_KINDS.has(token)) return token;
      }
    }
  }

  for (const [key, child] of Object.entries(value)) {
    const found = findUnsafeProductEntity(child, context || isProductEntityKey(key), depth + 1);
    if (found) return found;
  }
  return null;
}

function stringValue(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function firstString(...values) {
  for (const value of values) {
    const normalized = stringValue(value);
    if (normalized) return normalized;
  }
  return null;
}

function payloadString(payload, keys) {
  for (const key of keys) {
    const value = payload[key];
    const normalized = stringValue(value);
    if (normalized) return normalized;
  }
  return null;
}

function objectString(value, keys) {
  if (!isPlainObject(value)) return null;
  return payloadString(value, keys);
}

function entityDisplayName(prefix, key, fallback = key) {
  return `${prefix} ${fallback || key}`.trim();
}

function toNumber(value, fallback = null) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeObservationInput(observation = {}) {
  const payload = parseJsonObject(observation.payload);
  const provenance = parseJsonObject(observation.provenance);
  const sourceClass = firstString(observation.sourceClass, observation.source_class);
  const observedAt = firstString(observation.observedAt, observation.observed_at);
  const confidence = Math.min(1, Math.max(0, toNumber(observation.confidence, 1)));
  return {
    id: firstString(observation.id, observation.observationId, observation.observation_id),
    sourceId: firstString(observation.sourceId, observation.source_id),
    sourceClass,
    sessionId: firstString(observation.sessionId, observation.session_id),
    triggerObservationId: firstString(observation.triggerObservationId, observation.trigger_observation_id),
    authorizedScopeRef: firstString(observation.authorizedScopeRef, observation.authorized_scope_ref),
    kind: firstString(observation.kind)?.toLowerCase() || null,
    externalObservationKey: firstString(observation.externalObservationKey, observation.external_observation_key),
    idempotencyKey: firstString(observation.idempotencyKey, observation.idempotency_key),
    observedAt,
    lon: toNumber(firstString(observation.lon, observation.lng, observation.longitude)),
    lat: toNumber(firstString(observation.lat, observation.latitude)),
    h3_7: firstString(observation.h3_7),
    h3_9: firstString(observation.h3_9),
    h3_11: firstString(observation.h3_11),
    confidence: Number(confidence.toFixed(3)),
    payload,
    provenance,
  };
}

function sourceObservationProvenance(observation) {
  return {
    id: observation.id,
    kind: observation.kind,
    source_id: observation.sourceId,
    source_class: observation.sourceClass,
    external_observation_key: observation.externalObservationKey,
    idempotency_key: observation.idempotencyKey,
    observed_at: observation.observedAt,
  };
}

function sourcePolicyProvenance(observation) {
  return {
    source_class: observation.sourceClass,
    restricted: RESTRICTED_SOURCE_CLASSES.has(observation.sourceClass),
    ...(observation.sessionId ? { session_id: observation.sessionId } : {}),
    ...(observation.triggerObservationId ? { trigger_observation_id: observation.triggerObservationId } : {}),
    ...(observation.authorizedScopeRef ? { authorized_scope_ref: observation.authorizedScopeRef } : {}),
  };
}

function baseProvenance(observation, derivationKind) {
  return {
    materialized_by: DERIVATION_VERSION,
    derivation_kind: derivationKind,
    source_observation: sourceObservationProvenance(observation),
    source_policy: sourcePolicyProvenance(observation),
    observation_provenance: observation.provenance,
  };
}

function makeEntity(observation, {
  entityKind,
  stableKey,
  displayName,
  labels = [],
  properties = {},
  derivationKind,
  relationship = 'observed_as',
}) {
  const provenance = baseProvenance(observation, derivationKind || entityKind);
  return {
    entityKind,
    stableKey,
    displayName,
    sourceClass: observation.sourceClass,
    firstSeenAt: observation.observedAt,
    lastSeenAt: observation.observedAt,
    lon: observation.lon,
    lat: observation.lat,
    h3_7: observation.h3_7,
    h3_9: observation.h3_9,
    h3_11: observation.h3_11,
    confidence: observation.confidence,
    labels: [...new Set(labels)],
    properties: {
      ...properties,
      source_class: observation.sourceClass,
    },
    provenance,
    edge: {
      relationship,
      weight: observation.confidence,
      confidence: observation.confidence,
      firstSeenAt: observation.observedAt,
      lastSeenAt: observation.observedAt,
      sourceObservationRefs: observation.id ? [observation.id] : [],
      provenance: {
        ...provenance,
        relationship,
        confidence: observation.confidence,
        first_seen_at: observation.observedAt,
        last_seen_at: observation.observedAt,
        source_observation_refs: observation.id ? [observation.id] : [],
      },
    },
  };
}

function deriveWifiEntity(observation) {
  if (observation.kind !== 'wifi_ap') return [];
  const key = payloadString(observation.payload, [
    'bssid_hash',
    'bssidHash',
    'ap_hash',
    'apHash',
    'network_hash',
    'networkHash',
    'ssid_hash',
    'ssidHash',
  ]);
  if (!key) return [];
  const keyKind = observation.payload.bssid_hash || observation.payload.bssidHash ? 'bssid_hash' : 'network_hash';
  return [makeEntity(observation, {
    entityKind: 'network',
    stableKey: `wifi_ap:${keyKind}:${key}`,
    displayName: entityDisplayName('Wi-Fi AP', key),
    labels: ['wifi', 'access-point'],
    derivationKind: 'wifi_ap',
    properties: {
      wireless_kind: 'wifi_ap',
      ssid_hash: payloadString(observation.payload, ['ssid_hash', 'ssidHash']),
      bssid_hash: payloadString(observation.payload, ['bssid_hash', 'bssidHash']),
      channel: observation.payload.channel ?? null,
      frequency_mhz: observation.payload.frequency_mhz ?? observation.payload.frequencyMhz ?? null,
      security: observation.payload.security ?? null,
    },
  })];
}

function deriveBleEntity(observation) {
  if (observation.kind !== 'ble_device') return [];
  const deviceHash = payloadString(observation.payload, [
    'device_hash',
    'deviceHash',
    'ble_address_hash',
    'bleAddressHash',
    'address_hash',
    'addressHash',
    'device_id_hash',
    'deviceIdHash',
  ]);
  const deviceClass = payloadString(observation.payload, ['device_class', 'deviceClass', 'class']);
  const key = deviceHash || (deviceClass ? `class:${normalizeUnsafeToken(deviceClass)}` : null);
  if (!key) return [];
  return [makeEntity(observation, {
    entityKind: 'device',
    stableKey: `ble_device:${key}`,
    displayName: entityDisplayName('BLE device', deviceClass || deviceHash),
    labels: ['ble', 'device'],
    derivationKind: 'ble_device',
    properties: {
      wireless_kind: 'ble_device',
      device_hash: deviceHash,
      device_class: deviceClass,
      manufacturer_hash: payloadString(observation.payload, ['manufacturer_hash', 'manufacturerHash']),
      rssi: observation.payload.rssi ?? null,
    },
  })];
}

function deriveGreenfeedEntity(observation) {
  if (observation.kind !== 'greenfeed_snapshot') return [];
  const sourceKey = payloadString(observation.payload, ['source_key', 'sourceKey', 'feed_key', 'feedKey', 'provider']) || observation.sourceId;
  if (!sourceKey) return [];
  return [makeEntity(observation, {
    entityKind: 'feed',
    stableKey: `greenfeed:source:${sourceKey}`,
    displayName: firstString(
      payloadString(observation.payload, ['title', 'name', 'display_name', 'displayName']),
      entityDisplayName('Greenfeed source', sourceKey),
    ),
    labels: ['greenfeed', 'source'],
    derivationKind: 'greenfeed_source',
    properties: {
      source_key: sourceKey,
      provider: payloadString(observation.payload, ['provider']),
      feed_url: payloadString(observation.payload, ['feed_url', 'feedUrl', 'url']),
      allowed_preload: GREEN_SOURCE_CLASSES.has(observation.sourceClass),
    },
  })];
}

function deriveClaimAnchorEntities(observation) {
  if (observation.kind !== 'claim_anchor') return [];
  const claimKey = payloadString(observation.payload, ['claim_key', 'claimKey', 'claim_id', 'claimId', 'claim_hash', 'claimHash']);
  const eventKey = payloadString(observation.payload, ['event_key', 'eventKey', 'event_id', 'eventId']);
  const anchorKind = normalizeUnsafeToken(payloadString(observation.payload, ['anchor_kind', 'anchorKind', 'kind']));
  const anchorKey = payloadString(observation.payload, ['anchor_key', 'anchorKey']);
  const entities = [];

  const resolvedClaimKey = claimKey || (anchorKind === 'claim' ? anchorKey : null);
  if (resolvedClaimKey) {
    entities.push(makeEntity(observation, {
      entityKind: 'claim',
      stableKey: `claim:${resolvedClaimKey}`,
      displayName: firstString(
        payloadString(observation.payload, ['claim_label', 'claimLabel', 'title', 'summary']),
        entityDisplayName('Claim', resolvedClaimKey),
      ),
      labels: ['claim', 'anchor'],
      derivationKind: 'claim_anchor',
      relationship: 'supports',
      properties: {
        claim_key: resolvedClaimKey,
        confidence_statement: payloadString(observation.payload, ['statement', 'claim', 'summary']),
      },
    }));
  }

  const resolvedEventKey = eventKey || (anchorKind === 'event' ? anchorKey : null);
  if (resolvedEventKey) {
    entities.push(makeEntity(observation, {
      entityKind: 'event',
      stableKey: `event:${resolvedEventKey}`,
      displayName: firstString(
        payloadString(observation.payload, ['event_label', 'eventLabel', 'title', 'summary']),
        entityDisplayName('Event', resolvedEventKey),
      ),
      labels: ['event', 'anchor'],
      derivationKind: 'event_anchor',
      relationship: 'supports',
      properties: {
        event_key: resolvedEventKey,
        event_type: payloadString(observation.payload, ['event_type', 'eventType']),
      },
    }));
  }

  return entities;
}

function payloadObject(payload, keys) {
  for (const key of keys) {
    if (isPlainObject(payload[key])) return payload[key];
  }
  return null;
}

function deriveMappedPlaceEntity(observation) {
  const place = payloadObject(observation.payload, ['mapped_place', 'mappedPlace', 'place']);
  const placeKind = normalizeUnsafeToken(objectString(place, ['kind', 'type', 'place_kind', 'placeKind']) || payloadString(observation.payload, ['place_kind', 'placeKind']));
  if (UNSAFE_PRODUCT_ENTITY_KINDS.has(placeKind)) return [];
  const placeKey = objectString(place, ['place_key', 'placeKey', 'id', 'key'])
    || payloadString(observation.payload, ['place_key', 'placeKey', 'mapped_place_key', 'mappedPlaceKey']);
  if (!placeKey) return [];
  return [makeEntity(observation, {
    entityKind: 'place',
    stableKey: `place:${placeKey}`,
    displayName: objectString(place, ['name', 'display_name', 'displayName', 'label']) || entityDisplayName('Place', placeKey),
    labels: ['place', 'mapped'],
    derivationKind: 'mapped_place',
    relationship: 'located_near',
    properties: {
      place_key: placeKey,
      place_kind: placeKind || null,
      provider: objectString(place, ['provider']) || payloadString(observation.payload, ['place_provider', 'placeProvider']),
    },
  })];
}

function deriveMappedSourceEntity(observation) {
  if (observation.kind === 'greenfeed_snapshot') return [];
  const mappedSource = payloadObject(observation.payload, ['mapped_source', 'mappedSource', 'source_entity', 'sourceEntity']);
  const sourceKey = objectString(mappedSource, ['source_key', 'sourceKey', 'id', 'key'])
    || payloadString(observation.payload, ['mapped_source_key', 'mappedSourceKey']);
  if (!sourceKey) return [];
  return [makeEntity(observation, {
    entityKind: 'feed',
    stableKey: `mapped_source:${sourceKey}`,
    displayName: objectString(mappedSource, ['name', 'display_name', 'displayName', 'label']) || entityDisplayName('Mapped source', sourceKey),
    labels: ['source', 'mapped'],
    derivationKind: 'mapped_source',
    properties: {
      source_key: sourceKey,
      provider: objectString(mappedSource, ['provider']),
    },
  })];
}

export function deriveEntitiesForObservation(rawObservation = {}) {
  const observation = normalizeObservationInput(rawObservation);
  if (!observation.kind || !observation.sourceClass || !observation.observedAt) return [];
  if (findUnsafeProductEntity(observation.payload)) return [];

  return [
    ...deriveWifiEntity(observation),
    ...deriveBleEntity(observation),
    ...deriveGreenfeedEntity(observation),
    ...deriveClaimAnchorEntities(observation),
    ...deriveMappedPlaceEntity(observation),
    ...deriveMappedSourceEntity(observation),
  ].filter((entity) => entity.stableKey && entity.entityKind && entity.displayName);
}

export async function materializeObservationEntities(pool, rawObservation = {}) {
  const entities = deriveEntitiesForObservation(rawObservation);
  if (!entities.length) return { entityCount: 0, edgeCount: 0, entities: [] };
  const observation = normalizeObservationInput(rawObservation);
  if (!observation.id) return { entityCount: 0, edgeCount: 0, entities: [] };

  let edgeCount = 0;
  const materialized = [];
  for (const entity of entities) {
    const entityResult = await pool.query(`
      INSERT INTO cyber_entities (
        entity_kind, stable_key, display_name, source_class, first_seen_at, last_seen_at,
        centroid, h3_7, h3_9, h3_11, confidence, labels, properties, provenance
      )
      VALUES (
        $1, $2, $3, $4, $5::timestamptz, $6::timestamptz,
        ST_SetSRID(ST_MakePoint($7, $8), 4326), $9, $10, $11, $12, $13::text[], $14::jsonb, $15::jsonb
      )
      ON CONFLICT (stable_key) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          source_class = EXCLUDED.source_class,
          first_seen_at = LEAST(cyber_entities.first_seen_at, EXCLUDED.first_seen_at),
          last_seen_at = GREATEST(cyber_entities.last_seen_at, EXCLUDED.last_seen_at),
          centroid = EXCLUDED.centroid,
          h3_7 = EXCLUDED.h3_7,
          h3_9 = EXCLUDED.h3_9,
          h3_11 = EXCLUDED.h3_11,
          confidence = GREATEST(cyber_entities.confidence, EXCLUDED.confidence),
          labels = ARRAY(SELECT DISTINCT unnest(cyber_entities.labels || EXCLUDED.labels)),
          properties = cyber_entities.properties || EXCLUDED.properties,
          provenance = cyber_entities.provenance || EXCLUDED.provenance,
          updated_at = now()
      RETURNING id
    `, [
      entity.entityKind,
      entity.stableKey,
      entity.displayName,
      entity.sourceClass,
      entity.firstSeenAt,
      entity.lastSeenAt,
      entity.lon,
      entity.lat,
      entity.h3_7,
      entity.h3_9,
      entity.h3_11,
      entity.confidence,
      entity.labels,
      JSON.stringify(entity.properties),
      JSON.stringify(entity.provenance),
    ]);
    const entityId = entityResult.rows[0].id;
    const edge = entity.edge;
    await pool.query(`
      INSERT INTO entity_observations (
        entity_id, observation_id, relationship, source_class, weight, confidence,
        first_seen_at, last_seen_at, source_observation_refs, provenance
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $8::timestamptz, $9::jsonb, $10::jsonb)
      ON CONFLICT (entity_id, observation_id, relationship) DO UPDATE
      SET source_class = EXCLUDED.source_class,
          weight = GREATEST(entity_observations.weight, EXCLUDED.weight),
          confidence = GREATEST(entity_observations.confidence, EXCLUDED.confidence),
          first_seen_at = LEAST(entity_observations.first_seen_at, EXCLUDED.first_seen_at),
          last_seen_at = GREATEST(entity_observations.last_seen_at, EXCLUDED.last_seen_at),
          source_observation_refs = (
            SELECT jsonb_agg(DISTINCT refs.value)
            FROM jsonb_array_elements(entity_observations.source_observation_refs || EXCLUDED.source_observation_refs) AS refs(value)
          ),
          provenance = entity_observations.provenance || EXCLUDED.provenance
      RETURNING entity_id
    `, [
      entityId,
      observation.id,
      edge.relationship,
      entity.sourceClass,
      edge.weight,
      edge.confidence,
      edge.firstSeenAt,
      edge.lastSeenAt,
      JSON.stringify(edge.sourceObservationRefs),
      JSON.stringify(edge.provenance),
    ]);
    edgeCount += 1;
    materialized.push({ id: entityId, stableKey: entity.stableKey, entityKind: entity.entityKind });
  }

  return { entityCount: materialized.length, edgeCount, entities: materialized };
}
