import { USGS_EARTHQUAKES_ADAPTER } from './sources/usgs-earthquakes.mjs';
import { NASA_EONET_EVENTS_ADAPTER } from './sources/nasa-eonet-events.mjs';
import { GDACS_ALERTS_ADAPTER } from './sources/gdacs-alerts.mjs';

export const WORLD_LIMITS = Object.freeze({ bytes: 8 * 1024 * 1024, items: 4000, vertices: 2000, timeoutMs: 12000 });
const pending = (id, name, reason, url) => ({ id, name, enabled: false, reason, url, attribution: name });
export const WORLD_SOURCES = Object.freeze([
  { id: 'usgs-earthquakes', name: 'USGS earthquakes', enabled: true,
    url: 'https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_day.geojson',
    attribution: 'U.S. Geological Survey', coverage: 'Global reported earthquakes in the past day; incomplete detection coverage.',
    termsUrl: 'https://www.usgs.gov/information-policies-and-instructions/copyrights-and-credits',
    intervalMs: 300000, staleMs: 900000, maxAgeMs: 86400000 },
  { id: 'nws-alerts', name: 'NWS alerts', enabled: true, url: 'https://api.weather.gov/alerts/active',
    attribution: 'NOAA / National Weather Service', coverage: 'US active alerts; zone-only alerts may have no map geometry.',
    termsUrl: 'https://www.weather.gov/documentation/services-web-api',
    intervalMs: 300000, staleMs: 900000, maxAgeMs: 3600000 },
  pending('nasa-eonet-events', 'NASA EONET', 'Existing normalizer available; terms, retention and source qualification pending.', 'https://eonet.gsfc.nasa.gov/'),
  pending('gdacs-alerts', 'GDACS', 'Existing normalizer available; terms, retention and source qualification pending.', 'https://www.gdacs.org/'),
  pending('deflock-osm-alpr-reports', 'DeFlock / OSM aggregates', 'Use existing H3 aggregate pipeline only; World transport integration pending. Never raw camera points.', 'https://www.openstreetmap.org/copyright'),
  pending('celestrak', 'CelesTrak satellites', 'Pending epoch/altitude/reference-frame support and durable two-hour cache with non-200 stop latch. No propagated positions enabled.', 'https://celestrak.org/usage-policy.php'),
  pending('adsb-lol', 'ADSB.lol aviation', 'ODbL obligations and production-contact qualification pending; coverage is incomplete.', 'https://api.adsb.lol/docs'),
  pending('aisstream', 'AISStream maritime', 'License/redistribution clarification and backend relay required.', 'https://aisstream.io/documentation'),
  pending('opensky', 'OpenSky aviation', 'Applicable operational-use agreement required.', 'https://opensky-network.org/about/terms-of-use'),
  pending('fr24', 'Flightradar24', 'Paid API; outside the free-provider scope.', 'https://fr24api.flightradar24.com/docs/faq'),
  pending('wsdot', 'WSDOT', 'Human key and feed-specific terms review required.', 'https://www.wsdot.wa.gov/traffic/api/'),
].map(Object.freeze));

export function iso(value) {
  if (value === null || value === undefined || value === '') return null;
  const ms = typeof value === 'number' ? value : Date.parse(value);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
const text = (value, max = 300) => typeof value === 'string' ? value.slice(0, max) : '';
function sourceLink(value, fallback, host) {
  try { const url = new URL(value); if (url.protocol === 'https:' && url.hostname === host && !url.username && !url.password) return url.href; } catch {}
  return fallback;
}
function collection(value) {
  if (!Array.isArray(value) || value.length > WORLD_LIMITS.items) throw new Error('invalid_or_oversize_items');
  return value;
}

// Reuse existing normalizers without changing their catalog enablement or storing public context as observations.
export function normalizeExistingWorldSource(id, payload, fetchedAt) {
  const adapter = { 'usgs-earthquakes': USGS_EARTHQUAKES_ADAPTER, 'nasa-eonet-events': NASA_EONET_EVENTS_ADAPTER, 'gdacs-alerts': GDACS_ALERTS_ADAPTER }[id];
  if (!adapter) throw new Error('unknown_source');
  const source = WORLD_SOURCES.find((item) => item.id === id);
  const entries = collection(id === 'nasa-eonet-events' ? payload?.events : payload?.features);
  const items = []; let rejected = 0;
  for (const entry of entries) {
    try {
      const one = id === 'nasa-eonet-events' ? { events: [entry] } : { features: [entry] };
      const [record] = adapter.normalize(one, { source: { id, layer_id: id, source_class: 'green_public' } });
      items.push(existingItem(id, record, entry, source, fetchedAt));
    } catch { rejected++; }
  }
  return { items, rejected };
}

function existingItem(id, record, entry, source, fetchedAt) {
  return { id: `${id}:${record.provider_event_id}`, sourceId: id,
    title: text(entry?.properties?.title || entry?.title || record.summary.classification),
    semantics: id === 'usgs-earthquakes' ? 'observed' : 'reported',
    eventAt: record.observed_at, updatedAt: iso(entry?.properties?.updated), fetchedAt,
    expiresAt: null, geometry: { type: 'Point', coordinates: [record.location.longitude, record.location.latitude] },
    sourceUrl: sourceLink(entry?.properties?.url, source.url, 'earthquake.usgs.gov'), attribution: source.attribution,
    uncertainty: 'Provider report; location and magnitude may be revised. Not a local observation or entity evidence.',
    detail: JSON.stringify(record.summary), regions: [] };
}
function validateRing(ring) {
  if (!Array.isArray(ring) || ring.length < 4) throw new Error('invalid_geometry');
  for (const point of ring) {
    if (!Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite)
      || Math.abs(point[0]) > 180 || Math.abs(point[1]) > 90) throw new Error('invalid_geometry');
  }
  if (ring[0][0] !== ring.at(-1)[0] || ring[0][1] !== ring.at(-1)[1]) throw new Error('invalid_geometry');
  return ring.length;
}
function alertGeometry(value) {
  if (value == null) return null;
  if (!['Polygon', 'MultiPolygon'].includes(value.type)) throw new Error('invalid_geometry');
  const polygons = value.type === 'Polygon' ? [value.coordinates] : value.coordinates;
  let vertices = 0;
  if (!Array.isArray(polygons) || !polygons.length) throw new Error('invalid_geometry');
  for (const polygon of polygons) {
    if (!Array.isArray(polygon) || !polygon.length) throw new Error('invalid_geometry');
    for (const ring of polygon) vertices += validateRing(ring);
    if (vertices > WORLD_LIMITS.vertices) throw new Error('invalid_geometry');
  }
  return structuredClone(value);
}
export function normalizeNws(payload, fetchedAt) {
  const items = []; let rejected = 0;
  for (const feature of collection(payload?.features)) {
    try {
      const p = feature?.properties;
      const id = text(p?.id || feature?.id, 240);
      const sent = iso(p?.sent); const expiresAt = iso(p?.expires);
      if (!id || !sent || !expiresAt || p.status !== 'Actual') throw new Error('invalid_alert');
      items.push(nwsItem(feature, p, id, sent, expiresAt, fetchedAt));
    } catch { rejected++; }
  }
  return { items, rejected };
}

function nwsItem(feature, p, id, sent, expiresAt, fetchedAt) {
  return { id: `nws-alerts:${id}`, sourceId: 'nws-alerts', title: text(p.headline || p.event),
        semantics: p.certainty === 'Observed' ? 'observed' : 'predicted', eventAt: iso(p.onset) || iso(p.effective), updatedAt: sent,
        fetchedAt, expiresAt, geometry: alertGeometry(feature.geometry), sourceUrl: sourceLink(p.id, 'https://www.weather.gov/', 'api.weather.gov'),
        attribution: 'NOAA / National Weather Service', uncertainty: `${text(p.certainty)} certainty; ${text(p.severity)} severity. ${text(p.areaDesc)}. Boundaries are alert areas, not measured event positions.`,
        detail: text(p.description, 1500),
        regions: [...new Set((Array.isArray(p.geocode?.UGC) ? p.geocode.UGC : []).map((code) => String(code).slice(0, 2)).filter((code) => /^[A-Z]{2}$/.test(code)))] };

}
