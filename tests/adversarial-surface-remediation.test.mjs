import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { request as httpRequest } from 'node:http';
import { createRequire } from 'node:module';

const root = new URL('../', import.meta.url);
const require = createRequire(import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const exists = (path) => existsSync(new URL(path, root));

function routeConfig(config, route) {
  return config.routes.find((entry) => entry.route === route);
}

function requestLocalServer(server, path, method) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const request = httpRequest({
      hostname: '127.0.0.1',
      method,
      path,
      port: address.port,
    }, (response) => {
      let body = '';
      response.setEncoding('utf8');
      response.on('data', (chunk) => {
        body += chunk;
      });
      response.once('end', () => {
        resolve({ body, status: response.statusCode });
      });
    });
    request.once('error', reject);
    request.end();
  });
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

test('the public operator directory contains only generic loader files while private assets use a token-gated Function route', () => {
  assert.deepEqual(
    readdirSync(new URL('app/operator/', root)).sort(),
    ['index.html', 'loader.css', 'loader.js'],
    'anonymous static delivery must not expose private modules, CSS, HTML, or persona material',
  );

  const staticWebApp = JSON.parse(read('app/staticwebapp.config.json'));
  assert.deepEqual(routeConfig(staticWebApp, '/operator'), {
    route: '/operator',
    rewrite: '/operator/index.html',
    allowedRoles: ['anonymous', 'authenticated'],
  });
  assert.equal(routeConfig(staticWebApp, '/operator/*'), undefined);
  assert.deepEqual(routeConfig(staticWebApp, '/api/operator-assets/*')?.allowedRoles, ['anonymous', 'authenticated']);
  assert.equal(exists('api/operator-assets/index.js'), true);
  assert.equal(exists('api/operator-assets/function.json'), true);
});

test('WiGLE and vision sample records are fixture-only and runtime fallbacks stay unavailable', () => {
  for (const fixture of [
    'tests/fixtures/wigle-sample-data.mjs',
    'tests/fixtures/vision-sample-data.mjs',
  ]) {
    assert.equal(exists(fixture), true, `${fixture} must be test-only fixture data`);
  }

  const runtimeSources = [
    'api/_private/operator/assets/wigle.mjs',
    'api/_private/operator/assets/vision.mjs',
    'api/_private/operator/assets/main.js',
  ];
  const runtimeSamplePatterns = [
    /createSample(?:Wigle|Vision)Dataset/,
    /SAMPLE_(?:LOCATION|ACCESS_POINTS|TIMESTAMP|FRAME|DETECTIONS)/,
    /source\s*:\s*['"]sample['"]/,
    /sourceLabel\s*=\s*['"]sample['"]/,
    /live, local, or sample vision payloads/,
  ];

  for (const sourcePath of runtimeSources) {
    const source = read(sourcePath);
    for (const pattern of runtimeSamplePatterns) {
      assert.doesNotMatch(source, pattern, `${sourcePath} must not ship a sample fallback`);
    }
  }
  const main = read('api/_private/operator/assets/main.js');
  assert.doesNotMatch(main, /visionSourceLabel:\s*['"]live['"]/);
  assert.doesNotMatch(main, /visionSourceLabel\s*=\s*['"]live['"]/);
});

test('private bootstrap composes named Godeye and vision controllers through the asset manifest', () => {
  const controllerAssets = [
    'godeye-controller.mjs',
    'vision-controller.mjs',
  ];
  const privateMain = read('api/_private/operator/assets/main.js');
  const assetManifest = read('api/operator-assets/index.js');

  for (const asset of controllerAssets) {
    assert.equal(exists(`api/_private/operator/assets/${asset}`), true, `${asset} must be a private controller module`);
    assert.match(assetManifest, new RegExp(`['"]${asset.replace('.', '\\.') }['"]`), `${asset} must be allowlisted for private ESM loading`);
  }
  assert.match(privateMain, /createGodeyeController/);
  assert.match(privateMain, /createVisionController/);
});

test('the retired agent surface has no Function, loader, template, CSS, route rewrite, or shell selector', async (t) => {
  const staticWebApp = JSON.parse(read('app/staticwebapp.config.json'));
  for (const route of ['/agent', '/agent.html', '/api/agent']) {
    assert.deepEqual(routeConfig(staticWebApp, route), { route, statusCode: 404 });
  }

  for (const retiredPath of [
    'api/agent/index.js',
    'api/agent/function.json',
    'api/_private/operator/agent.html',
    'app/operator/agent.html',
    'app/operator/agent.js',
    'app/operator/agent-loader.js',
  ]) {
    assert.equal(exists(retiredPath), false, `${retiredPath} must be removed rather than relabelled`);
  }

  const operatorShell = read('api/operator-shell/index.js');
  assert.doesNotMatch(operatorShell, /AGENT_PATH|view=agent|Interface Lab|Agent placeholder/);
  assert.doesNotMatch(operatorShell, /['"]agent['"]/);
  assert.doesNotMatch(read('api/_private/operator/shell.html'), /Interface Lab|Agent placeholder/);
  assert.doesNotMatch(read('api/_private/operator/assets/styles.css'), /\.agent-(?:shell|hero|input-area|output)\b/);
  assert.doesNotMatch(read('api/_private/operator/assets/theme.css'), /\.agent-hero\b/);

  assert.match(
    read('local-server.js'),
    /module\.exports\s*=\s*\{\s*createLocalServer\s*\};/,
    'local development must expose an isolated server factory for route denial tests',
  );
  const { createLocalServer } = require('../local-server.js');
  const server = createLocalServer();
  t.after(() => new Promise((resolve) => server.close(resolve)));
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');

  for (const path of ['/agent', '/agent.html', '/api/agent']) {
    for (const method of ['GET', 'POST', 'PATCH']) {
      const response = await requestLocalServer(server, path, method);
      assert.equal(response.status, 404, `${method} ${path} must not resolve a retired agent surface`);
      assert.doesNotMatch(response.body, /Agent placeholder|Interface Lab|Nacre-Moiré/i);
    }
  }
});
