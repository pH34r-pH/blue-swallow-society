import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import test from 'node:test';

const databaseUrl = process.env.CYBERMAP_TEST_DATABASE_URL;
const migrationDirectory = new URL('../db/migrations/', import.meta.url);
const migrationFiles = Object.freeze([
  '0001_cybermap_core.sql',
  '0002_device_ingest_contract.sql',
  '0003_paper_state.sql',
  '0004_godeye_global_cells_and_sources.sql',
]);

// TST-008 executes only with an injected, approved disposable PostGIS database.
// The test creates and drops one generated schema; it never creates, drops, or
// modifies the database named by CYBERMAP_TEST_DATABASE_URL outside that schema.
test(
  'TST-008 migration guardrails require CYBERMAP_TEST_DATABASE_URL for a disposable PostGIS database',
  { skip: databaseUrl ? false : 'CYBERMAP_TEST_DATABASE_URL is required for the disposable PostGIS migration proof.' },
  async () => {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: databaseUrl, max: 1 });
    const schemaName = `tst_008_${randomUUID().replaceAll('-', '')}`;
    const schema = quoteIdentifier(schemaName);
    let client;

    try {
      client = await pool.connect();
      await client.query(`CREATE SCHEMA ${schema}`);
      await client.query(`SET search_path TO ${schema}, public`);
      await applyMigrations(client);

      const approvedSource = await insertCatalogSource(client, {
        sourceKey: 'tst-008-approved-green',
        layerId: 'tst-008-approved-green',
      });
      const sourceId = approvedSource.rows[0].id;

      await assert.rejects(
        insertCatalogSource(client, {
          sourceKey: 'tst-008-unreviewed-green',
          layerId: 'tst-008-unreviewed-green',
          termsReviewedAt: null,
        }),
        rejectsGuardedWrite,
      );

      await assert.rejects(
        insertCatalogSource(client, {
          sourceClass: 'green_authorized',
          sourceKey: 'tst-008-unscoped-authorized',
          layerId: 'tst-008-unscoped-authorized',
          authorizedScopeRef: null,
        }),
        rejectsGuardedWrite,
      );

      await assert.rejects(
        insertCatalogSource(client, {
          sourceClass: 'orange_exposure',
          sourceKey: 'tst-008-orange-preload',
          layerId: 'tst-008-orange-preload',
          authorizedScopeRef: 'scope:tst-008',
        }),
        rejectsGuardedWrite,
      );

      const allowedResolution = await client.query(
        `INSERT INTO cybermap_cells (h3_cell, resolution, geom)
         VALUES (
           '85283473fffffff',
           5,
           ST_GeomFromText('POLYGON((-122 47, -121 47, -121 48, -122 48, -122 47))', 4326)
         )`,
      );
      assert.equal(allowedResolution.rowCount, 1);

      await assert.rejects(
        client.query(
          `INSERT INTO cybermap_cells (h3_cell, resolution, geom)
           VALUES (
             '862834737ffffff',
             6,
             ST_GeomFromText('POLYGON((-122 47, -121 47, -121 48, -122 48, -122 47))', 4326)
           )`,
        ),
        rejectsGuardedWrite,
      );

      const fetchRun = await client.query(
        `INSERT INTO source_fetch_runs (
           source_id, started_at, completed_at, outcome, response_class,
           fetched_count, accepted_count, duplicate_count, rejected_count
         ) VALUES ($1, $2, $3, 'success', 'http_200', 1, 1, 0, 0)
         RETURNING id::text AS id`,
        [sourceId, '2026-07-22T00:00:00.000Z', '2026-07-22T00:00:01.000Z'],
      );
      const fetchRunId = fetchRun.rows[0].id;

      await assert.rejects(
        client.query(
          'UPDATE source_fetch_runs SET response_class = $2 WHERE id = $1',
          [fetchRunId, 'tampered'],
        ),
        rejectsGuardedWrite,
      );
      await assert.rejects(
        client.query('DELETE FROM source_fetch_runs WHERE id = $1', [fetchRunId]),
        rejectsGuardedWrite,
      );
    } finally {
      if (client) {
        try {
          await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
        } finally {
          client.release();
        }
      }
      await pool.end();
    }
  },
);

async function applyMigrations(client) {
  for (const fileName of migrationFiles) {
    const sql = await readFile(new URL(fileName, migrationDirectory), 'utf8');
    await client.query(sql);
  }
}

async function insertCatalogSource(client, {
  sourceClass = 'green_public',
  sourceKey,
  layerId,
  authorizedScopeRef = null,
  termsReviewedAt = '2026-07-22T00:00:00.000Z',
} = {}) {
  return client.query(
    `INSERT INTO source_catalog (
       source_class, source_key, name, provider, terms_url,
       authorized_scope_ref, allowed_preload, enabled,
       layer_id, display_order, terms_reviewed_at, attribution_text,
       fresh_after_seconds, stale_after_seconds, global_layer, normalizer_version
     ) VALUES (
       $1::source_class, $2, $3, 'TST-008 provider', 'https://example.invalid/terms',
       $4, true, true,
       $5, 1, $6::timestamptz, 'TST-008 attribution',
       300, 600, true, 'tst-008.v1'
     ) RETURNING id::text AS id`,
    [sourceClass, sourceKey, sourceKey, authorizedScopeRef, layerId, termsReviewedAt],
  );
}

function quoteIdentifier(identifier) {
  return `"${identifier.replaceAll('"', '""')}"`;
}

function rejectsGuardedWrite(error) {
  return error?.code === '23514' || error?.code === 'P0001';
}
