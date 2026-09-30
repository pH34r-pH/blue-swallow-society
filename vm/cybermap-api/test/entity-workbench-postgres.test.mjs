import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import pg from 'pg';
import { PostgresEntityStore } from '../src/entity-postgres-store.mjs';

const url = process.env.BSS_ENTITY_TEST_DATABASE_URL;
test('isolated PostGIS entity workbench: corrections, replay, concurrency, evidence and immutable history', { skip: !url }, async (t) => {
  const parsed = new URL(url);
  assert.ok(['127.0.0.1', 'localhost'].includes(parsed.hostname) && parsed.pathname === '/entity_test',
    'Only an explicitly selected local disposable entity_test database is allowed');
  const schema = `entity_test_${randomUUID().replaceAll('-', '')}`;
  const admin = new pg.Pool({ connectionString: url });
  await admin.query(`CREATE SCHEMA ${schema}`);
  const pool = new pg.Pool({ connectionString: url, options: `-c search_path=${schema},public` });
  t.after(async () => { await pool.end(); await admin.query(`DROP SCHEMA ${schema} CASCADE`); await admin.end(); });
  const migrations = new URL('../db/migrations/', import.meta.url);
  for (const name of (await readdir(migrations)).filter((name) => name.endsWith('.sql')).sort()) {
    await pool.query(await readFile(new URL(name, migrations), 'utf8'));
  }
  const store = new PostgresEntityStore({ pool });
  const source = randomUUID(), publicSource = randomUUID();
  await pool.query(`INSERT INTO source_catalog(id,source_class,source_key,name) VALUES
    ($1,'owned_device','synthetic-personal','Synthetic personal'),($2,'green_public','synthetic-deflock','Synthetic public')`, [source, publicSource]);
  const devices = [randomUUID(), randomUUID(), randomUUID()];
  const evidence = [randomUUID(), randomUUID(), randomUUID()];
  const publicEvidence = randomUUID(), publicDevice = randomUUID();
  for (let i = 0; i < 4; i++) {
    const isPublic = i === 3;
    const device = isPublic ? publicDevice : devices[i], observation = isPublic ? publicEvidence : evidence[i];
    const sourceClass = isPublic ? 'green_public' : 'owned_device';
    await pool.query(`INSERT INTO observations(id,source_id,source_class,kind,observed_at,payload)
      VALUES($1,$2,$3,'wifi_ap','2026-01-01T00:00:00Z','{"synthetic":true,"rssi":null}'::jsonb)`,
    [observation, isPublic ? publicSource : source, sourceClass]);
    await pool.query(`INSERT INTO cyber_entities(id,entity_kind,stable_key,display_name,source_class,first_seen_at,last_seen_at)
      VALUES($1,'device',$2,'Synthetic device',$3,'2026-01-01','2026-01-01')`, [device, `synthetic-signature-${i}`, sourceClass]);
    await pool.query(`INSERT INTO entity_observations(entity_id,observation_id,relationship,source_class)
      VALUES($1,$2,'observed_as',$3)`, [device, observation, sourceClass]);
  }
  const original = (await pool.query('SELECT id, to_jsonb(o) AS original FROM observations o ORDER BY id')).rows;
  const actor = '11111111-1111-4111-8111-111111111111:22222222-2222-4222-8222-222222222222';
  const a = randomUUID(), b = randomUUID();
  const cmd = (action, entity_id, revisions, extra = {}) => ({ action, entity_id, expected_revisions: revisions,
    idempotency_key: randomUUID(), reason: 'Synthetic controlled correction', evidence_ids: [], ...extra });
  const mutate = (command) => store.mutate({ actor_id: actor, command });
  const detail = (entity_id) => store.detail({ entity_id });
  let create, split, merged, undoMerge;

  await t.test('preview rolls back; create is replayable and rejects changed content', async () => {
    create = cmd('create', a, { [a]: 0 }, { device_ids: devices, label: 'Synthetic alpha', evidence_ids: evidence });
    const preview = await store.preview({ actor_id: actor, command: create });
    assert.equal(preview.preview, true);
    assert.deepEqual(preview.entities[0].device_ids, [...devices].sort());
    await assert.rejects(detail(a), { code: 'entity_not_found' });
    const first = await mutate(create), replay = await mutate(create);
    assert.equal(first.assertion_id, replay.assertion_id);
    assert.equal(replay.replayed, true);
    assert.equal(first.revisions[a], 1);
    await assert.rejects(mutate({ ...create, label: 'Changed' }), { code: 'idempotency_key_reused' });
    assert.equal((await detail(a)).machine, null);
    assert.equal((await detail(a)).operator.label, 'Synthetic alpha');
  });
  await t.test('stale revisions reject; split, merge, undo preserve IDs and assertions', async () => {
    await assert.rejects(mutate(cmd('label', a, { [a]: 0 }, { label: 'Stale', labels: [] })), { code: 'stale_revision' });
    split = await mutate(cmd('split', a, { [a]: 1, [b]: 0 }, { new_entity_id: b, device_ids: [devices[2]] }));
    assert.equal((await detail(a)).device_ids.length, 2);
    assert.deepEqual((await detail(b)).device_ids, [devices[2]]);
    merged = await mutate(cmd('merge', a, { [a]: 2, [b]: 1 }, { source_entity_id: b }));
    assert.equal((await detail(b)).operator.merged_into, a);
    assert.equal((await detail(b)).operator.active, false);
    assert.equal((await detail(a)).device_ids.length, 3);
    undoMerge = await mutate(cmd('undo', a, { [a]: 3, [b]: 2 }, { assertion_id: merged.assertion_id }));
    assert.equal((await detail(b)).operator.active, true);
    assert.equal((await detail(a)).device_ids.length, 2);
    await assert.rejects(mutate(cmd('undo', a, { [a]: 4, [b]: 3 }, { assertion_id: split.assertion_id })), { code: 'undo_conflict' });
    // Undo itself is an append-only compensating assertion and can be compensated.
    await mutate(cmd('undo', a, { [a]: 4, [b]: 3 }, { assertion_id: undoMerge.assertion_id }));
    assert.equal((await detail(b)).operator.merged_into, a);
    const history = (await detail(a)).history.items;
    assert.ok(history.some((event) => event.compensates === merged.assertion_id));
    assert.ok(history.every((event) => event.actor_id === actor && event.created_at));
  });
  await t.test('corrections survive machine refresh; model evidence cannot use public context', async () => {
    await mutate(cmd('reject', a, { [a]: 5 }, { device_ids: [devices[1]], evidence_ids: [evidence[1]] }));
    const hypothesis = { entity_id: a, expected_revision: 6, version: 'synthetic-v1', algorithm: 'controlled-fixture',
      device_ids: devices, evidence_ids: evidence, confidence: null };
    await store.publishHypothesis(hypothesis);
    const current = await detail(a);
    assert.equal(current.machine.confidence, null);
    assert.equal(current.operator.label, 'Synthetic alpha');
    assert.equal(current.operator.review_state, 'needs_review');
    assert.ok(!current.device_ids.includes(devices[1]));
    await assert.rejects(store.publishHypothesis({ ...hypothesis, expected_revision: 7, version: 'synthetic-public', evidence_ids: [publicEvidence] }), { code: 'nonpersonal_or_missing_evidence' });
    await assert.rejects(mutate(cmd('membership', a, { [a]: 7 }, { add: [publicDevice], remove: [] })), { code: 'nonpersonal_or_missing_device' });
    await assert.rejects(mutate(cmd('label', a, { [a]: 7 }, { label: 'bad evidence', labels: [], evidence_ids: [publicEvidence] })), { code: 'nonpersonal_or_missing_evidence' });
    await assert.rejects(store.publishHypothesis({ ...hypothesis, expected_revision: 7, version: 'missing-links', evidence_ids: [] }), { code: 'nonpersonal_or_missing_device' });
  });
  await t.test('membership add/remove is reversible and concurrent stale tabs cannot overwrite', async () => {
    await mutate(cmd('membership', a, { [a]: 7 }, { add: [], remove: [devices[0]] }));
    assert.ok(!(await detail(a)).device_ids.includes(devices[0]));
    await mutate(cmd('membership', a, { [a]: 8 }, { add: [devices[0]], remove: [] }));
    const pending = [1, 2].map((n) => mutate(cmd('label', a, { [a]: 9 }, { label: `Concurrent ${n}`, labels: ['test'] })));
    const settled = await Promise.allSettled(pending);
    assert.equal(settled.filter((r) => r.status === 'fulfilled').length, 1);
    assert.equal(settled.find((r) => r.status === 'rejected').reason.code, 'stale_revision');
    const once = cmd('label', a, { [a]: 10 }, { label: 'Synthetic alpha', labels: ['test'] });
    const repeated = await Promise.all([mutate(once), mutate(once)]);
    assert.equal(repeated[0].assertion_id, repeated[1].assertion_id);
    assert.equal(repeated.filter((r) => r.replayed).length, 1);
  });
  await t.test('machine-first clusters, search filters, ordering and bounded evidence/history pages', async () => {
    const c = randomUUID();
    await store.publishHypothesis({ entity_id: c, expected_revision: 0, version: 'fixture-v1', algorithm: 'fixture',
      device_ids: [devices[0]], evidence_ids: [evidence[0]], confidence: 0.7 });
    assert.deepEqual((await detail(c)).device_ids, [devices[0]]);
    assert.equal((await detail(c)).operator.label, null);
    assert.equal((await store.list({ search: 'Synthetic alpha' })).items.length, 1);
    assert.equal((await store.list({ search: 'synthetic-signature-0' })).items.length, 2);
    assert.equal((await store.list({ min_confidence: 0.5 })).items.length, 1);
    assert.equal((await store.list({ device_id: devices[0], modality: 'wifi_ap', since: '2025-12-01T00:00:00Z', until: '2026-01-02T00:00:00Z' })).items.length, 2);
    assert.equal((await store.list({ modality: 'ble_device' })).items.length, 0);
    assert.equal((await store.list({ review_state: 'retired' })).items.length, 1);
    const page = await store.list({ limit: 1, sort: 'label', direction: 'asc' });
    assert.equal(page.items.length, 1); assert.equal(page.next_offset, 1);
    const next = await store.list({ limit: 1, sort: 'label', direction: 'asc', offset: 1 });
    assert.notEqual(next.items[0].entity_id, page.items[0].entity_id);
    const d = await store.detail({ entity_id: a, limit: 1 });
    assert.equal(d.history.next_offset, 1); assert.equal(d.evidence.next_offset, 1);
    assert.equal(d.evidence.items[0].source_class, 'owned_device');
    assert.equal((await store.list({ search: "%' OR 1=1 --" })).items.length, 0);
  });
  await t.test('empty clusters keep unknown values; undo-create preserves a tombstone', async () => {
    const empty = randomUUID();
    const receipt = await mutate(cmd('create', empty, { [empty]: 0 }, { device_ids: [], label: null }));
    const current = await detail(empty);
    assert.equal(current.machine, null);
    assert.equal(current.first_seen_at, null);
    assert.equal(current.last_seen_at, null);
    assert.equal((await pool.query('SELECT confidence FROM cyber_entities WHERE id=$1', [empty])).rows[0].confidence, null);
    await mutate(cmd('undo', empty, { [empty]: 1 }, { assertion_id: receipt.assertion_id }));
    assert.equal((await detail(empty)).operator.active, false);
    assert.equal((await detail(empty)).revision, 2);
    await assert.rejects(mutate(cmd('create', empty, { [empty]: 0 }, { device_ids: [] })), { code: 'stale_revision' });
    await assert.rejects(mutate(cmd('label', empty, { [empty]: 2 }, { label: 'Retired', labels: [] })), { code: 'entity_retired' });
  });
  await t.test('raw observations unchanged; DB rejects mutation of observation and entity history', async () => {
    assert.deepEqual((await pool.query('SELECT id, to_jsonb(o) AS original FROM observations o ORDER BY id')).rows, original);
    for (const table of ['observations', 'entity_assertions', 'entity_hypotheses']) {
      await assert.rejects(pool.query(`DELETE FROM ${table}`), /append-only/);
    }
    await assert.rejects(pool.query("UPDATE observations SET payload='{}'"), /append-only/);
    await assert.rejects(pool.query("UPDATE entity_assertions SET reason='changed'"), /append-only/);
    await assert.rejects(pool.query("UPDATE entity_hypotheses SET confidence=1"), /append-only/);
  });
});
