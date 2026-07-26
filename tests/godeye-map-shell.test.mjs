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
const operatorMain = read('app/operator/main.js');
const styles = read('app/operator/styles.css');
const registry = maybeRead('app/operator/godeye-layers.mjs');
const analysis = maybeRead('app/operator/godeye-session-analysis.mjs');
const mapController = maybeRead('app/operator/godeye-map.mjs');
const vendorRuntime = new URL('../app/operator/vendor/maplibre-gl.mjs', import.meta.url);
const vendorCss = new URL('../app/operator/vendor/maplibre-gl.css', import.meta.url);
const vendorLicense = new URL('../app/operator/vendor/maplibre-gl-LICENSE.txt', import.meta.url);
const vendorProvenance = new URL('../app/operator/vendor/MAPLIBRE-VENDOR.md', import.meta.url);

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

  assert.match(registry, /GODEYE_LAYER_SPECS/);
  assert.match(analysis, /clearGodeyeSessionAnalysis/);
  assert.match(mapController, /maplibre-gl\.mjs/);
  assert.match(mapController, /\/api\/cybermap\/tiles\/\{z\}\/\{x\}\/\{y\}/);
  assert.match(mapController, /transformRequest/);
  assert.match(mapController, /clear\(/);
  assert.doesNotMatch(`${operatorShell}\n${operatorMain}\n${registry}\n${mapController}`, /cdn\.jsdelivr|unpkg\.com|geolibre/i);
});

test('Godeye workbench styles retain a responsive, operator-only evidence layout', () => {
  ['.godeye-workbench', '.godeye-layer-ledger', '.godeye-inspector', '.godeye-timeline', '.godeye-map-canvas'].forEach((selector) => {
    assert.ok(styles.includes(selector), selector);
  });
  assert.match(styles, /@media\s*\(min-width:\s*1120px\)/);
  assert.ok(!styles.includes('maplibre-gl-ctrl-geocoder'));
});
