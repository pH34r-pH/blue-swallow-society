import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { setTimeout as delay } from 'node:timers/promises';
import { promisify } from 'node:util';

const exec = promisify(execFile);
const image = 'postgis/postgis:16-3.5@sha256:94146ac37bc61e2322f88016056c5920729cb8c64c8542ed590af8fc2abdac07';
const root = fileURLToPath(new URL('../', import.meta.url));
const migrationPath = 'vm/cybermap-api/db/migrations';
const migrations = new URL(`../${migrationPath}/`, import.meta.url);
const migrationTarget = '/tmp/society-recovery-migrations';
const backup = '/tmp/society-recovery.dump';
const sourceId = 'a0000000-0000-4000-8000-000000000001';
const sessionId = 'a0000000-0000-4000-8000-000000000002';
const batchId = 'a0000000-0000-4000-8000-000000000003';
const verifiedId = 'a0000000-0000-4000-8000-000000000004';
const unverifiedId = 'a0000000-0000-4000-8000-000000000005';

async function output(command, args, options = {}) {
  const { stdout } = await exec(command, args, { timeout: 60_000, ...options });
  return stdout.trim();
}

async function schemaManifest() {
  const files = (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort();
  const hash = createHash('sha256');
  for (const name of files) {
    const bytes = await readFile(new URL(name, migrations));
    hash.update(`${name}\0${createHash('sha256').update(bytes).digest('hex')}\n`);
  }
  return { files, versions: files.map((name) => name.slice(0, -4)), sha256: hash.digest('hex') };
}

const seedLegacy = `
  BEGIN;
  INSERT INTO source_catalog (id, source_class, source_key, name)
    VALUES ('${sourceId}', 'owned_device', 'synthetic-recovery', 'Synthetic recovery');
  INSERT INTO sensorium_sessions (id, source_id, session_kind, device_ref)
    VALUES ('${sessionId}', '${sourceId}', 'direct_observation', 'synthetic-device');
  INSERT INTO sync_batches (id, source_id, session_id, client_id, idempotency_key,
      status, received_at, completed_at, observation_count, payload_hash, accepted_count, response_status, receipt)
    VALUES ('${batchId}', '${sourceId}', '${sessionId}', 'synthetic-device', 'synthetic-batch', 'applied',
      '2026-01-01 00:00:00+00', '2026-01-01 00:00:01+00', 1, repeat('a', 64), 1, 200,
      jsonb_build_object('schema_version', 'bss.sync_receipt.v1', 'server_batch_id', '${batchId}',
        'idempotency_key', 'synthetic-batch', 'status', 'applied', 'accepted_count', 1,
        'rejected_count', 0, 'duplicate_count', 0, 'validation_errors', '[]'::jsonb,
        'server_clock', '2026-01-01T00:00:01Z'));
  INSERT INTO observations (id, source_id, source_class, session_id, sync_batch_id, kind,
      observed_at, external_observation_key, content_hash, payload)
    VALUES
      ('${verifiedId}', '${sourceId}', 'owned_device', '${sessionId}', '${batchId}', 'wifi_ap',
        '2026-01-01 00:00:00+00', 'legacy-proven', repeat('b', 64), '{"synthetic":true}'),
      ('${unverifiedId}', '${sourceId}', 'owned_device', '${sessionId}', NULL, 'wifi_ap',
        '2026-01-01 00:00:00+00', 'legacy-unproven', repeat('c', 64), '{}');
  COMMIT;`;

const legacySnapshot = `SELECT jsonb_build_object(
  'source', (SELECT to_jsonb(s) FROM source_catalog s WHERE id = '${sourceId}'),
  'session', (SELECT to_jsonb(s) FROM sensorium_sessions s WHERE id = '${sessionId}'),
  'observations', (SELECT jsonb_agg(to_jsonb(o) - 'producer_device_id' ORDER BY id)
    FROM observations o WHERE source_id = '${sourceId}'),
  'receipt', (SELECT to_jsonb(b) - 'preserved_conflict_count' FROM sync_batches b WHERE id = '${batchId}'));`;

// Migration 0004 seeds a public catalog entry before any user admission.
const noAdmission = `SELECT NOT EXISTS (SELECT FROM source_catalog
  WHERE (source_class, source_key) <> ('green_public', 'deflock-osm-alpr-reports'))
  AND NOT EXISTS (SELECT FROM sensorium_sessions)
  AND NOT EXISTS (SELECT FROM device_ingest_credentials)
  AND NOT EXISTS (SELECT FROM observations)
  AND NOT EXISTS (SELECT FROM sync_batches);`;

test('disposable PostGIS can rebuild empty, upgrade populated and recover to a new database', { timeout: 300_000 }, async (t) => {
  // Every database command targets the new container by ID over its local socket.
  // The fixture publishes no ports and has no connection to deployed databases.
  const docker = (args, options) => output('docker', args, options);
  const sourceCommit = await output('git', ['rev-parse', 'HEAD'], { cwd: root });
  await output('git', ['diff', '--quiet', sourceCommit, '--', migrationPath], { cwd: root });
  const tracked = await output('git', ['ls-tree', '-r', '--name-only', sourceCommit, '--', migrationPath], { cwd: root });
  const schema = await schemaManifest();
  assert.deepEqual(schema.files, tracked.split('\n').filter((name) => name.endsWith('.sql'))
    .map((name) => name.slice(migrationPath.length + 1)).sort(), 'rehearse only the candidate SQL files');
  const upgradeFrom = schema.files.indexOf('0005_device_scoped_observation_identity.sql');
  assert.ok(upgradeFrom > 0, 'find the migration that introduces scoped observation identity');
  const postgresId = await docker(['run', '--rm', '--detach', '--network', 'none',
    '--name', `society-recovery-${randomUUID()}`, '--env', 'POSTGRES_PASSWORD', image], {
    env: { ...process.env, POSTGRES_PASSWORD: randomBytes(24).toString('hex') },
  });
  assert.match(postgresId, /^[a-f0-9]{64}$/);
  t.after(() => docker(['rm', '--force', postgresId]));
  const pg = (...args) => docker(['exec', '--user', 'postgres', postgresId, ...args]);
  const sql = (db, statement) => pg('psql', '-XqAt', '-v', 'ON_ERROR_STOP=1', '-d', db, '-c', statement);
  const create = (db) => pg('createdb', '--template', 'template0', db);
  const apply = (db, files) => pg('psql', '-Xq', '-v', 'ON_ERROR_STOP=1', '-d', db,
    ...files.flatMap((file) => ['-f', `${migrationTarget}/${file}`]));
  const versions = (db) => sql(db, 'SELECT version FROM schema_migrations ORDER BY version COLLATE "C";');
  const expectedVersions = schema.versions.join('\n');

  for (let attempt = 0; ; attempt++) {
    try { await pg('pg_isready', '--host', '127.0.0.1', '--timeout', '1'); break; }
    catch (error) {
      if (attempt === 29) throw error;
      await delay(1_000);
    }
  }
  await docker(['cp', fileURLToPath(migrations), `${postgresId}:${migrationTarget}`]);

  const freshDb = 'society_fresh';
  await create(freshDb);
  await apply(freshDb, schema.files);
  assert.equal(await versions(freshDb), expectedVersions);
  assert.equal(await sql(freshDb, noAdmission), 't', 'confirm the fixture has no admitted records before reset');
  const runtime = JSON.parse(await sql(freshDb, `SELECT jsonb_build_object(
    'postgres', current_setting('server_version'), 'postgis', postgis_lib_version());`));
  const databaseId = (db) => sql('postgres', `SELECT oid FROM pg_database WHERE datname = '${db}';`);
  const initialDatabase = await databaseId(freshDb);
  await pg('dropdb', freshDb);
  assert.equal(await databaseId(freshDb), '');
  await create(freshDb);
  await apply(freshDb, schema.files);
  assert.notEqual(await databaseId(freshDb), initialDatabase);
  assert.equal(await versions(freshDb), expectedVersions);
  assert.equal(await sql(freshDb, noAdmission), 't');

  const sourceDb = 'society_admitted';
  await create(sourceDb);
  await apply(sourceDb, schema.files.slice(0, upgradeFrom));
  assert.equal(await versions(sourceDb), schema.versions.slice(0, upgradeFrom).join('\n'));
  await sql(sourceDb, seedLegacy);
  const legacy = await sql(sourceDb, legacySnapshot);
  assert.equal(await sql(sourceDb, noAdmission), 'f', 'the admitted fixture requires a separate recovery path');
  await apply(sourceDb, schema.files.slice(upgradeFrom));
  assert.equal(await versions(sourceDb), expectedVersions);
  assert.ok(await sql(sourceDb, legacySnapshot) === legacy, 'forward migration preserves observations and finalized receipts');
  const scopesQuery = 'SELECT observation_id, producer_device_id, external_observation_key FROM observation_identity_scopes;';
  const expectedScope = `${verifiedId}|synthetic-device|legacy-proven`;
  assert.equal(await sql(sourceDb, scopesQuery), expectedScope, 'only the proven legacy row gains a separate scope');

  await pg('pg_dump', '--format=custom', '--file', backup, sourceDb);
  const [backupSha256] = (await pg('sha256sum', backup)).split(/\s+/);
  assert.match(backupSha256, /^[a-f0-9]{64}$/);
  await sql(sourceDb, `INSERT INTO observations (source_id, source_class, kind, observed_at, external_observation_key)
    VALUES ('${sourceId}', 'owned_device', 'wifi_ap', '2026-01-01 00:00:02+00', 'post-backup-fixture');`);
  const recoveryDb = 'society_recovered';
  await create(recoveryDb);
  await pg('pg_restore', '--exit-on-error', '--single-transaction', '--dbname', recoveryDb, backup);
  assert.equal(await versions(recoveryDb), expectedVersions);
  assert.equal(await sql(recoveryDb, scopesQuery), expectedScope);
  assert.ok(await sql(recoveryDb, legacySnapshot) === legacy, 'restore preserves the point-in-time observations and receipt');
  await assert.rejects(sql(recoveryDb, `UPDATE sync_batches SET error = 'fixture edit' WHERE id = '${batchId}';`),
    /finalized sync batches are immutable/);
  await assert.rejects(sql(recoveryDb, `UPDATE observations SET payload = '{}'::jsonb WHERE id = '${verifiedId}';`),
    /observations are append-only/);
  assert.equal(await sql(sourceDb, 'SELECT count(*) FROM observations;'), '3', 'recovery leaves the admitted source intact');
  assert.equal(await sql(recoveryDb, 'SELECT count(*) FROM observations;'), '2', 'recovery restores the backup point');

  t.diagnostic(JSON.stringify({
    sourceCommit,
    schema: { versions: schema.versions, sha256: schema.sha256 },
    environment: { kind: 'disposable', network: 'none', image, ...runtime },
    stages: [
      { operation: 'fresh_provisioning', policy: 'empty_synthetic' },
      { operation: 'reset_before_admission', policy: 'empty_synthetic' },
      { operation: 'forward_migration', policy: 'admitted_synthetic', fromSchema: schema.versions[upgradeFrom - 1] },
      { operation: 'isolated_restore', policy: 'admitted_synthetic', backupSha256 },
    ],
  }));
});
