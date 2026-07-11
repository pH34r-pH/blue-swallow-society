import { buildTileGrid, clamp, latLonToTileXY } from './map-math.mjs';

const DEFAULT_VIEWPORT = { width: 1024, height: 768, zoom: 15 };
const DEFAULT_RADIUS_METERS = 600;
const EARTH_METERS_PER_DEGREE_LAT = 111_320;
const CYBERMAP_ENDPOINT = '/api/cybermap/viewport';

const SOURCE_CLASS_LABELS = new Map([
  ['green_public', 'green public'],
  ['green_preload', 'green preload'],
  ['owned_device', 'owned device'],
  ['orange_exposure', 'orange exposure'],
  ['grey_public', 'grey public'],
  ['gray_public', 'grey public'],
  ['red_sensitive', 'red sensitive'],
]);

export function createEmptyCybermapState({ reason = 'empty', message = '' } = {}) {
  return {
    ok: false,
    ready: false,
    state: reason === 'empty' ? 'empty' : 'degraded',
    cells: [],
    caveats: reason ? [{ code: reason, severity: reason === 'empty' ? 'info' : 'warning', message }] : [],
    generatedAt: null,
    statusText: message || 'No backend Cybermap cells available for this viewport.',
  };
}

export function buildCybermapViewportPath({
  location,
  zoom = DEFAULT_VIEWPORT.zoom,
  radiusMeters = DEFAULT_RADIUS_METERS,
  layers = ['green_preload', 'local_owned', 'exposure_enrichment'],
  since = null,
} = {}) {
  const center = normalizeLocation(location);
  if (!center) {
    return null;
  }

  const params = new URLSearchParams();
  params.set('bbox', bboxForLocation(center, radiusMeters).join(','));
  params.set('zoom', String(Math.round(Number(zoom) || DEFAULT_VIEWPORT.zoom)));
  if (Array.isArray(layers) && layers.length) {
    params.set('layers', layers.filter(Boolean).join(','));
  }
  if (since) {
    params.set('since', String(since));
  }
  return `${CYBERMAP_ENDPOINT}?${params.toString()}`;
}

export function parseCybermapViewportPayload(payload) {
  if (!payload || typeof payload !== 'object') {
    return createEmptyCybermapState({
      reason: 'backend_unavailable',
      message: 'Cybermap backend unavailable; showing empty degraded map.',
    });
  }

  const cells = Array.isArray(payload.cells)
    ? payload.cells.map(normalizeCybermapCell).filter(Boolean)
    : [];
  const caveats = Array.isArray(payload.caveats) ? payload.caveats.map(normalizeCaveat).filter(Boolean) : [];
  const state = cleanString(payload.state) || (cells.length ? 'ready' : 'empty');

  if (!cells.length) {
    const message = firstCaveatMessage(caveats) || 'No backend Cybermap cells available for this viewport.';
    return {
      ok: payload.ok === true,
      ready: false,
      state: state === 'ready' ? 'empty' : state,
      cells,
      caveats,
      generatedAt: cleanString(payload.generated_at || payload.generatedAt) || null,
      statusText: `No backend Cybermap cells: ${message}`,
    };
  }

  return {
    ok: payload.ok !== false,
    ready: true,
    state: state === 'empty' ? 'ready' : state,
    cells,
    caveats,
    generatedAt: cleanString(payload.generated_at || payload.generatedAt) || null,
    statusText: `${cells.length} backend Cybermap cell${cells.length === 1 ? '' : 's'} loaded.`,
    resolution: toFiniteNumber(payload.resolution),
  };
}

export function buildCybermapMapState({
  location = null,
  cells = [],
  viewportWidth = DEFAULT_VIEWPORT.width,
  viewportHeight = DEFAULT_VIEWPORT.height,
  zoom = DEFAULT_VIEWPORT.zoom,
} = {}) {
  const center = normalizeLocation(location);
  if (!center) {
    return {
      center: null,
      zoom,
      tileGrid: [],
      markers: [],
      stats: { total: 0, sourceClasses: {}, highestSalience: null },
    };
  }

  const tileGrid = buildTileGrid({
    lat: center.lat,
    lon: center.lon,
    zoom,
    width: viewportWidth,
    height: viewportHeight,
  });

  const markers = cells.map(normalizeCybermapCell).filter(Boolean).map((cell) => {
    const affordance = formatCybermapCellAffordance(cell);
    const projection = projectCell(cell, tileGrid, zoom, center);
    return {
      ...cell,
      ...affordance,
      ...projection,
      visible: isWithinViewport(projection.left, projection.top, viewportWidth, viewportHeight),
    };
  });

  const sourceClasses = markers.reduce((counts, marker) => {
    marker.sourceClasses.forEach((sourceClass) => {
      counts[sourceClass] = (counts[sourceClass] || 0) + 1;
    });
    return counts;
  }, {});
  const highestSalience = markers.reduce((best, marker) => {
    if (!Number.isFinite(marker.salience)) {
      return best;
    }
    return !best || marker.salience > best.salience ? marker : best;
  }, null);

  return {
    center,
    zoom,
    tileGrid,
    markers,
    stats: {
      total: markers.length,
      sourceClasses,
      highestSalience: highestSalience
        ? { id: highestSalience.id, salience: highestSalience.salience, label: highestSalience.title }
        : null,
    },
  };
}

export function formatCybermapCellAffordance(cellInput) {
  const cell = normalizeCybermapCell(cellInput);
  if (!cell) {
    return {
      title: 'Cybermap cell unavailable',
      meta: 'backend cell',
      detail: 'No cell payload returned.',
      sourceClassSummary: 'unknown source class',
      freshnessLabel: 'freshness unknown',
      confidenceLabel: 'confidence unknown',
      caveatSummary: 'No caveats reported.',
    };
  }

  const sourceClassSummary = cell.sourceClasses.length
    ? cell.sourceClasses.map(labelSourceClass).join(' · ')
    : 'unknown source class';
  const freshnessLabel = formatFreshness(cell.freshness);
  const confidenceLabel = formatConfidence(cell);
  const caveatSummary = formatCaveats(cell.caveats);

  return {
    title: `Cybermap cell ${cell.id}`,
    meta: [sourceClassSummary, freshnessLabel, confidenceLabel].filter(Boolean).join(' · '),
    detail: [
      `${cell.observationCount} observation${cell.observationCount === 1 ? '' : 's'}`,
      `${cell.entityCount} entit${cell.entityCount === 1 ? 'y' : 'ies'}`,
      caveatSummary,
    ].filter(Boolean).join(' · '),
    sourceClassSummary,
    freshnessLabel,
    confidenceLabel,
    caveatSummary,
  };
}

function normalizeCybermapCell(cell) {
  if (!cell || typeof cell !== 'object') {
    return null;
  }
  const id = cleanString(cell.h3_cell || cell.h3Cell || cell.id);
  if (!id) {
    return null;
  }
  const sourceClasses = uniqueStrings(cell.source_classes || cell.sourceClasses || []);
  const caveats = Array.isArray(cell.caveats) ? cell.caveats.map(normalizeCaveat).filter(Boolean) : [];
  const centroid = normalizeLocation(cell.centroid || cell.center) || centroidFromGeometry(cell.geom || cell.geometry);
  return {
    id,
    h3Cell: id,
    resolution: toFiniteNumber(cell.resolution),
    geom: cell.geom || cell.geometry || null,
    centroid,
    sourceClasses,
    observationCount: toFiniteNumber(cell.observation_count ?? cell.observationCount) ?? 0,
    entityCount: toFiniteNumber(cell.entity_count ?? cell.entityCount) ?? 0,
    freshness: normalizeFreshness(cell.freshness || cell),
    caveats,
    salience: toFiniteNumber(cell.salience),
    confidence: toFiniteNumber(cell.confidence),
    layers: cell.layers && typeof cell.layers === 'object' ? cell.layers : {},
    raw: cell,
  };
}

function normalizeFreshness(value) {
  if (!value || typeof value !== 'object') {
    return { ageSeconds: null, lastObservedAt: null, lastIngestedAt: null, stale: false };
  }
  return {
    ageSeconds: toFiniteNumber(value.age_seconds ?? value.ageSeconds),
    lastObservedAt: cleanString(value.last_observed_at || value.lastObservedAt || value.last_seen_at || value.lastSeenAt) || null,
    lastIngestedAt: cleanString(value.last_ingested_at || value.lastIngestedAt || value.updated_at || value.updatedAt) || null,
    stale: value.stale === true,
  };
}

function normalizeCaveat(caveat) {
  if (!caveat || typeof caveat !== 'object') {
    return null;
  }
  const code = cleanString(caveat.code || caveat.id || caveat.message);
  if (!code) {
    return null;
  }
  return {
    code,
    severity: cleanString(caveat.severity) || 'info',
    message: cleanString(caveat.message) || humanizeCode(code),
    sourceClasses: uniqueStrings(caveat.source_classes || caveat.sourceClasses || []),
  };
}

function bboxForLocation(location, radiusMeters) {
  const safeRadius = Math.max(1, Number(radiusMeters) || DEFAULT_RADIUS_METERS);
  const latDelta = safeRadius / EARTH_METERS_PER_DEGREE_LAT;
  const lonScale = Math.cos((location.lat * Math.PI) / 180) || 1;
  const lonDelta = safeRadius / (EARTH_METERS_PER_DEGREE_LAT * Math.max(0.1, Math.abs(lonScale)));
  return [
    roundCoordinate(location.lon - lonDelta),
    roundCoordinate(location.lat - latDelta),
    roundCoordinate(location.lon + lonDelta),
    roundCoordinate(location.lat + latDelta),
  ];
}

function centroidFromGeometry(geometry) {
  if (!geometry || typeof geometry !== 'object') {
    return null;
  }
  const rings = geometry.type === 'Polygon'
    ? geometry.coordinates
    : geometry.type === 'MultiPolygon'
      ? geometry.coordinates?.[0]
      : null;
  const ring = Array.isArray(rings?.[0]) ? rings[0] : null;
  if (!ring?.length) {
    return null;
  }
  const points = ring
    .map((point) => Array.isArray(point) ? { lon: toFiniteNumber(point[0]), lat: toFiniteNumber(point[1]) } : null)
    .filter((point) => point && Number.isFinite(point.lat) && Number.isFinite(point.lon));
  if (!points.length) {
    return null;
  }
  const total = points.reduce((accumulator, point) => {
    accumulator.lat += point.lat;
    accumulator.lon += point.lon;
    return accumulator;
  }, { lat: 0, lon: 0 });
  return {
    lat: total.lat / points.length,
    lon: total.lon / points.length,
    accuracy: null,
    heading: null,
    speed: null,
    altitude: null,
    timestamp: null,
  };
}

function projectCell(cell, tileGrid, zoom, center) {
  const centroid = cell.centroid;
  if (!centroid || !Number.isFinite(centroid.lat) || !Number.isFinite(centroid.lon)) {
    return { left: tileGrid.topLeftX, top: tileGrid.topLeftY, distanceMeters: null, bearing: null };
  }
  const projected = latLonToTileXY(centroid.lat, centroid.lon, zoom);
  return {
    left: projected.x * 256 - tileGrid.topLeftX,
    top: projected.y * 256 - tileGrid.topLeftY,
    distanceMeters: haversineDistance(center.lat, center.lon, centroid.lat, centroid.lon),
    bearing: bearingBetween(center.lat, center.lon, centroid.lat, centroid.lon),
  };
}

function formatFreshness(freshness) {
  if (!freshness) {
    return 'freshness unknown';
  }
  if (Number.isFinite(freshness.ageSeconds)) {
    const label = formatDuration(freshness.ageSeconds);
    return `${label} old${freshness.stale ? ' · stale' : ''}`;
  }
  if (freshness.lastObservedAt) {
    return `observed ${freshness.lastObservedAt}`;
  }
  if (freshness.lastIngestedAt) {
    return `ingested ${freshness.lastIngestedAt}`;
  }
  return 'freshness unknown';
}

function formatConfidence(cell) {
  const parts = [];
  if (Number.isFinite(cell.confidence)) {
    parts.push(`${Math.round(cell.confidence * 100)}% confidence`);
  }
  if (Number.isFinite(cell.salience)) {
    parts.push(`salience ${cell.salience.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')}`);
  }
  return parts.join(' · ') || 'confidence unknown';
}

function formatCaveats(caveats) {
  if (!Array.isArray(caveats) || !caveats.length) {
    return 'No caveats reported.';
  }
  return caveats.map((caveat) => caveat.message || humanizeCode(caveat.code)).join(' · ');
}

function firstCaveatMessage(caveats) {
  return caveats.find((caveat) => caveat.message)?.message || null;
}

function labelSourceClass(value) {
  return SOURCE_CLASS_LABELS.get(value) || humanizeCode(value);
}

function humanizeCode(value) {
  return String(value || 'unknown').replace(/[_-]+/g, ' ').trim() || 'unknown';
}

function normalizeLocation(location) {
  if (!location || typeof location !== 'object') {
    return null;
  }
  const lat = toFiniteNumber(location.lat ?? location.latitude ?? location.Lat ?? location.Latitude);
  const lon = toFiniteNumber(location.lon ?? location.lng ?? location.longitude ?? location.Lon ?? location.Longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return null;
  }
  return {
    lat,
    lon,
    accuracy: toFiniteNumber(location.accuracy ?? location.Accuracy),
    heading: toFiniteNumber(location.heading ?? location.Heading),
    speed: toFiniteNumber(location.speed ?? location.Speed),
    altitude: toFiniteNumber(location.altitude ?? location.Altitude),
    timestamp: cleanString(location.timestamp || location.time || location.updatedAt) || null,
  };
}

function uniqueStrings(values) {
  const input = Array.isArray(values) ? values : typeof values === 'string' ? values.split(',') : [];
  return [...new Set(input.map(cleanString).filter(Boolean))];
}

function cleanString(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function toFiniteNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function roundCoordinate(value) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function formatDuration(seconds) {
  const safeSeconds = Math.max(0, Number(seconds) || 0);
  if (safeSeconds < 60) {
    return `${Math.round(safeSeconds)}s`;
  }
  if (safeSeconds < 3600) {
    return `${Math.round(safeSeconds / 60)}m`;
  }
  if (safeSeconds < 86_400) {
    return `${Math.round(safeSeconds / 3600)}h`;
  }
  return `${Math.round(safeSeconds / 86_400)}d`;
}

function isWithinViewport(left, top, width, height) {
  return left >= -96 && top >= -96 && left <= width + 96 && top <= height + 96;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const earthRadiusMeters = 6_371_000;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  return earthRadiusMeters * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingBetween(lat1, lon1, lat2, lon2) {
  const phi1 = toRadians(lat1);
  const phi2 = toRadians(lat2);
  const lambda = toRadians(lon2 - lon1);
  const y = Math.sin(lambda) * Math.cos(phi2);
  const x = Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda);
  return (toDegrees(Math.atan2(y, x)) + 360) % 360;
}

function toRadians(value) {
  return (value * Math.PI) / 180;
}

function toDegrees(value) {
  return (value * 180) / Math.PI;
}
