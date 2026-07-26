import test from 'node:test';
import assert from 'node:assert/strict';

import {
  GODEYE_LAYER_SPECS,
  defaultGodeyeLayerState,
  layerIsActiveAtZoom,
  parseGodeyeLayerSearch,
  serializeGodeyeLayerSearch,
} from '../api/_private/operator/assets/godeye-layers.mjs';

test('Godeye layer registry is frozen, reviewed, and constrained to BSS transports', () => {
  assert.equal(Object.isFrozen(GODEYE_LAYER_SPECS), true);
  assert.deepEqual(GODEYE_LAYER_SPECS.map((layer) => layer.id), ['green-cells', 'current-context']);

  for (const layer of GODEYE_LAYER_SPECS) {
    assert.equal(Object.isFrozen(layer), true);
    assert.equal(typeof layer.title, 'string');
    assert.ok(['mvt', 'viewport-geojson'].includes(layer.transport));
    assert.equal(typeof layer.defaultVisible, 'boolean');
    assert.ok(Number.isInteger(layer.minZoom));
    assert.ok(Number.isInteger(layer.maxZoom));
    assert.ok(Array.isArray(layer.safeSelectionFields));
    assert.ok(layer.safeSelectionFields.length > 0);
  }

  const cells = GODEYE_LAYER_SPECS.find((layer) => layer.id === 'green-cells');
  assert.deepEqual(cells.sourceClasses, ['green_public', 'green_owned', 'green_authorized']);
  assert.equal(cells.pathTemplate, '/api/cybermap/tiles/{z}/{x}/{y}');
  assert.equal(cells.minZoom, 0);
  assert.equal(cells.maxZoom, 12);

  const serialized = JSON.stringify(GODEYE_LAYER_SPECS).toLowerCase();
  ['plugin', 'project', 'manifest', 'remoteurl', 'file', 'postgis', 'sql', 'http://', 'https://'].forEach((forbidden) => {
    assert.equal(serialized.includes(forbidden), false, `${forbidden} is not a layer-registry capability`);
  });
});

test('Godeye layer state accepts only reviewed IDs and never retains coordinate-bearing URL state', () => {
  assert.deepEqual(defaultGodeyeLayerState(), { visibleLayerIds: ['green-cells', 'current-context'] });

  assert.deepEqual(parseGodeyeLayerSearch('?godeyeLayer=green-cells'), { visibleLayerIds: ['green-cells'] });
  assert.deepEqual(parseGodeyeLayerSearch('?godeyeLayer=unknown'), defaultGodeyeLayerState());
  assert.deepEqual(parseGodeyeLayerSearch('?godeyeLayer=green-cells&lat=47.6062&lon=-122.3321'), defaultGodeyeLayerState());

  assert.equal(serializeGodeyeLayerSearch({ visibleLayerIds: ['green-cells'] }), '?godeyeLayer=green-cells');
  assert.equal(serializeGodeyeLayerSearch({ visibleLayerIds: ['current-context'] }), '?godeyeLayer=current-context');
  assert.equal(serializeGodeyeLayerSearch({ visibleLayerIds: ['unknown'] }), '');
});

test('Godeye layer zoom applicability is deterministic and bounded', () => {
  const cells = GODEYE_LAYER_SPECS.find((layer) => layer.id === 'green-cells');
  const context = GODEYE_LAYER_SPECS.find((layer) => layer.id === 'current-context');

  assert.equal(layerIsActiveAtZoom(cells, 0), true);
  assert.equal(layerIsActiveAtZoom(cells, 12), true);
  assert.equal(layerIsActiveAtZoom(cells, 13), false);
  assert.equal(layerIsActiveAtZoom(context, 13), true);
  assert.equal(layerIsActiveAtZoom(context, 19), false);
  assert.equal(layerIsActiveAtZoom(context, Number.NaN), false);
});
