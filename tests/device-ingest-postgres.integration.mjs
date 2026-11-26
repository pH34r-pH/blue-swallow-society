import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, rmdir } from 'node:fs/promises';
import { createServer } from 'node:https';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { getCACertificates, setDefaultCACertificates } from 'node:tls';
import { promisify } from 'node:util';

import { hashToken } from '../vm/cybermap-api/src/auth.mjs';
import { PostgresObservationStore } from '../vm/cybermap-api/src/postgres-store.mjs';
import { createRequestHandler } from '../vm/cybermap-api/src/server.mjs';
import { ingestHeaders, validObservation, validWardriverV2Batch, withServer } from '../vm/cybermap-api/test/helpers.mjs';

const require = createRequire(new URL('../vm/cybermap-api/package.json', import.meta.url));
const { Pool } = require('pg');
const proxy = require('../../api/cybermap-observations-batch/index.js');
const exec = promisify(execFile);
const database = new URL(process.env.SOCIETY_INGEST_TEST_DATABASE_URL || 'invalid');
assert.ok(database.protocol === 'postgres:' && ['127.0.0.1', 'localhost'].includes(database.hostname)
  && database.pathname === '/bss_history_synthetic' && !database.search && !database.hash,
  'ingest fixture requires the disposable local synthetic PostGIS database');

async function fixtureCertificate(t) {
  const directory = await mkdtemp(join(tmpdir(), 'society-ingest-tls-'));
  const certificatePath = join(directory, 'localhost.crt');
  const keyPath = join(directory, 'localhost.key');
  t.after(async () => {
    await rm(certificatePath, { force: true });
    await rm(keyPath, { force: true });
    await rmdir(directory);
  });
  await exec('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1',
    '-subj', '/CN=society-ingest-fixture', '-addext', 'subjectAltName=IP:127.0.0.1',
    '-keyout', keyPath, '-out', certificatePath], { timeout: 10_000 });
  const [cert, key] = await Promise.all([readFile(certificatePath, 'utf8'), readFile(keyPath, 'utf8')]);
  const defaults = getCACertificates('default');
  setDefaultCACertificates([...defaults, cert]);
  t.after(() => setDefaultCACertificates(defaults));
  return { cert, key };
}

async function enrollFixture(pool, source, label) {
  const id = `synthetic-${label}-${randomUUID()}`;
  const session = randomUUID();
  const token = randomBytes(32).toString('base64url');
  await pool.query(`INSERT INTO sensorium_sessions (id, source_id, session_kind, device_ref)
    VALUES ($1, $2, 'direct_observation', $3)`, [session, source, id]);
  await pool.query(`INSERT INTO device_ingest_credentials (device_id, source_id, token_sha256, scopes)
    VALUES ($1, $2, $3, ARRAY['observations:write'])`, [id, source, hashToken(token)]);
  return { id, session, token };
}

async function submit(device, batch) {
  const context = {};
  await proxy(context, {
    method: 'POST',
    headers: ingestHeaders(batch, { 'x-blue-swallow-ingest-token': device.token }),
    rawBody: JSON.stringify(batch),
  });
  return context.res;
}

function assertApplied(response) {
  assert.equal(response.status, 201, JSON.stringify(response.body));
  assert.equal(response.body.schema_version, 'bss.sync_receipt.v2');
  assert.equal(response.body.accepted_count, 1);
  assert.equal(response.body.rejected_count, 0);
  assert.equal(response.body.progress.acknowledged_through, '42');
  return response.body;
}

test('HTTPS ingest persists each enrolled device’s own session and rejects another device’s session', { timeout: 25_000 }, async (t) => {
  const pool = new Pool({ connectionString: database.href, connectionTimeoutMillis: 3_000 });
  t.after(() => pool.end());
  const source = randomUUID();
  await pool.query(`INSERT INTO source_catalog (id, source_class, source_key, name)
    VALUES ($1, 'owned_device', $2, 'Synthetic device source')`, [source, `synthetic-ingest-${source}`]);
  const first = await enrollFixture(pool, source, 'first');
  const second = await enrollFixture(pool, source, 'second');
  const firstBatch = validWardriverV2Batch({
    device_id: first.id, session_id: first.session,
    observations: [validObservation({
      external_observation_key: 'wardriver-observation:42', confidence: 0.8,
      location: { latitude: 0, longitude: 0, accuracy_m: 10 },
    })],
  });
  const secondBatch = validWardriverV2Batch({
    device_id: second.id, session_id: second.session,
    observations: [{ ...firstBatch.observations[0], confidence: 0.3 }],
  });
  const server = createServer(await fixtureCertificate(t), createRequestHandler({
    store: new PostgresObservationStore({ pool }),
  }));
  const previousBackend = process.env.BACKEND_CYBERMAP_BASE_URL;
  t.after(() => {
    if (previousBackend === undefined) delete process.env.BACKEND_CYBERMAP_BASE_URL;
    else process.env.BACKEND_CYBERMAP_BASE_URL = previousBackend;
  });
  await withServer(server, async (localUrl) => {
    process.env.BACKEND_CYBERMAP_BASE_URL = localUrl.replace(/^http:/, 'https:');
    const firstReceipt = assertApplied(await submit(first, firstBatch));
    const denied = await submit(second, { ...secondBatch, session_id: first.session });
    assert.equal(denied.status, 422);
    assert.deepEqual(denied.body, { ok: false, error: 'session_not_owned' });
    assert.equal((await pool.query('SELECT count(*) FROM sync_batches WHERE source_id = $1', [source])).rows[0].count, '1');

    const secondReceipt = assertApplied(await submit(second, secondBatch));
    assert.notEqual(secondReceipt.server_batch_id, firstReceipt.server_batch_id);
    const replay = await submit(first, firstBatch);
    assert.equal(replay.status, 200);
    assert.equal(replay.headers['idempotent-replayed'], 'true');
    assert.deepEqual(replay.body, firstReceipt);

    const changed = await submit(first, { ...firstBatch, idempotency_key: `batch-${randomUUID()}`,
      observations: [{ ...firstBatch.observations[0], confidence: 0.1 }] });
    assert.equal(changed.status, 201);
    assert.equal(changed.body.accepted_count, 0);
    assert.equal(changed.body.preserved_conflict_count, 1);
    assert.equal(changed.body.progress.acknowledged_through, '42');

    await pool.query('UPDATE device_ingest_credentials SET enabled = false WHERE source_id = $1 AND device_id = $2',
      [source, second.id]);
    const disabled = await submit(second, secondBatch);
    assert.equal(disabled.status, 403);
    assert.deepEqual(disabled.body, { ok: false, error: 'forbidden' });

    const { rows } = await pool.query(`SELECT producer_device_id AS device_id, session_id,
      sync_batch_id, external_observation_key, confidence::double precision AS confidence FROM observations
      WHERE source_id = $1 ORDER BY producer_device_id`, [source]);
    assert.equal(rows.length, 2);
    for (const [index, device, receipt, confidence] of [[0, first, firstReceipt, 0.8], [1, second, secondReceipt, 0.3]]) {
      assert.deepEqual(rows[index], { device_id: device.id, session_id: device.session,
        sync_batch_id: receipt.server_batch_id, external_observation_key: 'wardriver-observation:42', confidence });
    }
    const persisted = await pool.query('SELECT id, receipt FROM sync_batches WHERE source_id = $1', [source]);
    assert.equal(persisted.rows.length, 3);
    const stored = new Map(persisted.rows.map(({ id, receipt }) => [id, receipt]));
    for (const receipt of [firstReceipt, secondReceipt, changed.body]) {
      assert.deepEqual(stored.get(receipt.server_batch_id), receipt);
    }
  });
});
