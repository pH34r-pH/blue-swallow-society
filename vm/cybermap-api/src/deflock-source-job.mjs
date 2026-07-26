import { fileURLToPath } from 'node:url';

import { Pool } from 'pg';

import { PostgresObservationStore } from './postgres-store.mjs';
import { DEFLOCK_SOURCE_ID, runDeflockSourceJob } from './greenfeed-worker.mjs';

export async function runDeflockSourceProcess({ store, runSourceJob = runDeflockSourceJob } = {}) {
  if (!store || typeof store.getDeflockSource !== 'function') throw new TypeError('A configured DeFlock source store is required.');
  if (typeof runSourceJob !== 'function') throw new TypeError('A source worker is required.');
  const source = await store.getDeflockSource(DEFLOCK_SOURCE_ID);
  return runSourceJob({ source, store });
}

export async function main({ env = process.env, PoolClass = Pool, write = (line) => process.stdout.write(line) } = {}) {
  if (typeof env.DATABASE_URL !== 'string' || env.DATABASE_URL.length === 0) throw new Error('DATABASE_URL is required.');
  const pool = new PoolClass({
    connectionString: env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    application_name: 'bss-deflock-source',
  });
  try {
    const result = await runDeflockSourceProcess({ store: new PostgresObservationStore({ pool }) });
    write(`${JSON.stringify({ level: 'info', service: 'bss-deflock-source', ...result })}\n`);
    return result;
  } finally {
    await pool.end();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    process.stderr.write(`${JSON.stringify({ level: 'error', service: 'bss-deflock-source', message: error?.message ?? 'source job failed' })}\n`);
    process.exitCode = 1;
  });
}
