import { IngestError } from './auth.mjs';

const VIEWPORT_BODY_KEYS = new Set(['lat', 'latitude', 'lon', 'longitude', 'radiusMeters', 'limit', 'maxAgeMs', 'now']);

export async function readViewportFromBody(payload, { store, now }) {
  if (typeof store?.queryViewport !== 'function') {
    throw new IngestError('viewport_unavailable', 'Cybermap viewport reads are not available.', { statusCode: 503 });
  }
  return store.queryViewport(parseViewportBody(payload, now));
}

export async function readOperatorSignalSnapshotFromBody(payload, { store, now }) {
  const viewport = await readViewportFromBody(payload, { store, now });
  return projectOperatorSignalSnapshot(viewport);
}

export function parseViewportBody(payload, now) {
  if (!isPlainObject(payload)) {
    throw new IngestError('invalid_viewport', 'Viewport body must be a JSON object.', { statusCode: 400 });
  }
  for (const key of Object.keys(payload)) {
    if (!VIEWPORT_BODY_KEYS.has(key)) {
      throw new IngestError('invalid_viewport', `Unsupported viewport field: ${key}.`, { statusCode: 400 });
    }
  }
  return parseViewportValues({
    lat: payload.lat ?? payload.latitude,
    lon: payload.lon ?? payload.longitude,
    radiusMeters: payload.radiusMeters,
    limit: payload.limit,
    maxAgeMs: payload.maxAgeMs,
    now: payload.now,
  }, now, 'POST body');
}

export function projectOperatorSignalSnapshot(viewport) {
  const accessPoints = Array.isArray(viewport?.accessPoints) ? viewport.accessPoints : [];
  const signals = accessPoints.map((record) => ({
    kind: record?.kind || 'wifi',
    label: labelForKind(record?.kind),
    lat: finiteOrNull(record?.lat),
    lon: finiteOrNull(record?.lon),
    signalDbm: finiteOrNull(record?.signalDbm),
    frequencyMhz: finiteOrNull(record?.frequencyMhz),
    channel: finiteOrNull(record?.channel),
    distanceMeters: finiteOrNull(record?.distanceMeters),
    accuracyMeters: finiteOrNull(record?.accuracyMeters),
    confidence: finiteOrNull(record?.confidence),
    observedAt: timestampOrNull(record?.observedAt ?? record?.lastSeen),
    sourceClass: stringOrNull(record?.sourceClass ?? record?.source) || 'unknown',
    redactionClass: 'identifier_suppressed',
    retentionClass: 'policy_bound',
  }));

  return {
    schema_version: 'bss.operator_signal_snapshot.v1',
    ok: true,
    mode: 'operator_signal_snapshot',
    live: viewport?.live === true,
    current: viewport?.current === true,
    source: 'cybermap-postgis',
    location: viewport?.location || null,
    radiusMeters: finiteOrNull(viewport?.radiusMeters),
    maxAgeMs: finiteOrNull(viewport?.maxAgeMs),
    totalResults: signals.length,
    signals,
    updatedAt: timestampOrNull(viewport?.updatedAt) || new Date().toISOString(),
    warning: 'An observation is not proof of emitter location, identity, ownership, or current presence.',
  };
}

function parseViewportValues(values, now, source) {
  const lat = parseFiniteNumber(values.lat);
  const lon = parseFiniteNumber(values.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    throw new IngestError('invalid_viewport', `lat and lon ${source} values are required.`, { statusCode: 400 });
  }
  const maxAgeValue = values.maxAgeMs;
  const maxAgeMs = maxAgeValue === null || maxAgeValue === undefined || maxAgeValue === ''
    ? null
    : clampFiniteNumber(maxAgeValue, 1_000, 86_400_000, 45_000);
  const nowMs = parseTimestampMs(values.now);
  return {
    lat,
    lon,
    radiusMeters: clampFiniteNumber(values.radiusMeters, 25, 5_000, 100),
    limit: Math.trunc(clampFiniteNumber(values.limit, 1, 500, 100)),
    maxAgeMs,
    now: new Date(Number.isFinite(nowMs) ? nowMs : now()),
  };
}

function labelForKind(kind) {
  return kind === 'wifi' ? 'Wi-Fi observation' : `${String(kind || 'radio').replaceAll('_', ' ')} observation`;
}

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseFiniteNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function finiteOrNull(value) {
  return Number.isFinite(Number(value)) ? Number(value) : null;
}

function stringOrNull(value) {
  return typeof value === 'string' && value ? value : null;
}

function timestampOrNull(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : null;
}

function parseTimestampMs(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function clampFiniteNumber(value, minimum, maximum, fallback) {
  const number = parseFiniteNumber(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, number));
}
