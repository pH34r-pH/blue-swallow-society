import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import pg from 'pg';

const { Client } = pg;
const testDatabaseUrl = process.env.CYBERMAP_TEST_DATABASE_URL;
const migrationDirectory = new URL('../db/migrations/', import.meta.url);
const migrations = [
  '0001_cybermap_core.sql',
  '0002_device_ingest_contract.sql',
  '0003_paper_state.sql',
  '0004_godeye_global_cells_and_sources.sql',
  '0005_device_scoped_observation_identity.sql',
  '0006_best_effort_observation_progress.sql',
];

test('global source migration applies to an isolated disposable PostGIS schema', {
  skip: !testDatabaseUrl && 'CYBERMAP_TEST_DATABASE_URL is not configured; protected ephemeral PostGIS proof was not run.',
}, async () => {
  const schema = `godeye_global_${randomUUID().replaceAll('-', '')}`;
  const client = new Client({ connectionString: testDatabaseUrl });
  await client.connect();

  try {
    await client.query(`CREATE SCHEMA ${quoteIdentifier(schema)}`);
    await client.query(`SET search_path TO ${quoteIdentifier(schema)}, public`);
    for (const migration of migrations) {
      await client.query(readFileSync(new URL(migration, migrationDirectory), 'utf8'));
    }

    const sourceResult = await client.query(`
      SELECT id, source_key, enabled, allowed_preload, terms_reviewed
      FROM source_catalog
      WHERE source_key = 'deflock-osm-alpr-reports'
    `);
    assert.equal(sourceResult.rowCount, 1);
    assert.equal(sourceResult.rows[0].enabled, false);
    assert.equal(sourceResult.rows[0].allowed_preload, false);
    assert.equal(sourceResult.rows[0].terms_reviewed, false);
    const sourceId = sourceResult.rows[0].id;

    await client.query(`
      INSERT INTO global_source_cells (
        source_id, h3_cell, resolution, centroid, footprint,
        observed_at, first_seen_at, last_seen_at, report_count, salience, evidence_class, caveats
      ) VALUES (
        $1, '822837fffffffff', 2,
        ST_SetSRID(ST_MakePoint(0, 0), 4326),
        ST_GeomFromText('POLYGON((-1 -1, 1 -1, 1 1, -1 1, -1 -1))', 4326),
        now(), now(), now(), 1, 0.1, 'public_reported', '[]'::jsonb
      )
    `, [sourceId]);

    await assert.rejects(
      client.query(`
        INSERT INTO global_source_cells (
          source_id, h3_cell, resolution, centroid, footprint,
          observed_at, first_seen_at, last_seen_at, report_count, salience, evidence_class, caveats
        ) VALUES (
          $1, '832837fffffffff', 3,
          ST_SetSRID(ST_MakePoint(0, 0), 4326),
          ST_GeomFromText('POLYGON((-1 -1, 1 -1, 1 1, -1 1, -1 -1))', 4326),
          now(), now(), now(), 1, 0.1, 'public_reported', '[]'::jsonb
        )
      `, [sourceId]),
      /check constraint|global_source_cells_resolution_valid/i,
    );

    const run = await client.query(`
      INSERT INTO source_fetch_runs (source_id, outcome, started_at, completed_at, item_count, normalized_count, cell_count)
      VALUES ($1, 'disabled', now(), now(), 0, 0, 0)
      RETURNING id
    `, [sourceId]);
    await assert.rejects(
      client.query('UPDATE source_fetch_runs SET outcome = $2 WHERE id = $1', [run.rows[0].id, 'success']),
      /append-only/i,
    );
  } finally {
    await client.query('RESET search_path').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${quoteIdentifier(schema)} CASCADE`).catch(() => {});
    await client.end();
  }
});

function quoteIdentifier(value) {
  return `"${String(value).replaceAll('"', '""')}"`;
}
