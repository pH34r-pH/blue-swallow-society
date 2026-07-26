import { cellToBoundary, cellToLatLng, latLngToCell } from 'h3-js';

export const DEFLOCK_SOURCE_ID = 'deflock-osm-alpr-reports';
export const DEFLOCK_SOURCE_CLASS = 'green_public';
export const DEFLOCK_EVIDENCE_CLASS = 'public_reported';
export const DEFLOCK_H3_RESOLUTIONS = Object.freeze([2, 4, 5]);
export const DEFLOCK_CAVEAT = 'Public OSM-tagged ALPR reports; not verified or live.';

export function materializeDeflockReports(reports, { observedAt = new Date().toISOString() } = {}) {
  if (!Array.isArray(reports)) throw new TypeError('reports must be an array');
  const normalizedObservedAt = validTimestamp(observedAt);
  const counts = new Map();
  for (const report of reports) {
    const { latitude, longitude } = normalizePoint(report);
    for (const resolution of DEFLOCK_H3_RESOLUTIONS) {
      const h3Cell = latLngToCell(latitude, longitude, resolution);
      const key = `${resolution}:${h3Cell}`;
      const existing = counts.get(key) ?? { h3_cell: h3Cell, resolution, report_count: 0 };
      existing.report_count += 1;
      counts.set(key, existing);
    }
  }
  const denominator = Math.max(reports.length, 1);
  return [...counts.values()]
    .map((cell) => {
      const [latitude, longitude] = cellToLatLng(cell.h3_cell);
      return Object.freeze({
        h3_cell: cell.h3_cell,
        resolution: cell.resolution,
        centroid: Object.freeze({ latitude, longitude }),
        boundary: Object.freeze(closeBoundary(cellToBoundary(cell.h3_cell)).map(([boundaryLatitude, boundaryLongitude]) => Object.freeze({ latitude: boundaryLatitude, longitude: boundaryLongitude }))),
        report_count: cell.report_count,
        first_seen_at: normalizedObservedAt,
        last_seen_at: normalizedObservedAt,
        salience: Math.min(1, cell.report_count / denominator),
        source_ids: Object.freeze([DEFLOCK_SOURCE_ID]),
        source_classes: Object.freeze([DEFLOCK_SOURCE_CLASS]),
        evidence_class: DEFLOCK_EVIDENCE_CLASS,
        caveats: Object.freeze([DEFLOCK_CAVEAT]),
      });
    })
    .sort((left, right) => left.resolution - right.resolution || left.h3_cell.localeCompare(right.h3_cell));
}

function closeBoundary(boundary) {
  if (!Array.isArray(boundary) || boundary.length < 3) throw new TypeError('H3 boundary is invalid');
  const first = boundary[0];
  const last = boundary.at(-1);
  return first[0] === last[0] && first[1] === last[1] ? boundary : [...boundary, first];
}

function normalizePoint(value) {
  if (!value || typeof value !== 'object') throw new TypeError('report must be an object');
  const latitude = Number(value.latitude);
  const longitude = Number(value.longitude);
  if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) {
    throw new TypeError('report coordinates are invalid');
  }
  return { latitude, longitude };
}

function validTimestamp(value) {
  const date = new Date(value);
  if (typeof value !== 'string' || !Number.isFinite(date.getTime())) throw new TypeError('observedAt must be an ISO timestamp');
  return date.toISOString();
}
