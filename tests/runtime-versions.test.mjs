import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const readJson = (path) => JSON.parse(read(path));

const workflowPaths = [
  '.github/workflows/deploy-static-web-app.yml',
  '.github/workflows/infra-whatif.yml',
  '.github/workflows/azure-static-web-apps-wonderful-pond-0623ed81e.yml',
];

test('GitHub JavaScript actions use Node 24-native major versions', () => {
  for (const path of workflowPaths) {
    const workflow = read(path);
    assert.doesNotMatch(workflow, /actions\/checkout@v[1-4]\b/, path);
    assert.doesNotMatch(workflow, /azure\/login@v[12]\b/, path);
  }

  assert.match(read(workflowPaths[0]), /actions\/checkout@v7\b/);
  assert.match(read(workflowPaths[0]), /azure\/login@v3\b/);
  assert.match(read(workflowPaths[1]), /actions\/checkout@v7\b/);
  assert.match(read(workflowPaths[1]), /azure\/login@v3\b/);
  assert.match(read(workflowPaths[2]), /actions\/checkout@v7\b/);
});

test('VM service and repository development runtime are pinned to Node 24', () => {
  assert.equal(read('.nvmrc').trim(), '24');
  assert.equal(readJson('vm/cybermap-api/package.json').engines.node, '>=24.0.0 <25');
  assert.equal(readJson('vm/cybermap-api/package-lock.json').packages[''].engines.node, '>=24.0.0 <25');

  const installer = read('infra/scripts/install-cybermap-api.sh');
  assert.match(installer, /node --version \| grep -Eq '\^v24\\\.'/);
  assert.match(installer, /https:\/\/deb\.nodesource\.com\/setup_24\.x/);
  assert.doesNotMatch(installer, /setup_(18|20|22)\.x/);
});

test('managed SWA Functions are pinned to the newest Azure-supported Node runtime', () => {
  assert.equal(readJson('app/staticwebapp.config.json').platform.apiRuntime, 'node:22');
  assert.equal(readJson('api/package.json').engines.node, '>=22.0.0 <23');
  assert.equal(readJson('api/package-lock.json').packages[''].engines.node, '>=22.0.0 <23');
});
