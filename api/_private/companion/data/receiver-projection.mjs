import { integer, signed } from './protocol.mjs';

// Matches Wardriver MeasuredMap's Web Mercator latitude boundary. These are
// receiver fixes, not inferred locations of Wi-Fi or other emitters.
export const MAX_MERCATOR_LATITUDE = 85.05112878;
const MAX_POINTS = 2000;
function horizontalAccuracy(fix) {
  return Object.hasOwn(fix, 'horizontalAccuracyM') && Number.isFinite(fix.horizontalAccuracyM)
    && fix.horizontalAccuracyM >= 0 ? fix.horizontalAccuracyM : null;
}
export function receiverFixes(store, { publisher = null, limit = MAX_POINTS } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_POINTS) throw new Error('invalid_projection');
  const points = []; let excludedMercator = 0; let invalid = 0; let eligible = 0;
  for (const { record, claims } of store.observations({ publisher, geometry: true })) {
    if (record.kind !== 'gnss') continue;
    const fix = record.wire.gnss; const lat = fix.latitudeDeg; const lon = fix.longitudeDeg;
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) { invalid++; continue; }
    if (Math.abs(lat) > MAX_MERCATOR_LATITUDE) { excludedMercator++; continue; }
    eligible++;
    if (points.length >= limit) continue;
    points.push({ id: record.id, publisher: claims[0][0], sessionId: record.sessionId,
      latitude: lat, longitude: lon, accuracyMetres: horizontalAccuracy(fix), bootEpoch: record.wire.timing.bootEpoch,
      captureElapsedNs: integer(record.wire.timing.captureElapsedNs).toString(),
      wallTimeMs: signed(record.wire.timing.wallTimeMs).toString() });
  }
  return { points, eligible, excludedMercator, invalid, truncated: eligible > limit,
    generation: store.summary().generation, kind: 'receiver-fixes' };
}
