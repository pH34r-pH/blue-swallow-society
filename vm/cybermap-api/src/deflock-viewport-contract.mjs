const REQUEST_FIELDS = new Set(['schema_version', 'bbox', 'zoom', 'layer_ids', 'cell_limit']);
const BBOX_FIELDS = new Set(['west', 'south', 'east', 'north']);
const LAYER_IDS = new Set(['deflock-osm-alpr-reports']);
const CELL_FIELDS = new Set([
  'h3_cell', 'resolution', 'centroid', 'report_count', 'first_seen_at', 'last_seen_at',
  'salience', 'source_ids', 'source_classes', 'evidence_class', 'caveats',
]);
const SOURCE_FIELDS = new Set([
  'source_id', 'source_class', 'status', 'allowed_preload', 'last_success_at', 'attribution', 'caveats',
]);
const CENTROID_FIELDS = new Set(['latitude', 'longitude']);
const MAX_CELL_LIMIT = 1000;

export class DeflockViewportError extends Error {
  constructor(code, message = code, { statusCode = 400 } = {}) {
    super(message);
    this.name = 'DeflockViewportError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export function validateDeflockViewportRequest(input) {
  requireObject(input, 'invalid_request');
  rejectUnknown(input, REQUEST_FIELDS, 'invalid_request');
  if (input.schema_version !== 'bss.global_viewport_request.v1') {
    throw new DeflockViewportError('unsupported_schema_version');
  }
  requireObject(input.bbox, 'invalid_bbox');
  rejectUnknown(input.bbox, BBOX_FIELDS, 'invalid_bbox');
  const bbox = {
    west: finite(input.bbox.west, -180, 180, 'invalid_bbox'),
    south: finite(input.bbox.south, -90, 90, 'invalid_bbox'),
    east: finite(input.bbox.east, -180, 180, 'invalid_bbox'),
    north: finite(input.bbox.north, -90, 90, 'invalid_bbox'),
  };
  if (bbox.west >= bbox.east) throw new DeflockViewportError('wrapped_bbox');
  if (bbox.south >= bbox.north) throw new DeflockViewportError('invalid_bbox');
  if (!Number.isInteger(input.zoom) || input.zoom < 2 || input.zoom > 12) {
    throw new DeflockViewportError('invalid_zoom');
  }
  if (!Array.isArray(input.layer_ids) || input.layer_ids.length === 0 || input.layer_ids.length > 8
      || new Set(input.layer_ids).size !== input.layer_ids.length
      || !input.layer_ids.every((id) => typeof id === 'string' && LAYER_IDS.has(id))) {
    throw new DeflockViewportError('unknown_layer');
  }
  const cellLimit = input.cell_limit === undefined ? MAX_CELL_LIMIT : input.cell_limit;
  if (!Number.isInteger(cellLimit) || cellLimit < 1 || cellLimit > MAX_CELL_LIMIT) {
    throw new DeflockViewportError('cell_limit_exceeded');
  }
  return Object.freeze({
    schema_version: input.schema_version,
    bbox: Object.freeze(bbox),
    zoom: input.zoom,
    layer_ids: Object.freeze([...input.layer_ids]),
    resolution: resolutionForZoom(input.zoom),
    cell_limit: cellLimit,
  });
}

export function buildDeflockViewportResponse({ request, cells = [], sources = [], now = new Date().toISOString() } = {}) {
  if (!request || request.schema_version !== 'bss.global_viewport_request.v1') {
    throw new DeflockViewportError('invalid_request');
  }
  if (!Array.isArray(cells) || cells.length > request.cell_limit) {
    throw new DeflockViewportError('cell_limit_exceeded');
  }
  const normalizedCells = cells.map(sanitizeCell);
  const normalizedSources = Array.isArray(sources) ? sources.map(sanitizeSource) : [];
  return {
    schema_version: 'bss.global_viewport_response.v1',
    ok: true,
    mode: 'global',
    bbox: structuredClone(request.bbox),
    zoom: request.zoom,
    resolution: request.resolution,
    layer_ids: [...request.layer_ids],
    cells: normalizedCells,
    sources: normalizedSources,
    empty: normalizedCells.length === 0,
    generated_at: validTimestamp(now, 'invalid_response_timestamp'),
  };
}

export function resolutionForZoom(zoom) {
  if (zoom <= 4) return 2;
  if (zoom <= 6) return 4;
  return 5;
}

function sanitizeCell(cell) {
  requireObject(cell, 'invalid_cell');
  for (const key of Object.keys(cell)) {
    if (!CELL_FIELDS.has(key)) throw new DeflockViewportError(key === 'lat' || key === 'lon' || key === 'geometry' ? 'raw_cell_field' : 'invalid_cell');
  }
  if (typeof cell.h3_cell !== 'string' || cell.h3_cell.length < 3 || cell.h3_cell.length > 32) throw new DeflockViewportError('invalid_cell');
  if (!Number.isInteger(cell.resolution) || ![2, 4, 5].includes(cell.resolution)) throw new DeflockViewportError('invalid_cell');
  requireObject(cell.centroid, 'invalid_cell');
  rejectUnknown(cell.centroid, CENTROID_FIELDS, 'invalid_cell');
  const centroid = {
    latitude: finite(cell.centroid.latitude, -90, 90, 'invalid_cell'),
    longitude: finite(cell.centroid.longitude, -180, 180, 'invalid_cell'),
  };
  if (!Number.isInteger(cell.report_count) || cell.report_count < 1) throw new DeflockViewportError('invalid_cell');
  if (cell.evidence_class !== 'public_reported') throw new DeflockViewportError('invalid_cell');
  if (!Array.isArray(cell.source_ids) || !cell.source_ids.every((id) => typeof id === 'string' && LAYER_IDS.has(id))) throw new DeflockViewportError('invalid_cell');
  if (!Array.isArray(cell.source_classes) || !cell.source_classes.every((sourceClass) => sourceClass === 'green_public')) throw new DeflockViewportError('invalid_cell');
  if (!Array.isArray(cell.caveats) || !cell.caveats.every((item) => typeof item === 'string' && item.length <= 500)) throw new DeflockViewportError('invalid_cell');
  return {
    h3_cell: cell.h3_cell,
    resolution: cell.resolution,
    centroid,
    report_count: cell.report_count,
    first_seen_at: validTimestamp(cell.first_seen_at, 'invalid_cell'),
    last_seen_at: validTimestamp(cell.last_seen_at, 'invalid_cell'),
    salience: finite(cell.salience, 0, 1, 'invalid_cell'),
    source_ids: [...cell.source_ids],
    source_classes: [...cell.source_classes],
    evidence_class: cell.evidence_class,
    caveats: [...cell.caveats],
  };
}

function sanitizeSource(source) {
  requireObject(source, 'invalid_source');
  rejectUnknown(source, SOURCE_FIELDS, 'invalid_source');
  if (source.source_id !== 'deflock-osm-alpr-reports' || source.source_class !== 'green_public') throw new DeflockViewportError('invalid_source');
  if (!['fresh', 'stale', 'error', 'disabled', 'empty'].includes(source.status)) throw new DeflockViewportError('invalid_source');
  if (typeof source.allowed_preload !== 'boolean' || typeof source.attribution !== 'string' || source.attribution.length > 1000) throw new DeflockViewportError('invalid_source');
  if (source.last_success_at !== null && source.last_success_at !== undefined) validTimestamp(source.last_success_at, 'invalid_source');
  if (!Array.isArray(source.caveats) || !source.caveats.every((item) => typeof item === 'string' && item.length <= 500)) throw new DeflockViewportError('invalid_source');
  return {
    source_id: source.source_id,
    source_class: source.source_class,
    status: source.status,
    allowed_preload: source.allowed_preload,
    last_success_at: source.last_success_at ?? null,
    attribution: source.attribution,
    caveats: [...source.caveats],
  };
}

function requireObject(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new DeflockViewportError(code);
}

function rejectUnknown(value, allowed, code) {
  if (Object.keys(value).some((key) => !allowed.has(key))) throw new DeflockViewportError(code);
}

function finite(value, min, max, code) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new DeflockViewportError(code);
  return value;
}

function validTimestamp(value, code) {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) throw new DeflockViewportError(code);
  return new Date(value).toISOString();
}
