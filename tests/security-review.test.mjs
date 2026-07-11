import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const staticWebApp = JSON.parse(read('app/staticwebapp.config.json'));
const indexHtml = read('app/index.html');
const operatorHtml = read('app/operator/index.html');
const publicCss = read('app/public.css');
const operatorMainJs = read('app/operator/main.js');
const tzeentchJs = read('app/operator/tzeentch.mjs');
const tzeentchDashboardJs = read('app/operator/tzeentch-dashboard.mjs');
const chainedDaemonJs = read('app/operator/chained-daemon.mjs');
const agentJs = read('app/operator/agent.js');
const agentApi = read('api/agent/index.js');
const wigleApi = read('api/wigle/index.js');
const localServer = read('local-server.js');
const styles = read('app/operator/styles.css');
const deployWorkflow = read('.github/workflows/deploy-static-web-app.yml');
const operatorAuth = read('api/_lib/operator-auth.js');
const removedCanonicalPasscodeHash = [
  '1498079020c154198640fb47d5dba23a804f44ff805fac623c69202af9db2c',
  '80',
].join('');

function routeConfig(route) {
  return staticWebApp.routes.find((entry) => entry.route === route);
}

function normalizedSwaRoute(route) {
  return route === '/' ? route : route.replace(/\/+$/, '');
}

test('Static Web Apps routes do not collide after Azure trailing-slash normalization', () => {
  const seen = new Map();
  for (const route of staticWebApp.routes.map((entry) => entry.route)) {
    const normalized = normalizedSwaRoute(route);
    assert.ok(!seen.has(normalized), `${route} duplicates ${seen.get(normalized)} after SWA normalization`);
    seen.set(normalized, route);
  }
});

test('operator APIs use SWA auth or passcode-issued bearer tokens', () => {
  ['/api/wigle', '/api/agent', '/api/osint', '/api/tzeentch', '/api/validate-passcode'].forEach((route) => {
    assert.deepEqual(routeConfig(route)?.allowedRoles, ['authenticated'], `${route} should require Static Web Apps authentication`);
  });

  assert.ok(read('api/osint/index.js').includes('requireOperatorToken'));
  assert.ok(read('api/tzeentch/index.js').includes('requireOperatorToken'));
  assert.ok(agentApi.includes('requireOperatorToken'));
  assert.ok(wigleApi.includes('requireOperatorToken'));
  assert.ok(agentJs.includes('Authorization: `Bearer ${session.token}`'));
  assert.ok(agentJs.includes("'X-Blue-Swallow-Operator-Token': session.token"));
  assert.ok(operatorMainJs.includes('Authorization: `Bearer ${session.token}`'));
  assert.ok(operatorMainJs.includes("'X-Blue-Swallow-Operator-Token': session.token"));
});

test('public face ships no operator console markers, login shell, or operator API names', () => {
  const forbiddenPublicNeedles = [
    'OPERATOR CONSOLE',
    'Tzeentch',
    'Godeye',
    'passcode',
    'terminalScreen',
    'mainInterface',
    '/api/osint',
    '/api/tzeentch',
    '/api/validate-passcode',
    '/operator',
  ];

  assert.match(indexHtml, /<body\s+data-mode="public"/);
  assert.match(indexHtml, /Blue Swallow Society/);
  assert.match(indexHtml, /\/downloads\/blue-swallow-wardriver-2\.109-bss\.1-debug\.apk/);
  assert.match(indexHtml, /href="\/public\.css"/);
  assert.doesNotMatch(indexHtml, /<script\b/i);
  forbiddenPublicNeedles.forEach((needle) => {
    assert.ok(!indexHtml.includes(needle), `public index leaked ${needle}`);
    assert.ok(!publicCss.includes(needle), `public css leaked ${needle}`);
  });
});

test('operator entrypoint is separate from the public face and unlinked from root', () => {
  assert.ok(operatorHtml.includes('terminalScreen'));
  assert.ok(operatorHtml.includes('passcodeInput'));
  assert.ok(operatorHtml.includes('mainInterface'));
  assert.ok(operatorHtml.includes('/operator/main.js'));
  assert.ok(operatorHtml.includes('/operator/styles.css'));
  assert.ok(!indexHtml.includes('operator/index.html'));
  assert.ok(!indexHtml.includes('/operator/'));
});

test('operator HTML, JS, CSS, modules, and legacy routes are SWA-auth protected', () => {
  assert.deepEqual(routeConfig('/operator')?.allowedRoles, ['authenticated']);
  assert.equal(routeConfig('/operator')?.rewrite, '/operator/index.html');
  assert.deepEqual(routeConfig('/operator/*')?.allowedRoles, ['authenticated']);
  assert.deepEqual(routeConfig('/agent')?.allowedRoles, ['authenticated']);
  assert.equal(routeConfig('/agent')?.rewrite, '/operator/agent.html');
  assert.deepEqual(routeConfig('/agent.html')?.allowedRoles, ['authenticated']);
  assert.equal(routeConfig('/agent.html')?.rewrite, '/operator/agent.html');
});

test('passcode auth has no client fallback secret or local bypass', () => {
  assert.ok(!operatorMainJs.includes('PASSCODE_FALLBACK'));
  assert.ok(!operatorMainJs.includes("passcode === 'blue-swallow'"));
  assert.ok(!operatorMainJs.includes('Local fallback for development shells'));
  assert.ok(!operatorMainJs.includes(removedCanonicalPasscodeHash));
});

test('deployment config wires auth material from GitHub secrets only', () => {
  assert.ok(deployWorkflow.includes('secrets.BLUE_SWALLOW_PASSCODE_SHA256'));
  assert.ok(deployWorkflow.includes('secrets.BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY'));
  assert.match(deployWorkflow, /az staticwebapp appsettings set[\s\S]*BLUE_SWALLOW_PASSCODE_SHA256=/);
  assert.match(deployWorkflow, /az staticwebapp appsettings set[\s\S]*BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY=/);
  assert.ok(deployWorkflow.includes('BLUE_SWALLOW_PASSCODE_SHA256 must be a 64-character SHA-256 hex digest'));
  assert.ok(deployWorkflow.includes('BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY must be at least 32 bytes'));
  assert.ok(!deployWorkflow.includes(removedCanonicalPasscodeHash));
});

test('operator bearer tokens are signed with an independent server-side secret', () => {
  assert.ok(operatorAuth.includes('BLUE_SWALLOW_OPERATOR_TOKEN_SIGNING_KEY'));
  assert.ok(operatorAuth.includes('getOperatorTokenSigningKey'));
  assert.ok(operatorAuth.includes('signPayload(encodedPayload, signingKey)'));
  assert.ok(!operatorAuth.includes('signPayload(encodedPayload, digest)'));
});

test('device-local endpoints stay same-origin under the production CSP', () => {
  const csp = staticWebApp.globalHeaders['Content-Security-Policy'];
  assert.match(csp, /connect-src 'self'(?:;|$)/);
  assert.ok(!indexHtml.includes('http://device.local'));
  assert.ok(!indexHtml.includes('placeholder="/api/ar-detections"'));
  assert.ok(operatorHtml.includes('placeholder="/api/wigle"'));
});

test('OSINT, WiGLE coordinates, and agent prompts are sent via POST bodies, not URLs or persistent storage', () => {
  assert.ok(tzeentchJs.includes("fetch(new URL('/api/osint', window.location.origin).toString()"));
  assert.ok(tzeentchJs.includes("method: 'POST'"));
  assert.ok(tzeentchJs.includes('body: JSON.stringify'));
  assert.ok(!tzeentchJs.includes("url.searchParams.set('query'"));
  assert.ok(!tzeentchJs.includes('localStorage'));
  assert.ok(tzeentchJs.includes('sessionStorage'));
  assert.ok(tzeentchJs.includes('buildOperatorHeaders()'));
  assert.ok(tzeentchJs.includes('Authorization: `Bearer ${session.token}`'));
  assert.ok(tzeentchJs.includes("'X-Blue-Swallow-Operator-Token': session.token"));

  assert.ok(agentJs.includes("fetch('/api/agent'"));
  assert.ok(agentJs.includes("method: 'POST'"));
  assert.ok(agentJs.includes('buildOperatorHeaders({'));
  assert.ok(agentJs.includes('body: JSON.stringify({ prompt })'));
  assert.ok(!agentJs.includes('/api/agent?prompt='));
  assert.ok(!agentApi.includes('req.query'));
  assert.ok(!agentApi.includes('prompt:'));

  assert.ok(operatorMainJs.includes('function buildWigleRequestPayload'));
  assert.ok(operatorMainJs.includes("method: 'POST'"));
  assert.ok(operatorMainJs.includes('body: JSON.stringify(requestPayload)'));
  assert.ok(operatorMainJs.includes('buildOperatorHeaders({'));
  assert.ok(!operatorMainJs.includes('buildWigleEndpointUrl'));
  assert.ok(!operatorMainJs.includes("url.searchParams.set('lat'"));
  assert.ok(wigleApi.includes('hasSensitiveLocationQuery'));
  assert.ok(wigleApi.includes('WiGLE location coordinates must be sent in the POST body'));
  assert.ok(wigleApi.includes("getBodyValue(req, 'lat'"));
  assert.ok(wigleApi.includes('Direct WiGLE API lookup is disabled'));
  assert.ok(!wigleApi.includes("searchParams.set('latrange"));
  assert.ok(!wigleApi.includes("searchParams.set('closestLat'"));
  assert.ok(!wigleApi.includes('api.wigle.net/api/v2/network/search'));
});

test('APK downloads are public static assets with binary fallback excluded', () => {
  assert.deepEqual(routeConfig('/downloads/*')?.allowedRoles, ['anonymous', 'authenticated']);
  assert.ok(staticWebApp.navigationFallback.exclude.some((entry) => entry.includes('apk')));
  assert.ok(indexHtml.includes('/downloads/blue-swallow-wardriver-2.109-bss.1-debug.apk'));
});

test('Tzeentch network feeds are lazy-loaded only when the Tzeentch tab is opened', () => {
  const initDefaults = operatorMainJs.match(/function initTabDefaults\(\) \{(?<body>[\s\S]*?)\n\}/)?.groups?.body || '';
  assert.ok(!initDefaults.includes('initTzeentchDashboard'));
  assert.match(operatorMainJs, /if \(nextTabKey === 'tzeentch'\) \{\n\s+initTzeentchDashboard\(\);/);
});

test('Tzeentch runtime never seeds or falls back to demo feed data', () => {
  const runtimeSources = [tzeentchJs, tzeentchDashboardJs, chainedDaemonJs].join('\n');

  assert.ok(!tzeentchJs.includes('createDemoDashboardDataset'));
  assert.ok(!tzeentchJs.includes('using sample model'));
  assert.ok(!runtimeSources.includes('createDemoChainedDaemonObservations'));
  assert.ok(!runtimeSources.includes('CorpGuest-Redmond-5G'));
  assert.ok(!runtimeSources.includes('BADGE-042-demo'));
  assert.ok(!runtimeSources.includes('BSS-DeadDrop'));
});

test('local dev server returns JSON 501 for unmounted API routes instead of SPA HTML', () => {
  assert.ok(localServer.includes("statusCode: 501"));
  assert.ok(localServer.includes('API route not mounted locally'));
  assert.ok(!localServer.includes("filePath = path.join(APP_DIR, 'index.html');\n    }\n    \n    fs.readFile"));
});

test('sample WiGLE state is explicitly labeled as demo data', () => {
  assert.ok(operatorMainJs.includes('Sample/demo WiGLE dataset loaded'));
  assert.ok(!operatorMainJs.includes("wigleStatus: 'Local WiGLE database is ready.'"));
  assert.ok(operatorHtml.includes('Sample/demo WiGLE dataset loaded'));
});

test('stale shell CSS selectors are pruned', () => {
  ['.terminal-badge', '.terminal-error', '.tzeentch-surface-tabs', '.tzeentch-surface-tab'].forEach((selector) => {
    assert.ok(!styles.includes(selector), `${selector} should be removed`);
  });
});
