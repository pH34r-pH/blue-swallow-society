const EMPTY = { type: 'FeatureCollection', features: [] };
export async function createWorldMap({ container, onSelect = () => {}, onFailure = () => {} }) {
  if (!document.querySelector('[data-world-map-css]')) {
    const link = document.createElement('link'); link.rel = 'stylesheet'; link.href = '/api/operator-assets/maplibre-gl.css'; link.dataset.worldMapCss = ''; document.head.append(link);
  }
  const module = await import('./maplibre-gl.mjs'); const lib = module.default || module;
  let map;
  try {
    map = new lib.Map({ container, style: { version: 8, projection: { type: 'globe' },
      sources: { land: { type: 'geojson', data: '/api/operator-assets/world-land.geojson', attribution: 'Made with Natural Earth (public domain)' } },
      layers: [{ id: 'ocean', type: 'background', paint: { 'background-color': '#122536' } },
        { id: 'land', type: 'fill', source: 'land', paint: { 'fill-color': '#35534e' } }] },
      center: [-119, 46], zoom: 3.8, maxZoom: 6, pixelRatio: Math.min(devicePixelRatio || 1, 1.5),
      attributionControl: true, renderWorldCopies: false, fadeDuration: 0 });
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Globe initialization timed out.')), 12000);
      map.once('load', () => { clearTimeout(timeout); resolve(); });
      map.once('error', () => { clearTimeout(timeout); reject(new Error('Globe unavailable.')); });
    });
    map.addSource('context', { type: 'geojson', data: EMPTY });
    map.addLayer({ id: 'alert-areas', source: 'context', type: 'fill', filter: ['==', ['geometry-type'], 'Polygon'],
      paint: { 'fill-color': '#f0ba69', 'fill-opacity': 0.3 } });
    map.addLayer({ id: 'event-points', source: 'context', type: 'circle', filter: ['==', ['geometry-type'], 'Point'],
      paint: { 'circle-radius': 5, 'circle-color': ['match', ['get', 'freshness'], 'stale', '#99a5a9', '#e8bd78'], 'circle-stroke-color': '#182b38', 'circle-stroke-width': 1 } });
    map.addControl(new lib.NavigationControl({ showCompass: true }));
    for (const layer of ['event-points', 'alert-areas']) map.on('click', layer, (event) => onSelect(event.features?.[0]?.properties?.id));
    map.getCanvas().addEventListener('webglcontextlost', onFailure);
    map.on('error', onFailure);
    return { set(items, preset) {
      map.getSource('context').setData({ type: 'FeatureCollection', features: items.filter((item) => item.geometry).map((item) => ({
        type: 'Feature', geometry: item.geometry, properties: { id: item.id, freshness: item.freshness } })) });
      map.jumpTo({ center: preset.center, zoom: preset.zoom });
    }, resize: () => map.resize(), destroy: () => map.remove(), projection: () => map.getProjection().type };
  } catch (error) { map?.remove(); throw error; }
}
