import { PostgresWorldOrbitStore } from './world-orbit-postgres-store.mjs';
import { createWorldOrbitService } from './world-orbit-service.mjs';
import { createOrbitAcquisition } from './world-orbit-acquisition.mjs';
import { createWorldService } from './world-service.mjs';
import { createWorldRoute } from './world-route.mjs';
import { createWorldAcquisition } from './world-acquisition.mjs';
import { Pool } from 'pg';

import { PostgresObservationStore } from './postgres-store.mjs';
import { PostgresEntityStore } from './entity-postgres-store.mjs';
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
const mtlsCredentialPolicy = readMtlsCredentialPolicy();
const store = new PostgresObservationStore({ pool, mtlsCredentialPolicy });
const worldService = createWorldService();
const worldAcquisition = createWorldAcquisition(worldService);
const orbitEnabled = process.env.BSS_WORLD_ORBITS_ENABLED === 'true';
const orbitService = createWorldOrbitService({ store:new PostgresWorldOrbitStore({ pool }), enabled:orbitEnabled });
const orbitAcquisition = createOrbitAcquisition(orbitService);
const worldSnapshot = { async read() {
  const ground = worldService.read(), orbits = await orbitService.read();
  return { ...ground, orbits, sources:ground.sources.map((source) => source.id==='celestrak' ? orbits.source : source) };
} };
const server = createCybermapApiServer({
  worldRoute: createWorldRoute({ service: worldSnapshot }),
  store,
  entityStore: new PostgresEntityStore({ pool }),
  logger: {
    error(event) {
      process.stderr.write(`${JSON.stringify({ level: 'error', service: 'bss-cybermap-api', ...event })}\n`);
    },
  },
});

server.listen(port, host, () => {
  if (process.env.BSS_WORLD_PUBLIC_FEEDS_ENABLED === 'true') worldAcquisition.start();
  if (orbitEnabled && process.env.BSS_WORLD_ORBIT_ACQUISITION_ENABLED === 'true') orbitAcquisition.start();
  process.stdout.write(`${JSON.stringify({ level: 'info', service: 'bss-cybermap-api', event: 'listening', host, port })}\n`);
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => shutdown(signal));
}

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  worldAcquisition.stop();
  orbitAcquisition.stop();
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

function readMtlsCredentialPolicy() {
  const fields = Object.freeze({
    deviceId: readOptionalEnvironment('BSS_MTLS_EXPECTED_DEVICE_ID'),
    sourceKey: readOptionalEnvironment('BSS_MTLS_EXPECTED_SOURCE_KEY'),
    sourceClass: readOptionalEnvironment('BSS_MTLS_EXPECTED_SOURCE_CLASS'),
    credentialSource: readOptionalEnvironment('BSS_MTLS_EXPECTED_CREDENTIAL_SOURCE'),
    environment: readOptionalEnvironment('BSS_MTLS_EXPECTED_ENVIRONMENT'),
    scopes: readOptionalEnvironment('BSS_MTLS_EXPECTED_SCOPES'),
  });
  const values = Object.values(fields);
  if (values.every((value) => value === null)) return null;
  if (values.some((value) => value === null)) {
    throw new Error('BSS_MTLS_EXPECTED_* policy must be configured as one complete set.');
  }
  const scopes = fields.scopes.split(',').map((scope) => scope.trim()).filter(Boolean);
  if (scopes.length === 0) throw new Error('BSS_MTLS_EXPECTED_SCOPES must contain at least one scope.');
  return Object.freeze({
    deviceId: fields.deviceId,
    sourceKey: fields.sourceKey,
    sourceClass: fields.sourceClass,
    sourceProvenance: Object.freeze({
      credential_source: fields.credentialSource,
      environment: fields.environment,
    }),
    credentialMetadata: Object.freeze({
      credential_source: fields.credentialSource,
      environment: fields.environment,
    }),
    scopes: Object.freeze(scopes),
  });
}

function readOptionalEnvironment(name) {
  const value = String(process.env[name] ?? '').trim();
  return value || null;
}
