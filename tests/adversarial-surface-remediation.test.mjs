import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const exists = (path) => existsSync(new URL(path, root));

function routeConfig(config, route) {
  return config.routes.find((entry) => entry.route === route);
}

test('anonymous echo-lab route is retired without weakening Cybermap token routes', () => {
  assert.equal(exists('api/echo/function.json'), false, 'the anonymous echo Function must be removed');
  assert.equal(exists('api/echo/index.js'), false, 'no Function may proxy an upstream echo body');

  const staticWebApp = JSON.parse(read('app/staticwebapp.config.json'));
  assert.deepEqual(routeConfig(staticWebApp, '/api/echo'), {
    route: '/api/echo',
    statusCode: 404,
  });
  assert.ok(staticWebApp.navigationFallback.exclude.includes('/api/*'));

  const deployWorkflow = read('.github/workflows/deploy-static-web-app.yml');
  const localServer = read('local-server.js');
  const vmBicep = read('infra/vm-echo-lab.bicep');
  const mainBicep = read('infra/main.bicep');
  const runtimeSettingsBlock = deployWorkflow.match(/az staticwebapp appsettings set[\s\S]*?(?=\n\s*az staticwebapp appsettings delete)/)?.[0] || '';
  assert.ok(!runtimeSettingsBlock.includes('BACKEND_ECHO_BASE_URL'));
  assert.match(deployWorkflow, /az staticwebapp appsettings delete[\s\S]*--setting-names BACKEND_ECHO_BASE_URL/);
  assert.ok(!localServer.includes("urlPath === '/api/echo'"));
  assert.ok(!localServer.includes('API echo endpoint available'));
  assert.ok(!vmBicep.includes('/opt/echo/echo_server.py'));
  assert.ok(!vmBicep.includes('backendEchoBaseUrl'));
  assert.ok(!mainBicep.includes('backendEchoBaseUrl'));
  assert.equal(exists('scripts/wireup-backend-url.sh'), false, 'the echo-only app-setting helper must be removed');

  const currentOperationPaths = [
    'README.md',
    'docs/static-web-app-functionality.md',
    'docs/azure-resources.md',
    'scripts/print-next-steps.sh',
  ];
  for (const currentOperationPath of currentOperationPaths) {
    assert.ok(!read(currentOperationPath).includes('/api/echo'));
    assert.ok(!read(currentOperationPath).includes('BACKEND_ECHO_BASE_URL'));
  }

  const currentOperationalDocumentation = {
    '.github/copilot-instructions.md': [
      /api\/echo/,
      /BACKEND_ECHO_BASE_URL/,
      /Ubuntu VM echo backend/,
    ],
    'docs/cybermap-geospatial-backend.md': [/Replace echo-lab cloud-init/],
    'docs/wardriver-raid-backend-repair-plan.md': [/Replace echo-only VM/],
    'docs/azure-resources.md': [/Encapsulates VM, public IP, NSG, NIC, cloud-init, and auto-shutdown/],
  };
  for (const [currentOperationPath, staleOperationClaims] of Object.entries(currentOperationalDocumentation)) {
    const source = read(currentOperationPath);
    for (const staleOperationClaim of staleOperationClaims) {
      assert.doesNotMatch(source, staleOperationClaim, `${currentOperationPath} must not present echo as current operation`);
    }
  }
  assert.match(read('docs/azure-resources.md'), /Custom Script extension/);

  assert.ok(!read('scripts/local-dev.ps1').includes('BACKEND_ECHO_BASE_URL'));
  assert.match(read('docs/blue-swallow-system-implementation-delta.md').slice(0, 500), /Historical audit snapshot/);

  for (const historicalPath of ['docs/vm-api.md', 'docs/vm-echo-wiring.md']) {
    const source = read(historicalPath);
    assert.match(source, /^# .*Historical/m, `${historicalPath} must retain echo provenance as historical documentation`);
    assert.match(source, /retired/i, `${historicalPath} must state that the echo path is retired`);
  }

  for (const route of ['/api/cybermap/viewport', '/api/cybermap/observations/batch']) {
    assert.deepEqual(
      routeConfig(staticWebApp, route)?.allowedRoles,
      ['anonymous', 'authenticated'],
      `${route} must still reach its Function token guard`,
    );
  }
  assert.match(read('api/cybermap-viewport/index.js'), /requireOperatorToken/);
  const observationBatch = read('api/cybermap-observations-batch/index.js');
  assert.match(observationBatch, /x-blue-swallow-ingest-token/);
  assert.match(observationBatch, /requiredHeader\(req, header\)/);
});
