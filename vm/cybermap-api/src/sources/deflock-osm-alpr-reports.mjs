export const DEFLOCK_SOURCE_ID = 'deflock-osm-alpr-reports';
export const DEFLOCK_DATA_URL = 'https://data.dontgetflocked.com/cameras.geojson.gz';
export const DEFLOCK_TERMS_URL = 'https://www.openstreetmap.org/copyright';
export const DEFLOCK_ATTRIBUTION = '© OpenStreetMap contributors; data available under ODbL. DeFlock delivery reference.';

export function extractDeflockReportPoints(payload) {
  if (!payload || payload.type !== 'FeatureCollection' || !Array.isArray(payload.features)) {
    throw new TypeError('Deflock source payload must be a GeoJSON FeatureCollection.');
  }
  const reports = [];
  for (const feature of payload.features) {
    if (feature?.type !== 'Feature' || feature?.geometry?.type !== 'Point' || !Array.isArray(feature.geometry.coordinates)) continue;
    const [longitude, latitude] = feature.geometry.coordinates;
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90 || !Number.isFinite(longitude) || longitude < -180 || longitude > 180) continue;
    reports.push({ latitude, longitude });
  }
  if (reports.length === 0) throw new TypeError('Deflock source payload has no valid point reports.');
  return reports;
}
