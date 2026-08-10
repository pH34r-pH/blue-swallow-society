import { randomBytes } from 'node:crypto';

import { Pool } from 'pg';

import {
  DESKTOP_DEVICE_ID,
  DESKTOP_SOURCE_KEY,
  DESKTOP_SOURCE_POLICY,
  REQUIRED_DESKTOP_SCOPES,
  assertDesktopCredentialPolicy,
  assertDesktopSourcePolicy,
  desktopCredentialMetadata,
} from './desktop-credential-policy.mjs';

const databaseUrl = requireValue('DATABASE_URL');
const certificateFingerprint = normalizeFingerprint(requireValue('LOCAL_MTLS_CERT_FINGERPRINT'));

const pool = new Pool({ connectionString: databaseUrl, max: 1 });
let client;
try {
  client = await pool.connect();
  await client.query('BEGIN');
  const sourceId = await ensureDesktopSource(client);
  await ensureDesktopCredential(client, sourceId);
  await client.query('COMMIT');
  process.stdout.write(`${JSON.stringify({ event: 'desktop_mtls_credential_ready' })}\n`);
} catch (error) {
  await client?.query('ROLLBACK').catch(() => {});
  throw error;
} finally {
  client?.release();
  await pool.end();
}

async function ensureDesktopSource(client) {
  await client.query(
    `INSERT INTO source_catalog (
       source_class, source_key, name, provider, terms_url, authorized_scope_ref,
       allowed_preload, retains_raw_payload, cache_ttl_seconds, enabled, attribution,
       terms_reviewed, provenance
     ) VALUES (
       $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb
     ) ON CONFLICT (source_key) DO NOTHING`,
    [
      DESKTOP_SOURCE_POLICY.source_class,
      DESKTOP_SOURCE_POLICY.source_key,
      DESKTOP_SOURCE_POLICY.name,
      DESKTOP_SOURCE_POLICY.provider,
      DESKTOP_SOURCE_POLICY.terms_url,
      DESKTOP_SOURCE_POLICY.authorized_scope_ref,
      DESKTOP_SOURCE_POLICY.allowed_preload,
      DESKTOP_SOURCE_POLICY.retains_raw_payload,
      DESKTOP_SOURCE_POLICY.cache_ttl_seconds,
      DESKTOP_SOURCE_POLICY.enabled,
      DESKTOP_SOURCE_POLICY.attribution,
      DESKTOP_SOURCE_POLICY.terms_reviewed,
      JSON.stringify(DESKTOP_SOURCE_POLICY.provenance),
    ],
  );
  const source = await client.query(
    `SELECT
       id::text AS id,
       source_class::text AS source_class,
       source_key,
       name,
       provider,
       terms_url,
       authorized_scope_ref,
       allowed_preload,
       retains_raw_payload,
       cache_ttl_seconds,
       enabled,
       attribution,
       terms_reviewed,
       provenance
     FROM source_catalog
     WHERE source_key = $1
     FOR UPDATE`,
    [DESKTOP_SOURCE_KEY],
  );
  if (source.rows.length !== 1) {
    throw new Error('Local proof must contain exactly one desktop source record.');
  }
  const { id, ...sourcePolicy } = source.rows[0];
  assertDesktopSourcePolicy(sourcePolicy);
  return id;
}

async function ensureDesktopCredential(client, sourceId) {
  const existing = await client.query(
    `SELECT
       credential.device_id,
       source.source_key,
       credential.enabled,
       credential.expires_at,
       credential.scopes,
       credential.metadata
     FROM device_ingest_credentials AS credential
     JOIN source_catalog AS source ON source.id = credential.source_id
     WHERE credential.device_id = $1 AND credential.source_id = $2
     ORDER BY credential.created_at ASC
     FOR UPDATE OF credential`,
    [DESKTOP_DEVICE_ID, sourceId],
  );
  if (existing.rows.length > 1) {
    throw new Error('Local proof has multiple desktop credentials; destroy its disposable volume.');
  }
  if (existing.rows.length === 1) {
    assertDesktopCredentialPolicy(existing.rows[0], certificateFingerprint);
    return;
  }
  await client.query(
    `INSERT INTO device_ingest_credentials (
       device_id, source_id, token_sha256, scopes, enabled, metadata
     ) VALUES ($1, $2, $3, $4::text[], true, $5::jsonb)`,
    [
      DESKTOP_DEVICE_ID,
      sourceId,
      randomBytes(32).toString('hex'),
      REQUIRED_DESKTOP_SCOPES,
      JSON.stringify(desktopCredentialMetadata(certificateFingerprint)),
    ],
  );
}

function normalizeFingerprint(value) {
  const normalized = value.trim().toLowerCase();
  if (!/^[a-f0-9]{64}$/.test(normalized)) {
    throw new Error('LOCAL_MTLS_CERT_FINGERPRINT must be a SHA-256 hexadecimal fingerprint.');
  }
  return normalized;
}

function requireValue(name) {
  const value = String(process.env[name] ?? '').trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
