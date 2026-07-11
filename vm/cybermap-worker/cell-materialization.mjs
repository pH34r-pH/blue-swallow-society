const MATERIALIZATION_VERSION = 'cybermap-worker/cell-materialization:v1';
const DEFAULT_LOOKBACK_MS = 5 * 60 * 1000;
const DEFAULT_AFFECTED_CELL_LIMIT = 500;

const SOURCE_CLASS_ORDER = Object.freeze([
  'green_public',
  'green_owned',
  'green_authorized',
  'owned_device',
  'local_observation',
  'grey_enrichment',
  'orange_exposure',
  'red_restricted',
]);

const GREEN_SOURCE_CLASSES = new Set(['green_public', 'green_owned', 'green_authorized']);
const LOCAL_OWNED_SOURCE_CLASSES = new Set(['owned_device', 'local_observation']);
const RESTRICTED_SOURCE_CLASSES = new Set(['grey_enrichment', 'orange_exposure', 'red_restricted']);
const OPERATOR_SCOPES = new Set(['*', 'operator:*', 'cybermap:*', 'cybermap:restricted-read']);

const CELL_FIELD_BY_RESOLUTION = Object.freeze({
  7: 'h3_7',
  9: 'h3_9',
  11: 'h3_11',
});

const GEOHASH_ALPHABET = '0123456789bcdefghjkmnpqrstuvwxyz';

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseJsonValue(value, fallback) {
  if (value === undefined || value === null) return fallback;
  if (isPlainObject(value) || Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return fallback;
}

function stringValue(value) {
  if (value === undefined || value === null) return null;
  const normalized = String(value).trim();
  return normalized || null;
}

function numberValue(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function isoString(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function sourceClassRank(sourceClass) {
  const index = SOURCE_CLASS_ORDER.indexOf(sourceClass);
  return index === -1 ? SOURCE_CLASS_ORDER.length : index;
}

function sortedSourceClasses(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => {
    const rank = sourceClassRank(a) - sourceClassRank(b);
    return rank || a.localeCompare(b);
  });
}

function incrementCounter(counter, key, amount = 1) {
  if (!key) return;
  counter[key] = (counter[key] || 0) + amount;
}

function addUniqueSorted(array, value) {
  if (!value || array.includes(value)) return;
  array.push(value);
  array.sort();
}

function finiteNumberOrNull(value) {
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function boundedNumberOrNull(value, { min = -Infinity, max = Infinity } = {}) {
  const number = finiteNumberOrNull(value);
  if (number === null) return null;
  return Math.min(max, Math.max(min, number));
}

function incrementCounterBy(counter, key, amount = 0) {
  if (!key || amount === 0) return;
  counter[key] = (counter[key] || 0) + amount;
}

function rowValue(row, snakeName, camelName = null) {
  return row?.[snakeName] ?? (camelName ? row?.[camelName] : undefined);
}

function normalizeLabels(value) {
  const parsed = parseJsonValue(value, value);
  if (Array.isArray(parsed)) return parsed.map((item) => stringValue(item)).filter(Boolean);
  if (typeof parsed === 'string') return parsed.split(',').map((item) => stringValue(item)).filter(Boolean);
  return [];
}

function normalizeCellRow(row) {
  const sourceClass = stringValue(rowValue(row, 'source_class', 'sourceClass'))?.toLowerCase();
  const observationId = stringValue(rowValue(row, 'observation_id', 'observationId') ?? row?.id);
  const entityId = stringValue(rowValue(row, 'entity_id', 'entityId'));
  const entityStableKey = stringValue(rowValue(row, 'entity_stable_key', 'entityStableKey'));
  const entityKind = stringValue(rowValue(row, 'entity_kind', 'entityKind'));
  const entityDisplayName = stringValue(rowValue(row, 'entity_display_name', 'entityDisplayName'));
  const entitySourceClass = stringValue(rowValue(row, 'entity_source_class', 'entitySourceClass'))?.toLowerCase() || sourceClass;

  return {
    observationId,
    kind: stringValue(row?.kind)?.toLowerCase(),
    sourceClass,
    observedAt: isoString(rowValue(row, 'observed_at', 'observedAt')),
    ingestedAt: isoString(rowValue(row, 'ingested_at', 'ingestedAt')),
    h3_7: stringValue(row?.h3_7),
    h3_9: stringValue(row?.h3_9),
    h3_11: stringValue(row?.h3_11),
    confidence: Math.max(0, Math.min(1, numberValue(row?.confidence, 1))),
    sessionId: stringValue(rowValue(row, 'session_id', 'sessionId')),
    triggerObservationId: stringValue(rowValue(row, 'trigger_observation_id', 'triggerObservationId')),
    authorizedScopeRef: stringValue(rowValue(row, 'authorized_scope_ref', 'authorizedScopeRef')),
    payload: parseJsonValue(row?.payload, {}),
    provenance: parseJsonValue(row?.provenance ?? row?.observation_provenance, {}),
    entity: entityId || entityStableKey ? {
      id: entityId,
      entityKind,
      stableKey: entityStableKey || entityId,
      displayName: entityDisplayName || entityStableKey || entityId,
      sourceClass: entitySourceClass,
      labels: normalizeLabels(rowValue(row, 'entity_labels', 'entityLabels')),
    } : null,
  };
}

function layerKindForSourceClass(sourceClass) {
  if (GREEN_SOURCE_CLASSES.has(sourceClass)) return 'green_preload';
  if (LOCAL_OWNED_SOURCE_CLASSES.has(sourceClass)) return 'local_owned';
  if (RESTRICTED_SOURCE_CLASSES.has(sourceClass)) return 'exposure_enrichment';
  return 'other';
}

function createLayer(layerKind) {
  const layer = {
    layer: layerKind,
    source_classes: [],
    observation_count: 0,
    entity_count: 0,
    observations_by_kind: {},
    source_class_counts: {},
    entities: [],
    first_seen_at: null,
    last_seen_at: null,
    last_ingested_at: null,
    global_preload: layerKind === 'green_preload',
    gated: layerKind === 'exposure_enrichment',
    provenance_bearing: layerKind === 'exposure_enrichment',
    local_context: layerKind === 'local_owned',
    _observationIds: new Set(),
    _entityKeys: new Set(),
  };
  if (layerKind === 'exposure_enrichment') {
    layer.gated_by_source_class = {};
  }
  return layer;
}

function gateFor(layer, sourceClass) {
  if (!layer.gated_by_source_class[sourceClass]) {
    layer.gated_by_source_class[sourceClass] = {
      source_class: sourceClass,
      observation_count: 0,
      entity_count: 0,
      observations_by_kind: {},
      first_seen_at: null,
      last_seen_at: null,
      last_ingested_at: null,
      authorized_scope_refs: [],
      trigger_observation_ids: [],
      session_ids: [],
      provenance_required: true,
      _observationIds: new Set(),
      _entityKeys: new Set(),
    };
  }
  return layer.gated_by_source_class[sourceClass];
}

function updateObservationTimes(target, observation) {
  const observedAt = isoString(observation.observedAt);
  if (observedAt) {
    if (!target.first_seen_at || observedAt < target.first_seen_at) target.first_seen_at = observedAt;
    if (!target.last_seen_at || observedAt > target.last_seen_at) target.last_seen_at = observedAt;
  }
  const ingestedAt = isoString(observation.ingestedAt);
  if (ingestedAt && (!target.last_ingested_at || ingestedAt > target.last_ingested_at)) {
    target.last_ingested_at = ingestedAt;
  }
}

function addObservationToLayer(layer, observation) {
  const observationKey = observation.observationId || `${observation.kind}|${observation.sourceClass}|${observation.observedAt}`;
  if (!layer._observationIds.has(observationKey)) {
    layer._observationIds.add(observationKey);
    layer.observation_count += 1;
    incrementCounter(layer.observations_by_kind, observation.kind);
    incrementCounter(layer.source_class_counts, observation.sourceClass);
  }
  updateObservationTimes(layer, observation);
  layer.source_classes = sortedSourceClasses([...layer.source_classes, observation.sourceClass]);

  if (layer.gated_by_source_class) {
    const gate = gateFor(layer, observation.sourceClass);
    if (!gate._observationIds.has(observationKey)) {
      gate._observationIds.add(observationKey);
      gate.observation_count += 1;
      incrementCounter(gate.observations_by_kind, observation.kind);
    }
    updateObservationTimes(gate, observation);
    addUniqueSorted(gate.authorized_scope_refs, observation.authorizedScopeRef);
    addUniqueSorted(gate.trigger_observation_ids, observation.triggerObservationId);
    addUniqueSorted(gate.session_ids, observation.sessionId);
  }
}

function entityKey(entity) {
  if (!entity) return null;
  return entity.stableKey || entity.id;
}

function addEntityToLayer(layer, entity, visibleSourceClass) {
  const key = entityKey(entity);
  const sourceClass = visibleSourceClass || entity.sourceClass;
  if (!key || !sourceClass) return;

  if (layer.gated_by_source_class) {
    const gate = gateFor(layer, sourceClass);
    if (!gate._entityKeys.has(key)) {
      gate._entityKeys.add(key);
      gate.entity_count += 1;
    }
  }

  let existingEntity = layer.entities.find((candidate) => (candidate.stable_key || candidate.id) === key);
  if (existingEntity) {
    existingEntity.source_classes = sortedSourceClasses([...(existingEntity.source_classes || []), sourceClass]);
    existingEntity.source_class = existingEntity.source_classes[0] || sourceClass;
    return;
  }

  layer._entityKeys.add(key);
  layer.entity_count += 1;
  existingEntity = {
    id: entity.id,
    entity_kind: entity.entityKind,
    stable_key: entity.stableKey,
    display_name: entity.displayName,
    source_class: sourceClass,
    source_classes: sortedSourceClasses([sourceClass]),
    labels: entity.labels,
  };
  layer.entities.push(existingEntity);
  layer.entities.sort((a, b) => String(a.stable_key || a.id).localeCompare(String(b.stable_key || b.id)));
}

function finalizeLayer(layer) {
  const finalized = { ...layer };
  delete finalized._observationIds;
  delete finalized._entityKeys;
  finalized.source_classes = sortedSourceClasses(finalized.source_classes);
  finalized.entities = finalized.entities.slice(0, 25);
  if (finalized.gated_by_source_class) {
    finalized.gated_by_source_class = Object.fromEntries(
      sortedSourceClasses(Object.keys(finalized.gated_by_source_class)).map((sourceClass) => {
        const gate = { ...finalized.gated_by_source_class[sourceClass] };
        delete gate._observationIds;
        delete gate._entityKeys;
        gate.authorized_scope_refs = [...gate.authorized_scope_refs].sort();
        gate.trigger_observation_ids = [...gate.trigger_observation_ids].sort();
        gate.session_ids = [...gate.session_ids].sort();
        return [sourceClass, gate];
      }),
    );
  }
  return finalized;
}

function decodeGeohashBounds(geohash) {
  let evenBit = true;
  const lat = [-90, 90];
  const lon = [-180, 180];

  for (const char of geohash) {
    const index = GEOHASH_ALPHABET.indexOf(char);
    if (index < 0) return null;
    for (let mask = 16; mask > 0; mask >>= 1) {
      if (evenBit) {
        const midpoint = (lon[0] + lon[1]) / 2;
        if (index & mask) lon[0] = midpoint;
        else lon[1] = midpoint;
      } else {
        const midpoint = (lat[0] + lat[1]) / 2;
        if (index & mask) lat[0] = midpoint;
        else lat[1] = midpoint;
      }
      evenBit = !evenBit;
    }
  }

  return { latMin: lat[0], latMax: lat[1], lonMin: lon[0], lonMax: lon[1] };
}

function fallbackBoundary(h3Cell) {
  let hash = 0;
  for (const char of String(h3Cell || '')) hash = ((hash * 31) + char.charCodeAt(0)) >>> 0;
  const lon = ((hash % 360000) / 1000) - 180;
  const lat = ((((hash / 360000) >>> 0) % 180000) / 1000) - 90;
  const delta = 0.0005;
  return { lonMin: lon - delta, lonMax: lon + delta, latMin: lat - delta, latMax: lat + delta };
}

export function cellBoundaryGeoJson(h3Cell) {
  const raw = String(h3Cell || '').toLowerCase();
  const geohash = raw.match(/^gh(?:7|9|11):([0-9bcdefghjkmnpqrstuvwxyz]+)$/)?.[1];
  const bounds = (geohash && decodeGeohashBounds(geohash)) || fallbackBoundary(h3Cell);
  return {
    type: 'Polygon',
    coordinates: [[
      [bounds.lonMin, bounds.latMin],
      [bounds.lonMax, bounds.latMin],
      [bounds.lonMax, bounds.latMax],
      [bounds.lonMin, bounds.latMax],
      [bounds.lonMin, bounds.latMin],
    ]],
  };
}

function buildFreshness(uniqueObservations, nowIso) {
  const observedTimes = uniqueObservations.map((observation) => observation.observedAt).filter(Boolean).sort();
  const ingestedTimes = uniqueObservations.map((observation) => observation.ingestedAt).filter(Boolean).sort();
  const lastObservedAt = observedTimes.at(-1) || null;
  const lastIngestedAt = ingestedTimes.at(-1) || null;
  const ageSeconds = lastObservedAt
    ? Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(lastObservedAt).getTime()) / 1000))
    : null;
  return {
    updated_at: nowIso,
    last_observed_at: lastObservedAt,
    last_ingested_at: lastIngestedAt,
    age_seconds: ageSeconds,
    stale: ageSeconds === null ? true : ageSeconds > 24 * 60 * 60,
  };
}

function payloadString(payload, key) {
  return stringValue(payload?.[key]);
}

function payloadArrayStrings(payload, key) {
  const value = payload?.[key];
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).map((item) => stringValue(item)).filter(Boolean);
}

function buildGreenfeedMetadata(uniqueObservations, nowIso) {
  const rows = uniqueObservations.filter((observation) => (
    observation.kind === 'greenfeed_snapshot' && GREEN_SOURCE_CLASSES.has(observation.sourceClass)
  ));
  if (!rows.length) return null;

  const sourceKeys = [];
  const sourceCaveats = [];
  const freshnessStatusCounts = {};
  const uptimeStatusCounts = {};
  const claimValidationSources = [];
  let cacheTtlSecondsMin = null;
  let cacheTtlSecondsMax = null;
  let staleByCacheTtlCount = 0;

  for (const observation of rows) {
    const payload = observation.payload || {};
    const sourceKey = payloadString(payload, 'source_key') || observation.observationId;
    addUniqueSorted(sourceKeys, sourceKey);
    for (const caveat of [
      ...payloadArrayStrings(payload, 'caveats'),
      stringValue(payload.view?.caveat),
    ]) {
      addUniqueSorted(sourceCaveats, caveat);
    }

    const ttl = boundedNumberOrNull(payload.cache_ttl_seconds, { min: 0 });
    if (ttl !== null) {
      cacheTtlSecondsMin = cacheTtlSecondsMin === null ? ttl : Math.min(cacheTtlSecondsMin, ttl);
      cacheTtlSecondsMax = cacheTtlSecondsMax === null ? ttl : Math.max(cacheTtlSecondsMax, ttl);
      const ageSeconds = observation.observedAt
        ? Math.max(0, Math.round((new Date(nowIso).getTime() - new Date(observation.observedAt).getTime()) / 1000))
        : null;
      if (ageSeconds === null || ageSeconds > ttl) staleByCacheTtlCount += 1;
    }

    const freshnessStatus = payloadString(payload, 'freshness_status') || (ttl !== null && staleByCacheTtlCount > 0 ? 'stale' : 'unknown');
    const uptimeStatus = payloadString(payload, 'uptime_status') || 'unknown';
    incrementCounter(freshnessStatusCounts, freshnessStatus);
    incrementCounter(uptimeStatusCounts, uptimeStatus);

    const ranking = payload.claim_validation_ranking || {};
    claimValidationSources.push({
      source_key: sourceKey,
      provider: payloadString(payload, 'provider'),
      distance_meters: boundedNumberOrNull(ranking.distance_meters, { min: 0 }),
      bearing_degrees: boundedNumberOrNull(ranking.bearing_degrees, { min: 0, max: 360 }),
      angle_delta_degrees: boundedNumberOrNull(ranking.angle_delta_degrees, { min: 0, max: 180 }),
      source_quality_score: boundedNumberOrNull(ranking.source_quality_score ?? payload.source_quality_score, { min: 0, max: 1 }),
      claim_validation_score: boundedNumberOrNull(ranking.claim_validation_score, { min: 0, max: 1 }),
    });
  }

  claimValidationSources.sort((a, b) => String(a.source_key).localeCompare(String(b.source_key)));
  return {
    cache_ttl_seconds_min: cacheTtlSecondsMin,
    cache_ttl_seconds_max: cacheTtlSecondsMax,
    freshness_status_counts: Object.fromEntries(Object.entries(freshnessStatusCounts).sort(([a], [b]) => a.localeCompare(b))),
    uptime_status_counts: Object.fromEntries(Object.entries(uptimeStatusCounts).sort(([a], [b]) => a.localeCompare(b))),
    greenfeed_source_keys: sourceKeys,
    source_caveats: sourceCaveats,
    claim_validation_sources: claimValidationSources,
    stale_by_cache_ttl_count: staleByCacheTtlCount,
  };
}

function calculateSalience({ observationCount, entityCount, restrictedCount, maxConfidence, freshness }) {
  const recencyBoost = freshness.age_seconds === null ? 0 : Math.max(0, 1 - Math.min(freshness.age_seconds, 86_400) / 86_400);
  const raw = (observationCount * 0.2) + (entityCount * 0.35) + (restrictedCount * 0.15) + (maxConfidence * 0.2) + (recencyBoost * 0.1);
  return Number(Math.min(99.999, raw).toFixed(3));
}

export function buildCybermapCellSummary(rows = [], { h3Cell, resolution, now = new Date() } = {}) {
  const nowIso = isoString(now) || new Date().toISOString();
  const normalizedRows = rows.map((row) => normalizeCellRow(row)).filter((row) => row.sourceClass && row.observedAt);
  const observationsById = new Map();
  const entitiesByKey = new Map();
  const layers = {};

  for (const row of normalizedRows) {
    const observationKey = row.observationId || `${row.kind}|${row.sourceClass}|${row.observedAt}`;
    if (!observationsById.has(observationKey)) observationsById.set(observationKey, row);
    const kind = layerKindForSourceClass(row.sourceClass);
    layers[kind] ||= createLayer(kind);
    addObservationToLayer(layers[kind], row);
    if (row.entity) {
      const key = entityKey(row.entity);
      if (key) entitiesByKey.set(key, row.entity);
      addEntityToLayer(layers[kind], row.entity, row.sourceClass);
    }
  }

  const uniqueObservations = [...observationsById.values()];
  const observedTimes = uniqueObservations.map((observation) => observation.observedAt).filter(Boolean).sort();
  const sourceClasses = sortedSourceClasses(uniqueObservations.map((observation) => observation.sourceClass));
  const counts = {
    observations_by_kind: {},
    observations_by_source_class: {},
    entities_by_kind: {},
  };
  let maxConfidence = 0;
  for (const observation of uniqueObservations) {
    incrementCounter(counts.observations_by_kind, observation.kind);
    incrementCounter(counts.observations_by_source_class, observation.sourceClass);
    maxConfidence = Math.max(maxConfidence, observation.confidence);
  }
  for (const entity of entitiesByKey.values()) {
    incrementCounter(counts.entities_by_kind, entity.entityKind);
  }

  const finalizedLayers = Object.fromEntries(
    Object.entries(layers).map(([kind, layer]) => [kind, finalizeLayer(layer)]),
  );
  const greenfeedMetadata = buildGreenfeedMetadata(uniqueObservations, nowIso);
  if (greenfeedMetadata && finalizedLayers.green_preload) {
    Object.assign(finalizedLayers.green_preload, greenfeedMetadata);
  }
  const restrictedLayer = finalizedLayers.exposure_enrichment;
  const caveats = [];
  if (greenfeedMetadata) {
    caveats.push({
      code: 'greenfeed_cache_ttl_applies',
      severity: 'info',
      source_classes: finalizedLayers.green_preload?.source_classes || [],
      cache_ttl_seconds_min: greenfeedMetadata.cache_ttl_seconds_min,
      cache_ttl_seconds_max: greenfeedMetadata.cache_ttl_seconds_max,
      message: 'Greenfeed snapshots carry source cache TTL and freshness caveats; claim validation must consider source update cadence and observation age.',
    });
    if (greenfeedMetadata.stale_by_cache_ttl_count > 0) {
      caveats.push({
        code: 'greenfeed_snapshot_stale_by_ttl',
        severity: 'warning',
        source_classes: finalizedLayers.green_preload?.source_classes || [],
        stale_observation_count: greenfeedMetadata.stale_by_cache_ttl_count,
        message: 'At least one Greenfeed snapshot is older than its declared cache TTL.',
      });
    }
    if (greenfeedMetadata.source_caveats.length > 0) {
      caveats.push({
        code: 'greenfeed_source_caveats',
        severity: 'info',
        source_classes: finalizedLayers.green_preload?.source_classes || [],
        caveats: greenfeedMetadata.source_caveats,
        message: 'Greenfeed source caveats apply to this cell summary.',
      });
    }
  }
  if (restrictedLayer?.observation_count > 0) {
    caveats.push({
      code: 'restricted_layer_requires_scope',
      severity: 'warning',
      source_classes: restrictedLayer.source_classes,
      message: 'Grey/orange/red enrichment is gated and must not preload globally; callers need matching local/owned trigger or authorized scope.',
    });
  }
  if (finalizedLayers.local_owned?.observation_count > 0) {
    caveats.push({
      code: 'local_owned_context_not_global_preload',
      severity: 'info',
      source_classes: finalizedLayers.local_owned.source_classes,
      message: 'Owned/local observations are viewport context, not public global preload.',
    });
  }

  const freshness = buildFreshness(uniqueObservations, nowIso);
  if (greenfeedMetadata) {
    Object.assign(freshness, {
      greenfeed_cache_ttl_seconds_min: greenfeedMetadata.cache_ttl_seconds_min,
      greenfeed_cache_ttl_seconds_max: greenfeedMetadata.cache_ttl_seconds_max,
      greenfeed_stale_by_cache_ttl: greenfeedMetadata.stale_by_cache_ttl_count > 0,
      greenfeed_stale_by_cache_ttl_count: greenfeedMetadata.stale_by_cache_ttl_count,
      greenfeed_freshness_status_counts: greenfeedMetadata.freshness_status_counts,
    });
  }
  const observationCount = uniqueObservations.length;
  const entityCount = entitiesByKey.size;
  const restrictedCount = restrictedLayer?.observation_count || 0;

  return {
    h3Cell,
    resolution: Number(resolution),
    geom: cellBoundaryGeoJson(h3Cell),
    updatedAt: nowIso,
    firstSeenAt: observedTimes[0] || null,
    lastSeenAt: observedTimes.at(-1) || null,
    sourceClasses,
    observationCount,
    entityCount,
    layers: finalizedLayers,
    counts,
    freshness,
    caveats,
    salience: calculateSalience({ observationCount, entityCount, restrictedCount, maxConfidence, freshness }),
    provenance: {
      materialized_by: MATERIALIZATION_VERSION,
      app_computed_cell: true,
      source_row_count: rows.length,
    },
  };
}

function validateResolution(resolution) {
  const normalized = Number(resolution);
  const field = CELL_FIELD_BY_RESOLUTION[normalized];
  if (!field) throw new Error('resolution must be one of 7, 9, 11');
  return { resolution: normalized, field };
}

function summaryParams(summary) {
  return [
    summary.h3Cell,
    summary.resolution,
    JSON.stringify(summary.geom),
    summary.firstSeenAt,
    summary.lastSeenAt,
    summary.sourceClasses,
    summary.observationCount,
    summary.entityCount,
    JSON.stringify(summary.layers),
    JSON.stringify(summary.counts),
    JSON.stringify(summary.freshness),
    JSON.stringify(summary.caveats),
    summary.salience,
    JSON.stringify(summary.provenance),
  ];
}

export async function fetchCybermapCellRows(pool, { h3Cell, resolution }) {
  const { field } = validateResolution(resolution);
  const result = await pool.query(`
    SELECT
      o.id AS observation_id,
      o.kind,
      o.source_class,
      o.observed_at,
      o.ingested_at,
      o.h3_7,
      o.h3_9,
      o.h3_11,
      o.confidence,
      o.session_id,
      o.trigger_observation_id,
      o.authorized_scope_ref,
      o.payload,
      o.provenance,
      ce.id AS entity_id,
      ce.entity_kind,
      ce.stable_key AS entity_stable_key,
      ce.display_name AS entity_display_name,
      ce.source_class AS entity_source_class,
      ce.labels AS entity_labels
    FROM observations o
    LEFT JOIN entity_observations eo ON eo.observation_id = o.id
    LEFT JOIN cyber_entities ce ON ce.id = eo.entity_id
    WHERE o.${field} = $1
    ORDER BY o.observed_at ASC, o.id ASC
  `, [h3Cell]);
  return result.rows || [];
}

export async function materializeCybermapCell(pool, { h3Cell, resolution, now = new Date() } = {}) {
  if (!pool?.query) throw new Error('pool with query(sql, params) is required');
  const normalizedCell = stringValue(h3Cell);
  if (!normalizedCell) throw new Error('h3Cell is required');
  const { resolution: normalizedResolution } = validateResolution(resolution);
  const rows = await fetchCybermapCellRows(pool, { h3Cell: normalizedCell, resolution: normalizedResolution });
  const summary = buildCybermapCellSummary(rows, {
    h3Cell: normalizedCell,
    resolution: normalizedResolution,
    now,
  });
  if (summary.observationCount === 0) {
    return {
      h3Cell: normalizedCell,
      resolution: normalizedResolution,
      observationCount: 0,
      entityCount: 0,
      upserted: false,
      cell: null,
    };
  }

  const upsert = await pool.query(`
    INSERT INTO cybermap_cells (
      h3_cell, resolution, geom, first_seen_at, last_seen_at, source_classes,
      observation_count, entity_count, layers, counts, freshness, caveats, salience, provenance
    )
    VALUES (
      $1, $2, ST_SetSRID(ST_GeomFromGeoJSON($3), 4326), $4::timestamptz, $5::timestamptz, $6::source_class[],
      $7, $8, $9::jsonb, $10::jsonb, $11::jsonb, $12::jsonb, $13, $14::jsonb
    )
    ON CONFLICT (h3_cell, resolution) DO UPDATE
    SET geom = EXCLUDED.geom,
        updated_at = now(),
        first_seen_at = EXCLUDED.first_seen_at,
        last_seen_at = EXCLUDED.last_seen_at,
        source_classes = EXCLUDED.source_classes,
        observation_count = EXCLUDED.observation_count,
        entity_count = EXCLUDED.entity_count,
        layers = EXCLUDED.layers,
        counts = EXCLUDED.counts,
        freshness = EXCLUDED.freshness,
        caveats = EXCLUDED.caveats,
        salience = EXCLUDED.salience,
        provenance = EXCLUDED.provenance
    RETURNING h3_cell, resolution, first_seen_at, last_seen_at, source_classes,
              observation_count, entity_count, layers, counts, freshness, caveats, salience, provenance
  `, summaryParams(summary));

  return {
    h3Cell: normalizedCell,
    resolution: normalizedResolution,
    observationCount: summary.observationCount,
    entityCount: summary.entityCount,
    upserted: true,
    cell: upsert.rows?.[0] || summary,
  };
}

function normalizeAffectedCursor(cursor) {
  if (!cursor) return null;
  const resolution = Number(cursor.resolution);
  const h3Cell = stringValue(cursor.h3_cell ?? cursor.h3Cell);
  if (!CELL_FIELD_BY_RESOLUTION[resolution] || !h3Cell) return null;
  return { resolution, h3Cell };
}

export async function listAffectedCybermapCells(pool, {
  since = new Date(Date.now() - DEFAULT_LOOKBACK_MS),
  before = new Date(),
  limit = DEFAULT_AFFECTED_CELL_LIMIT,
  after = null,
} = {}) {
  const sinceIso = isoString(since);
  if (!sinceIso) throw new Error('since must be a valid timestamp');
  const beforeIso = isoString(before);
  if (!beforeIso) throw new Error('before must be a valid timestamp');
  const boundedLimit = Math.max(1, Math.min(10_000, Number.parseInt(String(limit), 10) || DEFAULT_AFFECTED_CELL_LIMIT));
  const cursor = normalizeAffectedCursor(after);
  const result = await pool.query(`
    WITH affected AS (
      SELECT DISTINCT 7 AS resolution, h3_7 AS h3_cell
      FROM observations
      WHERE ingested_at >= $1::timestamptz AND ingested_at < $2::timestamptz AND h3_7 IS NOT NULL
      UNION
      SELECT DISTINCT 9 AS resolution, h3_9 AS h3_cell
      FROM observations
      WHERE ingested_at >= $1::timestamptz AND ingested_at < $2::timestamptz AND h3_9 IS NOT NULL
      UNION
      SELECT DISTINCT 11 AS resolution, h3_11 AS h3_cell
      FROM observations
      WHERE ingested_at >= $1::timestamptz AND ingested_at < $2::timestamptz AND h3_11 IS NOT NULL
    )
    SELECT resolution, h3_cell
    FROM affected
    WHERE ($3::int IS NULL OR resolution > $3::int OR (resolution = $3::int AND h3_cell > $4::text))
    ORDER BY resolution, h3_cell
    LIMIT $5
  `, [sinceIso, beforeIso, cursor?.resolution ?? null, cursor?.h3Cell ?? null, boundedLimit]);

  const cells = (result.rows || [])
    .map((row) => ({ resolution: Number(row.resolution), h3Cell: stringValue(row.h3_cell ?? row.h3Cell) }))
    .filter((row) => CELL_FIELD_BY_RESOLUTION[row.resolution] && row.h3Cell);
  const lastCell = cells.at(-1) || null;
  return {
    since: sinceIso,
    before: beforeIso,
    after: cursor,
    cells,
    limitReached: cells.length === boundedLimit,
    nextCursor: cells.length === boundedLimit && lastCell
      ? { resolution: lastCell.resolution, h3Cell: lastCell.h3Cell }
      : null,
  };
}

export async function materializeAffectedCybermapCells(pool, {
  since = new Date(Date.now() - DEFAULT_LOOKBACK_MS),
  resolutions = [7, 9, 11],
  limit = DEFAULT_AFFECTED_CELL_LIMIT,
  after = null,
  now = new Date(),
  before = now,
} = {}) {
  const allowedResolutions = new Set(resolutions.map((resolution) => Number(resolution)));
  const affectedPage = await listAffectedCybermapCells(pool, { since, before, limit, after });
  const affected = affectedPage.cells;
  const materialized = [];
  for (const cell of affected) {
    if (!allowedResolutions.has(cell.resolution)) continue;
    const result = await materializeCybermapCell(pool, {
      h3Cell: cell.h3Cell,
      resolution: cell.resolution,
      now,
    });
    if (result.upserted) materialized.push(result);
  }
  return {
    since: affectedPage.since,
    before: affectedPage.before,
    after: affectedPage.after,
    nextCursor: affectedPage.nextCursor,
    limitReached: affectedPage.limitReached,
    materialized,
    affectedCellCount: affected.length,
    upsertedCellCount: materialized.length,
  };
}

function hasOperatorScope(callerScopes = []) {
  return callerScopes.some((scope) => OPERATOR_SCOPES.has(scope));
}

function asSet(values = []) {
  return new Set((Array.isArray(values) ? values : [values]).map((value) => stringValue(value)).filter(Boolean));
}

function cloneJson(value) {
  return parseJsonValue(JSON.stringify(value ?? null), value);
}

function sumSourceClassCounts(sourceClassCounts, sourceClasses) {
  return sourceClasses.reduce((sum, sourceClass) => sum + (sourceClassCounts?.[sourceClass] || 0), 0);
}

function sumGateObservationKinds(gates) {
  const observationsByKind = {};
  for (const gate of Object.values(gates)) {
    for (const [kind, count] of Object.entries(gate.observations_by_kind || {})) {
      incrementCounterBy(observationsByKind, kind, Number(count || 0));
    }
  }
  return observationsByKind;
}

function summarizeGateTimes(gates) {
  let firstSeenAt = null;
  let lastSeenAt = null;
  let lastIngestedAt = null;
  for (const gate of Object.values(gates)) {
    firstSeenAt = minTime(firstSeenAt, timeValue(gate, 'first_seen_at', 'firstSeenAt'));
    lastSeenAt = maxTime(lastSeenAt, timeValue(gate, 'last_seen_at', 'lastSeenAt'));
    lastIngestedAt = maxTime(lastIngestedAt, timeValue(gate, 'last_ingested_at', 'lastIngestedAt'));
  }
  return { firstSeenAt, lastSeenAt, lastIngestedAt };
}

function timeValue(source, snakeName, camelName = snakeName) {
  return isoString(source?.[snakeName] ?? source?.[camelName]);
}

function minTime(current, candidate) {
  return candidate && (!current || candidate < current) ? candidate : current;
}

function maxTime(current, candidate) {
  return candidate && (!current || candidate > current) ? candidate : current;
}

function buildProjectedFreshness(existingFreshness, { updatedAt, lastObservedAt, lastIngestedAt }) {
  const freshness = { ...(existingFreshness || {}) };
  const timestamp = isoString(updatedAt) || freshness.updated_at || freshness.updatedAt || new Date().toISOString();
  freshness.updated_at = timestamp;
  freshness.last_observed_at = lastObservedAt || null;
  freshness.last_ingested_at = lastIngestedAt || null;
  freshness.age_seconds = lastObservedAt
    ? Math.max(0, Math.round((new Date(timestamp).getTime() - new Date(lastObservedAt).getTime()) / 1000))
    : null;
  freshness.stale = freshness.age_seconds === null ? true : freshness.age_seconds > 24 * 60 * 60;
  return freshness;
}

function projectEntitiesForAllowedSources(entities = [], allowedSourceClasses = []) {
  const allowed = new Set(allowedSourceClasses);
  return entities
    .map((entity) => {
      const sourceClasses = sortedSourceClasses(entity.source_classes || [entity.source_class]);
      const visibleSourceClasses = sourceClasses.filter((sourceClass) => allowed.has(sourceClass));
      if (visibleSourceClasses.length === 0) return null;
      return {
        ...entity,
        source_class: visibleSourceClasses[0],
        source_classes: visibleSourceClasses,
      };
    })
    .filter(Boolean);
}

function setProjectedField(projected, snakeName, camelName, value) {
  if (Object.hasOwn(projected, snakeName)) projected[snakeName] = value;
  if (Object.hasOwn(projected, camelName)) projected[camelName] = value;
  if (!Object.hasOwn(projected, snakeName) && !Object.hasOwn(projected, camelName)) {
    projected[snakeName] = value;
  }
}

function recomputeProjectedAggregates(projected) {
  const layers = Object.values(projected.layers || {});
  const sourceClasses = sortedSourceClasses(layers.flatMap((layer) => layer.source_classes || []));
  const counts = {
    observations_by_kind: {},
    observations_by_source_class: {},
    entities_by_kind: {},
  };
  let observationCount = 0;
  let entityCount = 0;
  const entityKeys = new Set();
  let firstSeenAt = null;
  let lastSeenAt = null;
  let lastIngestedAt = null;

  for (const layer of layers) {
    observationCount += Number(layer.observation_count || 0);
    entityCount += Number(layer.entity_count || 0);
    firstSeenAt = minTime(firstSeenAt, timeValue(layer, 'first_seen_at', 'firstSeenAt'));
    lastSeenAt = maxTime(lastSeenAt, timeValue(layer, 'last_seen_at', 'lastSeenAt'));
    lastIngestedAt = maxTime(lastIngestedAt, timeValue(layer, 'last_ingested_at', 'lastIngestedAt'));
    for (const [kind, count] of Object.entries(layer.observations_by_kind || {})) {
      incrementCounterBy(counts.observations_by_kind, kind, Number(count || 0));
    }
    for (const [sourceClass, count] of Object.entries(layer.source_class_counts || {})) {
      incrementCounterBy(counts.observations_by_source_class, sourceClass, Number(count || 0));
    }
    for (const entity of layer.entities || []) {
      const key = entity.stable_key || entity.id;
      if (!key || entityKeys.has(key)) continue;
      entityKeys.add(key);
      incrementCounter(counts.entities_by_kind, entity.entity_kind);
    }
  }

  entityCount = entityKeys.size;
  setProjectedField(projected, 'source_classes', 'sourceClasses', sourceClasses);
  setProjectedField(projected, 'observation_count', 'observationCount', observationCount);
  setProjectedField(projected, 'entity_count', 'entityCount', entityCount);
  setProjectedField(projected, 'first_seen_at', 'firstSeenAt', firstSeenAt);
  setProjectedField(projected, 'last_seen_at', 'lastSeenAt', lastSeenAt);
  projected.freshness = buildProjectedFreshness(projected.freshness, {
    updatedAt: timeValue(projected.freshness, 'updated_at', 'updatedAt') || timeValue(projected, 'updated_at', 'updatedAt'),
    lastObservedAt: lastSeenAt,
    lastIngestedAt,
  });
  if (projected.provenance && typeof projected.provenance === 'object') {
    projected.provenance = {
      ...projected.provenance,
      source_row_count: observationCount,
    };
  }
  projected.counts = counts;

  const restrictedCount = projected.layers?.exposure_enrichment?.observation_count || 0;
  const projectedSalience = calculateSalience({
    observationCount,
    entityCount,
    restrictedCount,
    maxConfidence: 0,
    freshness: projected.freshness || { age_seconds: null },
  });
  projected.salience = Math.min(Number(projected.salience || 0), projectedSalience);
  return projected;
}

function redactHiddenRestrictedCaveats(caveats, visibleSourceClasses) {
  const visible = new Set(visibleSourceClasses);
  return (Array.isArray(caveats) ? caveats : [])
    .map((caveat) => {
      const sourceClasses = Array.isArray(caveat.source_classes) ? caveat.source_classes : [];
      if (!sourceClasses.some((sourceClass) => RESTRICTED_SOURCE_CLASSES.has(sourceClass))) return caveat;
      const redactedSourceClasses = sortedSourceClasses(sourceClasses.filter((sourceClass) => (
        !RESTRICTED_SOURCE_CLASSES.has(sourceClass) || visible.has(sourceClass)
      )));
      if (redactedSourceClasses.length === 0 && caveat.code === 'restricted_layer_requires_scope') return null;
      return { ...caveat, source_classes: redactedSourceClasses };
    })
    .filter(Boolean);
}

export function projectCybermapCellForScope(cell, {
  callerScopes = [],
  authorizedScopeRefs = [],
  sourceClasses = [],
  includeRestricted = false,
} = {}) {
  const projected = cloneJson(cell) || {};
  projected.layers = projected.layers || {};
  projected.caveats = Array.isArray(projected.caveats) ? projected.caveats : [];
  const restrictedLayer = projected.layers.exposure_enrichment;
  if (!restrictedLayer) return projected;

  if (includeRestricted || hasOperatorScope(callerScopes)) {
    projected.caveats.push({
      code: 'restricted_layer_scope_limited',
      severity: 'warning',
      source_classes: restrictedLayer.source_classes || [],
      message: 'Restricted enrichment is visible to this operator scope and remains provenance-bearing.',
    });
    return projected;
  }

  const authorized = asSet(authorizedScopeRefs);
  const callerSourceClasses = asSet(sourceClasses);
  const gates = restrictedLayer.gated_by_source_class || {};
  const allowedSourceClasses = sortedSourceClasses(Object.entries(gates)
    .filter(([sourceClass, gate]) => {
      if (callerSourceClasses.has(sourceClass)) return true;
      return (gate.authorized_scope_refs || []).some((scope) => authorized.has(scope));
    })
    .map(([sourceClass]) => sourceClass));

  if (allowedSourceClasses.length === 0) {
    delete projected.layers.exposure_enrichment;
    recomputeProjectedAggregates(projected);
    const visibleSourceClasses = projected.source_classes || projected.sourceClasses || [];
    projected.caveats = redactHiddenRestrictedCaveats(projected.caveats, visibleSourceClasses);
    projected.caveats.push({
      code: 'restricted_layer_filtered',
      severity: 'info',
      source_classes: [],
      message: 'Restricted grey/orange/red layer omitted because caller lacks matching local/owned trigger or authorized scope.',
    });
    return projected;
  }

  const allowedGateEntries = Object.fromEntries(allowedSourceClasses.map((sourceClass) => [sourceClass, gates[sourceClass]]));
  const gateTimes = summarizeGateTimes(allowedGateEntries);
  const allowedEntities = projectEntitiesForAllowedSources(restrictedLayer.entities || [], allowedSourceClasses);
  const nextLayer = {
    ...restrictedLayer,
    source_classes: allowedSourceClasses,
    source_class_counts: Object.fromEntries(
      allowedSourceClasses.map((sourceClass) => [sourceClass, restrictedLayer.source_class_counts?.[sourceClass] || 0]),
    ),
    observations_by_kind: sumGateObservationKinds(allowedGateEntries),
    first_seen_at: gateTimes.firstSeenAt,
    last_seen_at: gateTimes.lastSeenAt,
    last_ingested_at: gateTimes.lastIngestedAt,
    gated_by_source_class: allowedGateEntries,
    entities: allowedEntities,
  };
  nextLayer.observation_count = sumSourceClassCounts(restrictedLayer.source_class_counts, allowedSourceClasses);
  nextLayer.entity_count = allowedEntities.length;
  projected.layers.exposure_enrichment = nextLayer;
  recomputeProjectedAggregates(projected);
  const visibleSourceClasses = projected.source_classes || projected.sourceClasses || [];
  projected.caveats = redactHiddenRestrictedCaveats(projected.caveats, visibleSourceClasses);
  projected.caveats.push({
    code: 'restricted_layer_scope_limited',
    severity: 'warning',
    source_classes: allowedSourceClasses,
    message: 'Restricted enrichment is filtered to caller-authorized source classes and remains provenance-bearing.',
  });
  return projected;
}
