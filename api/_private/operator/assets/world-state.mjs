export const WORLD_PRESETS = Object.freeze({
  pnw: { label: 'PNW', center: [-119, 46], zoom: 3.8, boxes: [[-125, 42, -116, 49], [-117, 42, -111, 49]], regions: ['WA', 'OR', 'ID'] },
  wa: { label: 'Washington', center: [-120.5, 47.4], zoom: 5, boxes: [[-125, 45.5, -116.8, 49]], regions: ['WA'] },
  us: { label: 'US', center: [-105, 40], zoom: 2, boxes: [[-125, 24, -66, 50], [-180, 51, -129, 72], [170, 51, 180, 72], [-161, 18, -154, 23]], regions: null },
  global: { label: 'Global', center: [0, 20], zoom: 0.8, boxes: null, regions: null },
});
export const WORLD_PAGE_SIZE = 50;
export const WORLD_ITEM_LIMIT = 8000;
export function validateWorldSnapshot(data) {
  if (data?.version !== 'bss.world.v1' || data.boundary !== 'public_context_not_entity_evidence'
    || !Array.isArray(data.items) || data.items.length > WORLD_ITEM_LIMIT || !Array.isArray(data.sources) || data.sources.length > 20) throw new Error('World response unavailable.');
  const ids = new Set(data.sources.map((source) => source.id));
  const itemIds = new Set();
  for (const item of data.items) {
    if (!ids.has(item.sourceId) || typeof item.id !== 'string' || itemIds.has(item.id)
      || typeof item.title !== 'string' || !['observed', 'reported', 'predicted', 'historical'].includes(item.semantics)
      || !['fresh', 'stale'].includes(item.freshness)) throw new Error('World response unavailable.');
    itemIds.add(item.id);
  }
  return data;
}
function coordinates(geometry) {
  if (!geometry) return [];
  if (geometry.type === 'Point') return [geometry.coordinates];
  if (geometry.type === 'Polygon') return geometry.coordinates.flat();
  if (geometry.type === 'MultiPolygon') return geometry.coordinates.flat(2);
  return [];
}
function inPreset(item, preset) {
  if (!preset.boxes) return true;
  if (item.sourceId === 'nws-alerts' && item.regions?.length) {
    return !preset.regions || item.regions.some((region) => preset.regions.includes(region));
  }
  const points = coordinates(item.geometry);
  if (!points.length) return false;
  return preset.boxes.some(([west, south, east, north]) => points.some(([lon, lat]) => lon >= west && lon <= east && lat >= south && lat <= north));
}
export function filterWorld(data, { preset = 'pnw', sources = [], search = '', semantics = 'all', sort = 'newest', page = 0 } = {}) {
  const region = WORLD_PRESETS[preset] || WORLD_PRESETS.pnw;
  const selected = new Set(sources); const needle = String(search).trim().toLowerCase().slice(0, 160);
  const all = (data?.items || []).filter((item) => selected.has(item.sourceId) && inPreset(item, region)
    && (semantics === 'all' || item.semantics === semantics)
    && (!needle || `${item.title} ${item.detail} ${item.sourceId}`.toLowerCase().includes(needle)));
  all.sort(sort === 'title' ? (a, b) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id)
    : (a, b) => (Date.parse(b.eventAt) || 0) - (Date.parse(a.eventAt) || 0) || a.id.localeCompare(b.id));
  const pages = Math.max(1, Math.ceil(all.length / WORLD_PAGE_SIZE));
  const current = Math.min(pages - 1, Math.max(0, Number.isInteger(page) ? page : 0));
  return { all, items: all.slice(current * WORLD_PAGE_SIZE, (current + 1) * WORLD_PAGE_SIZE), total: all.length, pages, page: current };
}
export function safeWorldLink(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'https:' && !url.username && !url.password) return url.href;
  } catch {}
  return null;
}

export function worldGeometryBudget(items) {
  const features = []; let vertices = 0;
  for (const item of items) {
    const count = coordinates(item.geometry).length;
    if (!count || vertices + count > 20000) continue;
    if (features.length >= 1000) break;
    vertices += count; features.push(item);
  }
  return { items: features, vertices };
}

export function sourceFreshness(source, at = Date.now()) {
  if (!source.enabled) return 'disabled';
  if (source.error) return 'failure';
  if (!source.fetchedAt) return 'unavailable';
  const age = at - Date.parse(source.fetchedAt);
  if (age > source.maxAgeMs) return 'expired';
  if (age > source.staleMs) return 'stale';
  return source.state;
}
