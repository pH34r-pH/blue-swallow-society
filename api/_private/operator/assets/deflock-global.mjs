const DEFAULT_ATTRIBUTION = '© OpenStreetMap contributors; data available under ODbL. DeFlock delivery reference.';

export function createDeflockGlobalClient({
  endpoint,
  fetchImpl = fetch,
  getHeaders = () => ({}),
} = {}) {
  return Object.freeze({ load });

  async function load(request) {
    const response = await fetchImpl(endpoint, {
      method: 'POST',
      headers: getHeaders(),
      credentials: 'same-origin',
      cache: 'no-store',
      body: JSON.stringify(request),
    });
    const payload = await response.json();
    if (!response.ok || payload?.schema_version !== 'bss.global_viewport_response.v1') {
      throw new Error(payload?.message || `HTTP ${response.status}`);
    }

    return Object.freeze({
      payload,
      message: describeDeflockStatus(payload),
    });
  }
}

export function renderDeflockGlobalMap({
  cellLayer,
  data,
  bbox,
  setText,
  documentRef = document,
} = {}) {
  if (!cellLayer) {
    return;
  }

  const attribution = data?.sources?.find((entry) => entry.source_id === 'deflock-osm-alpr-reports')?.attribution
    || DEFAULT_ATTRIBUTION;
  setText('deflockGlobalAttribution', attribution);
  const fragment = documentRef.createDocumentFragment();
  for (const cell of data?.cells ?? []) {
    const latitude = Number(cell?.centroid?.latitude);
    const longitude = Number(cell?.centroid?.longitude);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) continue;
    const marker = documentRef.createElement('span');
    marker.className = 'deflock-global-cell';
    marker.style.left = `${((longitude - bbox.west) / (bbox.east - bbox.west)) * 100}%`;
    marker.style.top = `${((bbox.north - latitude) / (bbox.north - bbox.south)) * 100}%`;
    const count = Math.max(0, Number(cell.report_count) || 0);
    marker.textContent = count > 99 ? '99+' : String(count);
    marker.title = `Public-reported aggregate: ${count} report${count === 1 ? '' : 's'} at H3 resolution ${cell.resolution}.`;
    fragment.appendChild(marker);
  }
  cellLayer.replaceChildren(fragment);
}

function describeDeflockStatus(payload) {
  const source = payload.sources?.find((entry) => entry.source_id === 'deflock-osm-alpr-reports');
  const count = Array.isArray(payload.cells) ? payload.cells.length : 0;
  const status = source?.status || 'unknown';
  if (status === 'disabled') {
    return 'Public-reports layer is disabled by catalog configuration.';
  }
  if (status === 'stale') {
    return `Public-reports layer is stale; displaying ${count} coarse aggregate cell${count === 1 ? '' : 's'} with its source warning.`;
  }
  return `Public-reports layer ${status}; displaying ${count} coarse aggregate cell${count === 1 ? '' : 's'}.`;
}
