import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (path) => readFileSync(new URL(path, root), 'utf8');
const migration = read('vm/cybermap-api/db/migrations/0001_cybermap_core.sql');
const migrationLower = migration.toLowerCase();
const dbReadme = read('vm/cybermap-api/db/README.md');

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
    'confidence numeric',
    'first_seen_at timestamptz',
    'last_seen_at timestamptz',
    'source_observation_refs jsonb',
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

test('raw frames and PII are disabled-by-default retention classes instead of default payload fields', () => {
  assert.match(migrationLower, /create\s+type\s+cyber_retention_class\s+as\s+enum/);
  assertIncludesAll(migrationLower, [
    "'summary_only'",
    "'hash_only'",
    "'raw_frame_explicit'",
    "'pii_explicit'",
    "default 'summary_only'",
    'raw_payload_ref text',
    'operator_approved_raw_ref text',
    "payload ?| array['raw_frame', 'raw_frames', 'face_image', 'license_plate_image', 'raw_pii']",
  ], 'retention/PII guardrails');
});

test('migration docs define the lightweight ordered SQL runner contract', () => {
  assert.match(dbReadme, /psql/i);
  assert.match(dbReadme, /0001_cybermap_core\.sql/);
  assert.match(dbReadme, /public_greenfeed\s*->\s*green_public/);
  assert.match(dbReadme, /PostGIS/i);
});
