import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const maybeRead = (path) => {
  const url = new URL(path, root);
  return existsSync(url) ? readFileSync(url, 'utf8') : '';
};

const operatorShell = read('api/_private/operator/shell.html');
const operatorAssets = read('api/operator-assets/index.js');
const operatorMain = read('api/_private/operator/assets/main.js');
const styles = read('api/_private/operator/assets/styles.css');
const registry = maybeRead('api/_private/operator/assets/godeye-layers.mjs');
const analysis = maybeRead('api/_private/operator/assets/godeye-session-analysis.mjs');
const mapController = maybeRead('api/_private/operator/assets/godeye-map.mjs');
const vendorRuntime = new URL('../api/_private/operator/assets/maplibre-gl.mjs', import.meta.url);
const vendorCss = new URL('../api/_private/operator/assets/maplibre-gl.css', import.meta.url);
const vendorLicense = new URL('../api/_private/operator/assets/maplibre-gl-LICENSE.txt', import.meta.url);
const vendorProvenance = new URL('../api/_private/operator/assets/MAPLIBRE-VENDOR.md', import.meta.url);

test('Godeye workbench uses a self-hosted MapLibre runtime and fixed BSS map controls', () => {
  assert.equal(existsSync(vendorRuntime), true);
  assert.equal(existsSync(vendorCss), true);
  assert.equal(existsSync(vendorLicense), true);
  assert.equal(existsSync(vendorProvenance), true);
  assert.match(readFileSync(vendorProvenance, 'utf8'), /maplibre-gl@6\.0\.0/);

  ['godeyeLayerLedger', 'godeyeSourceHealth', 'godeyeSelectedCell', 'godeyeTimeline', 'godeyeMapCanvas'].forEach((id) => {
    assert.ok(operatorShell.includes(`id="${id}"`), id);
  });
  assert.ok(!operatorShell.includes('wigleEndpointInput'));
  assert.ok(!operatorShell.includes('wigleConnectBtn'));
  assert.match(operatorMain, /createGodeyeMapController/);
  assert.doesNotMatch(operatorMain, /buildTileGrid|wigleEndpoint|sameOriginPath/);

  ['godeye-layers.mjs', 'godeye-session-analysis.mjs', 'godeye-map.mjs', 'maplibre-gl.mjs', 'maplibre-gl-shared.mjs', 'maplibre-gl-worker.mjs', 'maplibre-gl.css'].forEach((asset) => {
    assert.ok(operatorAssets.includes(`'${asset}'`), asset);
  });

  assert.match(registry, /GODEYE_LAYER_SPECS/);
  assert.match(analysis, /clearGodeyeSessionAnalysis/);
  assert.match(mapController, /\/api\/operator-assets\/maplibre-gl\.mjs/);
  assert.match(mapController, /\/api\/cybermap\/tiles\/\{z\}\/\{x\}\/\{y\}/);
  assert.match(mapController, /transformRequest/);
  assert.match(mapController, /clear\(/);
  assert.doesNotMatch(`${operatorShell}\n${operatorMain}\n${registry}\n${mapController}`, /cdn\.jsdelivr|unpkg\.com|geolibre|\/operator\/vendor/i);
});

test('Godeye workbench styles retain a responsive, operator-only evidence layout', () => {
  ['.godeye-workbench', '.godeye-layer-ledger', '.godeye-inspector', '.godeye-timeline', '.godeye-map-canvas'].forEach((selector) => {
    assert.ok(styles.includes(selector), selector);
  });
  assert.match(styles, /@media\s*\(min-width:\s*1120px\)/);
  assert.ok(!styles.includes('maplibre-gl-ctrl-geocoder'));
});
