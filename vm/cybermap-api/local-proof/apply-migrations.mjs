import { readFile } from 'node:fs/promises';

import { Pool } from 'pg';

const databaseUrl = requireValue('DATABASE_URL');
const databaseReadyTimeoutMs = positiveIntegerFromEnv('DATABASE_READY_TIMEOUT_MS', 60_000);
const databaseReadyRetryMs = positiveIntegerFromEnv('DATABASE_READY_RETRY_MS', 500);
const migrationDirectory = new URL('../db/migrations/', import.meta.url);
const migrationFiles = Object.freeze([
  '0001_cybermap_core.sql',
  '0002_device_ingest_contract.sql',
  '0003_paper_state.sql',
  '0004_godeye_global_cells_and_sources.sql',
  '0004_morning_brief_archive.sql',
  '0005_device_scoped_observation_identity.sql',
  '0006_best_effort_observation_progress.sql',
]);

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
let client;
try {
  client = await connectWithRetry(pool, databaseReadyTimeoutMs, databaseReadyRetryMs);
  const applied = await appliedMigrations(client);
  for (const fileName of migrationFiles) {
    const version = fileName.replace(/\.sql$/, '');
    if (applied.has(version)) continue;
    const sql = await readFile(new URL(fileName, migrationDirectory), 'utf8');
    await client.query(sql);
    process.stdout.write(`${JSON.stringify({ event: 'migration_applied', version })}\n`);
  }
} finally {
  client?.release();
  await pool.end();
}

async function connectWithRetry(pool, timeoutMs, retryMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError;

  while (Date.now() < deadline) {
    try {
      return await pool.connect();
    } catch (error) {
      if (!isTransientDatabaseConnectionError(error)) throw error;
      lastError = error;
      const remainingMs = deadline - Date.now();
      if (remainingMs <= 0) break;
      await sleep(Math.min(retryMs, remainingMs));
    }
  }

  throw new Error(`Local PostGIS did not accept a connection within ${timeoutMs} ms.`, {
    cause: lastError,
  });
}

function isTransientDatabaseConnectionError(error) {
  return new Set(['ECONNREFUSED', '08001', '08004', '08006', '57P03', '53300']).has(error?.code);
}

function sleep(durationMs) {
  return new Promise((resolve) => setTimeout(resolve, durationMs));
}

async function appliedMigrations(client) {
  try {
    const result = await client.query('SELECT version FROM schema_migrations');
    return new Set(result.rows.map((row) => row.version));
  } catch (error) {
    if (error?.code === '42P01') return new Set();
    throw error;
  }
}

function requireValue(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function positiveIntegerFromEnv(name, defaultValue) {
  const raw = String(process.env[name] ?? '').trim();
  if (!raw) return defaultValue;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}
