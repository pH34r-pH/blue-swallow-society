import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');

function request(server, options = {}) {
  const address = server.address();
  return new Promise((resolve, reject) => {
    const req = http.request({
      host: '127.0.0.1',
      port: address.port,
      path: options.path || '/',
      method: options.method || 'GET',
      headers: options.headers || {},
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, text, json: text ? JSON.parse(text) : null });
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function makePool(handler) {
  const pool = {
    queries: [],
    ended: false,
    async query(sql, params = []) {
      this.queries.push({ sql, params });
      return handler(sql, params);
    },
    async end() {
      this.ended = true;
    },
  };
  return pool;
}

test('database config fails closed when missing and redacts secrets while capping B1MS pool size', async () => {
  const { loadDatabaseConfig } = await import('../vm/cybermap-api/db.mjs');

  const missing = loadDatabaseConfig({});
  assert.equal(missing.ok, false);
  assert.deepEqual(missing.missing, ['CYBERMAP_DATABASE_URL']);

  const configured = loadDatabaseConfig({
    CYBERMAP_DATABASE_URL: 'postgresql://cybermap:super-secret@127.0.0.1:6432/cybermap',
    CYBERMAP_DB_POOL_MAX: '99',
  });
  assert.equal(configured.ok, true);
  assert.equal(configured.pool.max, 5, 'B1MS API pool must stay low even when env asks for more');
  assert.equal(configured.status.poolMax, 5);
  assert.equal(configured.status.usesPgBouncer, true);
  assert.doesNotMatch(JSON.stringify(configured.status), /super-secret|postgresql:\/\//i);
});

test('/readyz returns not ready without crashing or leaking secrets when DB config is missing', async () => {
  const { createCybermapApiServer } = await import('../vm/cybermap-api/server.mjs');
  const server = createCybermapApiServer({
    env: {},
    logger: () => {},
    now: () => new Date('2026-07-10T00:00:00.000Z'),
    dbPoolFactory: () => assert.fail('missing DB config must not construct a pool'),
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const ready = await request(server, { path: '/readyz' });
    assert.equal(ready.status, 503);
    assert.equal(ready.json.ok, false);
    assert.equal(ready.json.dependencies.postgres.status, 'not_configured');
    assert.equal(ready.json.dependencies.postgres.missing[0], 'CYBERMAP_DATABASE_URL');
    assert.doesNotMatch(ready.text, /postgresql:\/\/|password|super-secret/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('/readyz reports DB connectivity and latest migration version on mocked success', async () => {
  const { createCybermapApiServer } = await import('../vm/cybermap-api/server.mjs');
  const pool = makePool((sql) => {
    if (/select\s+1\s+as\s+ok/i.test(sql)) return { rows: [{ ok: 1 }] };
    if (/from\s+schema_migrations/i.test(sql)) return { rows: [{ version: '0003_cybermap_cells_provenance' }] };
    assert.fail(`unexpected query: ${sql}`);
  });
  const server = createCybermapApiServer({
    env: { CYBERMAP_DATABASE_URL: 'postgresql://cybermap:super-secret@127.0.0.1:6432/cybermap' },
    logger: () => {},
    now: () => new Date('2026-07-10T00:00:00.000Z'),
    dbPoolFactory: () => pool,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const ready = await request(server, { path: '/readyz' });
    assert.equal(ready.status, 200);
    assert.equal(ready.json.ok, true);
    assert.equal(ready.json.dependencies.postgres.status, 'ready');
    assert.equal(ready.json.dependencies.postgres.migration.current, '0003_cybermap_cells_provenance');
    assert.equal(ready.json.dependencies.postgres.migration.expected, '0003_cybermap_cells_provenance');
    assert.doesNotMatch(ready.text, /super-secret|postgresql:\/\//i);
    assert.ok(pool.queries.some(({ sql }) => /select\s+1\s+as\s+ok/i.test(sql)));
    assert.ok(pool.queries.some(({ sql }) => /schema_migrations/i.test(sql)));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('/readyz rejects databases that are still on the pre-read-api migration', async () => {
  const { createCybermapApiServer } = await import('../vm/cybermap-api/server.mjs');
  const pool = makePool((sql) => {
    if (/select\s+1\s+as\s+ok/i.test(sql)) return { rows: [{ ok: 1 }] };
    if (/from\s+schema_migrations/i.test(sql)) return { rows: [{ version: '0002_cybermap_auth_registry' }] };
    assert.fail(`unexpected query: ${sql}`);
  });
  const server = createCybermapApiServer({
    env: { CYBERMAP_DATABASE_URL: 'postgresql://cybermap@127.0.0.1:6432/cybermap' },
    logger: () => {},
    now: () => new Date('2026-07-10T00:00:00.000Z'),
    dbPoolFactory: () => pool,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const ready = await request(server, { path: '/readyz' });
    assert.equal(ready.status, 503);
    assert.equal(ready.json.ok, false);
    assert.equal(ready.json.dependencies.postgres.status, 'migration_mismatch');
    assert.equal(ready.json.dependencies.postgres.migration.current, '0002_cybermap_auth_registry');
    assert.equal(ready.json.dependencies.postgres.migration.expected, '0003_cybermap_cells_provenance');
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('/readyz reports DB failures generically without leaking driver errors', async () => {
  const { createCybermapApiServer } = await import('../vm/cybermap-api/server.mjs');
  const pool = makePool(() => {
    throw new Error('password=super-secret postgresql://cybermap:super-secret@private-host/cybermap');
  });
  const server = createCybermapApiServer({
    env: { CYBERMAP_DATABASE_URL: 'postgresql://cybermap:super-secret@127.0.0.1:6432/cybermap' },
    logger: () => {},
    now: () => new Date('2026-07-10T00:00:00.000Z'),
    dbPoolFactory: () => pool,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  try {
    const ready = await request(server, { path: '/readyz' });
    assert.equal(ready.status, 503);
    assert.equal(ready.json.ok, false);
    assert.equal(ready.json.dependencies.postgres.status, 'unavailable');
    assert.equal(ready.json.dependencies.postgres.error.code, 'db_unavailable');
    assert.doesNotMatch(ready.text, /super-secret|postgresql:\/\/|private-host/i);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});

test('migration runner discovers ordered SQL files and applies only unapplied versions', async () => {
  const { runMigrations } = await import('../vm/cybermap-api/migrate.mjs');
  const migrationsDir = await mkdtemp(join(tmpdir(), 'cybermap-migrations-'));
  await writeFile(join(migrationsDir, '0001_base.sql'), 'SELECT 1;');
  await writeFile(join(migrationsDir, '0002_next.sql'), 'SELECT 2;');

  const executedSql = [];
  const pool = makePool((sql) => {
    if (/from\s+schema_migrations/i.test(sql)) return { rows: [{ version: '0001_base' }] };
    executedSql.push(sql.trim());
    return { rows: [] };
  });

  const result = await runMigrations({
    migrationsDir,
    env: { CYBERMAP_DATABASE_URL: 'postgresql://cybermap:super-secret@127.0.0.1:6432/cybermap' },
    poolFactory: () => pool,
  });

  assert.deepEqual(result.applied, ['0002_next']);
  assert.deepEqual(executedSql, ['SELECT 2;']);
  assert.equal(pool.ended, true);
});

test('VM deployment config wires PgBouncer, package scripts, migration startup command, and documented env vars', () => {
  const apiPackage = JSON.parse(read('vm/cybermap-api/package.json'));
  const vmBicep = read('infra/vm-echo-lab.bicep');
  const docs = read('docs/vm-api.md');

  assert.equal(apiPackage.scripts.start, 'node server.mjs');
  assert.equal(apiPackage.scripts.migrate, 'node migrate.mjs');
  assert.match(apiPackage.dependencies.pg, /^\^?8\./);

  for (const needle of [
    'CYBERMAP_DATABASE_URL',
    'CYBERMAP_DB_POOL_MAX=5',
    'CYBERMAP_EXPECTED_MIGRATION=0003_cybermap_cells_provenance',
    'migrate.mjs --if-configured',
    '/opt/cybermap-api/db/migrations/0001_cybermap_core.sql',
    '/opt/cybermap-api/db/migrations/0002_cybermap_auth_registry.sql',
    '/opt/cybermap-api/db/migrations/0003_cybermap_cells_provenance.sql',
    'X-Real-IP $remote_addr',
    'X-Forwarded-For $remote_addr',
    'default_pool_size = 5',
    'reserve_pool_size = 2',
  ]) {
    assert.ok(vmBicep.includes(needle), `Bicep should include ${needle}`);
  }

  for (const needle of [
    'CYBERMAP_DATABASE_URL',
    'CYBERMAP_DB_POOL_MAX',
    'CYBERMAP_EXPECTED_MIGRATION',
    'CYBERMAP_DB_CONNECT_TIMEOUT_MS',
    '/readyz',
    'schema_migrations',
  ]) {
    assert.ok(docs.includes(needle), `docs/vm-api.md should document ${needle}`);
  }
});
