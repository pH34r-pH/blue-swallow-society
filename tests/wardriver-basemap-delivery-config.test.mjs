import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const storageModule = new URL('infra/modules/wardriver-release-storage.bicep', root);
const styleTemplate = new URL('basemap/style.template.json', root);
const publicationWorkflow = new URL('.github/workflows/publish-wardriver-basemap.yml', root);

function parseJson(path) {
  return JSON.parse(read(path));
}

test('Bicep keeps release blobs private and serves basemap objects only from the storage static-website endpoint', () => {
  assert.equal(existsSync(storageModule), true);
  const storage = read('infra/modules/wardriver-release-storage.bicep');
  const main = read('infra/main.bicep');

  assert.match(storage, /allowBlobPublicAccess:\s*false/);
  assert.match(storage, /resource basemapStaticWebsite 'Microsoft\.Storage\/storageAccounts\/staticWebsite@2023-05-01'/);
  assert.match(storage, /indexDocument: 'index\.html'/);
  assert.match(storage, /resource releaseContainer[\s\S]*?publicAccess:\s*'None'/);
  assert.doesNotMatch(storage, /publicAccess:\s*'Blob'/);
  assert.match(storage, /basemapContainerName string = '\$web'/);
  assert.match(storage, /primaryEndpoints\.web/);
  assert.match(storage, /wardriverBasemapStyleUrl/);
  assert.match(main, /wardriverBasemapStyleUrl/);
});

test('the checked-in style is BSS-branded, attributable, and cannot point at a third-party tile origin', () => {
  assert.equal(existsSync(styleTemplate), true);
  const style = parseJson('basemap/style.template.json');

  assert.equal(style.version, 8);
  assert.equal(style.name, 'Blue Swallow Wardriver Basemap');
  assert.equal(style.sources?.['bss-basemap']?.type, 'vector');
  assert.deepEqual(style.sources?.['bss-basemap']?.tiles, ['__BSS_TILE_BASE_URL__/{z}/{x}/{y}.pbf']);
  assert.match(style.sources?.['bss-basemap']?.attribution ?? '', /OpenStreetMap contributors/);
  assert.ok(style.layers.some((layer) => layer.id === 'bss-water'));
  assert.ok(style.layers.some((layer) => layer.id === 'bss-roads'));
  assert.equal(JSON.stringify(style).includes('demotiles.maplibre.org'), false);
  assert.equal(JSON.stringify(style).includes('tile.openstreetmap.org'), false);
});

test('manual basemap publication verifies its source and toolchain, emits provenance, and uses OIDC Blob writes', () => {
  assert.equal(existsSync(publicationWorkflow), true);
  const workflow = read('.github/workflows/publish-wardriver-basemap.yml');

  assert.match(workflow, /workflow_dispatch/);
  assert.match(workflow, /washington/);
  assert.match(workflow, /download\.geofabrik\.de\/north-america\/us\/washington-latest\.osm\.pbf/);
  assert.match(workflow, /planetiler\.jar\.sha256/);
  assert.match(workflow, /actions\/setup-java@v4/);
  assert.match(workflow, /java-version: '21'/);
  assert.match(workflow, /\$JAVA_HOME\/bin\/java/);
  assert.match(workflow, /sha256sum --check/);
  assert.match(workflow, /--auth-mode login/);
  assert.match(workflow, /Storage Blob Data Contributor/);
  assert.match(workflow, /Verify OIDC Blob data-plane access/);
  assert.match(workflow, /az storage container show --auth-mode login/);
  assert.ok(workflow.includes('web\\.core\\.windows\\.net'));
  assert.match(workflow, /PUBLIC_PREFIX: wardriver-basemap/);
  assert.match(workflow, /container" != '\$web'/);
  assert.ok(
    workflow.indexOf('Verify OIDC Blob data-plane access') < workflow.indexOf('Fetch and verify bounded OpenStreetMap input'),
    'data-plane RBAC must fail before the expensive map build',
  );
  assert.match(workflow, /STYLE_OBJECT_PATH: v1\/style\.json/);
  assert.match(workflow, /basemap-provenance\.json/);
  assert.match(workflow, /content-cache-control 'public, max-age=31536000, immutable'/);
  assert.doesNotMatch(workflow, /--account-key/);
  assert.doesNotMatch(workflow, /show-connection-string/);
});
