import { createDefaultPool, loadDatabaseConfig } from './db.mjs';
import { SOURCE_CLASSES } from './source-registry.mjs';
import { projectCybermapCellForScope } from '../cybermap-worker/cell-materialization.mjs';

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
const RESTRICTED_SOURCE_CLASSES = new Set(['grey_enrichment', 'orange_exposure', 'red_restricted']);
const OPERATOR_SCOPES = new Set(['*', 'operator:*', 'cybermap:*']);
const ALLOWED_LAYERS = new Set(['green_preload', 'local_owned', 'exposure_enrichment']);
const CELL_FIELD_BY_RESOLUTION = Object.freeze({
  7: 'h3_7',
  9: 'h3_9',
  11: 'h3_11',
});

const MAX_BBOX_SPAN_DEGREES = 2;
const MAX_BBOX_AREA_DEGREES = 2;
const MAX_ZOOM = 20;
const MAX_VIEWPORT_CELLS = 250;
const MAX_VIEWPORT_SCAN_CELLS = MAX_VIEWPORT_CELLS * 4;
const MAX_NEARBY_CELLS = 50;
const MAX_NEARBY_RADIUS_M = 1000;
const NEARBY_CONTEXT_CONTRACT_VERSION = 'bss.cybermap.nearby.v1';
const MAX_CELL_OBSERVATION_LINKS = 100;
const MAX_ENTITY_OBSERVATION_LINKS = 100;
const MAX_SOURCE_ROWS = 100;
const H3ISH_CELL = /^gh(7|9|11):[0-9bcdefghjkmnpqrstuvwxyz]{7,11}$/i;
const UUIDISH = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_RESPONSE_KEYS = new Set([
  'raw-frame',
  'raw-frames',
  'raw_frame',
  'raw_frames',
  'raw-image',
  'raw-images',
  'raw_image',
  'raw_images',
  'raw-pii',
  'raw_pii',
  'raw-payload-ref',
  'raw_payload_ref',
  'operator-approved-raw-ref',
  'operator_approved_raw_ref',
  'face-image',
  'face-images',
  'face_image',
  'face_images',
  'license-plate-image',
  'license-plate-images',
  'license_plate_image',
  'license_plate_images',
  'license-plate',
  'license_plate',
  'license-plates',
  'license_plates',
  'ssid',
  'bssid',
  'mac',
  'mac-address',
  'mac_address',
  'email',
  'email-address',
  'email_address',
  'phone',
  'phone-number',
  'phone_number',
  'pii',
]);

function errorResult(statusCode, code, message) {
  return {
    handled: true,
    statusCode,
    body: {
      ok: false,
      error: { code, message },
    },
  };
}

function okResult(body, statusCode = 200) {
  return {
    handled: true,
    statusCode,
    body: {
      ok: true,
      ...body,
    },
  };
}

function parseJsonValue(value, fallback = null) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value === 'string') {
    try {
      return JSON.parse(value);
    } catch {
      return fallback;
    }
  }
  return value;
}

function isoString(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
}

function normalizeUnsafeKey(key) {
  return String(key || '')
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
}

function sanitizeResponseJson(value, depth = 0) {
  if (value === null || value === undefined) return value;
  if (depth > 8) return null;
  if (Array.isArray(value)) return value.map((item) => sanitizeResponseJson(item, depth + 1));
  if (value instanceof Date) return value.toISOString();
  if (typeof value !== 'object') return value;

  const sanitized = {};
  for (const [key, child] of Object.entries(value)) {
    if (UNSAFE_RESPONSE_KEYS.has(normalizeUnsafeKey(key))) continue;
    sanitized[key] = sanitizeResponseJson(child, depth + 1);
  }
  return sanitized;
}

function sourceClassRank(sourceClass) {
  const index = SOURCE_CLASS_ORDER.indexOf(sourceClass);
  return index === -1 ? SOURCE_CLASS_ORDER.length : index;
}

function sortedSourceClasses(values = []) {
  return [...new Set((Array.isArray(values) ? values : [values])
    .map((value) => String(value || '').trim().toLowerCase())
    .filter(Boolean))]
    .sort((left, right) => sourceClassRank(left) - sourceClassRank(right) || left.localeCompare(right));
}

function identityScopes(identity) {
  return (Array.isArray(identity?.scopes) ? identity.scopes : [])
    .map((scope) => String(scope || '').trim().toLowerCase())
    .filter(Boolean);
}

function identityIsOperator(identity) {
  if (identity?.clientType === 'operator_admin') return true;
  return identityScopes(identity).some((scope) => OPERATOR_SCOPES.has(scope));
}

function authorizedScopeRefsFromIdentity(identity) {
  return identityScopes(identity).flatMap((scope) => {
    if (scope.startsWith('authorized-scope:')) return [scope.slice('authorized-scope:'.length)];
    if (scope.startsWith('authorized_scope:')) return [scope.slice('authorized_scope:'.length)];
    return [];
  }).filter(Boolean);
}

function allowedSourceClassesForIdentity(identity) {
  if (identityIsOperator(identity)) return [...SOURCE_CLASSES];
  return sortedSourceClasses(identity?.sourceClasses || []);
}

function ensureSourceAuthority(identity) {
  const allowed = allowedSourceClassesForIdentity(identity);
  if (!allowed.length) {
    return errorResult(403, 'source_scope_required', 'Read token has no registered Cybermap source class authority.');
  }
  return { ok: true, allowed };
}

function sourceClassesAllowed(identity, requested) {
  const authority = ensureSourceAuthority(identity);
  if (!authority.ok) return authority;
  if (identityIsOperator(identity)) return { ok: true, allowed: sortedSourceClasses(requested.length ? requested : authority.allowed) };
  const allowed = new Set(authority.allowed);
  const unauthorized = requested.filter((sourceClass) => !allowed.has(sourceClass));
  if (unauthorized.length) {
    return errorResult(403, 'source_scope_forbidden', 'Requested source class is not registered for this token.');
  }
  return { ok: true, allowed: sortedSourceClasses(requested.length ? requested : authority.allowed) };
}

export function zoomToCybermapResolution(zoom) {
  const parsed = Number.parseInt(String(zoom ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > MAX_ZOOM) {
    throw new Error(`zoom must be an integer from 0 to ${MAX_ZOOM}`);
  }
  if (parsed <= 8) return 7;
  if (parsed <= 14) return 9;
  return 11;
}

export function parseCybermapBbox(value, { required = true } = {}) {
  if (!value) {
    if (required) throw Object.assign(new Error('bbox query parameter is required'), { code: 'bbox_required' });
    return null;
  }
  const rawParts = String(value).split(',').map((part) => part.trim());
  const parts = rawParts.map((part) => Number(part));
  if (rawParts.length !== 4 || rawParts.some((part) => part === '') || parts.some((part) => !Number.isFinite(part))) {
    throw Object.assign(new Error('bbox must be west,south,east,north numeric coordinates'), { code: 'bbox_invalid' });
  }
  const [west, south, east, north] = parts;
  if (west < -180 || west > 180 || east < -180 || east > 180 || south < -90 || south > 90 || north < -90 || north > 90) {
    throw Object.assign(new Error('bbox coordinates are outside WGS84 bounds'), { code: 'bbox_invalid' });
  }
  if (east <= west || north <= south) {
    throw Object.assign(new Error('bbox must not cross the antimeridian and must have positive width and height'), { code: 'bbox_invalid' });
  }
  const lonSpan = east - west;
  const latSpan = north - south;
  if (lonSpan > MAX_BBOX_SPAN_DEGREES || latSpan > MAX_BBOX_SPAN_DEGREES || lonSpan * latSpan > MAX_BBOX_AREA_DEGREES) {
    throw Object.assign(new Error('bbox exceeds bounded Cybermap viewport limits'), { code: 'bbox_too_large' });
  }
  return { west, south, east, north, lonSpan, latSpan };
}

function parseBoundedNumber(value, fieldName, { min, max, required = true, fallback = null } = {}) {
  if ((value === undefined || value === null || value === '') && !required) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) {
    throw Object.assign(new Error(`${fieldName} must be between ${min} and ${max}`), { code: `${fieldName}_invalid` });
  }
  return number;
}

function parseNearbyQuery(searchParams) {
  const lat = parseBoundedNumber(searchParams.get('lat'), 'lat', { min: -90, max: 90 });
  const lon = parseBoundedNumber(searchParams.get('lon'), 'lon', { min: -180, max: 180 });
  const radiusM = Math.round(parseBoundedNumber(searchParams.get('radius_m') ?? searchParams.get('radiusM'), 'radius_m', {
    min: 1,
    max: MAX_NEARBY_RADIUS_M,
    required: false,
    fallback: 250,
  }));
  const headingDeg = parseBoundedNumber(searchParams.get('heading_deg') ?? searchParams.get('headingDeg'), 'heading_deg', {
    min: 0,
    max: 360,
    required: false,
    fallback: null,
  });
  const mapZoom = searchParams.get('zoom') === null ? null : parseBoundedNumber(searchParams.get('zoom'), 'zoom', {
    min: 0,
    max: MAX_ZOOM,
  });
  const resolution = zoomToCybermapResolution(mapZoom ?? 15);
  const layers = parseLayerFilter(searchParams.get('layers'));
  const requestedClasses = parseSourceClassFilter(searchParams);
  return { lat, lon, radiusM, headingDeg, mapZoom, resolution, layers, requestedClasses };
}

function parseLayerFilter(value) {
  if (!value) return null;
  const layers = [...new Set(String(value).split(',').map((item) => item.trim()).filter(Boolean))];
  const invalid = layers.filter((layer) => !ALLOWED_LAYERS.has(layer));
  if (invalid.length) throw Object.assign(new Error(`unsupported layer filter: ${invalid.join(', ')}`), { code: 'layer_invalid' });
  return layers;
}

function parseSourceClassFilter(searchParams) {
  const raw = searchParams.get('class') || searchParams.get('source_class') || searchParams.get('sourceClass') || '';
  if (!raw) return [];
  const sourceClasses = [...new Set(raw.split(',').map((item) => item.trim().toLowerCase()).filter(Boolean))];
  const invalid = sourceClasses.filter((sourceClass) => !SOURCE_CLASSES.includes(sourceClass));
  if (invalid.length) throw Object.assign(new Error(`unsupported source class: ${invalid.join(', ')}`), { code: 'source_class_invalid' });
  return sortedSourceClasses(sourceClasses);
}

function parseCellId(h3Cell) {
  const normalized = String(h3Cell || '').trim().toLowerCase();
  const match = normalized.match(H3ISH_CELL);
  if (!match) throw Object.assign(new Error('h3Cell must be an app-computed gh7/gh9/gh11 cell id'), { code: 'cell_invalid' });
  const resolution = Number(match[1]);
  const geohash = normalized.split(':')[1] || '';
  if (geohash.length !== resolution) {
    throw Object.assign(new Error('h3Cell geohash precision must match its gh resolution prefix'), { code: 'cell_invalid' });
  }
  return { h3Cell: normalized, resolution, field: CELL_FIELD_BY_RESOLUTION[resolution] };
}

function parseEntityId(value) {
  const id = String(value || '').trim().toLowerCase();
  if (!UUIDISH.test(id)) throw Object.assign(new Error('entity id must be a UUID'), { code: 'entity_id_invalid' });
  return id;
}

async function withReadPool({ env, dbPoolFactory }, operation) {
  const config = loadDatabaseConfig(env);
  if (!config.ok) return errorResult(503, 'db_not_configured', 'Cybermap database is not configured.');
  let pool;
  try {
    pool = await (dbPoolFactory || createDefaultPool)(config.pool);
    return await operation(pool);
  } catch (error) {
    if (error?.name === 'AssertionError') throw error;
    return errorResult(503, 'db_unavailable', 'Cybermap database read failed.');
  } finally {
    if (pool?.end) await pool.end();
  }
}

function dbCellFromRow(row) {
  return sanitizeResponseJson({
    h3_cell: row.h3_cell,
    resolution: Number(row.resolution),
    geom: parseJsonValue(row.geom, null),
    updated_at: isoString(row.updated_at),
    first_seen_at: isoString(row.first_seen_at),
    last_seen_at: isoString(row.last_seen_at),
    source_classes: sortedSourceClasses(row.source_classes || []),
    observation_count: Number(row.observation_count || 0),
    entity_count: Number(row.entity_count || 0),
    layers: parseJsonValue(row.layers, {}),
    counts: parseJsonValue(row.counts, {}),
    freshness: parseJsonValue(row.freshness, {}),
    caveats: parseJsonValue(row.caveats, []),
    salience: Number(row.salience || 0),
    confidence: row.confidence === undefined || row.confidence === null ? null : Number(row.confidence),
    provenance: parseJsonValue(row.provenance, {}),
  });
}

function recomputeLayerFilteredCell(cell, forceFilteredProjection = false) {
  const previousObservationCount = Number(cell.observation_count || 0);
  const previousSourceClasses = sortedSourceClasses(cell.source_classes || []);
  const layers = Object.values(cell.layers || {});
  const sourceClasses = sortedSourceClasses(layers.flatMap((layer) => layer.source_classes || []));
  const observationCount = layers.reduce((sum, layer) => sum + Number(layer.observation_count || 0), 0);
  const entityKeys = new Set();
  const firstSeenValues = [];
  const lastSeenValues = [];
  const lastIngestedValues = [];
  const counts = {
    observations_by_kind: {},
    observations_by_source_class: {},
    entities_by_kind: {},
  };

  for (const layer of layers) {
    const firstSeen = isoString(layer.first_seen_at);
    const lastSeen = isoString(layer.last_seen_at);
    const lastIngested = isoString(layer.last_ingested_at);
    if (firstSeen) firstSeenValues.push(firstSeen);
    if (lastSeen) lastSeenValues.push(lastSeen);
    if (lastIngested) lastIngestedValues.push(lastIngested);
    for (const [kind, count] of Object.entries(layer.observations_by_kind || {})) {
      counts.observations_by_kind[kind] = (counts.observations_by_kind[kind] || 0) + Number(count || 0);
    }
    for (const [sourceClass, count] of Object.entries(layer.source_class_counts || {})) {
      if (!sourceClasses.includes(sourceClass)) continue;
      counts.observations_by_source_class[sourceClass] = (counts.observations_by_source_class[sourceClass] || 0) + Number(count || 0);
    }
    for (const entity of layer.entities || []) {
      const key = entity.stable_key || entity.id;
      if (!key || entityKeys.has(key)) continue;
      entityKeys.add(key);
      const kind = entity.entity_kind || entity.entityKind || 'unknown';
      counts.entities_by_kind[kind] = (counts.entities_by_kind[kind] || 0) + 1;
    }
  }

  const filteredProjection = forceFilteredProjection || observationCount !== previousObservationCount
    || sourceClasses.join('|') !== previousSourceClasses.join('|');
  const firstSeenAt = firstSeenValues.sort()[0] || null;
  const lastSeenAt = lastSeenValues.sort().at(-1) || null;
  const lastIngestedAt = lastIngestedValues.sort().at(-1) || null;
  const visibleSourceClassSet = new Set(sourceClasses);
  const redactedCaveats = (Array.isArray(cell.caveats) ? cell.caveats : []).flatMap((caveat) => {
    const caveatSourceClasses = sortedSourceClasses(caveat?.source_classes || []);
    if (!caveatSourceClasses.length) return [{ ...caveat, source_classes: [] }];
    const visible = caveatSourceClasses.filter((sourceClass) => visibleSourceClassSet.has(sourceClass));
    if (!visible.length) return [];
    return [{ ...caveat, source_classes: visible }];
  });
  const baseProvenance = cell.provenance && typeof cell.provenance === 'object' ? cell.provenance : {};

  cell.source_classes = sourceClasses;
  cell.observation_count = observationCount;
  cell.entity_count = entityKeys.size;
  cell.first_seen_at = firstSeenAt;
  cell.last_seen_at = lastSeenAt;
  cell.updated_at = filteredProjection ? (lastIngestedAt || lastSeenAt) : cell.updated_at;
  cell.counts = counts;
  cell.caveats = redactedCaveats;
  cell.freshness = filteredProjection ? {
    last_observed_at: lastSeenAt,
    last_ingested_at: lastIngestedAt,
    source_classes: sourceClasses,
  } : cell.freshness;
  cell.provenance = {
    ...(baseProvenance.materialized_by ? { materialized_by: baseProvenance.materialized_by } : {}),
    app_computed_cell: baseProvenance.app_computed_cell ?? true,
    source_row_count: observationCount,
    ...(filteredProjection ? { projection_filtered: true } : {}),
  };
  cell.salience = filteredProjection ? null : cell.salience;
  cell.confidence = filteredProjection ? null : cell.confidence;
  return cell;
}

function applyRequestedLayerFilter(cell, layers) {
  if (!layers) return cell;
  const requested = new Set(layers);
  cell.layers = Object.fromEntries(Object.entries(cell.layers || {}).filter(([layer]) => requested.has(layer)));
  cell.caveats = [...(Array.isArray(cell.caveats) ? cell.caveats : []), {
    code: 'layers_filtered',
    severity: 'info',
    source_classes: cell.source_classes || [],
    message: 'Response limited to caller-visible requested layers.',
  }];
  return recomputeLayerFilteredCell(cell, true);
}

function sourceClassesForLayer(layer) {
  return sortedSourceClasses([
    ...(Array.isArray(layer?.source_classes) ? layer.source_classes : []),
    ...Object.keys(layer?.source_class_counts || {}),
    ...(Array.isArray(layer?.entities) ? layer.entities.flatMap((entity) => entity.source_classes || [entity.source_class]) : []),
  ]);
}

function cellLayerNames(cell) {
  return Object.keys(cell?.layers || {}).sort();
}

function cellProjectionChanged(original, projected) {
  if (Number(original?.observation_count || 0) !== Number(projected?.observation_count || 0)) return true;
  if (Number(original?.entity_count || 0) !== Number(projected?.entity_count || 0)) return true;
  if (sortedSourceClasses(original?.source_classes || []).join('|') !== sortedSourceClasses(projected?.source_classes || []).join('|')) return true;
  if (cellLayerNames(original).join('|') !== cellLayerNames(projected).join('|')) return true;
  return false;
}

function applySourceClassLayerAuthority(cell, identity) {
  if (identityIsOperator(identity)) return cell;
  const allowed = new Set(allowedSourceClassesForIdentity(identity));
  const filtered = [];
  for (const [layerName, layer] of Object.entries(cell.layers || {})) {
    if (layerName === 'exposure_enrichment') continue;
    const layerSourceClasses = sourceClassesForLayer(layer);
    if (layerSourceClasses.some((sourceClass) => !allowed.has(sourceClass))) {
      delete cell.layers[layerName];
      filtered.push(layerName);
    }
  }
  if (!filtered.length) return cell;
  cell.caveats = [...(Array.isArray(cell.caveats) ? cell.caveats : []), {
    code: 'source_class_layer_filtered',
    severity: 'info',
    source_classes: [],
    message: 'Materialized layers were omitted because they require source-class authority not present on this token.',
  }];
  return recomputeLayerFilteredCell(cell, true);
}

function projectCell(row, identity, layers = null) {
  const rawCell = dbCellFromRow(row);
  const projected = projectCybermapCellForScope(rawCell, {
    callerScopes: identity?.scopes || [],
    authorizedScopeRefs: authorizedScopeRefsFromIdentity(identity),
    sourceClasses: allowedSourceClassesForIdentity(identity),
    includeRestricted: identityIsOperator(identity),
  });
  const sourceScoped = applySourceClassLayerAuthority(sanitizeResponseJson(projected), identity);
  const visibleProjected = cellProjectionChanged(rawCell, sourceScoped)
    ? recomputeLayerFilteredCell(sourceScoped, true)
    : sourceScoped;
  return applyRequestedLayerFilter(visibleProjected, layers);
}

function visibleCellUpdatedAt(cell) {
  return isoString(cell.updated_at)
    || isoString(cell.freshness?.last_ingested_at)
    || isoString(cell.freshness?.last_observed_at)
    || isoString(cell.last_seen_at)
    || isoString(cell.first_seen_at);
}

function visibleCellUpdatedTime(cell) {
  const value = visibleCellUpdatedAt(cell);
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function compareViewportCells(left, right) {
  const leftSalience = Number(left.salience ?? 0);
  const rightSalience = Number(right.salience ?? 0);
  if (rightSalience !== leftSalience) return rightSalience - leftSalience;
  const timeDelta = visibleCellUpdatedTime(right) - visibleCellUpdatedTime(left);
  if (timeDelta !== 0) return timeDelta;
  return String(left.h3_cell || '').localeCompare(String(right.h3_cell || ''));
}

function applyVisibleSinceFilter(cell, since) {
  if (!since) return true;
  return visibleCellUpdatedTime(cell) >= new Date(since).getTime();
}

function viewportResponseLayers(cells, requestedLayers) {
  const visible = new Set(cells.flatMap((cell) => Object.keys(cell.layers || {})));
  const ordered = requestedLayers || [...ALLOWED_LAYERS];
  return ordered.filter((layer) => visible.has(layer));
}

function observationLinkFromRow(row) {
  return sanitizeResponseJson({
    id: row.id || row.observation_id,
    observation_id: row.observation_id || row.id,
    relationship: row.relationship || undefined,
    kind: row.kind,
    source_id: row.source_id,
    source_class: row.source_class,
    observed_at: isoString(row.observed_at),
    confidence: row.confidence === undefined || row.confidence === null ? null : Number(row.confidence),
    provenance: parseJsonValue(row.provenance, {}),
  });
}

function entityFromRow(row) {
  return sanitizeResponseJson({
    id: row.id,
    entity_kind: row.entity_kind,
    stable_key: row.stable_key,
    display_name: row.display_name,
    source_class: row.source_class,
    first_seen_at: isoString(row.first_seen_at),
    last_seen_at: isoString(row.last_seen_at),
    centroid: parseJsonValue(row.centroid, null),
    h3_7: row.h3_7,
    h3_9: row.h3_9,
    h3_11: row.h3_11,
    confidence: row.confidence === undefined || row.confidence === null ? null : Number(row.confidence),
    labels: Array.isArray(row.labels) ? row.labels : [],
    properties: parseJsonValue(row.properties, {}),
    provenance: parseJsonValue(row.provenance, {}),
    freshness: {
      first_seen_at: isoString(row.first_seen_at),
      last_seen_at: isoString(row.last_seen_at),
      updated_at: isoString(row.updated_at),
    },
    caveats: [{
      code: RESTRICTED_SOURCE_CLASSES.has(row.source_class) ? 'restricted_entity_scope_limited' : 'entity_summary_only',
      severity: RESTRICTED_SOURCE_CLASSES.has(row.source_class) ? 'warning' : 'info',
      source_classes: [row.source_class].filter(Boolean),
      message: 'Entity read response returns summaries and observation links only; raw evidence payloads are omitted.',
    }],
  });
}

function sourceFromRow(row, now = new Date()) {
  const lastChecked = isoString(row.last_checked_at);
  const ttl = Number(row.cache_ttl_seconds || 0);
  const stale = lastChecked ? (now.getTime() - new Date(lastChecked).getTime()) > ttl * 1000 : true;
  const caveats = [];
  if (GREEN_SOURCE_CLASSES.has(row.source_class) && row.allowed_preload) {
    caveats.push({
      code: 'green_preload_allowed',
      severity: 'info',
      source_classes: [row.source_class],
      message: 'Green public/owned/authorized source may be used for preload subject to terms and cache TTL.',
    });
  }
  if (RESTRICTED_SOURCE_CLASSES.has(row.source_class)) {
    caveats.push({
      code: 'restricted_source_scope_limited',
      severity: 'warning',
      source_classes: [row.source_class],
      message: 'Restricted source catalog entry is visible only under matching caller authority.',
    });
  }

  return sanitizeResponseJson({
    id: row.id,
    source_class: row.source_class,
    source_key: row.source_key,
    name: row.name,
    provider: row.provider,
    feed_url: row.feed_url || row.url,
    terms_url: row.terms_url,
    allowed_preload: row.allowed_preload === true,
    cache_ttl_seconds: ttl,
    freshness: {
      last_checked_at: lastChecked,
      cache_ttl_seconds: ttl,
      stale,
    },
    provenance: parseJsonValue(row.provenance, {}),
    caveats,
  });
}

async function handleViewport({ searchParams, identity, env, dbPoolFactory }) {
  let bbox;
  let resolution;
  let layers;
  try {
    bbox = parseCybermapBbox(searchParams.get('bbox'));
    resolution = zoomToCybermapResolution(searchParams.get('zoom'));
    layers = parseLayerFilter(searchParams.get('layers'));
    if (searchParams.get('since') && Number.isNaN(new Date(searchParams.get('since')).getTime())) {
      return errorResult(400, 'since_invalid', 'since must be an ISO timestamp.');
    }
  } catch (error) {
    return errorResult(400, error.code || 'viewport_query_invalid', error.message);
  }

  const authority = ensureSourceAuthority(identity);
  if (!authority.ok) return authority;
  const sourceClasses = authority.allowed;
  const since = searchParams.get('since') ? new Date(searchParams.get('since')).toISOString() : null;

  return withReadPool({ env, dbPoolFactory }, async (pool) => {
    const result = await pool.query(`
      select
        h3_cell,
        resolution,
        ST_AsGeoJSON(geom)::json as geom,
        updated_at,
        first_seen_at,
        last_seen_at,
        source_classes,
        observation_count,
        entity_count,
        layers,
        counts,
        freshness,
        caveats,
        salience,
        provenance
      from cybermap_cells
      where resolution = $1
        and geom && ST_MakeEnvelope($2, $3, $4, $5, 4326)
        and ST_Intersects(geom, ST_MakeEnvelope($2, $3, $4, $5, 4326))
        and source_classes && $6::source_class[]
      order by h3_cell asc
      limit $7
    `, [
      resolution,
      bbox.west,
      bbox.south,
      bbox.east,
      bbox.north,
      sourceClasses,
      MAX_VIEWPORT_SCAN_CELLS + 1,
    ]);

    const candidateLimitReached = result.rows.length > MAX_VIEWPORT_SCAN_CELLS;
    const visibleCells = result.rows
      .slice(0, MAX_VIEWPORT_SCAN_CELLS)
      .map((row) => projectCell(row, identity, layers))
      .filter((cell) => cell.observation_count > 0)
      .filter((cell) => applyVisibleSinceFilter(cell, since))
      .sort(compareViewportCells);
    const limitReached = visibleCells.length > MAX_VIEWPORT_CELLS;
    const cells = visibleCells.slice(0, MAX_VIEWPORT_CELLS);
    const caveats = [{
      code: 'bounded_viewport',
      severity: 'info',
      source_classes: sourceClasses,
      message: `Viewport is bounded to ${MAX_VIEWPORT_CELLS} materialized cells and app-computed gh${resolution} resolution.`,
    }];
    if (limitReached) {
      caveats.push({
        code: 'viewport_cell_limit_reached',
        severity: 'warning',
        source_classes: sourceClasses,
        message: 'Viewport response was truncated to the maximum bounded cell count after caller-visible projection.',
      });
    }
    if (candidateLimitReached) {
      caveats.push({
        code: 'viewport_candidate_scan_limit_reached',
        severity: 'warning',
        source_classes: sourceClasses,
        message: 'Viewport candidate scan was bounded before projection; narrow the bbox or increase zoom for complete coverage.',
      });
    }
    return okResult({
      resolution,
      bbox,
      layers: viewportResponseLayers(cells, layers),
      source_classes: sourceClasses,
      cells,
      caveats,
      limit_reached: limitReached || candidateLimitReached,
    });
  });
}

async function handleNearby({ searchParams, identity, env, dbPoolFactory }) {
  let query;
  try {
    query = parseNearbyQuery(searchParams);
  } catch (error) {
    return errorResult(400, error.code || 'nearby_query_invalid', error.message);
  }
  const classDecision = sourceClassesAllowed(identity, query.requestedClasses);
  if (!classDecision.ok) return classDecision;
  const sourceClasses = classDecision.allowed;

  return withReadPool({ env, dbPoolFactory }, async (pool) => {
    const result = await pool.query(`
      select
        h3_cell,
        resolution,
        ST_AsGeoJSON(geom)::json as geom,
        updated_at,
        first_seen_at,
        last_seen_at,
        source_classes,
        observation_count,
        entity_count,
        layers,
        counts,
        freshness,
        caveats,
        salience,
        provenance
      from cybermap_cells
      where ST_DWithin(
          geom::geography,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography,
          $3
        )
        and resolution = $4
        and source_classes && $5::source_class[]
      order by ST_Distance(
          geom::geography,
          ST_SetSRID(ST_MakePoint($2, $1), 4326)::geography
        ) asc,
        h3_cell asc
      limit $6
    `, [
      query.lat,
      query.lon,
      query.radiusM,
      query.resolution,
      sourceClasses,
      MAX_NEARBY_CELLS + 1,
    ]);

    const candidateLimitReached = result.rows.length > MAX_NEARBY_CELLS;
    const cells = result.rows
      .slice(0, MAX_NEARBY_CELLS)
      .map((row) => projectCell(row, identity, query.layers))
      .filter((cell) => cell.observation_count > 0);
    return okResult({
      contract_version: NEARBY_CONTEXT_CONTRACT_VERSION,
      context: {
        lat: query.lat,
        lon: query.lon,
        radius_m: query.radiusM,
        heading_deg: query.headingDeg,
        map_zoom: query.mapZoom,
        resolution: query.resolution,
        source_classes: sourceClasses,
      },
      layers: viewportResponseLayers(cells, query.layers),
      source_classes: sourceClasses,
      cells,
      caveats: [{
        code: 'bounded_nearby_context',
        severity: 'info',
        source_classes: sourceClasses,
        message: `Nearby context is bounded to ${MAX_NEARBY_CELLS} materialized cells within ${query.radiusM} meters and omits raw frames/PII.`,
      }],
      limit_reached: candidateLimitReached,
    });
  });
}

async function handleCellDetail({ h3Cell, identity, env, dbPoolFactory }) {
  let parsed;
  try {
    parsed = parseCellId(h3Cell);
  } catch (error) {
    return errorResult(400, error.code || 'cell_invalid', error.message);
  }
  const authority = ensureSourceAuthority(identity);
  if (!authority.ok) return authority;
  const sourceClasses = authority.allowed;

  return withReadPool({ env, dbPoolFactory }, async (pool) => {
    const cellResult = await pool.query(`
      select
        h3_cell,
        resolution,
        ST_AsGeoJSON(geom)::json as geom,
        updated_at,
        first_seen_at,
        last_seen_at,
        source_classes,
        observation_count,
        entity_count,
        layers,
        counts,
        freshness,
        caveats,
        salience,
        provenance
      from cybermap_cells
      where h3_cell = $1
        and resolution = $2
        and source_classes && $3::source_class[]
      limit 1
    `, [parsed.h3Cell, parsed.resolution, sourceClasses]);
    if (!cellResult.rows.length) return errorResult(404, 'cell_not_found', 'Cybermap cell was not found for caller scope.');

    const observationResult = await pool.query(`
      select
        id,
        kind,
        source_id,
        source_class,
        observed_at,
        confidence,
        provenance
      from observations
      where ${parsed.field} = $1
        and source_class = any($2::source_class[])
      order by observed_at desc, id asc
      limit $3
    `, [parsed.h3Cell, sourceClasses, MAX_CELL_OBSERVATION_LINKS]);

    return okResult({
      cell: projectCell(cellResult.rows[0], identity),
      observation_links: observationResult.rows.map(observationLinkFromRow),
      caveats: [{
        code: 'cell_drilldown_summary_only',
        severity: 'info',
        source_classes: sourceClasses,
        message: 'Cell drilldown returns provenance and observation links only; raw frames and raw PII are omitted.',
      }],
    });
  });
}

async function handleEntityDetail({ entityId, identity, env, dbPoolFactory }) {
  let id;
  try {
    id = parseEntityId(entityId);
  } catch (error) {
    return errorResult(400, error.code || 'entity_id_invalid', error.message);
  }
  const authority = ensureSourceAuthority(identity);
  if (!authority.ok) return authority;
  const sourceClasses = authority.allowed;

  return withReadPool({ env, dbPoolFactory }, async (pool) => {
    const entityResult = await pool.query(`
      select
        id,
        entity_kind,
        stable_key,
        display_name,
        source_class,
        first_seen_at,
        last_seen_at,
        ST_AsGeoJSON(centroid)::json as centroid,
        h3_7,
        h3_9,
        h3_11,
        confidence,
        labels,
        properties,
        provenance,
        updated_at
      from cyber_entities
      where id = $1
        and source_class = any($2::source_class[])
      limit 1
    `, [id, sourceClasses]);
    if (!entityResult.rows.length) return errorResult(404, 'entity_not_found', 'Cybermap entity was not found for caller scope.');

    const linkResult = await pool.query(`
      select
        eo.observation_id,
        eo.relationship,
        eo.source_class,
        o.kind,
        o.observed_at,
        eo.confidence,
        eo.provenance
      from entity_observations eo
      join observations o on o.id = eo.observation_id
      where eo.entity_id = $1
        and eo.source_class = any($2::source_class[])
        and o.source_class = any($2::source_class[])
      order by eo.last_seen_at desc, eo.observation_id asc
      limit $3
    `, [id, sourceClasses, MAX_ENTITY_OBSERVATION_LINKS]);

    return okResult({
      entity: entityFromRow(entityResult.rows[0]),
      observation_links: linkResult.rows.map(observationLinkFromRow),
      caveats: [{
        code: 'entity_drilldown_summary_only',
        severity: 'info',
        source_classes: sourceClasses,
        message: 'Entity drilldown omits raw observation payloads and returns bounded links only.',
      }],
    });
  });
}

async function handleSources({ searchParams, identity, env, dbPoolFactory, now = new Date() }) {
  let bbox;
  let requestedClasses;
  try {
    bbox = parseCybermapBbox(searchParams.get('bbox'), { required: false });
    requestedClasses = parseSourceClassFilter(searchParams);
  } catch (error) {
    return errorResult(400, error.code || 'source_query_invalid', error.message);
  }
  const classDecision = sourceClassesAllowed(identity, requestedClasses);
  if (!classDecision.ok) return classDecision;
  const sourceClasses = classDecision.allowed;

  return withReadPool({ env, dbPoolFactory }, async (pool) => {
    const params = [sourceClasses];
    const bboxClause = bbox ? `
        and (
          (footprint is not null and ST_Intersects(footprint, ST_MakeEnvelope($2, $3, $4, $5, 4326)))
          or (geom is not null and ST_Intersects(geom, ST_MakeEnvelope($2, $3, $4, $5, 4326)))
        )
    ` : '';
    if (bbox) params.push(bbox.west, bbox.south, bbox.east, bbox.north);
    params.push(MAX_SOURCE_ROWS);
    const limitParam = params.length;
    const sourceResult = await pool.query(`
      select
        id,
        source_class,
        source_key,
        name,
        provider,
        feed_url,
        terms_url,
        allowed_preload,
        cache_ttl_seconds,
        last_checked_at,
        provenance
      from source_catalog
      where enabled = true
        and source_class = any($1::source_class[])
        ${bboxClause}
      order by last_checked_at desc nulls last, name asc, id asc
      limit $${limitParam}
    `, params);

    return okResult({
      source_classes: sourceClasses,
      bbox,
      sources: sourceResult.rows.map((row) => sourceFromRow(row, now)),
      caveats: [{
        code: 'bounded_source_catalog',
        severity: 'info',
        source_classes: sourceClasses,
        message: `Source catalog responses are bounded to ${MAX_SOURCE_ROWS} enabled entries and fixed class/bbox filters.`,
      }],
    });
  });
}

export async function handleCybermapReadRequest({ method = 'GET', pathname = '/', searchParams, identity, env, dbPoolFactory, now = new Date() } = {}) {
  if (String(method).toUpperCase() !== 'GET') return null;
  if (pathname === '/api/v1/cybermap/viewport') {
    return handleViewport({ searchParams, identity, env, dbPoolFactory, now });
  }
  if (pathname === '/api/v1/cybermap/nearby') {
    return handleNearby({ searchParams, identity, env, dbPoolFactory, now });
  }
  const cellMatch = pathname.match(/^\/api\/v1\/cybermap\/cells\/([^/]+)$/);
  if (cellMatch) {
    return handleCellDetail({ h3Cell: decodeURIComponent(cellMatch[1]), identity, env, dbPoolFactory, now });
  }
  const entityMatch = pathname.match(/^\/api\/v1\/entities\/([^/]+)$/);
  if (entityMatch) {
    return handleEntityDetail({ entityId: decodeURIComponent(entityMatch[1]), identity, env, dbPoolFactory, now });
  }
  if (pathname === '/api/v1/sources') {
    return handleSources({ searchParams, identity, env, dbPoolFactory, now });
  }
  return null;
}

export const cybermapReadDefaults = Object.freeze({
  MAX_BBOX_SPAN_DEGREES,
  MAX_BBOX_AREA_DEGREES,
  MAX_ZOOM,
  MAX_VIEWPORT_CELLS,
  MAX_NEARBY_CELLS,
  MAX_NEARBY_RADIUS_M,
  MAX_CELL_OBSERVATION_LINKS,
  MAX_ENTITY_OBSERVATION_LINKS,
  MAX_SOURCE_ROWS,
});
