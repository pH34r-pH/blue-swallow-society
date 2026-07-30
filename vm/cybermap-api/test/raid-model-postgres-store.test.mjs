import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import test from 'node:test';

import { PostgresRaIDModelStore } from '../src/raid-model-store.mjs';
import { catalogRequest, release } from './raid-model-fixtures.mjs';

class LifecyclePool {
  constructor({ releaseRecord, releaseRecords = null, migrations = ['0006_raid_model_lifecycle', '0007_raid_model_lifecycle_hardening'], revocationRecords = [] } = {}) {
    this.releaseRecord = releaseRecord;
    this.releaseRecords = releaseRecords ?? [releaseRecord];
    this.migrations = migrations;
    this.revocationRecords = revocationRecords;
    this.calls = [];
  }

  async query(sql, values = []) {
    this.calls.push({ sql, values });
    if (/schema_migrations/i.test(sql)) {
      return { rows: this.migrations.map((version) => ({ version })), rowCount: this.migrations.length };
    }
    if (/FROM\s+raid_model_release_revocations\s+AS\s+revocation/i.test(sql)) {
      return { rows: this.revocationRecords.map((release_id) => ({ release_id })), rowCount: this.revocationRecords.length };
    }
    if (/SELECT\s+release\.release_manifest\s+AS\s+release\s*,\s*artifact\.artifact_bytes/i.test(sql)) {
      return { rows: [{
        release: withoutArtifactBytes(this.releaseRecord),
        artifact_bytes: this.releaseRecord.artifact_bytes,
      }], rowCount: 1 };
    }
    if (/raid_model_releases/i.test(sql)) {
      const records = /LIMIT 64/i.test(sql) ? this.releaseRecords.slice(0, 64) : this.releaseRecords;
      return { rows: records.map((record) => ({ release: withoutArtifactBytes(record) })), rowCount: records.length };
    }
    throw new Error(`unexpected pool query: ${sql}`);
  }

  async connect() {
    throw new Error('No write transaction is expected in this catalog/artifact test.');
  }
}

function withoutArtifactBytes(value) {
  const { artifact_bytes: _bytes, ...metadata } = value;
  return metadata;
}

test('Postgres lifecycle readiness requires its own forward migration', async () => {
  const pool = new LifecyclePool({ releaseRecord: release(), migrations: [] });
  const ready = await new PostgresRaIDModelStore({ pool }).ready();
  assert.deepEqual(ready, { ok: false, database: 'ready', migrations: 'pending' });
  assert.deepEqual(pool.calls[0].values, [['0006_raid_model_lifecycle', '0007_raid_model_lifecycle_hardening']]);
});

test('Postgres lifecycle catalog selects metadata without reading model artifact bytes', async () => {
  const model = release();
  const pool = new LifecyclePool({ releaseRecord: model });
  const store = new PostgresRaIDModelStore({ pool, releaseVerifier: () => true });

  const entries = await store.listCatalog({ compatibility: catalogRequest() });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].release_id, model.release_id);
  assert.equal('artifact_bytes' in entries[0], false);
  assert.match(pool.calls[0].sql, /SELECT release\.release_manifest AS release/i);
  assert.doesNotMatch(pool.calls[0].sql.slice(0, pool.calls[0].sql.indexOf('FROM')), /artifact\.artifact_bytes/i);
  assert.match(pool.calls[0].sql, /octet_length\(artifact\.artifact_bytes\) = release\.artifact_size_bytes/i);
  assert.match(pool.calls[0].sql, /encode\(digest\(artifact\.artifact_bytes, 'sha256'\), 'hex'\) = release\.artifact_sha256/i);
});

test('Postgres lifecycle revocation list is field-scoped and bounded', async () => {
  const pool = new LifecyclePool({
    releaseRecord: release(),
    revocationRecords: ['raid-general-20260729-revoked'],
  });
  const releaseIds = await new PostgresRaIDModelStore({ pool }).listRevocations();

  assert.deepEqual(releaseIds, ['raid-general-20260729-revoked']);
  assert.match(pool.calls[0].sql, /JOIN\s+raid_model_releases/i);
  assert.match(pool.calls[0].sql, /release\.channel\s*=\s*'field'/i);
  assert.match(pool.calls[0].sql, /LIMIT\s+100/i);
});

test('Postgres lifecycle catalog considers compatible eligible releases beyond an incompatible prefix without reading bytes', async () => {
  const incompatible = Array.from({ length: 64 }, (_, index) => release({
    release_id: `raid-general-20260729-incompatible-${String(index).padStart(3, '0')}`,
    compatibility: { min_app_version: '2.200.0', max_app_version: '2.201.0', min_runtime_version: '2.0.0', max_runtime_version: '2.2.0' },
  }));
  const compatible = release({ release_id: 'raid-general-20260729-compatible-old' });
  const pool = new LifecyclePool({ releaseRecord: compatible, releaseRecords: [...incompatible, compatible] });

  const entries = await new PostgresRaIDModelStore({ pool, releaseVerifier: () => true }).listCatalog({ compatibility: catalogRequest() });

  assert.deepEqual(entries.map((entry) => entry.release_id), [compatible.release_id]);
  assert.match(pool.calls[0].sql, /JOIN\s+raid_model_artifacts/i);
  assert.doesNotMatch(pool.calls[0].sql, /LIMIT\s+64/i);
  assert.doesNotMatch(pool.calls[0].sql.slice(0, pool.calls[0].sql.indexOf('FROM')), /artifact\.artifact_bytes/i);
});

test('Postgres lifecycle artifact resolution reads exact bytes only after release metadata eligibility', async () => {
  const model = release();
  const pool = new LifecyclePool({ releaseRecord: model });
  const artifact = await new PostgresRaIDModelStore({ pool, releaseVerifier: () => true }).getArtifact({
    releaseId: model.release_id,
    compatibility: catalogRequest(),
  });

  assert.deepEqual(artifact.bytes, model.artifact_bytes);
  assert.equal(artifact.artifact.sha256, crypto.createHash('sha256').update(artifact.bytes).digest('hex'));
  assert.match(pool.calls[0].sql, /raid_model_artifacts/i);
  assert.ok(pool.calls[0].values.includes(model.release_id));
});
