import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const staticWebApp = JSON.parse(read('app/staticwebapp.config.json'));
const route = (path) => staticWebApp.routes.find((entry) => entry.route === path);

const rootMain = read('app/main.js');
const loader = read('app/operator/loader.js');
const publicSession = read('app/operator/operator-session.mjs');
const privateMain = read('api/_private/operator/assets/main.js');
const privateSession = read('api/_private/operator/assets/operator-session.mjs');
const wigleApi = read('api/wigle/index.js');
const viewportApi = read('api/cybermap-viewport/index.js');
const signalsApi = read('api/operator-signals/index.js');
const operatorAuth = read('api/_lib/operator-auth.js');
const installScript = read('infra/scripts/install-cybermap-api.sh');
const vmBicep = read('infra/vm-echo-lab.bicep');

test('operator APIs reach explicit application guards rather than SWA AAD', () => {
  for (const path of ['/api/wigle', '/api/operator-signals', '/api/cybermap/viewport', '/api/cybermap/observations/batch', '/api/tzeentch']) {
    assert.deepEqual(route(path)?.allowedRoles, ['anonymous', 'authenticated'], path);
  }
  for (const source of [wigleApi, viewportApi, signalsApi]) {
    assert.match(source, /requireOperatorToken/);
  }
});

test('operator bearer material is memory-only throughout the public handoff and private asset graph', () => {
  for (const source of [loader, publicSession, privateMain, privateSession]) {
    assert.doesNotMatch(source, /blue-swallow-society:operator-session|sessionStorage.*operator|localStorage|document\.cookie/);
  }
  assert.doesNotMatch(rootMain, /blue-swallow-society:operator-session|sessionStorage.*operator|document\.cookie/);
  assert.match(rootMain, /activateOperatorSession\(session\)/);
  assert.match(loader, /activateOperatorSession/);
  assert.match(privateSession, /X-Blue-Swallow-Operator-Token/);
  assert.match(operatorAuth, /BLUE_SWALLOW_OPERATOR_TOKEN_VERSION/);
  assert.match(operatorAuth, /DEFAULT_TOKEN_TTL_MS = 5 \* 60 \* 1000/);
});

test('coordinate-bearing operator reads use body-only POSTs and the VM source is immutable', () => {
  assert.match(viewportApi, /postCybermapJson/);
  assert.match(signalsApi, /operator-signals/);
  assert.match(installScript, /sha256sum --check/);
  assert.match(installScript, /cybermap-api-release\.json/);
  assert.match(vmBicep, /cybermapSourceRevision/);
  assert.doesNotMatch(vmBicep, /refs\/heads\/main/);
});

test('browser code is not imported by backend functions', () => {
  for (const source of [wigleApi, viewportApi, signalsApi]) {
    assert.doesNotMatch(source, /app\/operator/);
  }
  assert.match(wigleApi, /shared\/legacy-wigle-parser\.mjs/);
});
