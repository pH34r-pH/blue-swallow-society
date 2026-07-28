import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

const mainBicep = read('infra/main.bicep');
const vmBicep = read('infra/vm-echo-lab.bicep');
const installer = read('infra/scripts/install-cybermap-api.sh');
const deployWorkflow = read('.github/workflows/deploy-static-web-app.yml');
const whatIfWorkflow = read('.github/workflows/infra-whatif.yml');

test('VM Cybermap deployment accepts only an explicit immutable archive and verified digest', () => {
  assert.match(mainBicep, /param cybermapSourceTarballUrl string(?!\s*=)/);
  assert.match(mainBicep, /param cybermapSourceTarballSha256 string(?!\s*=)/);
  assert.match(vmBicep, /param cybermapSourceRevision string/);
  assert.match(vmBicep, /'__CYBERMAP_SOURCE_REVISION__'/);
  assert.match(vmBicep, /param cybermapSourceTarballSha256 string/);
  assert.match(vmBicep, /'__CYBERMAP_SOURCE_TARBALL_SHA256__'/);
  assert.match(vmBicep, /cybermapSourceTarballSha256/);
  assert.match(installer, /CYBERMAP_SOURCE_TARBALL_SHA256/);
  assert.match(installer, /cybermap-api-release\.json/);
  assert.match(installer, /archive_sha256/);
  assert.match(installer, /sha256sum --check/);
  assert.ok(installer.indexOf('sha256sum --check') < installer.indexOf('tar -xzf'), 'checksum verification must precede extraction');
  assert.ok(installer.indexOf('sha256sum --check') < installer.indexOf('run_migration'), 'checksum verification must precede migrations');
});

test('deployment and what-if derive a full Git commit archive digest rather than a mutable branch', () => {
  [deployWorkflow, whatIfWorkflow].forEach((workflow) => {
    assert.match(workflow, /GITHUB_SHA/);
    assert.match(workflow, /sha256sum/);
    assert.match(workflow, /cybermapSourceRevision="\$GITHUB_SHA"/);
    assert.match(workflow, /cybermapSourceTarballUrl=/);
    assert.match(workflow, /cybermapSourceTarballSha256=/);
  });
  assert.doesNotMatch(mainBicep, /refs\/heads\/main/);
});

test('passcode limiter wiring uses a dedicated Table store, not release storage', () => {
  const rateLimitModule = new URL('../infra/modules/passcode-rate-limit-storage.bicep', import.meta.url);
  const module = readFileSync(rateLimitModule, 'utf8');
  assert.match(mainBicep, /passcode-rate-limit-storage/);
  assert.match(module, /Microsoft\.Storage\/storageAccounts/);
  assert.match(module, /Microsoft\.Storage\/storageAccounts\/tableServices\/tables/);
  assert.match(deployWorkflow, /BLUE_SWALLOW_PASSCODE_RATE_LIMIT_STORAGE_CONNECTION_STRING/);
  assert.match(deployWorkflow, /BLUE_SWALLOW_PASSCODE_RATE_LIMIT_TABLE/);
  assert.doesNotMatch(deployWorkflow, /BLUE_SWALLOW_PASSCODE_RATE_LIMIT_STORAGE_CONNECTION_STRING="\$storage_connection_string"/);
});

test('legacy WiGLE parsing is a runtime-neutral adapter and the operator consumes the VM projection', () => {
  const wigleApi = read('api/wigle/index.js');
  const browserFacade = read('api/_private/operator/assets/wigle.mjs');
  const operatorMain = read('api/_private/operator/assets/main.js');
  const signalRoute = read('api/operator-signals/index.js');
  assert.doesNotMatch(wigleApi, /app\/operator/);
  assert.match(wigleApi, /shared\/legacy-wigle-parser\.mjs/);
  assert.match(browserFacade, /export function parseWiglePayload/);
  assert.doesNotMatch(browserFacade, /document\.|window\./);
  assert.match(signalRoute, /api\/v1\/cybermap\/operator-signals/);
  assert.match(operatorMain, /['"]\/api\/operator-signals['"]/);
});
