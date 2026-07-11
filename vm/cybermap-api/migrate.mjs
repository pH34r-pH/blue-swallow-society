import { readdir, readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDefaultPool, loadDatabaseConfig } from './db.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const DEFAULT_MIGRATIONS_DIR = join(here, 'db', 'migrations');

export class MigrationConfigError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'MigrationConfigError';
    this.details = details;
  }
}

function versionFromFilename(filename) {
  return filename.replace(/\.sql$/i, '');
}

export async function discoverMigrations(migrationsDir = DEFAULT_MIGRATIONS_DIR) {
  const entries = await readdir(migrationsDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.sql'))
    .map((entry) => ({
      version: versionFromFilename(entry.name),
      filename: entry.name,
      path: join(migrationsDir, entry.name),
    }))
    .sort((left, right) => left.filename.localeCompare(right.filename));
}

async function readAppliedVersions(pool) {
  try {
    const result = await pool.query('select version from schema_migrations order by version');
    return new Set((result.rows || []).map((row) => row.version));
  } catch (error) {
    if (error?.code === '42P01' || /schema_migrations/i.test(String(error?.message || ''))) {
      return new Set();
    }
    throw error;
  }
}

export async function runMigrations({
  env = process.env,
  migrationsDir = env.CYBERMAP_MIGRATIONS_DIR || DEFAULT_MIGRATIONS_DIR,
  poolFactory = createDefaultPool,
} = {}) {
  const config = loadDatabaseConfig(env);
  if (!config.ok) {
    throw new MigrationConfigError('Cybermap database config is missing or invalid.', {
      missing: config.missing || [],
      invalid: config.invalid || [],
    });
  }

  const migrations = await discoverMigrations(migrationsDir);
  const pool = await poolFactory(config.pool);
  const applied = [];
  const skipped = [];

  try {
    const appliedVersions = await readAppliedVersions(pool);
    for (const migration of migrations) {
      if (appliedVersions.has(migration.version)) {
        skipped.push(migration.version);
        continue;
      }
      const sql = await readFile(migration.path, 'utf8');
      await pool.query(sql);
      applied.push(migration.version);
    }
  } finally {
    if (pool?.end) await pool.end();
  }

  return {
    migrationsDir,
    applied,
    skipped,
    latest: migrations.at(-1)?.version || null,
  };
}

function safeCliError(error) {
  if (error instanceof MigrationConfigError) {
    const missing = error.details?.missing?.length ? ` missing=${error.details.missing.join(',')}` : '';
    const invalid = error.details?.invalid?.length ? ` invalid=${error.details.invalid.join(',')}` : '';
    return `Cybermap migration config error.${missing}${invalid}`;
  }
  return 'Cybermap migration failed; inspect secure service logs for driver details.';
}

async function main(argv = process.argv.slice(2)) {
  const ifConfigured = argv.includes('--if-configured');
  try {
    const result = await runMigrations();
    process.stdout.write(`${JSON.stringify({ service: 'cybermap-api', event: 'migrations_applied', ...result })}\n`);
  } catch (error) {
    if (ifConfigured && error instanceof MigrationConfigError) {
      process.stdout.write(`${JSON.stringify({ service: 'cybermap-api', event: 'migrations_skipped', reason: 'db_not_configured', missing: error.details?.missing || [], invalid: error.details?.invalid || [] })}\n`);
      return;
    }
    process.stderr.write(`${safeCliError(error)}\n`);
    process.exitCode = 1;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
}
