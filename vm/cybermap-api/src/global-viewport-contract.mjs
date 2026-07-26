const SCHEMA_VERSION = 'bss.godeye.global_viewport.v1';
const MAX_CELLS = 1_000;
const MAX_LAYER_IDS = 12;
const H3_RESOLUTIONS = new Set([5, 7, 9, 11]);
const SOURCE_CLASSES = new Set(['green_public', 'green_owned', 'green_authorized']);
const SOURCE_HEALTH_STATES = new Set(['fresh', 'stale', 'very_stale', 'error', 'disabled', 'empty']);
const REQUEST_FIELDS = new Set(['schema_version', 'bbox', 'zoom', 'layer_ids', 'since', 'max_cells']);
const RESPONSE_FIELDS = new Set([
  'ok',
  'schema_version',
  'mode',
  'generated_at',
  'bbox',
  'requested_zoom',
  'selected_resolution',
  'aggregation_applied',
  'cells',
  'source_health',
  'intelligence_gaps',
]);
const BBOX_FIELDS = new Set(['west', 'south', 'east', 'north']);
const CELL_FIELDS = new Set([
  'h3_cell',
  'resolution',
  'centroid',
  'source_classes',
  'observation_count',
  'entity_count',
  'first_seen_at',
  'last_seen_at',
  'layers',
  'freshness',
  'caveats',
  'salience',
]);
const CENTROID_FIELDS = new Set(['lat', 'lon']);
const LAYER_AGGREGATE_FIELDS = new Set(['observation_count']);
const FRESHNESS_FIELDS = new Set(['state', 'age_seconds']);
const SOURCE_HEALTH_FIELDS = new Set([
  'layer_id',
  'display_name',
  'source_class',
  'health',
  'last_success_at',
  'next_retry_at',
  'terms_url',
  'attribution',
  'caveat_count',
]);
const RFC3339_UTC_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?Z$/;
const H3_CELL = /^[0-9a-f]{15}$/i;
const CONTROLLED_LABEL = /^[a-z0-9_]{1,64}$/;
const LAYER_ID = /^[a-z0-9][a-z0-9-]{0,63}$/;

export class GlobalViewportContractError extends Error {
  constructor(code, message = code, { statusCode = 400, path = '' } = {}) {
    super(message);
    this.name = 'GlobalViewportContractError';
    this.code = code;
    this.statusCode = statusCode;
    this.path = path;
  }
}

export function validateGlobalViewportRequest(input, options = {}) {
  const supportedLayerIds = resolveSupportedLayerIds(options);

  requireObject(input, '$');
  rejectUnknownFields(input, REQUEST_FIELDS, '$');
  requireExactString(input.schema_version, SCHEMA_VERSION, '$.schema_version');

  const bbox = validateBbox(input.bbox, '$.bbox');
  const zoom = requireInteger(input.zoom, '$.zoom', 0, 16);
  const layerIds = validateLayerIds(input.layer_ids, '$.layer_ids', supportedLayerIds);
  const maxCells = requireInteger(input.max_cells, '$.max_cells', 1, MAX_CELLS, 'viewport_too_large');
  const since = input.since === undefined ? undefined : requireTimestamp(input.since, '$.since');

  return deepFreeze({
    schema_version: SCHEMA_VERSION,
    bbox,
    zoom,
    layer_ids: layerIds,
    ...(since === undefined ? {} : { since }),
    max_cells: maxCells,
  });
}

export function validateGlobalViewportResponse(input, options = {}) {
  const supportedLayerIds = resolveSupportedLayerIds(options);

  requireObject(input, '$');
  rejectUnknownFields(input, RESPONSE_FIELDS, '$');
  if (input.ok !== true) invalid('$.ok', 'Global viewport responses must be successful aggregate responses.');
  requireExactString(input.schema_version, SCHEMA_VERSION, '$.schema_version');
  requireExactString(input.mode, 'global', '$.mode');

  const cells = validateCells(input.cells, supportedLayerIds);
  const sourceHealth = validateSourceHealth(input.source_health, supportedLayerIds);
  const intelligenceGaps = validateControlledLabels(input.intelligence_gaps, '$.intelligence_gaps');

  return deepFreeze({
    ok: true,
    schema_version: SCHEMA_VERSION,
    mode: 'global',
    generated_at: requireTimestamp(input.generated_at, '$.generated_at'),
    bbox: validateBbox(input.bbox, '$.bbox'),
    requested_zoom: requireInteger(input.requested_zoom, '$.requested_zoom', 0, 16),
    selected_resolution: requireResolution(input.selected_resolution, '$.selected_resolution'),
    aggregation_applied: requireBoolean(input.aggregation_applied, '$.aggregation_applied'),
    cells,
    source_health: sourceHealth,
    intelligence_gaps: intelligenceGaps,
  });
}

function resolveSupportedLayerIds({ supportedLayerIds } = {}) {
  if (!Array.isArray(supportedLayerIds) || supportedLayerIds.length === 0) {
    throw new TypeError('supportedLayerIds must be a non-empty array.');
  }

  const layerIds = new Set();
  for (const layerId of supportedLayerIds) {
    if (typeof layerId !== 'string' || !LAYER_ID.test(layerId)) {
      throw new TypeError('supportedLayerIds must contain controlled layer identifiers.');
    }
    layerIds.add(layerId);
  }
  return layerIds;
}

function validateBbox(input, path) {
  requireObject(input, path);
  rejectUnknownFields(input, BBOX_FIELDS, path);

  const west = requireFiniteNumber(input.west, `${path}.west`, -180, 180);
  const south = requireFiniteNumber(input.south, `${path}.south`, -85, 85);
  const east = requireFiniteNumber(input.east, `${path}.east`, -180, 180);
  const north = requireFiniteNumber(input.north, `${path}.north`, -85, 85);
  if (west >= east || south >= north) {
    invalid(path, 'Global viewport bounds must be ordered and cannot wrap the antimeridian.');
  }

  return { west, south, east, north };
}

function validateLayerIds(input, path, supportedLayerIds) {
  if (!Array.isArray(input) || input.length === 0 || input.length > MAX_LAYER_IDS) {
    invalid(path, `Select between one and ${MAX_LAYER_IDS} supported layers.`);
  }

  const layerIds = [];
  const seen = new Set();
  input.forEach((layerId, index) => {
    if (typeof layerId !== 'string' || !supportedLayerIds.has(layerId) || seen.has(layerId)) {
      invalid(`${path}[${index}]`, 'Layer identifiers must be unique supported values.');
    }
    seen.add(layerId);
    layerIds.push(layerId);
  });
  return layerIds;
}

function validateCells(input, supportedLayerIds) {
  if (!Array.isArray(input) || input.length > MAX_CELLS) {
    invalid('$.cells', `Responses can expose at most ${MAX_CELLS} aggregate cells.`);
  }

  const h3Cells = new Set();
  return input.map((cell, index) => {
    const path = `$.cells[${index}]`;
    requireObject(cell, path);
    rejectUnknownFields(cell, CELL_FIELDS, path);

    const h3Cell = requireH3Cell(cell.h3_cell, `${path}.h3_cell`);
    if (h3Cells.has(h3Cell)) invalid(`${path}.h3_cell`, 'Aggregate cells must be unique.');
    h3Cells.add(h3Cell);

    const firstSeenAt = requireTimestamp(cell.first_seen_at, `${path}.first_seen_at`);
    const lastSeenAt = requireTimestamp(cell.last_seen_at, `${path}.last_seen_at`);
    if (Date.parse(firstSeenAt) > Date.parse(lastSeenAt)) {
      invalid(path, 'Cell first_seen_at cannot be later than last_seen_at.');
    }

    return {
      h3_cell: h3Cell,
      resolution: requireResolution(cell.resolution, `${path}.resolution`),
      centroid: validateCentroid(cell.centroid, `${path}.centroid`),
      source_classes: validateSourceClasses(cell.source_classes, `${path}.source_classes`),
      observation_count: requireInteger(cell.observation_count, `${path}.observation_count`, 0, Number.MAX_SAFE_INTEGER),
      entity_count: requireInteger(cell.entity_count, `${path}.entity_count`, 0, Number.MAX_SAFE_INTEGER),
      first_seen_at: firstSeenAt,
      last_seen_at: lastSeenAt,
      layers: validateLayerAggregates(cell.layers, `${path}.layers`, supportedLayerIds),
      freshness: validateFreshness(cell.freshness, `${path}.freshness`, supportedLayerIds),
      caveats: validateControlledLabels(cell.caveats, `${path}.caveats`),
      salience: requireFiniteNumber(cell.salience, `${path}.salience`, 0, 1),
    };
  });
}

function validateCentroid(input, path) {
  requireObject(input, path);
  rejectUnknownFields(input, CENTROID_FIELDS, path);
  return {
    lat: requireFiniteNumber(input.lat, `${path}.lat`, -85, 85),
    lon: requireFiniteNumber(input.lon, `${path}.lon`, -180, 180),
  };
}

function validateSourceClasses(input, path) {
  if (!Array.isArray(input) || input.length === 0 || input.length > SOURCE_CLASSES.size) {
    invalid(path, 'At least one permitted source class is required.');
  }

  const classes = [];
  const seen = new Set();
  input.forEach((sourceClass, index) => {
    if (!SOURCE_CLASSES.has(sourceClass) || seen.has(sourceClass)) {
      invalid(`${path}[${index}]`, 'Source classes must be unique permitted aggregate classes.');
    }
    seen.add(sourceClass);
    classes.push(sourceClass);
  });
  return classes;
}

function validateLayerAggregates(input, path, supportedLayerIds) {
  requireObject(input, path);
  const layers = {};
  const layerIds = Object.keys(input);
  if (layerIds.length === 0 || layerIds.length > MAX_LAYER_IDS) {
    invalid(path, `Cells must contain between one and ${MAX_LAYER_IDS} aggregate layers.`);
  }

  for (const layerId of layerIds) {
    if (!supportedLayerIds.has(layerId)) invalid(`${path}.${layerId}`, 'Layer is not supported.');
    const aggregatePath = `${path}.${layerId}`;
    const aggregate = input[layerId];
    requireObject(aggregate, aggregatePath);
    rejectUnknownFields(aggregate, LAYER_AGGREGATE_FIELDS, aggregatePath);
    layers[layerId] = {
      observation_count: requireInteger(
        aggregate.observation_count,
        `${aggregatePath}.observation_count`,
        0,
        Number.MAX_SAFE_INTEGER,
      ),
    };
  }
  return layers;
}

function validateFreshness(input, path, supportedLayerIds) {
  requireObject(input, path);
  const freshness = {};
  const layerIds = Object.keys(input);
  if (layerIds.length === 0 || layerIds.length > MAX_LAYER_IDS) {
    invalid(path, `Cells must contain between one and ${MAX_LAYER_IDS} freshness records.`);
  }

  for (const layerId of layerIds) {
    if (!supportedLayerIds.has(layerId)) invalid(`${path}.${layerId}`, 'Layer is not supported.');
    const freshnessPath = `${path}.${layerId}`;
    const value = input[layerId];
    requireObject(value, freshnessPath);
    rejectUnknownFields(value, FRESHNESS_FIELDS, freshnessPath);
    freshness[layerId] = {
      state: requireSourceHealthState(value.state, `${freshnessPath}.state`),
      age_seconds: requireInteger(value.age_seconds, `${freshnessPath}.age_seconds`, 0, Number.MAX_SAFE_INTEGER),
    };
  }
  return freshness;
}

function validateSourceHealth(input, supportedLayerIds) {
  if (!Array.isArray(input) || input.length > MAX_LAYER_IDS) {
    invalid('$.source_health', `Responses can expose at most ${MAX_LAYER_IDS} source health records.`);
  }

  const seen = new Set();
  return input.map((record, index) => {
    const path = `$.source_health[${index}]`;
    requireObject(record, path);
    rejectUnknownFields(record, SOURCE_HEALTH_FIELDS, path);

    const layerId = requireSupportedLayerId(record.layer_id, `${path}.layer_id`, supportedLayerIds);
    if (seen.has(layerId)) invalid(`${path}.layer_id`, 'Source health records must be unique per layer.');
    seen.add(layerId);

    return {
      layer_id: layerId,
      display_name: requireBoundedString(record.display_name, `${path}.display_name`, 1, 160),
      source_class: requireSourceClass(record.source_class, `${path}.source_class`),
      health: requireSourceHealthState(record.health, `${path}.health`),
      last_success_at: requireTimestamp(record.last_success_at, `${path}.last_success_at`),
      next_retry_at: requireTimestamp(record.next_retry_at, `${path}.next_retry_at`),
      terms_url: requireTermsUrl(record.terms_url, `${path}.terms_url`),
      attribution: requireBoundedString(record.attribution, `${path}.attribution`, 1, 256),
      caveat_count: requireInteger(record.caveat_count, `${path}.caveat_count`, 0, MAX_CELLS),
    };
  });
}

function validateControlledLabels(input, path) {
  if (!Array.isArray(input) || input.length > MAX_LAYER_IDS) {
    invalid(path, `Expected at most ${MAX_LAYER_IDS} controlled labels.`);
  }

  const labels = [];
  const seen = new Set();
  input.forEach((label, index) => {
    if (typeof label !== 'string' || !CONTROLLED_LABEL.test(label) || seen.has(label)) {
      invalid(`${path}[${index}]`, 'Expected unique controlled labels.');
    }
    seen.add(label);
    labels.push(label);
  });
  return labels;
}

function requireSupportedLayerId(value, path, supportedLayerIds) {
  if (typeof value !== 'string' || !supportedLayerIds.has(value)) {
    invalid(path, 'Layer is not supported.');
  }
  return value;
}

function requireH3Cell(value, path) {
  if (typeof value !== 'string' || !H3_CELL.test(value)) invalid(path, 'Expected an H3 cell index.');
  return value.toLowerCase();
}

function requireResolution(value, path) {
  if (!H3_RESOLUTIONS.has(value)) invalid(path, 'Expected a permitted H3 resolution.');
  return value;
}

function requireSourceClass(value, path) {
  if (!SOURCE_CLASSES.has(value)) invalid(path, 'Expected a permitted source class.');
  return value;
}

function requireSourceHealthState(value, path) {
  if (!SOURCE_HEALTH_STATES.has(value)) invalid(path, 'Expected a controlled source health state.');
  return value;
}

function requireTermsUrl(value, path) {
  if (typeof value !== 'string') invalid(path, 'Expected an HTTPS terms URL without credentials.');

  let url;
  try {
    url = new URL(value);
  } catch {
    invalid(path, 'Expected an HTTPS terms URL without credentials.');
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash) {
    invalid(path, 'Expected an HTTPS terms URL without credentials.');
  }
  return url.toString();
}

function requireExactString(value, expected, path) {
  if (value !== expected) invalid(path, `Expected ${expected}.`);
  return value;
}

function requireTimestamp(value, path) {
  if (typeof value !== 'string' || !RFC3339_UTC_TIMESTAMP.test(value)) {
    invalid(path, 'Expected an ISO-8601 UTC timestamp.');
  }
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) invalid(path, 'Expected an ISO-8601 UTC timestamp.');
  return new Date(timestamp).toISOString();
}

function requireBoundedString(value, path, minimumLength, maximumLength) {
  if (typeof value !== 'string') invalid(path, 'Expected a bounded display string.');
  const normalized = value.trim();
  if (normalized.length < minimumLength || normalized.length > maximumLength) {
    invalid(path, 'Expected a bounded display string.');
  }
  return normalized;
}

function requireBoolean(value, path) {
  if (typeof value !== 'boolean') invalid(path, 'Expected a boolean.');
  return value;
}

function requireInteger(value, path, minimum, maximum, errorCode = 'invalid_global_viewport') {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new GlobalViewportContractError(errorCode, `Expected an integer between ${minimum} and ${maximum}.`, {
      statusCode: errorCode === 'viewport_too_large' ? 413 : 400,
      path,
    });
  }
  return value;
}

function requireFiniteNumber(value, path, minimum, maximum) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum || value > maximum) {
    invalid(path, `Expected a finite number between ${minimum} and ${maximum}.`);
  }
  return value;
}

function requireObject(value, path) {
  if (!isPlainObject(value)) invalid(path, 'Expected an object.');
}

function rejectUnknownFields(value, allowedFields, path) {
  for (const field of Object.keys(value)) {
    if (!allowedFields.has(field)) invalid(`${path}.${field}`, 'Unknown field.');
  }
}

function invalid(path, message) {
  throw new GlobalViewportContractError('invalid_global_viewport', message, { path });
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype;
}

function deepFreeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
