import { buildTileGrid, clamp, latLonToTileXY, metersPerPixel } from './map-math.mjs';

const DEFAULT_VIEWPORT = { width: 1024, height: 768, zoom: 17 };
const DEFAULT_CURRENT_WIGLE_MAX_AGE_MS = 45_000;
const DEFAULT_CURRENT_WIGLE_LIMIT = 12;
const WIFI_FREQUENCY_CHANNELS = new Map([
  [2412, 1], [2417, 2], [2422, 3], [2427, 4], [2432, 5], [2437, 6], [2442, 7],
  [2447, 8], [2452, 9], [2457, 10], [2462, 11], [2467, 12], [2472, 13], [2484, 14],
]);
const SAMPLE_LOCATION = {
  lat: 47.6154,
  lon: -122.3362,
  accuracy: 14,
  heading: 38,
  speed: 0.4,
  timestamp: '2026-07-09T12:00:00Z',
};

const SAMPLE_ACCESS_POINTS = [
  {
    bssid: 'e8:de:27:aa:11:01',
    ssid: 'BSS-WorkRouter',
    lat: 47.61555,
    lon: -122.33615,
    signalDbm: -44,
    channel: 6,
    security: 'WPA2',
    vendor: 'Ubiquiti',
    lastSeen: '2026-07-09T12:15:00Z',
    source: 'sample',
    deviceClass: 'router',
  },
  {
    bssid: 'e8:de:27:aa:11:02',
    ssid: 'BSS-Guest',
    lat: 47.61582,
    lon: -122.33572,
    signalDbm: -58,
    channel: 11,
    security: 'WPA2',
    vendor: 'Ubiquiti',
    lastSeen: '2026-07-09T12:12:30Z',
    source: 'sample',
    deviceClass: 'access point',
  },
  {
    bssid: '00:11:22:33:44:55',
    ssid: 'BSS-Camera',
    lat: 47.61486,
    lon: -122.33708,
    signalDbm: -71,
    channel: 1,
    security: 'WPA2',
    vendor: 'Generic',
    lastSeen: '2026-07-08T16:42:00Z',
    source: 'sample',
    deviceClass: 'network appliance',
  },
];

export function normalizeWigleRecord(record, { source = 'live' } = {}) {
  if (!record || typeof record !== 'object') {
    return null;
  }

  const ssid = cleanString(firstDefined(record, ['ssid', 'SSID', 'networkName', 'name', 'Name'])) || null;
  const bssid = cleanString(firstDefined(record, ['bssid', 'BSSID', 'mac', 'MAC', 'macAddress'])) || null;
  const lat = toNumber(firstDefined(record, ['lat', 'latitude', 'Lat', 'Latitude', 'lastlat', 'lastLat', 'bestlat', 'bestLat', 'CurrentLatitude', 'currentLatitude']));
  const lon = toNumber(firstDefined(record, ['lon', 'lng', 'longitude', 'Lon', 'Longitude', 'lastlon', 'lastLon', 'bestlon', 'bestLon', 'CurrentLongitude', 'currentLongitude']));
  const signalDbm = toNumber(firstDefined(record, ['signalDbm', 'signal_dbm', 'rssi', 'RSSI', 'signal', 'Signal', 'level', 'Level', 'bestlevel', 'bestLevel']));
  const channel = normalizeChannel(
    firstDefined(record, ['channel', 'chan', 'Channel']),
    firstDefined(record, ['frequency', 'freq', 'Frequency']),
  );
  const security = cleanString(firstDefined(record, ['security', 'encryption', 'Encryption', 'crypto', 'AuthMode', 'authMode', 'capabilities', 'Capabilities'])) || null;
  const vendor = cleanString(firstDefined(record, ['vendor', 'manufacturer', 'Manufacturer', 'oui', 'MFGR', 'mfgr'])) || null;
  const lastSeen = normalizeTimestamp(firstDefined(record, ['lastSeen', 'last_seen', 'updatedAt', 'seenAt', 'timestamp', 'lasttime', 'lastTime', 'time', 'Time', 'FirstSeen', 'firstSeen']));
  const deviceClass = cleanString(firstDefined(record, ['deviceClass', 'device_class', 'type', 'Type', 'kind'])) || inferDeviceClass(ssid, vendor);
  const id = cleanString(firstDefined(record, ['id', 'bssid', 'BSSID', 'mac', 'MAC'])) || deriveRecordId(ssid, bssid, lat, lon);

  const normalized = {
    id,
    ssid,
    bssid,
    lat,
    lon,
    signalDbm,
    signalBand: categorizeSignal(signalDbm),
    signalStrength: signalStrengthPercent(signalDbm),
    channel,
    security,
    vendor,
    lastSeen,
    deviceClass,
    source: cleanString(firstDefined(record, ['source', 'feedSource'])) || source,
    estimatedRange: estimateSignalRange(signalDbm),
    distanceMeters: null,
    heading: toNumber(firstDefined(record, ['heading', 'bearing', 'azimuth'])),
    raw: record,
  };

  return normalized;
}

export function mergeWigleRecords(...collections) {
  const map = new Map();

  collections.flat().forEach((entry) => {
    const normalized = normalizeWigleRecord(entry);
    if (!normalized) {
      return;
    }

    const key = normalized.bssid || normalized.id;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, normalized);
      return;
    }

    const preferred = shouldPreferRecord(normalized, existing) ? normalized : existing;
    map.set(key, preferred);
  });

  return Array.from(map.values()).sort((left, right) => scoreRecord(right) - scoreRecord(left));
}

export function parseWiglePayload(payload, { source = 'live' } = {}) {
  if (!payload) {
    return { location: null, accessPoints: [] };
  }

  if (typeof payload === 'string') {
    const text = payload.trim();
    if (!text) {
      return { location: null, accessPoints: [] };
    }

    try {
      return parseWiglePayload(JSON.parse(text), { source });
    } catch {
      return parseWigleText(text, source);
    }
  }

  if (Array.isArray(payload)) {
    return { location: null, accessPoints: mergeWigleRecords(payload.map((entry) => ({ ...entry, source }))) };
  }

  if (payload && typeof payload === 'object') {
    const accessPoints = Array.isArray(payload.accessPoints)
      ? payload.accessPoints
      : Array.isArray(payload.networks)
        ? payload.networks
        : Array.isArray(payload.results)
          ? payload.results
          : Array.isArray(payload.items)
            ? payload.items
            : [];

    return {
      location: normalizeLocation(payload.location || payload.position || payload.currentLocation),
      accessPoints: mergeWigleRecords(accessPoints.map((entry) => ({ ...entry, source: entry?.source || payload.source || source }))),
      source: cleanString(payload.source || source) || source,
      updatedAt: cleanString(payload.updatedAt || payload.lastUpdated || payload.timestamp) || null,
    };
  }

  return { location: null, accessPoints: [] };
}

function parseWigleText(text, source) {
  const lines = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (!lines.length) {
    return { location: null, accessPoints: [] };
  }

  const firstLine = lines[0];
  if (firstLine.startsWith('{') && lines.every((line) => line.startsWith('{'))) {
    const accessPoints = lines.flatMap((line) => {
      try {
        return [JSON.parse(line)];
      } catch {
        return [];
      }
    });
    return {
      location: null,
      accessPoints: mergeWigleRecords(accessPoints.map((entry) => ({ ...entry, source }))),
      source,
    };
  }

  if (firstLine.includes(',')) {
    return parseWigleCsv(lines, source);
  }

  return { location: null, accessPoints: [] };
}

function parseWigleCsv(lines, source) {
  if (lines.length < 2) {
    return { location: null, accessPoints: [] };
  }

  const headers = parseCsvRow(lines[0]).map(mapCsvHeader);
  const records = lines.slice(1).flatMap((line) => {
    const columns = parseCsvRow(line);
    if (!columns.length) {
      return [];
    }

    const entry = {};
    headers.forEach((header, index) => {
      if (!header) {
        return;
      }
      entry[header] = columns[index] ?? '';
    });

    return [entry];
  });

  return {
    location: null,
    accessPoints: mergeWigleRecords(records.map((entry) => ({ ...entry, source }))),
    source,
  };
}

function parseCsvRow(line) {
  const cells = [];
  let cell = '';
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === '"') {
      if (quoted && next === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (char === ',' && !quoted) {
      cells.push(cell.trim());
      cell = '';
      continue;
    }

    cell += char;
  }

  cells.push(cell.trim());
  return cells;
}

function mapCsvHeader(header) {
  const normalized = String(header || '').trim().toLowerCase();
  const compact = normalized.replace(/[^a-z0-9]+/g, '');

  switch (compact) {
    case 'ssid':
      return 'ssid';
    case 'bssid':
    case 'mac':
    case 'macaddress':
      return 'bssid';
    case 'lat':
    case 'latitude':
    case 'currentlatitude':
    case 'lastlat':
    case 'bestlat':
      return 'latitude';
    case 'lon':
    case 'lng':
    case 'longitude':
    case 'currentlongitude':
    case 'lastlon':
    case 'bestlon':
      return 'longitude';
    case 'signaldbm':
    case 'rssi':
    case 'signal':
    case 'level':
    case 'bestlevel':
      return 'signalDbm';
    case 'frequency':
    case 'freq':
      return 'frequency';
    case 'channel':
    case 'chan':
      return 'channel';
    case 'security':
    case 'encryption':
    case 'crypto':
    case 'authmode':
    case 'capabilities':
      return 'security';
    case 'vendor':
    case 'manufacturer':
    case 'mfgr':
      return 'vendor';
    case 'lastseen':
    case 'last_seen':
    case 'timestamp':
    case 'updatedat':
    case 'seenat':
    case 'firstseen':
    case 'lasttime':
    case 'time':
      return 'lastSeen';
    case 'source':
    case 'feedsource':
      return 'source';
    case 'deviceclass':
    case 'device_class':
    case 'type':
    case 'kind':
      return 'deviceClass';
    default:
      return header;
  }
}

export function buildWigleMapState({
  location = null,
  accessPoints = [],
  viewportWidth = DEFAULT_VIEWPORT.width,
  viewportHeight = DEFAULT_VIEWPORT.height,
  zoom = DEFAULT_VIEWPORT.zoom,
  radiusMeters = null,
} = {}) {
  const normalizedAccessPoints = mergeWigleRecords(accessPoints);
  const center = normalizeLocation(location) || inferCenterFromAccessPoints(normalizedAccessPoints) || SAMPLE_LOCATION;
  const mappedAccessPoints = Number.isFinite(radiusMeters)
    ? filterWigleRecordsByRadius(normalizedAccessPoints, center, radiusMeters)
    : normalizedAccessPoints;

  const tileGrid = buildTileGrid({
    lat: center.lat,
    lon: center.lon,
    zoom,
    width: viewportWidth,
    height: viewportHeight,
  });

  const markers = mappedAccessPoints.map((ap) => {
    const projection = projectAccessPoint(ap, tileGrid, zoom, center);
    return {
      ...ap,
      ...projection,
      label: ap.ssid || ap.bssid || 'Unknown network',
      subtitle: [
        ap.deviceClass || 'access point',
        ap.signalDbm === null || ap.signalDbm === undefined ? null : `${ap.signalDbm} dBm`,
      ].filter(Boolean).join(' · '),
      detail: [
        ap.security || null,
        ap.vendor || null,
        ap.estimatedRange?.label || null,
      ].filter(Boolean).join(' · ') || 'WiGLE network',
      rangeRadiusPx: estimateRangeRadiusPx(ap, center.lat, zoom),
      visible: isWithinViewport(projection.left, projection.top, viewportWidth, viewportHeight),
    };
  });

  const strongest = [...markers].sort((left, right) => scoreRecord(right) - scoreRecord(left))[0] || null;
  const sourceCounts = markers.reduce((counts, marker) => {
    const key = marker.source || 'live';
    counts[key] = (counts[key] || 0) + 1;
    return counts;
  }, {});

  return {
    center,
    zoom,
    tileGrid,
    markers,
    stats: {
      total: markers.length,
      liveCount: sourceCounts.live || 0,
      databaseCount: sourceCounts.database || 0,
      strongest: strongest
        ? {
            ssid: strongest.ssid || strongest.bssid || 'Unknown network',
            signalDbm: strongest.signalDbm,
            signalBand: strongest.signalBand,
            source: strongest.source,
          }
        : null,
      signalBands: markers.reduce((counts, marker) => {
        counts[marker.signalBand] = (counts[marker.signalBand] || 0) + 1;
        return counts;
      }, {}),
    },
  };
}

export function buildArCandidateBoxes({
  accessPoints = [],
  viewportWidth = 1080,
  viewportHeight = 1920,
  orientationAngle = 0,
  maxBoxes = 4,
} = {}) {
  const normalizedAngle = normalizeAngle(orientationAngle);
  const normalizedAccessPoints = mergeWigleRecords(accessPoints)
    .slice(0, maxBoxes)
    .sort((left, right) => scoreRecord(right) - scoreRecord(left));

  const anchorLayout = getAnchorLayout(normalizedAngle, normalizedAccessPoints.length, viewportWidth, viewportHeight);
  const boxes = normalizedAccessPoints.map((ap, index) => {
    const score = scoreRecord(ap);
    const anchor = anchorLayout[index] || anchorLayout[anchorLayout.length - 1];
    const width = clamp(viewportWidth * (0.16 + score * 0.14), 110, viewportWidth * 0.42);
    const height = clamp(viewportHeight * (0.09 + score * 0.1), 72, viewportHeight * 0.3);
    const left = clamp(anchor.x - width / 2, 8, Math.max(8, viewportWidth - width - 8));
    const top = clamp(anchor.y - height / 2, 8, Math.max(8, viewportHeight - height - 8));

    return {
      id: ap.id,
      label: ap.ssid || ap.bssid || 'WiGLE target',
      subtitle: [
        ap.deviceClass || 'access point',
        ap.signalDbm === null || ap.signalDbm === undefined ? null : `${ap.signalDbm} dBm`,
        ap.channel ? `ch ${ap.channel}` : null,
      ].filter(Boolean).join(' · '),
      detail: [
        ap.vendor || null,
        ap.security || null,
        ap.estimatedRange?.label || null,
      ].filter(Boolean).join(' · ') || 'Signal hint only',
      x: Math.round(left),
      y: Math.round(top),
      width: Math.round(width),
      height: Math.round(height),
      confidence: Math.round(score * 100),
      signalDbm: ap.signalDbm,
      signalBand: ap.signalBand,
      rangeText: formatRange(ap.estimatedRange),
      source: ap.source,
      orientationAngle: normalizedAngle,
      category: ap.deviceClass || 'access point',
      visible: true,
      rotation: 0,
    };
  });

  return {
    orientationAngle: normalizedAngle,
    boxes,
    guide: {
      hint: 'Candidate overlays are ordered by WiGLE signal confidence.',
      rotationUpright: true,
    },
  };
}

export function buildCurrentWigleState({
  accessPoints = [],
  location = null,
  radiusMeters = null,
  now = Date.now(),
  maxAgeMs = DEFAULT_CURRENT_WIGLE_MAX_AGE_MS,
  limit = DEFAULT_CURRENT_WIGLE_LIMIT,
} = {}) {
  const nowMs = coerceTimestampMs(now) ?? Date.now();
  const ageLimit = Number.isFinite(Number(maxAgeMs))
    ? Math.max(0, Number(maxAgeMs))
    : DEFAULT_CURRENT_WIGLE_MAX_AGE_MS;
  const normalizedLocation = normalizeLocation(location);
  const maxRecords = Number.isFinite(Number(limit)) ? Math.max(0, Number(limit)) : DEFAULT_CURRENT_WIGLE_LIMIT;

  const mergedRecords = mergeCurrentWigleRecords(accessPoints, nowMs);
  const spatiallyRelevantRecords = normalizedLocation && Number.isFinite(radiusMeters)
    ? filterWigleRecordsByRadius(mergedRecords, normalizedLocation, radiusMeters)
    : mergedRecords;

  const currentRecords = spatiallyRelevantRecords
    .map((record) => annotateCurrentRecord(record, nowMs, ageLimit))
    .filter((record) => record.current)
    .sort(compareCurrentRecords)
    .slice(0, maxRecords);
  const latestSeenMs = currentRecords.reduce((latest, record) => {
    const seenMs = coerceTimestampMs(record.lastSeen);
    return Number.isFinite(seenMs) ? Math.max(latest, seenMs) : latest;
  }, 0);

  return {
    location: normalizedLocation,
    accessPoints: currentRecords,
    live: currentRecords.length > 0,
    current: currentRecords.length > 0,
    maxAgeMs: ageLimit,
    updatedAt: latestSeenMs ? new Date(latestSeenMs).toISOString() : new Date(nowMs).toISOString(),
  };
}

export function createSampleWigleDataset() {
  return {
    location: { ...SAMPLE_LOCATION },
    accessPoints: SAMPLE_ACCESS_POINTS.map((entry) => ({ ...entry })),
    source: 'sample',
    mode: 'sample',
    live: false,
    streamState: 'sample',
    updatedAt: SAMPLE_LOCATION.timestamp,
  };
}

export function filterWigleRecordsByRadius(records = [], center = null, radiusMeters = 100) {
  const normalizedCenter = normalizeLocation(center);
  const maxRadius = Number.isFinite(radiusMeters) ? Math.max(0, radiusMeters) : null;

  if (!normalizedCenter || maxRadius === null) {
    return mergeWigleRecords(records).map((record) => ({ ...record }));
  }

  return mergeWigleRecords(records)
    .map((record) => {
      if (!Number.isFinite(record.lat) || !Number.isFinite(record.lon)) {
        return null;
      }

      const distanceMeters = haversineDistance(normalizedCenter.lat, normalizedCenter.lon, record.lat, record.lon);
      if (distanceMeters > maxRadius) {
        return null;
      }

      return {
        ...record,
        distanceMeters,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftDistance = Number.isFinite(left.distanceMeters) ? left.distanceMeters : Number.POSITIVE_INFINITY;
      const rightDistance = Number.isFinite(right.distanceMeters) ? right.distanceMeters : Number.POSITIVE_INFINITY;
      if (leftDistance !== rightDistance) {
        return leftDistance - rightDistance;
      }

      return scoreRecord(right) - scoreRecord(left);
    });
}

export function isLiveWigleSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') {
    return false;
  }

  if (snapshot.live === true) {
    return true;
  }

  const mode = cleanString(snapshot.mode || snapshot.streamState || '').toLowerCase();
  if (mode === 'live' || mode === 'realtime' || mode === 'bridge') {
    return true;
  }

  const source = cleanString(snapshot.source || '').toLowerCase();
  return ['live', 'bridge', 'api'].includes(source);
}

function normalizeLocation(location, fallback = null) {
  if (!location || typeof location !== 'object') {
    return fallback ? { ...fallback } : null;
  }

  const lat = toNumber(firstDefined(location, ['lat', 'latitude', 'Lat', 'Latitude']));
  const lon = toNumber(firstDefined(location, ['lon', 'lng', 'longitude', 'Lon', 'Longitude']));
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return fallback ? { ...fallback } : null;
  }

  return {
    lat,
    lon,
    accuracy: toNumber(firstDefined(location, ['accuracy', 'Accuracy'])) ?? null,
    heading: toNumber(firstDefined(location, ['heading', 'Heading'])) ?? null,
    speed: toNumber(firstDefined(location, ['speed', 'Speed'])) ?? null,
    altitude: toNumber(firstDefined(location, ['altitude', 'Altitude'])) ?? null,
    timestamp: cleanString(firstDefined(location, ['timestamp', 'time', 'updatedAt'])) || null,
  };
}

function inferCenterFromAccessPoints(accessPoints) {
  const coords = accessPoints.filter((entry) => Number.isFinite(entry.lat) && Number.isFinite(entry.lon));
  if (!coords.length) {
    return null;
  }

  const total = coords.reduce((accumulator, entry) => {
    accumulator.lat += entry.lat;
    accumulator.lon += entry.lon;
    return accumulator;
  }, { lat: 0, lon: 0 });

  return {
    lat: total.lat / coords.length,
    lon: total.lon / coords.length,
    accuracy: null,
    heading: null,
    speed: null,
    altitude: null,
    timestamp: null,
  };
}

function projectAccessPoint(accessPoint, tileGrid, zoom, center) {
  if (!Number.isFinite(accessPoint.lat) || !Number.isFinite(accessPoint.lon)) {
    return {
      left: tileGrid.topLeftX,
      top: tileGrid.topLeftY,
      distanceMeters: null,
      bearing: null,
    };
  }

  const projected = latLonToTileXY(accessPoint.lat, accessPoint.lon, zoom);
  const left = projected.x * 256 - tileGrid.topLeftX;
  const top = projected.y * 256 - tileGrid.topLeftY;

  return {
    left,
    top,
    distanceMeters: haversineDistance(center.lat, center.lon, accessPoint.lat, accessPoint.lon),
    bearing: bearingBetween(center.lat, center.lon, accessPoint.lat, accessPoint.lon),
  };
}

function estimateRangeRadiusPx(accessPoint, centerLat, zoom) {
  const range = accessPoint.estimatedRange || estimateSignalRange(accessPoint.signalDbm);
  const metersPerPixelAtCenter = metersPerPixel(centerLat, zoom, 256);
  return clamp((range.max * 2) / Math.max(1, metersPerPixelAtCenter), 10, 480);
}

function estimateSignalRange(signalDbm) {
  if (!Number.isFinite(signalDbm)) {
    return { min: 20, max: 120, label: 'unknown range' };
  }

  if (signalDbm >= -45) {
    return { min: 0, max: 8, label: 'very near' };
  }

  if (signalDbm >= -58) {
    return { min: 5, max: 18, label: 'near' };
  }

  if (signalDbm >= -68) {
    return { min: 12, max: 40, label: 'mid-range' };
  }

  if (signalDbm >= -78) {
    return { min: 25, max: 75, label: 'far' };
  }

  return { min: 50, max: 150, label: 'distant' };
}

function categorizeSignal(signalDbm) {
  if (!Number.isFinite(signalDbm)) {
    return 'unknown';
  }

  if (signalDbm >= -45) {
    return 'excellent';
  }

  if (signalDbm >= -58) {
    return 'good';
  }

  if (signalDbm >= -70) {
    return 'fair';
  }

  return 'weak';
}

function signalStrengthPercent(signalDbm) {
  if (!Number.isFinite(signalDbm)) {
    return null;
  }

  return clamp(((signalDbm + 100) / 60) * 100, 0, 100);
}

function formatRange(range) {
  if (!range) {
    return 'unknown range';
  }

  return `${range.label} · ~${range.min}-${range.max}m`;
}

function shouldPreferRecord(candidate, existing) {
  const candidateScore = scoreRecord(candidate);
  const existingScore = scoreRecord(existing);

  if (candidateScore !== existingScore) {
    return candidateScore > existingScore;
  }

  const candidateSeen = Date.parse(candidate.lastSeen || '') || 0;
  const existingSeen = Date.parse(existing.lastSeen || '') || 0;
  if (candidateSeen !== existingSeen) {
    return candidateSeen > existingSeen;
  }

  return (candidate.source || '').length < (existing.source || '').length;
}

function mergeCurrentWigleRecords(...collections) {
  const map = new Map();

  collections.flat().forEach((entry) => {
    const normalized = normalizeWigleRecord(entry);
    if (!normalized) {
      return;
    }

    const key = normalized.bssid || normalized.id;
    const existing = map.get(key);
    if (!existing || shouldPreferCurrentRecord(normalized, existing)) {
      map.set(key, normalized);
    }
  });

  return Array.from(map.values());
}

function shouldPreferCurrentRecord(candidate, existing) {
  const candidateSeen = coerceTimestampMs(candidate.lastSeen);
  const existingSeen = coerceTimestampMs(existing.lastSeen);
  if (Number.isFinite(candidateSeen) && Number.isFinite(existingSeen) && candidateSeen !== existingSeen) {
    return candidateSeen > existingSeen;
  }

  if (Number.isFinite(candidateSeen) !== Number.isFinite(existingSeen)) {
    return Number.isFinite(candidateSeen);
  }

  const candidateSignal = Number.isFinite(candidate.signalDbm) ? candidate.signalDbm : Number.NEGATIVE_INFINITY;
  const existingSignal = Number.isFinite(existing.signalDbm) ? existing.signalDbm : Number.NEGATIVE_INFINITY;
  if (candidateSignal !== existingSignal) {
    return candidateSignal > existingSignal;
  }

  return (candidate.source || '').length < (existing.source || '').length;
}

function annotateCurrentRecord(record, nowMs, maxAgeMs) {
  const seenMs = coerceTimestampMs(record.lastSeen);
  const ageMs = Number.isFinite(seenMs) ? Math.max(0, nowMs - seenMs) : null;
  const current = Number.isFinite(ageMs) && ageMs <= maxAgeMs;

  return {
    ...record,
    ageMs,
    current,
    rangeText: formatRange(record.estimatedRange),
  };
}

function compareCurrentRecords(left, right) {
  const leftSignal = Number.isFinite(left.signalDbm) ? left.signalDbm : Number.NEGATIVE_INFINITY;
  const rightSignal = Number.isFinite(right.signalDbm) ? right.signalDbm : Number.NEGATIVE_INFINITY;
  if (leftSignal !== rightSignal) {
    return rightSignal - leftSignal;
  }

  const leftAge = Number.isFinite(left.ageMs) ? left.ageMs : Number.POSITIVE_INFINITY;
  const rightAge = Number.isFinite(right.ageMs) ? right.ageMs : Number.POSITIVE_INFINITY;
  if (leftAge !== rightAge) {
    return leftAge - rightAge;
  }

  return String(left.ssid || left.bssid || left.id || '').localeCompare(String(right.ssid || right.bssid || right.id || ''));
}

function scoreRecord(record) {
  const signal = Number.isFinite(record.signalDbm) ? clamp((100 + record.signalDbm) / 60, 0, 1) : 0.5;
  const recency = record.lastSeen ? clamp((Date.now() - Date.parse(record.lastSeen)) / (1000 * 60 * 60 * 24 * 30), 0, 1) : 0.5;
  return clamp(signal * 0.75 + (1 - recency) * 0.25, 0, 1);
}

function inferDeviceClass(ssid, vendor) {
  const text = `${ssid || ''} ${vendor || ''}`.toLowerCase();
  if (text.includes('router') || text.includes('gateway')) {
    return 'router';
  }

  if (text.includes('ap') || text.includes('wifi') || text.includes('access')) {
    return 'access point';
  }

  if (text.includes('camera')) {
    return 'camera';
  }

  return 'access point';
}

function getAnchorLayout(orientationAngle, count, viewportWidth, viewportHeight) {
  const base = [
    { x: 0.50, y: 0.48 },
    { x: 0.24, y: 0.30 },
    { x: 0.76, y: 0.32 },
    { x: 0.22, y: 0.72 },
    { x: 0.78, y: 0.70 },
    { x: 0.50, y: 0.22 },
  ];

  const angles = base.map((anchor) => rotateAnchor(anchor, orientationAngle));
  return angles.slice(0, Math.max(count, 1)).map((anchor) => ({
    x: clamp(anchor.x * viewportWidth, 16, viewportWidth - 16),
    y: clamp(anchor.y * viewportHeight, 16, viewportHeight - 16),
  }));
}

function rotateAnchor(anchor, orientationAngle) {
  const normalizedAngle = normalizeAngle(orientationAngle);
  if (normalizedAngle === 0) {
    return anchor;
  }

  if (normalizedAngle === 180) {
    return { x: 1 - anchor.x, y: 1 - anchor.y };
  }

  if (normalizedAngle === 90) {
    return { x: 1 - anchor.y, y: anchor.x };
  }

  return { x: anchor.y, y: 1 - anchor.x };
}

function normalizeAngle(angle) {
  return ((Math.round(angle || 0) % 360) + 360) % 360;
}

function deriveRecordId(ssid, bssid, lat, lon) {
  return [ssid || 'network', bssid || 'bssid', lat ?? 'lat', lon ?? 'lon'].join(':');
}

function firstDefined(object, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key) && object[key] !== undefined && object[key] !== null && object[key] !== '') {
      return object[key];
    }
  }
  return undefined;
}

function cleanString(value) {
  return value === null || value === undefined ? '' : String(value).trim();
}

function normalizeChannel(channelValue, frequencyValue = null) {
  const explicitChannel = toNumber(channelValue);
  if (Number.isFinite(explicitChannel) && explicitChannel > 0 && explicitChannel < 200) {
    return explicitChannel;
  }

  const frequency = toNumber(frequencyValue);
  if (!Number.isFinite(frequency)) {
    return explicitChannel;
  }

  if (WIFI_FREQUENCY_CHANNELS.has(frequency)) {
    return WIFI_FREQUENCY_CHANNELS.get(frequency);
  }

  if (frequency >= 5000 && frequency <= 5900) {
    return Math.round((frequency - 5000) / 5);
  }

  if (frequency >= 5955 && frequency <= 7115) {
    return Math.round((frequency - 5950) / 5);
  }

  return explicitChannel;
}

function normalizeTimestamp(value) {
  const timestampMs = coerceTimestampMs(value);
  if (Number.isFinite(timestampMs)) {
    return new Date(timestampMs).toISOString();
  }

  return cleanString(value) || null;
}

function coerceTimestampMs(value) {
  if (value instanceof Date) {
    const time = value.getTime();
    return Number.isFinite(time) ? time : null;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return normalizeNumericTimestamp(value);
  }

  const text = cleanString(value);
  if (!text) {
    return null;
  }

  if (/^-?\d+(?:\.\d+)?$/.test(text)) {
    return normalizeNumericTimestamp(Number(text));
  }

  const dateLike = /^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}(?:\.\d+)?$/.test(text)
    ? `${text.replace(' ', 'T')}Z`
    : text;
  const parsed = Date.parse(dateLike);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeNumericTimestamp(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000_000) {
    return value;
  }

  if (absolute >= 1_000_000_000) {
    return value * 1000;
  }

  return value;
}

function toNumber(value) {
  if (value === null || value === undefined || value === '') {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const earthRadius = 6371000;
  const deltaLat = toRad(lat2 - lat1);
  const deltaLon = toRad(lon2 - lon1);
  const a =
    Math.sin(deltaLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(deltaLon / 2) ** 2;
  return 2 * earthRadius * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingBetween(lat1, lon1, lat2, lon2) {
  const toRad = (degrees) => (degrees * Math.PI) / 180;
  const toDeg = (radians) => (radians * 180) / Math.PI;
  const y = Math.sin(toRad(lon2 - lon1)) * Math.cos(toRad(lat2));
  const x =
    Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
    Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(toRad(lon2 - lon1));
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function isWithinViewport(left, top, width, height) {
  return left >= -96 && top >= -96 && left <= width + 96 && top <= height + 96;
}
