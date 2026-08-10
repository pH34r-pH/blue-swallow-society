import { Pool } from 'pg';

import { DESKTOP_DEVICE_ID, DESKTOP_SOURCE_KEY } from './desktop-credential-policy.mjs';
import { normalizeProofDatabaseCounts } from './proof-count-contract.mjs';

const databaseUrl = requireValue('DATABASE_URL');
const pool = new Pool({ connectionString: databaseUrl, max: 1 });

try {
  const result = await pool.query(
    `SELECT json_build_object(
       'desktop_source_count', (
         SELECT count(*) FROM source_catalog WHERE source_key = $1
       ),
       'desktop_credential_count', (
         SELECT count(*)
         FROM device_ingest_credentials AS credential
         JOIN source_catalog AS source ON source.id = credential.source_id
         WHERE source.source_key = $1 AND credential.device_id = $2
       ),
       'sync_batch_count', (SELECT count(*) FROM sync_batches),
       'observation_count', (SELECT count(*) FROM observations)
     ) AS counts`,
    [DESKTOP_SOURCE_KEY, DESKTOP_DEVICE_ID],
  );
  const counts = normalizeProofDatabaseCounts(result.rows[0]?.counts);
  process.stdout.write(`${JSON.stringify(counts)}\n`);
} finally {
  await pool.end();
}

function requireValue(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
