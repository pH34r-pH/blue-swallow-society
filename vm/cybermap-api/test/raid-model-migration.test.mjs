import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import test from 'node:test';

const root = resolve(import.meta.dirname, '..');
const migration = resolve(root, 'db/migrations/0006_raid_model_lifecycle.sql');
const hardeningMigration = resolve(root, 'db/migrations/0007_raid_model_lifecycle_hardening.sql');
const modelStore = resolve(root, 'src/raid-model-store.mjs');
const installer = resolve(root, '../../infra/scripts/install-cybermap-api.sh');

test('model lifecycle migration stores immutable release evidence and data-minimal feedback', async () => {
  const source = await readFile(migration, 'utf8');
  assert.match(source, /^BEGIN;/);
  assert.match(source, /CREATE TABLE raid_model_releases/i);
  assert.match(source, /CREATE TABLE raid_model_artifacts/i);
  assert.match(source, /CREATE TABLE raid_model_feedback/i);
  assert.match(source, /CREATE TABLE raid_dataset_snapshots/i);
  assert.match(source, /CREATE TABLE raid_reviewed_training_examples/i);
  assert.match(source, /CREATE TABLE raid_dataset_snapshot_examples/i);
  assert.match(source, /CREATE TABLE raid_training_jobs/i);
  assert.match(source, /state\s+text\s+NOT NULL\s+CHECK\s*\(state\s+IN\s*\('trained',\s*'evaluation_passed',\s*'awaiting_approval',\s*'approved',\s*'published'\)\)/i);
  assert.match(source, /CREATE FUNCTION raid_semver_at_or_below\(/i);
  assert.match(source, /CREATE FUNCTION raid_semver_at_or_above\(/i);
  assert.match(source, /ALTER TABLE raid_training_jobs\s+ADD CONSTRAINT raid_training_jobs_predecessor_release_fk\s+FOREIGN KEY \(predecessor_release_id\)\s+REFERENCES raid_model_releases\(release_id\)/i);
  assert.match(source, /UNIQUE\s*\(source_id,\s*device_id,\s*feedback_id\)/i);
  assert.match(source, /raid_model_feedback_append_only_update/i);
  assert.match(source, /raid_model_feedback_append_only_delete/i);
  assert.match(source, /INSERT INTO schema_migrations \(version\) VALUES \('0006_raid_model_lifecycle'\)/i);
  assert.doesNotMatch(source, /\b(raw_frame|latitude|longitude|rssi|bssid|ssid)\b/i);
  assert.match(source, /COMMIT;\s*$/);
});

test('hardening migration rejects artifact rows that do not match immutable release size and digest evidence', async () => {
  const source = await readFile(hardeningMigration, 'utf8');
  assert.match(source, /^BEGIN;/);
  assert.match(source, /CREATE OR REPLACE FUNCTION validate_raid_model_artifact\(/i);
  assert.match(source, /octet_length\(NEW\.artifact_bytes\) <> expected_size/i);
  assert.match(source, /encode\(digest\(NEW\.artifact_bytes, 'sha256'\), 'hex'\) <> expected_sha256/i);
  assert.match(source, /CREATE TRIGGER raid_model_artifacts_validate_before_insert/i);
  assert.match(source, /INSERT INTO schema_migrations \(version\) VALUES \('0007_raid_model_lifecycle_hardening'\)/i);
  assert.match(source, /COMMIT;\s*$/);
});

test('VM installer applies the lifecycle migration after existing append-only identity migration', async () => {
  const source = await readFile(installer, 'utf8');
  const existing = source.indexOf('run_migration 0005_device_scoped_observation_identity');
  const lifecycle = source.indexOf('run_migration 0006_raid_model_lifecycle');
  const hardening = source.indexOf('run_migration 0007_raid_model_lifecycle_hardening');
  assert.ok(existing >= 0 && lifecycle > existing && hardening > lifecycle);
  assert.match(source, /db\/migrations\/0006_raid_model_lifecycle\.sql/);
  assert.match(source, /db\/migrations\/0007_raid_model_lifecycle_hardening\.sql/);
});

test('durable feedback persistence reconstructs receipts without a feedback-row update', async () => {
  const source = await readFile(modelStore, 'utf8');
  assert.doesNotMatch(source, /UPDATE\s+raid_model_feedback\b/i);
});
