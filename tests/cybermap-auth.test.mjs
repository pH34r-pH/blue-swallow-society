import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFileSync, readdirSync } from 'node:fs';

const FIXTURE_SOURCE_ID = '00000000-0000-4000-8000-000000000001';
const WARD_TOKEN = 'wardriver fixture token - not a stored registry value';
const READ_TOKEN = 'swa read fixture token - not a stored registry value';

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

function assertNoSecretLeak(value, secret, label) {
  assert.doesNotMatch(JSON.stringify(value), new RegExp(secret.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')), label);
  assert.doesNotMatch(JSON.stringify(value), /"authorization"\s*:|"x-cybermap-token"\s*:|"x-blue-swallow-operator-token"\s*:/i, `${label} should not include auth header material`);
}

async function withServer(options, fn) {
  const { createCybermapApiServer } = await import('../vm/cybermap-api/server.mjs');
  const server = createCybermapApiServer(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    return await fn(server);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

test('token registry hashes tokens and maps identity to client type, scopes, and source authority without retaining plaintext', async () => {
  const { createTokenRegistry, hashToken, authenticateToken } = await import('../vm/cybermap-api/auth.mjs');

  const registry = createTokenRegistry([
    {
      tokenHash: hashToken(WARD_TOKEN),
      tokenId: 'wardriver-alpha',
      clientType: 'wardriver_device',
      subject: 'device:alpha',
      scopes: ['observations:write'],
      sourceIds: [FIXTURE_SOURCE_ID],
      sourceClasses: ['owned_device'],
    },
  ]);

  const serialized = JSON.stringify(registry);
  assert.equal(serialized.includes(WARD_TOKEN), false, 'registry must store token hashes only');

  const accepted = authenticateToken(WARD_TOKEN, registry);
  assert.equal(accepted.ok, true);
  assert.equal(accepted.identity.clientType, 'wardriver_device');
  assert.equal(accepted.identity.tokenId, 'wardriver-alpha');
  assert.deepEqual(accepted.identity.scopes, ['observations:write']);
  assert.deepEqual(accepted.identity.sourceIds, [FIXTURE_SOURCE_ID]);
  assert.deepEqual(accepted.identity.sourceClasses, ['owned_device']);
  assertNoSecretLeak(accepted, WARD_TOKEN, 'accepted identity');

  const rejected = authenticateToken('wrong-token', registry);
  assert.equal(rejected.ok, false);
  assert.equal(rejected.code, 'auth_forbidden');
  assertNoSecretLeak(rejected, 'wrong-token', 'rejected auth result');
});

test('auth registry records fail closed when client type, scopes, or timestamp fields are malformed', async () => {
  const { createTokenRegistry, hashToken } = await import('../vm/cybermap-api/auth.mjs');

  assert.throws(() => createTokenRegistry([{ tokenHash: hashToken(WARD_TOKEN), scopes: ['observations:write'] }]), /client type/i);
  assert.throws(() => createTokenRegistry([{ tokenHash: hashToken(WARD_TOKEN), clientType: 'wardriver_device' }]), /scopes/i);
  assert.throws(() => createTokenRegistry([{
    tokenHash: hashToken(WARD_TOKEN),
    clientType: 'wardriver_device',
    scopes: ['observations:write'],
    expiresAt: 'not-a-date',
  }]), /expiresAt/i);
  assert.throws(() => createTokenRegistry([{
    tokenHash: hashToken(WARD_TOKEN),
    clientType: 'wardriver_device',
    scopes: ['observations:write'],
    revokedAt: 'not-a-date',
  }]), /revokedAt/i);
});

test('/api/v1/* fails closed for missing and invalid tokens while health/readiness stay unauthenticated', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');
  const logs = [];

  await withServer({
    tokenRecords: [{
      tokenHash: hashToken(WARD_TOKEN),
      tokenId: 'wardriver-alpha',
      clientType: 'wardriver_device',
      scopes: ['observations:write'],
      sourceIds: [FIXTURE_SOURCE_ID],
      sourceClasses: ['owned_device'],
    }],
    logger: (entry) => logs.push(entry),
    now: () => new Date('2026-07-10T00:00:00.000Z'),
  }, async (server) => {
    const health = await request(server, { path: '/healthz' });
    assert.equal(health.status, 200);

    const ready = await request(server, { path: '/readyz' });
    assert.equal(ready.status, 503);
    assert.equal(ready.json.dependencies.postgres.status, 'not_configured');

    const missing = await request(server, { path: '/api/v1/observations/batch' });
    assert.equal(missing.status, 401);
    assert.equal(missing.json.error.code, 'auth_required');

    const invalid = await request(server, {
      path: '/api/v1/observations/batch',
      headers: { Authorization: 'Bearer invalid-token-fixture' },
    });
    assert.equal(invalid.status, 403);
    assert.equal(invalid.json.error.code, 'auth_forbidden');

    assertNoSecretLeak(missing, WARD_TOKEN, 'missing-token response');
    assertNoSecretLeak(invalid, 'invalid-token-fixture', 'invalid-token response');
    assert.ok(logs.some((entry) => entry.event === 'auth_decision' && entry.decision === 'deny' && entry.reason === 'auth_required'));
    assert.ok(logs.some((entry) => entry.event === 'auth_decision' && entry.decision === 'deny' && entry.reason === 'auth_forbidden'));
    assertNoSecretLeak(logs, WARD_TOKEN, 'auth logs');
    assertNoSecretLeak(logs, 'invalid-token-fixture', 'auth logs');
  });
});

test('source-class authority comes from the token registry, not client-supplied payload fields', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');

  await withServer({
    tokenRecords: [{
      tokenHash: hashToken(WARD_TOKEN),
      tokenId: 'wardriver-alpha',
      clientType: 'wardriver_device',
      scopes: ['observations:write'],
      sourceIds: [FIXTURE_SOURCE_ID],
      sourceClasses: ['owned_device'],
    }],
    logger: () => {},
  }, async (server) => {
    const spoofed = await request(server, {
      method: 'POST',
      path: '/api/v1/observations/batch',
      headers: { Authorization: `Bearer ${WARD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_id: FIXTURE_SOURCE_ID,
        source_class: 'red_restricted',
        observations: [],
      }),
    });

    assert.equal(spoofed.status, 403);
    assert.equal(spoofed.json.error.code, 'source_scope_forbidden');
    assert.match(spoofed.json.error.message, /source class/i);
    assertNoSecretLeak(spoofed, WARD_TOKEN, 'source spoof response');
  });
});

test('auth decision logs include token metadata counts without subject identifiers or token hashes', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');
  const logs = [];
  const tokenHash = hashToken(WARD_TOKEN);

  await withServer({
    tokenRecords: [{
      tokenHash,
      tokenId: 'wardriver-alpha',
      clientType: 'wardriver_device',
      subject: 'device:alpha-sensitive',
      scopes: ['observations:write'],
      sourceIds: [FIXTURE_SOURCE_ID],
      sourceClasses: ['owned_device'],
    }],
    logger: (entry) => logs.push(entry),
  }, async (server) => {
    const response = await request(server, {
      method: 'POST',
      path: '/api/v1/observations/batch',
      headers: { Authorization: `Bearer ${WARD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_id: FIXTURE_SOURCE_ID, source_class: 'owned_device', observations: [] }),
    });

    assert.equal(response.status, 400);
    assert.equal(response.json.error.code, 'idempotency_key_required');
    const authLog = logs.find((entry) => entry.event === 'auth_decision' && entry.decision === 'allow');
    assert.ok(authLog, 'expected an allow auth_decision log');
    assert.equal(authLog.tokenId, 'wardriver-alpha');
    assert.equal(authLog.clientType, 'wardriver_device');
    assert.equal(authLog.scopeCount, 1);
    assert.equal(authLog.sourceIdCount, 1);
    assert.equal(authLog.sourceClassCount, 1);
    assert.equal('subject' in authLog, false);
    assertNoSecretLeak(logs, WARD_TOKEN, 'auth allow logs');
    assertNoSecretLeak(logs, tokenHash, 'auth allow logs');
    assertNoSecretLeak(logs, 'device:alpha-sensitive', 'auth allow logs');
  });
});

test('tokens with route scope but no registered source authority are denied even without source claims', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');

  await withServer({
    tokenRecords: [{
      tokenHash: hashToken(WARD_TOKEN),
      tokenId: 'wardriver-no-source',
      clientType: 'wardriver_device',
      scopes: ['observations:write'],
    }],
    logger: () => {},
  }, async (server) => {
    const response = await request(server, {
      method: 'POST',
      path: '/api/v1/observations/batch',
      headers: { Authorization: `Bearer ${WARD_TOKEN}`, 'Content-Type': 'application/json' },
      body: '{}',
    });

    assert.equal(response.status, 403);
    assert.equal(response.json.error.code, 'source_scope_required');
    assertNoSecretLeak(response.json, WARD_TOKEN, 'source-scope-required response');
  });
});

test('tokens with route scope but no registered source authority cannot self-assert source claims', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');

  await withServer({
    tokenRecords: [{
      tokenHash: hashToken(WARD_TOKEN),
      tokenId: 'wardriver-no-source-authority',
      clientType: 'wardriver_device',
      scopes: ['observations:write'],
    }],
    logger: () => {},
  }, async (server) => {
    const response = await request(server, {
      method: 'POST',
      path: '/api/v1/observations/batch',
      headers: { Authorization: `Bearer ${WARD_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        source_id: FIXTURE_SOURCE_ID,
        source_class: 'owned_device',
        observations: [],
      }),
    });

    assert.equal(response.status, 403);
    assert.equal(response.json.error.code, 'source_scope_forbidden');
    assertNoSecretLeak(response, WARD_TOKEN, 'missing source authority response');
  });
});

test('repeated query source claims are all verified against token source authority', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');

  await withServer({
    tokenRecords: [{
      tokenHash: hashToken(WARD_TOKEN),
      tokenId: 'wardriver-alpha',
      clientType: 'wardriver_device',
      scopes: ['cybermap:read'],
      sourceClasses: ['owned_device'],
    }],
    logger: () => {},
  }, async (server) => {
    const response = await request(server, {
      path: '/api/v1/observations?source_class=owned_device&source_class=red_restricted',
      headers: { Authorization: `Bearer ${WARD_TOKEN}` },
    });

    assert.equal(response.status, 403);
    assert.equal(response.json.error.code, 'source_scope_forbidden');
    assert.match(response.json.error.message, /source class/i);
    assertNoSecretLeak(response, WARD_TOKEN, 'repeated source query response');
  });
});

test('over-scoped tokens cannot call ingest routes without the required registry scope', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');

  await withServer({
    tokenRecords: [{
      tokenHash: hashToken(READ_TOKEN),
      tokenId: 'swa-read',
      clientType: 'swa_proxy',
      scopes: ['cybermap:read'],
      sourceClasses: ['green_public'],
    }],
    logger: () => {},
  }, async (server) => {
    const overScoped = await request(server, {
      method: 'POST',
      path: '/api/v1/observations/batch',
      headers: { Authorization: `Bearer ${READ_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_class: 'green_public', observations: [] }),
    });

    assert.equal(overScoped.status, 403);
    assert.equal(overScoped.json.error.code, 'scope_forbidden');
    assertNoSecretLeak(overScoped, READ_TOKEN, 'over-scoped response');
  });
});

test('public API rate limits apply to authenticated ingest paths and return retry metadata', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');

  await withServer({
    tokenRecords: [{
      tokenHash: hashToken(WARD_TOKEN),
      tokenId: 'wardriver-alpha',
      clientType: 'wardriver_device',
      scopes: ['observations:write'],
      sourceIds: [FIXTURE_SOURCE_ID],
      sourceClasses: ['owned_device'],
    }],
    rateLimit: {
      enabled: true,
      ingestLimit: 1,
      ingestWindowMs: 60_000,
      readLimit: 100,
      readWindowMs: 60_000,
    },
    logger: () => {},
  }, async (server) => {
    const payload = JSON.stringify({
      source_id: FIXTURE_SOURCE_ID,
      source_class: 'owned_device',
      observations: [],
    });
    const first = await request(server, {
      method: 'POST',
      path: '/api/v1/observations/batch',
      headers: { Authorization: `Bearer ${WARD_TOKEN}`, 'Content-Type': 'application/json' },
      body: payload,
    });
    assert.equal(first.status, 400, 'first authenticated request reaches observation route validation');
    assert.equal(first.json.error.code, 'idempotency_key_required');

    const second = await request(server, {
      method: 'POST',
      path: '/api/v1/observations/batch',
      headers: { Authorization: `Bearer ${WARD_TOKEN}`, 'Content-Type': 'application/json' },
      body: payload,
    });
    assert.equal(second.status, 429);
    assert.equal(second.json.error.code, 'rate_limited');
    assert.equal(second.headers['retry-after'], '60');
    assertNoSecretLeak(second, WARD_TOKEN, 'rate-limit response');
  });
});

test('public API rate limits count unauthenticated ingress before auth and body parsing', async () => {
  const { hashToken } = await import('../vm/cybermap-api/auth.mjs');

  await withServer({
    tokenRecords: [{
      tokenHash: hashToken(WARD_TOKEN),
      tokenId: 'wardriver-alpha',
      clientType: 'wardriver_device',
      scopes: ['observations:write'],
      sourceIds: [FIXTURE_SOURCE_ID],
      sourceClasses: ['owned_device'],
    }],
    rateLimit: {
      enabled: true,
      ingestLimit: 1,
      ingestWindowMs: 60_000,
      readLimit: 100,
      readWindowMs: 60_000,
    },
    logger: () => {},
  }, async (server) => {
    const first = await request(server, {
      method: 'POST',
      path: '/api/v1/observations/batch',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_class: 'owned_device', observations: [] }),
    });
    assert.equal(first.status, 401);
    assert.equal(first.json.error.code, 'auth_required');

    const second = await request(server, {
      method: 'POST',
      path: '/api/v1/observations/batch',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source_class: 'owned_device', observations: [] }),
    });
    assert.equal(second.status, 429);
    assert.equal(second.json.error.code, 'rate_limited');
    assert.equal(second.headers['retry-after'], '60');
    assertNoSecretLeak(second, WARD_TOKEN, 'preauth rate-limit response');
  });
});

test('public API rate limit identity ignores spoofed forwarded-for headers without a trusted real-IP header', async () => {
  const { createPublicRateLimiter } = await import('../vm/cybermap-api/rate-limit.mjs');
  const limiter = createPublicRateLimiter({
    enabled: true,
    ingestLimit: 1,
    ingestWindowMs: 60_000,
    now: () => 0,
  });

  const first = limiter({
    method: 'POST',
    path: '/api/v1/observations/batch',
    req: { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.10' }, socket: { remoteAddress: '127.0.0.1' } },
  });
  const second = limiter({
    method: 'POST',
    path: '/api/v1/observations/batch',
    req: { method: 'POST', headers: { 'x-forwarded-for': '198.51.100.11' }, socket: { remoteAddress: '127.0.0.1' } },
  });

  assert.equal(first.allowed, true);
  assert.equal(second.allowed, false);
  assert.equal(second.code, 'rate_limited');
});

test('auth persistence schema stores token hashes, client types, revocation, and source-scope mappings in an additive migration', () => {
  const migrationsDir = new URL('../vm/cybermap-api/db/migrations/', import.meta.url);
  const migrationNames = readdirSync(migrationsDir).filter((name) => name.endsWith('.sql')).sort();
  const coreMigration = readFileSync(new URL('0001_cybermap_core.sql', migrationsDir), 'utf8').toLowerCase();
  const authMigration = readFileSync(new URL('0002_cybermap_auth_registry.sql', migrationsDir), 'utf8').toLowerCase();

  assert.deepEqual(migrationNames, ['0001_cybermap_core.sql', '0002_cybermap_auth_registry.sql']);
  assert.doesNotMatch(coreMigration, /create\s+table\s+api_tokens|cybermap_client_type/);
  assert.match(authMigration, /^\s*begin;/i);
  assert.match(authMigration, /insert\s+into\s+schema_migrations\s*\(\s*version\s*\)\s*values\s*\(\s*'0002_cybermap_auth_registry'\s*\)/i);
  assert.match(authMigration, /commit;\s*$/i);
  assert.match(authMigration, /create\s+type\s+cybermap_client_type\s+as\s+enum/);
  for (const clientType of ['wardriver_device', 'swa_proxy', 'jetson', 'greenfeed_worker', 'operator_admin']) {
    assert.ok(authMigration.includes(`'${clientType}'`), `migration should include client type ${clientType}`);
  }
  assert.match(authMigration, /create\s+table\s+api_tokens/);
  assert.match(authMigration, /token_hash\s+text\s+not\s+null\s+unique/);
  assert.match(authMigration, /revoked_at\s+timestamptz/);
  assert.match(authMigration, /expires_at\s+timestamptz/);
  assert.match(authMigration, /create\s+table\s+api_token_source_scopes/);
  assert.match(authMigration, /source_id\s+uuid/);
  assert.match(authMigration, /foreign\s+key\s*\(\s*source_id\s*,\s*source_class\s*\)\s+references\s+source_catalog\s*\(\s*id\s*,\s*source_class\s*\)/);
  assert.match(authMigration, /source_class\s+source_class\s+not\s+null/);
  assert.doesNotMatch(authMigration, /plain(text)?_?token|token_secret|api_token\s+text/);
});

test('VM docs describe hashed auth registry, source scopes, rate limits, and token rotation without plaintext token settings', () => {
  const docs = [
    readFileSync(new URL('../docs/vm-api.md', import.meta.url), 'utf8'),
    readFileSync(new URL('../vm/cybermap-api/README.md', import.meta.url), 'utf8'),
  ].join('\n').toLowerCase();

  for (const needle of [
    'cybermap_auth_registry_json',
    'token_hash',
    'sha256:',
    'api_tokens',
    'api_token_source_scopes',
    'source_class',
    'auth_decision',
    'cybermap_ingest_rate_limit',
    'cybermap_read_rate_limit',
    'cybermap_private_mesh_only',
    'revoked_at',
    'expires_at',
    'rotation',
  ]) {
    assert.ok(docs.includes(needle), `docs should include ${needle}`);
  }
  assert.doesNotMatch(docs, /cybermap_api_token|blue_swallow_operator_token/);
});
