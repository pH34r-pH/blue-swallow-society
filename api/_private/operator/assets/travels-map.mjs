const MAPLIBRE = '/api/operator-assets/maplibre-gl.mjs';
function validCapture(row) {
  const { latitude, longitude } = row.captureLocation || {};
  return Number.isFinite(latitude) && Math.abs(latitude) <= 90 && Number.isFinite(longitude) && Math.abs(longitude) <= 180;
}
export function captureFeatures(rows) {
  return { type: 'FeatureCollection', features: rows.filter(validCapture).map((row) => ({ type: 'Feature', id: row.id,
      geometry: { type: 'Point', coordinates: [row.captureLocation.longitude, row.captureLocation.latitude] },
      properties: { id: row.id } })) };
}
export async function createTravelsMap(container, select) {
  const imported = await import(MAPLIBRE);
  const maplibre = imported.default || imported;
  const map = new maplibre.Map({ container, attributionControl: true, center: [0, 0], zoom: 1,
    style: { version: 8, sources: { basemap: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© OpenStreetMap contributors' } }, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#111217' } }, { id: 'basemap', type: 'raster', source: 'basemap', paint: { 'raster-opacity': 0.7 } }] } });
  await new Promise((resolve, reject) => {
    const fail = (error) => { clearTimeout(timer); map.off('load', loaded); map.off('error', failed); map.remove(); reject(error); };
    const loaded = () => { clearTimeout(timer); map.off('error', failed); resolve(); };
    const failed = (event) => fail(event.error);
    const timer = setTimeout(() => fail(new Error('Map initialization timed out')), 4000);
    map.once('load', loaded); map.once('error', failed);
  });
  map.addSource('captures', { type: 'geojson', data: captureFeatures([]) });
  map.addLayer({ id: 'captures', type: 'circle', source: 'captures', paint: { 'circle-radius': 6, 'circle-color': '#c2d4e6', 'circle-stroke-color': '#4d6d92', 'circle-stroke-width': 2 } });
  map.on('click', 'captures', (event) => { if (event.features?.[0]) select(event.features[0].properties.id); });
  return {
    set(rows, selectedId) {
      const data = captureFeatures(rows);
      map.getSource('captures').setData(data);
      map.setPaintProperty('captures', 'circle-radius', ['case', ['==', ['get', 'id'], selectedId || ''], 10, 6]);
      if (data.features.length) {
        const bounds = new maplibre.LngLatBounds();
        for (const feature of data.features) bounds.extend(feature.geometry.coordinates);
        map.fitBounds(bounds, { padding: 30, maxZoom: 16, duration: 0 });
      }
      map.resize();
    },
    destroy() { map.remove(); },
  };
}
