import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDeflockGlobalClient,
  renderDeflockGlobalMap,
} from '../api/_private/operator/assets/deflock-global.mjs';

const request = {
  schema_version: 'bss.global_viewport_request.v1',
  bbox: { west: -125, south: 24, east: -66, north: 50 },
  zoom: 3,
  layer_ids: ['deflock-osm-alpr-reports'],
  cell_limit: 600,
};

function response(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

test('Deflock aggregate client preserves the fixed authenticated viewport request and status message', async () => {
  const payload = {
    schema_version: 'bss.global_viewport_response.v1',
    cells: [{ report_count: 2 }],
    sources: [{ source_id: 'deflock-osm-alpr-reports', status: 'fresh' }],
  };
  const requests = [];
  const client = createDeflockGlobalClient({
    endpoint: '/api/cybermap/global-viewport',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return response(payload);
    },
    getHeaders: () => ({ 'X-Blue-Swallow-Operator-Token': 'operator-session-token' }),
  });

  const result = await client.load(request);

  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, '/api/cybermap/global-viewport');
  assert.equal(requests[0].options.method, 'POST');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[0].options.cache, 'no-store');
  assert.deepEqual(requests[0].options.headers, { 'X-Blue-Swallow-Operator-Token': 'operator-session-token' });
  assert.equal(requests[0].options.body, JSON.stringify(request));
  assert.deepEqual(result.payload, payload);
  assert.equal(result.message, 'Public-reports layer fresh; displaying 1 coarse aggregate cell.');
});

test('Deflock aggregate client preserves disabled and stale catalog states', async () => {
  for (const [status, expected] of [
    ['disabled', 'Public-reports layer is disabled by catalog configuration.'],
    ['stale', 'Public-reports layer is stale; displaying 2 coarse aggregate cells with its source warning.'],
  ]) {
    const client = createDeflockGlobalClient({
      endpoint: '/api/cybermap/global-viewport',
      fetchImpl: async () => response({
        schema_version: 'bss.global_viewport_response.v1',
        cells: [{}, {}],
        sources: [{ source_id: 'deflock-osm-alpr-reports', status }],
      }),
    });

    assert.equal((await client.load(request)).message, expected);
  }
});

test('Deflock aggregate client rejects non-materialized responses', async () => {
  const client = createDeflockGlobalClient({
    endpoint: '/api/cybermap/global-viewport',
    fetchImpl: async () => response({ message: 'catalog unavailable' }, 503),
  });

  await assert.rejects(() => client.load(request), /catalog unavailable/);
});

function element(tagName) {
  return {
    tagName,
    children: [],
    style: {},
    textContent: '',
    className: '',
    title: '',
    appendChild(child) {
      this.children.push(child);
    },
    replaceChildren(...children) {
      this.children = children.flatMap((child) => child.tagName === 'fragment' ? child.children : [child]);
    },
  };
}

test('Deflock map renderer keeps attribution, skips malformed cells, and caps display labels', () => {
  const layer = element('section');
  const labels = new Map();
  renderDeflockGlobalMap({
    cellLayer: layer,
    data: {
      sources: [{ source_id: 'deflock-osm-alpr-reports', attribution: 'Synthetic OSM attribution' }],
      cells: [
        { centroid: { latitude: 39, longitude: -100 }, report_count: 120, resolution: 5 },
        { centroid: { latitude: 39, longitude: 'invalid' }, report_count: 1, resolution: 5 },
        { centroid: { latitude: 40, longitude: -99 }, report_count: 1, resolution: 5 },
      ],
    },
    bbox: request.bbox,
    setText: (id, value) => labels.set(id, value),
    documentRef: {
      createElement: element,
      createDocumentFragment: () => element('fragment'),
    },
  });

  assert.equal(labels.get('deflockGlobalAttribution'), 'Synthetic OSM attribution');
  assert.equal(layer.children.length, 2);
  assert.equal(layer.children[0].textContent, '99+');
  assert.match(layer.children[0].title, /120 reports/);
  assert.equal(layer.children[1].textContent, '1');
  assert.equal(layer.children[1].style.left, `${((-99 - request.bbox.west) / (request.bbox.east - request.bbox.west)) * 100}%`);
});
