import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const migration = read('vm/cybermap-api/db/migrations/0001_cybermap_core.sql');
const migrationLower = migration.toLowerCase();
const ingestMigration = read('vm/cybermap-api/db/migrations/0002_device_ingest_contract.sql');
const ingestMigrationLower = ingestMigration.toLowerCase();
const dbReadme = read('vm/cybermap-api/db/README.md');
const installCybermapApi = read('infra/scripts/install-cybermap-api.sh');

function tableBlock(tableName) {
  const match = migrationLower.match(new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?${tableName}\\s*\\((?<body>[\\s\\S]*?)\\n\\);`, 'i'));
  assert.ok(match, `${tableName} table should exist`);
  return match.groups.body;
}

function assertIncludesAll(haystack, needles, label) {
  needles.forEach((needle) => assert.ok(haystack.includes(needle), `${label} should include ${needle}`));
}

test('cybermap core migration enables PostGIS and constrained source/observation types', () => {
  assert.match(migrationLower, /create\s+extension\s+if\s+not\s+exists\s+postgis/);
  assert.match(migrationLower, /create\s+extension\s+if\s+not\s+exists\s+pgcrypto/);
  assert.match(migrationLower, /create\s+type\s+source_class\s+as\s+enum/);
  assert.match(migrationLower, /create\s+type\s+observation_kind\s+as\s+enum/);

  assertIncludesAll(migrationLower, [
    "'green_public'",
    "'green_owned'",
    "'green_authorized'",
    "'owned_device'",
    "'local_observation'",
    "'grey_enrichment'",
    "'orange_exposure'",
    "'red_restricted'",
    'public_greenfeed -> green_public',
  ], 'source_class enum and canonical mapping');

  assertIncludesAll(migrationLower, [
    "'wifi_ap'",
    "'ble_device'",
    "'cell_signal'",
    "'visual_summary'",
    "'greenfeed_snapshot'",
    "'claim_anchor'",
    "'memory_event'",
    "'derived_cell'",
  ], 'observation_kind enum');
});

test('cybermap core migration creates the complete append-only ledger and product tables', () => {
  [
    'source_catalog',
    'sensorium_sessions',
    'observations',
    'cyber_entities',
    'entity_observations',
    'cybermap_cells',
    'mosaic_memories',
    'murmur_memories',
    'sync_batches',
  ].forEach((table) => tableBlock(table));

  assertIncludesAll(tableBlock('sensorium_sessions'), [
    'source_id uuid',
    'session_kind',
    'started_at timestamptz',
    'ended_at timestamptz',
    'authorized_scope_ref text',
    'metadata jsonb',
  ], 'sensorium_sessions');

  assertIncludesAll(tableBlock('cyber_entities'), [
    'entity_kind',
    'stable_key text',
    'display_name text',
    'first_seen_at timestamptz',
    'last_seen_at timestamptz',
    'properties jsonb',
    'provenance jsonb',
  ], 'cyber_entities');

  assertIncludesAll(tableBlock('entity_observations'), [
    'entity_id uuid',
    'observation_id uuid',
    'relationship text',
    'weight numeric',
    'primary key',
  ], 'entity_observations');

  ['mosaic_memories', 'murmur_memories'].forEach((table) => {
    assertIncludesAll(tableBlock(table), [
      'memory_key text',
      'summary text',
      'salience numeric',
      'retention_class',
      'payload jsonb',
      'provenance jsonb',
    ], table);
  });

  assertIncludesAll(tableBlock('observations'), [
    'external_observation_key text',
    'idempotency_key text',
    'unique (source_id, external_observation_key)',
    'unique (source_id, idempotency_key)',
  ], 'observations idempotency');

  assertIncludesAll(tableBlock('sync_batches'), [
    'source_id uuid',
    'client_id text',
    'idempotency_key text',
    'status text',
    'payload_hash text',
  ], 'sync_batches');
  assert.match(migrationLower, /unique\s*\(\s*source_id\s*,\s*client_id\s*,\s*idempotency_key\s*\)/);
});

test('spatial observations carry app-computed H3 cells and indexed PostGIS geometry', () => {
  ['observations', 'sensorium_sessions', 'cyber_entities', 'cybermap_cells', 'mosaic_memories', 'murmur_memories'].forEach((table) => {
    assert.match(tableBlock(table), /geometry\s*\([^,]+,\s*4326\)/, `${table} should use SRID 4326 geometry`);
  });

  ['observations', 'sensorium_sessions', 'cyber_entities', 'mosaic_memories', 'murmur_memories'].forEach((table) => {
    assertIncludesAll(tableBlock(table), ['h3_7 text', 'h3_9 text', 'h3_11 text'], `${table} app-computed cells`);
  });

  assert.match(migrationLower, /observations_geom_gix\s+on\s+observations\s+using\s+gist\s*\(\s*geom\s*\)/);
  assert.match(migrationLower, /cybermap_cells_geom_gix\s+on\s+cybermap_cells\s+using\s+gist\s*\(\s*geom\s*\)/);
  assert.match(migrationLower, /observations_h3_9_time_idx\s+on\s+observations\s*\(\s*h3_9\s*,\s*observed_at\s+desc\s*\)/);
  assert.match(migrationLower, /observations_payload_gin\s+on\s+observations\s+using\s+gin\s*\(\s*payload/);
  assert.match(migrationLower, /observations_provenance_gin\s+on\s+observations\s+using\s+gin\s*\(\s*provenance/);
});

test('non-green enrichment is gated by local or authorized trigger metadata', () => {
  const observations = tableBlock('observations');
  assertIncludesAll(observations, [
    'trigger_observation_id uuid',
    'session_id uuid',
    'authorized_scope_ref text',
    "source_class not in ('grey_enrichment', 'orange_exposure', 'red_restricted')",
    'trigger_observation_id is not null',
    'session_id is not null',
    'authorized_scope_ref is not null',
  ], 'observations source-class gate');

  const sourceCatalog = tableBlock('source_catalog');
  assertIncludesAll(sourceCatalog, [
    'allowed_preload boolean not null default false',
    "source_class in ('green_public', 'green_owned', 'green_authorized')",
  ], 'source_catalog preload gate');
});

test('passively observed RF identifiers and management-frame metadata have an explicit full-fidelity retention class', () => {
  assert.match(migrationLower, /create\s+type\s+cyber_retention_class\s+as\s+enum/);
  assertIncludesAll(migrationLower, [
    "'summary_only'",
    "'hash_only'",
    "'full_fidelity'",
    "payload jsonb not null",
  ], 'passive observation retention');
  const observations = tableBlock('observations');
  assert.doesNotMatch(observations, /operator_approved_raw_ref/);
  assert.doesNotMatch(observations, /payload \?\| array\['raw_frame'/);
});

test('migration docs define the lightweight ordered SQL runner contract', () => {
  assert.match(dbReadme, /psql/i);
  assert.match(dbReadme, /0001_cybermap_core\.sql/);
  assert.match(dbReadme, /public_greenfeed\s*->\s*green_public/);
  assert.match(dbReadme, /PostGIS/i);
});

test('VM Cybermap installer applies checked-in SQL migrations with psql', () => {
  assert.match(installCybermapApi, /postgresql-client/);
  assert.match(installCybermapApi, /DATABASE_URL=postgresql:\/\/__POSTGRES_ADMINISTRATOR_LOGIN__:\$POSTGRES_PASSWORD@__POSTGRES_SERVER_FQDN__:5432\/__POSTGRES_DATABASE_NAME__\?sslmode=require/);
  assert.match(installCybermapApi, /psql\s+-v\s+ON_ERROR_STOP=1\s+-f\s+"\$file"/);
  assert.match(installCybermapApi, /schema_migrations/);
  assert.match(installCybermapApi, /0001_cybermap_core\.sql/);
  assert.match(installCybermapApi, /0002_device_ingest_contract\.sql/);
  assert.doesNotMatch(installCybermapApi, /scripts\/migrate\.mjs/);
});

test('device ingest migration stores only token digests and scoped enrollment state', () => {
  assert.match(ingestMigrationLower, /create\s+table\s+device_ingest_credentials/);
  assert.match(ingestMigrationLower, /token_sha256\s+text\s+not\s+null\s+unique/);
  assert.match(ingestMigrationLower, /check\s*\(\s*token_sha256\s*~\s*'\^\[a-f0-9\]\{64\}\$'/);
  assert.match(ingestMigrationLower, /scopes\s+text\[\]\s+not\s+null/);
  assert.match(ingestMigrationLower, /enabled\s+boolean\s+not\s+null/);
  assert.doesNotMatch(ingestMigrationLower, /\bplaintext_token\b|\braw_token\b/);
});

test('device ingest migration links observations to batches and persists stable receipts', () => {
  assert.match(ingestMigrationLower, /alter\s+table\s+observations\s+add\s+column\s+sync_batch_id\s+uuid/);
  assert.match(ingestMigrationLower, /add\s+column\s+content_hash\s+text/);
  assert.match(ingestMigrationLower, /alter\s+table\s+sync_batches[\s\S]*accepted_count\s+integer/);
  assert.match(ingestMigrationLower, /duplicate_count\s+integer/);
  assert.match(ingestMigrationLower, /response_status\s+smallint/);
  assert.match(ingestMigrationLower, /receipt\s+jsonb/);
  assert.match(ingestMigrationLower, /receipt\s+is\s+not\s+null/);
  assert.match(ingestMigrationLower, /foreign\s+key\s*\(session_id,\s*source_id\)[\s\S]*references\s+sensorium_sessions\s*\(id,\s*source_id\)/);
  assert.match(ingestMigrationLower, /foreign\s+key\s*\(sync_batch_id,\s*source_id\)[\s\S]*references\s+sync_batches\s*\(id,\s*source_id\)/);
  assert.match(ingestMigrationLower, /sync_batches_applied_receipt_complete/);
  assert.match(ingestMigrationLower, /create\s+trigger\s+sync_batches_finalized_update_guard/);
  assert.match(ingestMigrationLower, /finalized sync batches are immutable/);
  assert.match(ingestMigrationLower, /insert\s+into\s+schema_migrations\s*\(version\)\s*values\s*\('0002_device_ingest_contract'\)/);
});

test('device ingest migration pins receipt identity and counts to the durable batch row', () => {
  assert.match(ingestMigrationLower, /receipt\s*->>\s*'server_batch_id'\s*=\s*id::text/);
  assert.match(ingestMigrationLower, /receipt\s*->>\s*'status'\s*=\s*status/);
  assert.match(ingestMigrationLower, /jsonb_typeof\(receipt\s*->\s*'accepted_count'\)\s*=\s*'number'/);
  assert.match(ingestMigrationLower, /jsonb_typeof\(receipt\s*->\s*'validation_errors'\)\s*=\s*'array'/);
  assert.match(ingestMigrationLower, /\(receipt\s*->>\s*'server_clock'\)::timestamptz\s*=\s*completed_at/);
  assert.match(ingestMigrationLower, /response_status\s+is\s+not\s+null/);
});
