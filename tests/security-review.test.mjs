import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const staticWebApp = JSON.parse(read('app/staticwebapp.config.json'));
const indexHtml = read('app/index.html');
const mainJs = read('app/main.js');
const tzeentchJs = read('app/tzeentch.mjs');
const agentJs = read('app/agent.js');
const agentApi = read('api/agent/index.js');
const localServer = read('local-server.js');
const styles = read('app/styles.css');

function routeConfig(route) {
  return staticWebApp.routes.find((entry) => entry.route === route);
}

test('operator API routes are protected by Static Web Apps auth', () => {
  ['/api/wigle', '/api/osint', '/api/agent', '/api/tzeentch'].forEach((route) => {
    assert.deepEqual(routeConfig(route)?.allowedRoles, ['authenticated'], `${route} should require authentication`);
  });
});

test('passcode auth has no client fallback secret or local bypass', () => {
  assert.ok(!mainJs.includes('PASSCODE_FALLBACK'));
  assert.ok(!mainJs.includes('blue-swallow'));
  assert.ok(!mainJs.includes('Local fallback for development shells'));
  assert.ok(!mainJs.includes('passcode ==='));
});

test('device-local endpoints stay same-origin under the production CSP', () => {
  const csp = staticWebApp.globalHeaders['Content-Security-Policy'];
  assert.match(csp, /connect-src 'self'(?:;|$)/);
  assert.ok(!indexHtml.includes('http://device.local'));
  assert.ok(indexHtml.includes('placeholder="/api/ar-detections"'));
  assert.ok(indexHtml.includes('placeholder="/api/wigle"'));
});

test('OSINT and agent prompts are sent via POST bodies, not URLs or persistent storage', () => {
  assert.ok(tzeentchJs.includes("fetch(new URL('/api/osint', window.location.origin).toString()"));
  assert.ok(tzeentchJs.includes("method: 'POST'"));
  assert.ok(tzeentchJs.includes('body: JSON.stringify'));
  assert.ok(!tzeentchJs.includes("url.searchParams.set('query'"));
  assert.ok(!tzeentchJs.includes('localStorage'));
  assert.ok(tzeentchJs.includes('sessionStorage'));

  assert.ok(agentJs.includes("fetch('/api/agent'"));
  assert.ok(agentJs.includes("method: 'POST'"));
  assert.ok(agentJs.includes('body: JSON.stringify({ prompt })'));
  assert.ok(!agentJs.includes('/api/agent?prompt='));
  assert.ok(!agentApi.includes('req.query'));
  assert.ok(!agentApi.includes('prompt:'));
});

test('Tzeentch network feeds are lazy-loaded only when the Tzeentch tab is opened', () => {
  const initDefaults = mainJs.match(/function initTabDefaults\(\) \{(?<body>[\s\S]*?)\n\}/)?.groups?.body || '';
  assert.ok(!initDefaults.includes('initTzeentchDashboard'));
  assert.match(mainJs, /if \(nextTabKey === 'tzeentch'\) \{\n\s+initTzeentchDashboard\(\);/);
});

test('local dev server returns JSON 501 for unmounted API routes instead of SPA HTML', () => {
  assert.ok(localServer.includes("statusCode: 501"));
  assert.ok(localServer.includes('API route not mounted locally'));
  assert.ok(!localServer.includes("filePath = path.join(APP_DIR, 'index.html');\n    }\n    \n    fs.readFile"));
});

test('sample WiGLE state is explicitly labeled as demo data', () => {
  assert.ok(mainJs.includes('Sample/demo WiGLE dataset loaded'));
  assert.ok(!mainJs.includes("wigleStatus: 'Local WiGLE database is ready.'"));
  assert.ok(indexHtml.includes('Sample/demo WiGLE dataset loaded'));
});

test('stale shell CSS selectors are pruned', () => {
  ['.terminal-badge', '.terminal-error', '.tzeentch-surface-tabs', '.tzeentch-surface-tab'].forEach((selector) => {
    assert.ok(!styles.includes(selector), `${selector} should be removed`);
  });
});
