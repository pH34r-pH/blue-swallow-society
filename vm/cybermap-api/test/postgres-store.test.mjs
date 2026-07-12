import test from 'node:test';
import assert from 'node:assert/strict';

import { PostgresObservationStore } from '../src/postgres-store.mjs';
import { hashToken } from '../src/auth.mjs';
import { DEVICE_ID, INGEST_TOKEN, validBatch } from './helpers.mjs';

class ScriptedClient {
  constructor(steps) {
    this.steps = [...steps];
    this.released = false;
  }

  async query(sql, values = []) {
    const step = this.steps.shift();
    assert.ok(step, `unexpected SQL: ${sql}`);
    assert.match(String(sql).replace(/\s+/g, ' ').trim(), step.sql);
    if (step.check) step.check(values, sql);
    if (step.error) throw step.error;
    return { rows: step.rows ?? [], rowCount: step.rowCount ?? (step.rows?.length ?? 0) };
  }

  release() {
    this.unconsumedSteps = this.steps.length;
    this.released = true;
  }
}

class FakePool {
  constructor({ authRows = [], clientSteps = [] } = {}) {
    this.authRows = authRows;
    this.client = new ScriptedClient(clientSteps);
    this.authCalls = [];
  }

  async query(sql, values) {
    this.authCalls.push({ sql, values });
    return { rows: this.authRows, rowCount: this.authRows.length };
  }

  async connect() {
    return this.client;
  }
}

const credentialRow = {
  credential_id: '10000000-0000-4000-8000-000000000001',
  device_id: DEVICE_ID,
  source_id: '20000000-0000-4000-8000-000000000001',
  source_class: 'owned_device',
  scopes: ['observations:write'],
};

test('Postgres authentication queries by device and SHA-256 token digest without passing raw bearer material', async () => {
  const pool = new FakePool({ authRows: [credentialRow] });
  const store = new PostgresObservationStore({ pool });

  const credential = await store.authenticate({
    deviceId: DEVICE_ID,
    token: INGEST_TOKEN,
    requiredScope: 'observations:write',
  });

  assert.equal(credential.source_id, credentialRow.source_id);
  assert.equal(pool.authCalls.length, 1);
  assert.match(pool.authCalls[0].sql, /device_ingest_credentials/i);
  assert.deepEqual(pool.authCalls[0].values, [DEVICE_ID, hashToken(INGEST_TOKEN), 'observations:write']);
  assert.equal(pool.authCalls[0].values.includes(INGEST_TOKEN), false);
});

test('Postgres applyBatch serializes identity locks, derives spatial cells, and commits one durable receipt', async () => {
  const sessionId = '40000000-0000-4000-8000-000000000001';
  const batch = validBatch({ session_id: sessionId });
  const batchId = '30000000-0000-4000-8000-000000000001';
  const clientSteps = [
    { sql: /^BEGIN$/i },
    { sql: /SET LOCAL lock_timeout/i },
    { sql: /FROM device_ingest_credentials[\s\S]*FOR NO KEY UPDATE/i, rows: [{ credential_id: credentialRow.credential_id }] },
    { sql: /pg_try_advisory_xact_lock/i, rows: [{ locked: true }] },
    { sql: /FROM sync_batches[\s\S]*FOR UPDATE/i, rows: [] },
    {
      sql: /FROM sensorium_sessions[\s\S]*device_ref[\s\S]*client_id[\s\S]*FOR SHARE/i,
      rows: [{ id: sessionId }],
      check(values) {
        assert.deepEqual(values, [sessionId, credentialRow.source_id, DEVICE_ID]);
      },
    },
    { sql: /pg_advisory_xact_lock/i },
    { sql: /FROM observations[\s\S]*external_observation_key = ANY/i, rows: [] },
    {
      sql: /INSERT INTO sync_batches/i,
      rows: [{ id: batchId }],
      check(values, sql) {
        assert.equal(values[0], credentialRow.source_id);
        assert.equal(values[1], DEVICE_ID);
        assert.equal(values[2], batch.idempotency_key);
        assert.match(values[3], /^[a-f0-9]{64}$/);
        assert.equal(values[5], sessionId);
        assert.match(sql, /session_id/i);
      },
    },
    {
      sql: /INSERT INTO observations/i,
      check(values, sql) {
        assert.match(sql, /ST_SetSRID\(ST_MakePoint/i);
        assert.match(sql, /jsonb_to_recordset/i);
        assert.equal(values[0], credentialRow.source_id);
        assert.equal(values[1], 'owned_device');
        assert.equal(values[3], batchId);
        const rows = JSON.parse(values[4]);
        assert.equal(rows.length, 1);
        assert.equal(rows[0].external_observation_key, batch.observations[0].external_observation_key);
        assert.match(rows[0].content_hash, /^[a-f0-9]{64}$/);
        assert.match(rows[0].h3_7, /^8[0-9a-f]{14}$/i);
        assert.match(rows[0].h3_9, /^8[0-9a-f]{14}$/i);
        assert.match(rows[0].h3_11, /^8[0-9a-f]{14}$/i);
      },
    },
    {
      sql: /SELECT clock_timestamp\(\) AS server_clock/i,
      rows: [{ server_clock: new Date('2026-07-11T18:43:00.000Z') }],
    },
    {
      sql: /UPDATE sync_batches[\s\S]*receipt =/i,
      check(values) {
        const receipt = JSON.parse(values[5]);
        assert.equal(receipt.server_batch_id, batchId);
        assert.equal(receipt.accepted_count, 1);
        assert.equal(receipt.duplicate_count, 0);
      },
    },
    { sql: /UPDATE device_ingest_credentials[\s\S]*last_used_at/i },
    { sql: /^COMMIT$/i },
  ];
  const pool = new FakePool({ clientSteps });
  const store = new PostgresObservationStore({
    pool,
    now: () => new Date('2026-07-11T18:43:00.000Z'),
  });

  const result = await store.applyBatch({ credential: credentialRow, batch });

  assert.equal(result.statusCode, 201);
  assert.equal(result.replayed, false);
  assert.equal(result.receipt.accepted_count, 1);
  assert.equal(result.receipt.server_batch_id, batchId);
  assert.equal(pool.client.released, true);
  assert.equal(pool.client.unconsumedSteps, 0);
});

test('Postgres applyBatch rechecks credential state inside the write transaction', async () => {
  const pool = new FakePool({ clientSteps: [
    { sql: /^BEGIN$/i },
    { sql: /SET LOCAL lock_timeout/i },
    { sql: /FROM device_ingest_credentials[\s\S]*FOR NO KEY UPDATE/i, rows: [] },
    { sql: /^ROLLBACK$/i },
  ] });
  await assert.rejects(
    new PostgresObservationStore({ pool }).applyBatch({ credential: credentialRow, batch: validBatch() }),
    (error) => error.code === 'forbidden' && error.statusCode === 403,
  );
});



test('Postgres applyBatch reports deadlock and transaction timeout failures as retryable', async () => {
  for (const code of ['40P01', '55P03', '57014']) {
    const pool = new FakePool({ clientSteps: [
      { sql: /^BEGIN$/i },
      { sql: /SET LOCAL lock_timeout/i },
      { sql: /FROM device_ingest_credentials[\s\S]*FOR NO KEY UPDATE/i, error: Object.assign(new Error(code), { code }) },
      { sql: /^ROLLBACK$/i },
    ] });
    await assert.rejects(
      new PostgresObservationStore({ pool }).applyBatch({ credential: credentialRow, batch: validBatch() }),
      (error) => error.code === 'ingest_busy' && error.statusCode === 503,
    );
  }
});

test('Postgres applyBatch returns the stored receipt for exact replay and rejects changed-content key reuse', async () => {
  const batch = validBatch();
  const storedReceipt = {
    schema_version: 'bss.sync_receipt.v1',
    server_batch_id: '30000000-0000-4000-8000-000000000001',
    idempotency_key: batch.idempotency_key,
    status: 'applied',
    accepted_count: 1,
    rejected_count: 0,
    duplicate_count: 0,
    validation_errors: [],
    server_clock: '2026-07-11T18:43:00.000Z',
  };
  const payloadHash = (await import('../src/contracts.mjs')).hashCanonicalJson(batch);

  const replayPool = new FakePool({ clientSteps: [
    { sql: /^BEGIN$/i },
    { sql: /SET LOCAL lock_timeout/i },
    { sql: /FROM device_ingest_credentials[\s\S]*FOR NO KEY UPDATE/i, rows: [{ credential_id: credentialRow.credential_id }] },
    { sql: /pg_try_advisory_xact_lock/i, rows: [{ locked: true }] },
    { sql: /FROM sync_batches[\s\S]*FOR UPDATE/i, rows: [{ payload_hash: payloadHash, receipt: storedReceipt }] },
    { sql: /UPDATE device_ingest_credentials[\s\S]*last_used_at/i },
    { sql: /^COMMIT$/i },
  ] });
  const replay = await new PostgresObservationStore({ pool: replayPool }).applyBatch({ credential: credentialRow, batch });
  assert.equal(replay.statusCode, 200);
  assert.equal(replay.replayed, true);
  assert.deepEqual(replay.receipt, storedReceipt);

  const conflictPool = new FakePool({ clientSteps: [
    { sql: /^BEGIN$/i },
    { sql: /SET LOCAL lock_timeout/i },
    { sql: /FROM device_ingest_credentials[\s\S]*FOR NO KEY UPDATE/i, rows: [{ credential_id: credentialRow.credential_id }] },
    { sql: /pg_try_advisory_xact_lock/i, rows: [{ locked: true }] },
    { sql: /FROM sync_batches[\s\S]*FOR UPDATE/i, rows: [{ payload_hash: 'f'.repeat(64), receipt: storedReceipt }] },
    { sql: /^ROLLBACK$/i },
  ] });
  await assert.rejects(
    new PostgresObservationStore({ pool: conflictPool }).applyBatch({ credential: credentialRow, batch }),
    (error) => error.code === 'idempotency_key_reused' && error.statusCode === 409,
  );
});

test('Postgres applyBatch rejects closed or unowned sessions before linking observations', async () => {
  const sessionId = '40000000-0000-4000-8000-000000000001';
  const pool = new FakePool({ clientSteps: [
    { sql: /^BEGIN$/i },
    { sql: /SET LOCAL lock_timeout/i },
    { sql: /FROM device_ingest_credentials[\s\S]*FOR NO KEY UPDATE/i, rows: [{ credential_id: credentialRow.credential_id }] },
    { sql: /pg_try_advisory_xact_lock/i, rows: [{ locked: true }] },
    { sql: /FROM sync_batches[\s\S]*FOR UPDATE/i, rows: [] },
    {
      sql: /FROM sensorium_sessions[\s\S]*ended_at\s+IS\s+NULL[\s\S]*device_ref[\s\S]*client_id[\s\S]*FOR SHARE/i,
      rows: [],
      check(values) {
        assert.deepEqual(values, [sessionId, credentialRow.source_id, DEVICE_ID]);
      },
    },
    { sql: /^ROLLBACK$/i },
  ] });

  await assert.rejects(
    new PostgresObservationStore({ pool }).applyBatch({
      credential: credentialRow,
      batch: validBatch({ session_id: sessionId }),
    }),
    (error) => error.code === 'session_not_owned' && error.statusCode === 422,
  );
});

test('Postgres applyBatch validates durable replay receipts before returning them', async () => {
  const batch = validBatch();
  const payloadHash = (await import('../src/contracts.mjs')).hashCanonicalJson(batch);
  const malformedReceipt = {
    schema_version: 'bss.sync_receipt.v1',
    server_batch_id: 'not-a-uuid',
    idempotency_key: batch.idempotency_key,
    status: 'applied',
    accepted_count: 2,
    rejected_count: 0,
    duplicate_count: 0,
    validation_errors: [],
    server_clock: 'not-a-date',
  };
  const pool = new FakePool({ clientSteps: [
    { sql: /^BEGIN$/i },
    { sql: /SET LOCAL lock_timeout/i },
    { sql: /FROM device_ingest_credentials[\s\S]*FOR NO KEY UPDATE/i, rows: [{ credential_id: credentialRow.credential_id }] },
    { sql: /pg_try_advisory_xact_lock/i, rows: [{ locked: true }] },
    { sql: /FROM sync_batches[\s\S]*FOR UPDATE/i, rows: [{ payload_hash: payloadHash, receipt: malformedReceipt }] },
    { sql: /^ROLLBACK$/i },
  ] });

  await assert.rejects(
    new PostgresObservationStore({ pool }).applyBatch({ credential: credentialRow, batch }),
    (error) => error.code === 'storage_contract_rejected' && error.statusCode === 422,
  );
});

test('Postgres applyBatch fails fast instead of blocking indefinitely on an in-flight batch lock', async () => {
  const pool = new FakePool({ clientSteps: [
    { sql: /^BEGIN$/i },
    { sql: /SET LOCAL lock_timeout/i },
    { sql: /FROM device_ingest_credentials[\s\S]*FOR NO KEY UPDATE/i, rows: [{ credential_id: credentialRow.credential_id }] },
    { sql: /pg_try_advisory_xact_lock/i, rows: [{ locked: false }] },
    { sql: /^ROLLBACK$/i },
  ] });

  await assert.rejects(
    new PostgresObservationStore({ pool }).applyBatch({ credential: credentialRow, batch: validBatch() }),
    (error) => error.code === 'batch_in_progress' && error.statusCode === 409,
  );
});
