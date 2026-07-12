import { Pool } from 'pg';

import { PostgresObservationStore } from './postgres-store.mjs';
import { createCybermapApiServer } from './server.mjs';

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  throw new Error('DATABASE_URL is required.');
}

const host = process.env.BSS_CYBERMAP_BIND_HOST || '127.0.0.1';
const port = parsePort(process.env.BSS_CYBERMAP_PORT || '8080');
const pool = new Pool({
  connectionString: databaseUrl,
  max: parsePositiveInteger(process.env.BSS_CYBERMAP_DB_POOL_MAX || '10', 'BSS_CYBERMAP_DB_POOL_MAX'),
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  application_name: 'bss-cybermap-api',
});
const store = new PostgresObservationStore({ pool });
const server = createCybermapApiServer({
  store,
  logger: {
    error(event) {
      process.stderr.write(`${JSON.stringify({ level: 'error', service: 'bss-cybermap-api', ...event })}\n`);
    },
  },
});

server.listen(port, host, () => {
  process.stdout.write(`${JSON.stringify({ level: 'info', service: 'bss-cybermap-api', event: 'listening', host, port })}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal));
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  process.stdout.write(`${JSON.stringify({ level: 'info', service: 'bss-cybermap-api', event: 'shutdown', signal })}\n`);
  server.close(async () => {
    await pool.end();
    process.exitCode = 0;
  });
  setTimeout(() => {
    process.exitCode = 1;
    server.closeAllConnections?.();
  }, 10_000).unref();
}

function parsePort(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65_535) {
    throw new Error('BSS_CYBERMAP_PORT must be an integer between 1 and 65535.');
  }
  return parsed;
}

function parsePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${name} must be a positive integer.`);
  return parsed;
}
