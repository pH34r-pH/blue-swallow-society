const GREEN_SOURCE_CLASSES = Object.freeze(['green_public', 'green_owned', 'green_authorized']);

function freezeLayer(specification) {
  return Object.freeze({
    ...specification,
    sourceClasses: Object.freeze([...specification.sourceClasses]),
    safeSelectionFields: Object.freeze([...specification.safeSelectionFields]),
  });
}

export const GODEYE_LAYER_SPECS = Object.freeze([
  freezeLayer({
    id: 'green-cells',
    title: 'Managed green cells',
    transport: 'mvt',
    pathTemplate: '/api/cybermap/tiles/{z}/{x}/{y}',
    sourceClasses: GREEN_SOURCE_CLASSES,
    minZoom: 0,
    maxZoom: 12,
    defaultVisible: true,
    legend: 'Summary materializations from approved green sources only.',
    health: 'Gateway-backed materialization',
    safeSelectionFields: ['h3_cell', 'resolution', 'observation_count', 'entity_count', 'salience', 'source_class_summary', 'freshness_status', 'caveat_status'],
  }),
  freezeLayer({
    id: 'current-context',
    title: 'Current authorized context',
    transport: 'viewport-geojson',
    pathTemplate: '/api/cybermap/viewport',
    sourceClasses: Object.freeze(['green_public', 'green_owned', 'green_authorized', 'owned_device', 'local_observation']),
    minZoom: 0,
    maxZoom: 18,
    defaultVisible: true,
    legend: 'Transient nearby observations from the existing POST viewport contract.',
    health: 'GPS-bound, session-only',
    safeSelectionFields: ['kind', 'sourceClass', 'observedAt', 'distanceMeters'],
  }),
]);

const LAYER_IDS = new Set(GODEYE_LAYER_SPECS.map((layer) => layer.id));

export function defaultGodeyeLayerState() {
  return { visibleLayerIds: GODEYE_LAYER_SPECS.filter((layer) => layer.defaultVisible).map((layer) => layer.id) };
}

export function layerIsActiveAtZoom(layer, zoom) {
  return Boolean(layer)
    && Number.isFinite(zoom)
    && zoom >= layer.minZoom
    && zoom <= layer.maxZoom;
}

export function parseGodeyeLayerSearch(search = '') {
  const query = new URLSearchParams(String(search).replace(/^\?/, ''));
  const entries = [...query.entries()];
  if (entries.length === 0) return defaultGodeyeLayerState();
  if (entries.length !== 1 || entries[0][0] !== 'godeyeLayer') return defaultGodeyeLayerState();
  const layerId = entries[0][1];
  return LAYER_IDS.has(layerId) ? { visibleLayerIds: [layerId] } : defaultGodeyeLayerState();
}

export function serializeGodeyeLayerSearch(state = {}) {
  const visible = Array.isArray(state.visibleLayerIds) ? state.visibleLayerIds : [];
  const approved = visible.filter((layerId) => LAYER_IDS.has(layerId));
  return approved.length === 1 ? `?godeyeLayer=${encodeURIComponent(approved[0])}` : '';
}

export function getGodeyeLayerSpec(layerId) {
  return GODEYE_LAYER_SPECS.find((layer) => layer.id === layerId) || null;
}
