import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import http from 'node:http';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function assertIncludesAll(haystack, needles, label) {
  needles.forEach((needle) => assert.ok(haystack.includes(needle), `${label} should include ${needle}`));
}

function request(server, options = {}) {
  const address = server.address();
  const body = options.body || '';
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      path: options.path || '/',
      method: options.method || 'GET',
      headers: {
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
        ...(options.headers || {}),
      },
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({
          status: res.statusCode,
          headers: res.headers,
          text,
          json: text ? JSON.parse(text) : null,
        });
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

test('VM Bicep provisions Cybermap API gateway services instead of public echo ingress', () => {
  const vmBicep = read('infra/vm-echo-lab.bicep');
  const mainBicep = read('infra/main.bicep');
  const apiServer = read('vm/cybermap-api/server.mjs');

  assertIncludesAll(vmBicep, [
    'cybermap-api.service',
    'cybermap-worker.service',
    '/opt/cybermap-api/server.mjs',
    '/opt/cybermap-api/rate-limit.mjs',
    '/opt/cybermap-api/sensorium.mjs',
    '/opt/cybermap-api/db.mjs',
    '/opt/cybermap-api/migrate.mjs',
    '/opt/cybermap-worker/worker.mjs',
    'NodeSource Node.js 20',
    'pgbouncer',
    '127.0.0.1:8000',
    'destinationPortRange: \'443\'',
  ], 'Cybermap VM cloud-init');
  assertIncludesAll(apiServer, ['rateLimitHook', 'requestId', 'checkDatabaseReadiness'], 'Cybermap API source');

  assert.match(vmBicep, /allow-https/i);
  assert.doesNotMatch(vmBicep, /allow-echo/i);
  assert.doesNotMatch(vmBicep, /destinationPortRange:\s*'8080'/);
  assert.doesNotMatch(vmBicep, /echo-server\.service/);
  assert.doesNotMatch(vmBicep, /\/opt\/echo/);
  assert.doesNotMatch(mainBicep, /backendEchoBaseUrl/);
  assert.match(mainBicep, /backendApiBaseUrl/);
});

test('Cybermap API service exposes secret-free health, DB readiness failure, auth gate, request IDs, and body limits', async () => {
  const { createCybermapApiServer } = await import('../vm/cybermap-api/server.mjs');
  const logs = [];
  const server = createCybermapApiServer({
    authTokens: ['test-token'],
    bodyLimitBytes: 16,
    logger: (entry) => logs.push(entry),
    now: () => new Date('2026-07-10T00:00:00.000Z'),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const health = await request(server, { path: '/healthz', headers: { 'X-Request-Id': 'req-health' } });
    assert.equal(health.status, 200);
    assert.equal(health.headers['x-request-id'], 'req-health');
    assert.equal(health.json.ok, true);
    assert.equal(health.json.service, 'cybermap-api');
    assert.equal(health.json.dependencies?.postgres, undefined, 'healthz must not require or leak DB state');
    assert.doesNotMatch(health.text, /test-token|postgres|password|secret/i);

    const ready = await request(server, { path: '/readyz' });
    assert.equal(ready.status, 503);
    assert.equal(ready.json.ok, false);
    assert.equal(ready.json.dependencies.postgres.status, 'not_configured');
    assert.deepEqual(ready.json.dependencies.postgres.missing, ['CYBERMAP_DATABASE_URL']);
    assert.doesNotMatch(ready.text, /postgres:\/\/|password|secret/i);

    const unauthorized = await request(server, { path: '/api/v1/cybermap/viewport' });
    assert.equal(unauthorized.status, 401);
    assert.equal(unauthorized.json.error.code, 'auth_required');

    const limited = await request(server, {
      method: 'POST',
      path: '/api/v1/observations/batch',
      headers: { Authorization: 'Bearer test-token', 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload: 'this exceeds the tiny test limit' }),
    });
    assert.equal(limited.status, 413);
    assert.equal(limited.json.error.code, 'body_too_large');

    const placeholder = await request(server, {
      path: '/api/v1/sources',
      headers: { Authorization: 'Bearer test-token' },
    });
    assert.equal(placeholder.status, 501);
    assert.equal(placeholder.json.error.code, 'not_implemented');
    assert.ok(placeholder.headers['x-request-id'], 'request id should be generated when absent');

    assert.ok(logs.every((entry) => typeof entry === 'object' && entry.requestId && entry.statusCode), 'logs should be structured JSON-ready objects with request ids and statuses');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('Cybermap API and worker scaffolds carry operational hook points without embedded DB secrets', () => {
  const apiPackage = read('vm/cybermap-api/package.json');
  const apiServer = read('vm/cybermap-api/server.mjs');
  const workerPackage = read('vm/cybermap-worker/package.json');
  const worker = read('vm/cybermap-worker/worker.mjs');
  const combined = [apiPackage, apiServer, workerPackage, worker].join('\n');

  assert.match(apiPackage, /"start"\s*:\s*"node server\.mjs"/);
  assert.match(workerPackage, /"start"\s*:\s*"node worker\.mjs"/);
  assertIncludesAll(apiServer, ['bodyLimitBytes', 'requestId', 'rateLimitHook', 'authTokens'], 'API operational hooks');
  assertIncludesAll(worker, ['cybermap-worker', 'structured', 'pollIntervalMs', 'SIGTERM'], 'worker scaffold');
  assert.doesNotMatch(combined, /postgres:\/\//i);
  assert.doesNotMatch(combined, /PGPASSWORD\s*=/i);
  assert.doesNotMatch(combined, /password\s*[:=]\s*['"][^'"]+/i);
});

test('VM docs describe the Cybermap gateway target and do not expose echo/8080 as the product path', () => {
  const vmApiDoc = read('docs/vm-api.md');
  const azureDoc = read('docs/azure-resources.md');
  const apiReadme = read('vm/cybermap-api/README.md');
  const vmApiSpec = read('specs/002-vm-api/spec.md');
  const gatewayDocs = `${vmApiDoc}\n${azureDoc}\n${apiReadme}`;
  const readinessDocs = `${gatewayDocs}\n${vmApiSpec}`;

  assertIncludesAll(gatewayDocs, [
    'cybermap-api',
    'cybermap-worker',
    '/healthz',
    '/readyz',
    'HTTPS 443',
    'localhost:8000',
    'PgBouncer',
    'structured JSON logs',
    'request ID',
    '/api/v1/*',
  ], 'Cybermap gateway docs');

  assert.doesNotMatch(gatewayDocs, /Primary Endpoint:\s*`\/echo`/);
  assert.doesNotMatch(gatewayDocs, /http:\/\/<vm-ip>:8080/);
  assert.doesNotMatch(gatewayDocs, /BACKEND_ECHO_BASE_URL/);
  assert.doesNotMatch(gatewayDocs, /echo-server\.service/);
  assert.doesNotMatch(readinessDocs, /pending-db-task|until DB wiring lands/i);
});
