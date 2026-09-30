const MAPLIBRE = '/api/operator-assets/maplibre-gl.mjs';
export function captureFeatures(rows) {
  return { type: 'FeatureCollection', features: rows.filter((row) => Number.isFinite(row.captureLocation?.latitude)
    && Number.isFinite(row.captureLocation?.longitude)).map((row) => ({ type: 'Feature', id: row.id,
      geometry: { type: 'Point', coordinates: [row.captureLocation.longitude, row.captureLocation.latitude] },
      properties: { id: row.id } })) };
}
export async function createTravelsMap(container, select) {
  const imported = await import(MAPLIBRE);
  const maplibre = imported.default || imported;
  const map = new maplibre.Map({ container, attributionControl: false, center: [0, 0], zoom: 1,
    style: { version: 8, sources: {}, layers: [{ id: 'background', type: 'background', paint: { 'background-color': '#111217' } }] } });
  await new Promise((resolve, reject) => { map.once('load', resolve); map.once('error', (event) => { map.remove(); reject(event.error); }); });
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
