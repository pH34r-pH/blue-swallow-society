const DEFAULT_POOL_MAX = 5;
const DEFAULT_CONNECT_TIMEOUT_MS = 3000;
const DEFAULT_IDLE_TIMEOUT_MS = 10000;
const DEFAULT_EXPECTED_MIGRATION = '0001_cybermap_core';

function parseBoundedInteger(value, fallback, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

function boolFromEnv(value) {
  return ['1', 'true', 'yes', 'on', 'require'].includes(String(value ?? '').toLowerCase());
}

function databaseNameFromUrl(databaseUrl) {
  try {
    const parsed = new URL(databaseUrl);
    return parsed.pathname.replace(/^\//, '') || 'unknown';
  } catch {
    return 'unknown';
  }
}

function usesPgBouncer(databaseUrl, env = {}) {
  if (boolFromEnv(env.CYBERMAP_DB_VIA_PGBOUNCER)) return true;
  try {
    const parsed = new URL(databaseUrl);
    return ['127.0.0.1', 'localhost', '::1'].includes(parsed.hostname) && String(parsed.port || '') === '6432';
  } catch {
    return false;
  }
}

export function loadDatabaseConfig(env = process.env) {
  const databaseUrl = env.CYBERMAP_DATABASE_URL;
  if (!databaseUrl) {
    return {
      ok: false,
      missing: ['CYBERMAP_DATABASE_URL'],
      status: {
        status: 'not_configured',
        missing: ['CYBERMAP_DATABASE_URL'],
      },
    };
  }

  try {
    // Validate URL shape here. Do not expose the parsed URL in returned status.
    // eslint-disable-next-line no-new
    new URL(databaseUrl);
  } catch {
    return {
      ok: false,
      missing: [],
      invalid: ['CYBERMAP_DATABASE_URL'],
      status: {
        status: 'invalid_config',
        invalid: ['CYBERMAP_DATABASE_URL'],
      },
    };
  }

  const poolMax = parseBoundedInteger(env.CYBERMAP_DB_POOL_MAX, DEFAULT_POOL_MAX, { min: 1, max: DEFAULT_POOL_MAX });
  const connectionTimeoutMillis = parseBoundedInteger(env.CYBERMAP_DB_CONNECT_TIMEOUT_MS, DEFAULT_CONNECT_TIMEOUT_MS, { min: 250, max: 30000 });
  const idleTimeoutMillis = parseBoundedInteger(env.CYBERMAP_DB_IDLE_TIMEOUT_MS, DEFAULT_IDLE_TIMEOUT_MS, { min: 1000, max: 60000 });
  const expectedMigration = env.CYBERMAP_EXPECTED_MIGRATION || DEFAULT_EXPECTED_MIGRATION;
  const viaPgBouncer = usesPgBouncer(databaseUrl, env);

  const pool = {
    connectionString: databaseUrl,
    max: poolMax,
    connectionTimeoutMillis,
    idleTimeoutMillis,
    allowExitOnIdle: true,
    application_name: env.CYBERMAP_DB_APPLICATION_NAME || 'blue-swallow-cybermap-api',
  };

  if (boolFromEnv(env.CYBERMAP_DB_SSL) || String(env.CYBERMAP_DB_SSLMODE || '').toLowerCase() === 'require') {
    pool.ssl = { rejectUnauthorized: !boolFromEnv(env.CYBERMAP_DB_SSL_ALLOW_SELF_SIGNED) };
  }

  return {
    ok: true,
    pool,
    expectedMigration,
    status: {
      status: 'configured',
      database: databaseNameFromUrl(databaseUrl),
      endpoint: viaPgBouncer ? 'pgbouncer-local' : 'postgres-configured',
      usesPgBouncer: viaPgBouncer,
      poolMax,
      connectTimeoutMs: connectionTimeoutMillis,
      idleTimeoutMs: idleTimeoutMillis,
    },
  };
}

export async function createDefaultPool(poolConfig) {
  const { Pool } = await import('pg');
  return new Pool(poolConfig);
}

function migrationStatus(current, expected) {
  if (!current) return 'missing';
  return current === expected ? 'current' : 'outdated';
}

export async function checkDatabaseReadiness({
  env = process.env,
  poolFactory = createDefaultPool,
  expectedMigration = env.CYBERMAP_EXPECTED_MIGRATION || DEFAULT_EXPECTED_MIGRATION,
} = {}) {
  const config = loadDatabaseConfig(env);
  if (!config.ok) {
    return {
      ok: false,
      statusCode: 503,
      postgres: {
        ...config.status,
        migration: {
          expected: expectedMigration,
          current: null,
          status: 'unknown',
        },
      },
    };
  }

  let pool;
  try {
    pool = await poolFactory(config.pool);
    await pool.query('select 1 as ok');
    const migrationResult = await pool.query('select version from schema_migrations order by applied_at desc limit 1');
    const current = migrationResult.rows?.[0]?.version || null;
    const status = migrationStatus(current, expectedMigration);
    const ready = status === 'current';
    return {
      ok: ready,
      statusCode: ready ? 200 : 503,
      postgres: {
        ...config.status,
        status: ready ? 'ready' : 'migration_mismatch',
        migration: {
          expected: expectedMigration,
          current,
          status,
        },
      },
    };
  } catch {
    return {
      ok: false,
      statusCode: 503,
      postgres: {
        ...config.status,
        status: 'unavailable',
        migration: {
          expected: expectedMigration,
          current: null,
          status: 'unknown',
        },
        error: {
          code: 'db_unavailable',
          message: 'Database readiness check failed.',
        },
      },
    };
  } finally {
    if (pool?.end) await pool.end();
  }
}

export const databaseDefaults = Object.freeze({
  DEFAULT_POOL_MAX,
  DEFAULT_CONNECT_TIMEOUT_MS,
  DEFAULT_IDLE_TIMEOUT_MS,
  DEFAULT_EXPECTED_MIGRATION,
});
