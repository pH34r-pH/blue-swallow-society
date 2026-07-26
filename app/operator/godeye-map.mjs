import { GODEYE_LAYER_SPECS } from './godeye-layers.mjs';

const MAPLIBRE_MODULE = '/operator/vendor/maplibre-gl.mjs';
const MAPLIBRE_STYLESHEET = '/operator/vendor/maplibre-gl.css';
const TILE_TEMPLATE = '/api/cybermap/tiles/{z}/{x}/{y}';
const EMPTY_FEATURE_COLLECTION = Object.freeze({ type: 'FeatureCollection', features: Object.freeze([]) });
const DEFAULT_CENTER = Object.freeze([-122.3321, 47.6062]);
const GREEN_CELL_LAYER_ID = 'godeye-green-cells';
const CURRENT_CONTEXT_LAYER_ID = 'godeye-current-context';

function loadStylesheet() {
  const existing = document.getElementById('bss-maplibre-styles');
  if (existing) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const link = document.createElement('link');
    link.id = 'bss-maplibre-styles';
    link.rel = 'stylesheet';
    link.href = MAPLIBRE_STYLESHEET;
    link.addEventListener('load', resolve, { once: true });
    link.addEventListener('error', () => reject(new Error('The local MapLibre stylesheet could not be loaded.')), { once: true });
    document.head.appendChild(link);
  });
}

async function loadMapLibre() {
  await loadStylesheet();
  const module = await import(MAPLIBRE_MODULE);
  const maplibre = module.default || module;
  if (typeof maplibre?.Map !== 'function') throw new Error('The local MapLibre renderer is unavailable.');
  return maplibre;
}

function baseStyle() {
  return {
    version: 8,
    sources: {
      'operator-basemap': {
        type: 'raster',
        tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        tileSize: 256,
        maxzoom: 19,
        attribution: '© OpenStreetMap contributors',
      },
    },
    layers: [
      { id: 'operator-background', type: 'background', paint: { 'background-color': '#111217' } },
      { id: 'operator-basemap', type: 'raster', source: 'operator-basemap', paint: { 'raster-opacity': 0.74, 'raster-saturation': -0.78, 'raster-contrast': 0.16 } },
    ],
  };
}

function finiteCoordinate(value) {
  return typeof value === 'number' && Number.isFinite(value);
}

function viewportFeatures(accessPoints) {
  const features = [];
  for (const record of Array.isArray(accessPoints) ? accessPoints : []) {
    if (!finiteCoordinate(record?.lat) || !finiteCoordinate(record?.lon)) continue;
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [record.lon, record.lat] },
      properties: {
        kind: String(record.kind || 'observation').slice(0, 48),
        sourceClass: String(record.sourceClass || 'unknown').slice(0, 48),
        observedAt: typeof record.observedAt === 'string' ? record.observedAt : '',
        distanceMeters: finiteCoordinate(record.distanceMeters) ? Math.round(record.distanceMeters) : null,
      },
    });
  }
  return { type: 'FeatureCollection', features };
}

function locationFeatures(location) {
  if (!finiteCoordinate(location?.lat) || !finiteCoordinate(location?.lon)) return EMPTY_FEATURE_COLLECTION;
  return {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [location.lon, location.lat] },
      properties: { accuracyMeters: finiteCoordinate(location.accuracy) ? Math.round(location.accuracy) : null },
    }],
  };
}

function setGeoJsonData(map, sourceId, data) {
  const source = map.getSource(sourceId);
  if (source?.setData) source.setData(data);
}

function currentLayerVisible(layerState, layerId) {
  return Array.isArray(layerState?.visibleLayerIds) && layerState.visibleLayerIds.includes(layerId);
}

function selectionFromFeature(feature) {
  const source = feature?.properties || {};
  return {
    h3Cell: source.h3_cell || null,
    resolution: source.resolution || null,
    observationCount: source.observation_count || null,
    entityCount: source.entity_count || null,
    salience: source.salience || null,
    sourceClassSummary: source.source_class_summary || null,
    freshnessStatus: source.freshness_status || null,
    caveatStatus: source.caveat_status || null,
  };
}

export function createGodeyeMapController({ container, getHeaders = () => ({}), onCellSelect = () => {}, onStatus = () => {} } = {}) {
  let map = null;
  let initializing = null;
  let centeredOnCurrentFix = false;
  let latestContext = { location: null, accessPoints: [], layerState: { visibleLayerIds: [] } };

  async function initialize() {
    if (map) return map;
    if (initializing) return initializing;
    if (!container) throw new Error('Godeye map container is unavailable.');
    initializing = loadMapLibre().then((maplibre) => new Promise((resolve, reject) => {
      const nextMap = new maplibre.Map({
        container,
        style: baseStyle(),
        center: DEFAULT_CENTER,
        zoom: 11,
        minZoom: 2,
        maxZoom: 18,
        attributionControl: true,
        transformRequest: (url) => {
          const target = new URL(url, window.location.origin);
          if (target.origin === window.location.origin && target.pathname.startsWith('/api/cybermap/tiles/')) {
            return { url: target.toString(), headers: getHeaders() };
          }
          return { url };
        },
      });
      nextMap.once('load', () => {
        map = nextMap;
        map.addSource('bss-green-cells', {
          type: 'vector',
          tiles: [TILE_TEMPLATE],
          minzoom: 0,
          maxzoom: 12,
        });
        map.addLayer({
          id: GREEN_CELL_LAYER_ID,
          type: 'fill',
          source: 'bss-green-cells',
          'source-layer': 'green_cells',
          paint: {
            'fill-color': '#759f87',
            'fill-opacity': 0.26,
            'fill-outline-color': '#9db0a3',
          },
        });
        map.addSource('bss-current-context', { type: 'geojson', data: EMPTY_FEATURE_COLLECTION });
        map.addLayer({
          id: CURRENT_CONTEXT_LAYER_ID,
          type: 'circle',
          source: 'bss-current-context',
          paint: {
            'circle-radius': 5,
            'circle-color': '#d7b872',
            'circle-opacity': 0.92,
            'circle-stroke-color': '#1d2321',
            'circle-stroke-width': 1.25,
          },
        });
        map.addSource('bss-current-fix', { type: 'geojson', data: EMPTY_FEATURE_COLLECTION });
        map.addLayer({
          id: 'godeye-current-fix',
          type: 'circle',
          source: 'bss-current-fix',
          paint: {
            'circle-radius': 7,
            'circle-color': '#f3ead2',
            'circle-stroke-color': '#465d74',
            'circle-stroke-width': 2,
          },
        });
        map.on('click', GREEN_CELL_LAYER_ID, (event) => {
          const feature = event.features?.[0];
          if (feature) onCellSelect(selectionFromFeature(feature));
        });
        map.on('mouseenter', GREEN_CELL_LAYER_ID, () => { map.getCanvas().style.cursor = 'crosshair'; });
        map.on('mouseleave', GREEN_CELL_LAYER_ID, () => { map.getCanvas().style.cursor = ''; });
        map.on('error', (event) => {
          if (event?.error?.message) onStatus(`Map rendering issue: ${event.error.message}`);
        });
        sync();
        resolve(map);
      });
      nextMap.once('error', (event) => reject(event?.error || new Error('MapLibre could not initialize.')));
    })).catch((error) => {
      container.dataset.mapState = 'unavailable';
      onStatus(`Managed map unavailable: ${error.message}`);
      throw error;
    }).finally(() => { initializing = null; });
    return initializing;
  }

  function sync() {
    if (!map) return;
    setGeoJsonData(map, 'bss-current-context', viewportFeatures(latestContext.accessPoints));
    setGeoJsonData(map, 'bss-current-fix', locationFeatures(latestContext.location));
    map.setLayoutProperty(GREEN_CELL_LAYER_ID, 'visibility', currentLayerVisible(latestContext.layerState, 'green-cells') ? 'visible' : 'none');
    map.setLayoutProperty(CURRENT_CONTEXT_LAYER_ID, 'visibility', currentLayerVisible(latestContext.layerState, 'current-context') ? 'visible' : 'none');
    const location = latestContext.location;
    if (!centeredOnCurrentFix && finiteCoordinate(location?.lat) && finiteCoordinate(location?.lon)) {
      map.jumpTo({ center: [location.lon, location.lat], zoom: 15 });
      centeredOnCurrentFix = true;
    }
  }

  return {
    async setContext({ location = null, accessPoints = [], layerState = { visibleLayerIds: [] } } = {}) {
      latestContext = { location, accessPoints, layerState };
      await initialize();
      sync();
    },
    setLayerState(layerState) {
      latestContext = { ...latestContext, layerState };
      sync();
    },
    clear() {
      latestContext = { location: null, accessPoints: [], layerState: { visibleLayerIds: [] } };
      centeredOnCurrentFix = false;
      sync();
    },
    destroy() {
      latestContext = { location: null, accessPoints: [], layerState: { visibleLayerIds: [] } };
      centeredOnCurrentFix = false;
      map?.remove();
      map = null;
      container?.replaceChildren();
    },
    resize() {
      map?.resize();
    },
  };
}

export { GODEYE_LAYER_SPECS, TILE_TEMPLATE };
