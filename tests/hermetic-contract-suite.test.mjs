import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const rootPath = fileURLToPath(root);
const read = (path) => readFileSync(new URL(path, root), 'utf8').replace(/\r\n/g, '\n');

const browserTests = [
  'tests/root-login-handoff-browser.test.mjs',
  'tests/tzeentch-browser.test.mjs',
  'tests/morning-brief-browser.test.mjs',
];

test('root contract manifest defines a portable bootstrap and separate browser gate', () => {
  assert.equal(existsSync(fileURLToPath(new URL('package.json', root))), true);
  const manifest = JSON.parse(read('package.json'));
  assert.equal(manifest.private, true);
  assert.equal(manifest.scripts.bootstrap, 'node scripts/bootstrap-contract-tests.mjs');
  assert.equal(manifest.scripts.test, 'node --test tests/*.test.mjs');
  assert.equal(manifest.scripts['test:browser'], 'node scripts/run-browser-contracts.mjs');

  const bootstrap = read('scripts/bootstrap-contract-tests.mjs');
  assert.match(bootstrap, /npm[\s\S]*ci[\s\S]*--ignore-scripts[\s\S]*--prefix[\s\S]*api/);
});

test('root contracts use portable file URLs and a shared Python launcher', () => {
  const boundary = read('tests/backend-boundary.test.mjs');
  assert.match(boundary, /fileURLToPath\(new URL\('\.\.\/api\/'/);
  assert.doesNotMatch(boundary, /new URL\('\.\.\/api\/'[^\n]*\.pathname/);

  const launcherPath = fileURLToPath(new URL('tests/helpers/python-launcher.mjs', root));
  assert.equal(existsSync(launcherPath), true);
  const launcher = read('tests/helpers/python-launcher.mjs');
  assert.match(launcher, /BSS_PYTHON/);
  assert.match(launcher, /py[\s\S]*-3/);
  assert.match(launcher, /python3/);
  for (const file of ['tests/paper-state-contract.test.mjs', 'tests/wardriver-basemap-style-render.test.mjs']) {
    const source = read(file);
    assert.match(source, /resolvePythonLauncher/);
    assert.doesNotMatch(source, /spawnSync\('python3'/);
  }
});

test('browser contracts skip only when unprovisioned and fail closed when explicitly required', () => {
  const helperPath = fileURLToPath(new URL('tests/helpers/obscura.mjs', root));
  assert.equal(existsSync(helperPath), true);
  const helper = read('tests/helpers/obscura.mjs');
  assert.match(helper, /OBSCURA_BIN/);
  assert.match(helper, /BSS_REQUIRE_OBSCURA/);
  assert.match(helper, /t\.skip/);
  for (const file of browserTests) {
    assert.match(read(file), /requireObscura/);
  }
});

test('CI mirrors the root bootstrap on Windows and runs a provisioned Obscura lane', () => {
  const workflowPath = fileURLToPath(new URL('.github/workflows/contract-tests.yml', root));
  assert.equal(existsSync(workflowPath), true);
  const workflow = read('.github/workflows/contract-tests.yml');
  assert.match(workflow, /windows-latest/);
  assert.match(workflow, /npm run bootstrap/);
  assert.match(workflow, /npm test/);
  assert.match(workflow, /self-hosted/);
  assert.match(workflow, /bss-obscura/);
  assert.match(workflow, /BSS_REQUIRE_OBSCURA: '1'/);
  assert.match(workflow, /npm run test:browser/);

  const readme = read('README.md');
  assert.match(readme, /npm run bootstrap/);
  assert.match(readme, /OBSCURA_BIN/);
  assert.match(readme, /BSS_REQUIRE_OBSCURA/);
  assert.ok(rootPath.length > 0);
  assert.equal(existsSync(fileURLToPath(new URL('README.md', root))), true, 'the root contract must support an arbitrarily named materialized tree');
});
