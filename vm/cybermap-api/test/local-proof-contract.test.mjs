import assert from 'node:assert/strict';
import { access, readFile } from 'node:fs/promises';
import test from 'node:test';

import { assertAppliedReceiptV1, assertExactReceiptReplayV1 } from '../local-proof/receipt-contract.mjs';

const localProof = new URL('../local-proof/', import.meta.url);
const composeFile = new URL('compose.yaml', localProof);
const caddyFile = new URL('Caddyfile', localProof);
const frontdoorFile = new URL('tcp-frontdoor.mjs', localProof);
const verifierFile = new URL('verify-local-proof.mjs', localProof);
const azureVerifierFile = new URL('verify-azure-mtls-smoke.mjs', localProof);
const azureSmokeOriginFile = new URL('azure-mtls-smoke-origin.mjs', localProof);
const bootstrapFile = new URL('bootstrap-local-proof-env.py', localProof);
const protectedDesktopCredentialFile = new URL('protected-desktop-credential.mjs', localProof);
const desktopCredentialPolicyFile = new URL('desktop-credential-policy.mjs', localProof);
const receiptContractFile = new URL('receipt-contract.mjs', localProof);
const proofCountContractFile = new URL('proof-count-contract.mjs', localProof);
const countReaderFile = new URL('read-proof-counts.mjs', localProof);
const readmeFile = new URL('README.md', localProof);
const envExampleFile = new URL('.env.example', localProof);
const runScriptFile = new URL('run-local-proof.sh', localProof);
const dockerFile = new URL('Dockerfile', localProof);
const migrationsFile = new URL('apply-migrations.mjs', localProof);
const seedFile = new URL('seed-desktop-device.mjs', localProof);
const localProofGitignoreFile = new URL('.gitignore', localProof);

async function exists(url) {
  try {
    await access(url);
    return true;
  } catch {
    return false;
  }
}

function validAppliedReceipt() {
  return {
    schema_version: 'bss.sync_receipt.v1',
    server_batch_id: 'f0000000-0000-4000-8000-000000000001',
    idempotency_key: 'local-proof-receipt-contract',
    status: 'applied',
    accepted_count: 1,
    rejected_count: 0,
    duplicate_count: 0,
    validation_errors: [],
    server_clock: '2026-08-09T20:00:00.000Z',
  };
}

test('receipt contract requires a complete v1 durable receipt and canonical replay', () => {
  const first = validAppliedReceipt();
  assert.doesNotThrow(() => assertAppliedReceiptV1(first, {
    idempotencyKey: first.idempotency_key,
    acceptedCount: 1,
  }));

  const missingDuplicateCount = { ...first };
  delete missingDuplicateCount.duplicate_count;
  assert.throws(() => assertAppliedReceiptV1(missingDuplicateCount, {
    idempotencyKey: first.idempotency_key,
    acceptedCount: 1,
  }));
  assert.throws(() => assertAppliedReceiptV1({ ...first, unsupported_extension: true }, {
    idempotencyKey: first.idempotency_key,
    acceptedCount: 1,
  }));
  assert.throws(() => assertAppliedReceiptV1({ ...first, server_batch_id: 'not-a-uuid' }, {
    idempotencyKey: first.idempotency_key,
    acceptedCount: 1,
  }), /server batch ID/i);

  const replacements = {
    schema_version: 'bss.sync_receipt.v1.changed',
    server_batch_id: 'f0000000-0000-4000-8000-000000000002',
    idempotency_key: 'local-proof-receipt-contract-changed',
    status: 'changed',
    accepted_count: 2,
    rejected_count: 1,
    duplicate_count: 1,
    validation_errors: ['changed'],
    server_clock: '2026-08-09T20:00:01.000Z',
  };
  for (const [field, replacement] of Object.entries(replacements)) {
    const replay = { ...first, [field]: replacement };
    assert.throws(() => assertExactReceiptReplayV1(first, replay), `replay mutation of ${field} must fail`);
  }
});

function normalizeLineEndings(value) {
  return value.replace(/\r\n/g, '\n');
}

test('local proof stack is a disposable PostGIS/Caddy-only mTLS boundary', async () => {
  assert.equal(await exists(composeFile), true, 'local proof compose.yaml must exist');
  assert.equal(await exists(caddyFile), true, 'local proof Caddyfile must exist');
  assert.equal(await exists(frontdoorFile), true, 'loopback TCP front-door relay must exist');
  assert.equal(await exists(verifierFile), true, 'repeatable local proof verifier must exist');
  assert.equal(await exists(azureVerifierFile), true, 'bounded Azure mTLS smoke verifier must exist');
  assert.equal(await exists(azureSmokeOriginFile), true, 'exact Azure mTLS smoke origin guard must exist');
  assert.equal(await exists(bootstrapFile), true, 'protected environment bootstrap must exist');
  assert.equal(await exists(protectedDesktopCredentialFile), true, 'shared protected desktop credential verifier must exist');
  assert.equal(await exists(desktopCredentialPolicyFile), true, 'exact desktop credential policy must exist');
  assert.equal(await exists(receiptContractFile), true, 'strict durable receipt contract must exist');
  assert.equal(await exists(proofCountContractFile), true, 'strict proof count contract must exist');
  assert.equal(await exists(countReaderFile), true, 'container proof count reader must exist');
  assert.equal(await exists(readmeFile), true, 'local proof instructions must exist');
  assert.equal(await exists(envExampleFile), true, 'non-secret environment template must exist');
  assert.equal(await exists(runScriptFile), true, 'local proof compose wrapper must exist');
  assert.equal(await exists(dockerFile), true, 'local proof Dockerfile must exist');
  assert.equal(await exists(migrationsFile), true, 'local proof migration runner must exist');
  assert.equal(await exists(seedFile), true, 'local proof fingerprint-bound seed script must exist');
  assert.equal(await exists(localProofGitignoreFile), true, 'local proof ignore boundary must exist');

  const [compose, caddy, frontdoor, verifier, azureVerifier, azureSmokeOrigin, bootstrap, protectedDesktopCredential, desktopCredentialPolicy, receiptContract, proofCountContract, countReader, readme, envExample, runScript, dockerfile, migrations, seed, localProofGitignore] = (await Promise.all([
    readFile(composeFile, 'utf8'),
    readFile(caddyFile, 'utf8'),
    readFile(frontdoorFile, 'utf8'),
    readFile(verifierFile, 'utf8'),
    readFile(azureVerifierFile, 'utf8'),
    readFile(azureSmokeOriginFile, 'utf8'),
    readFile(bootstrapFile, 'utf8'),
    readFile(protectedDesktopCredentialFile, 'utf8'),
    readFile(desktopCredentialPolicyFile, 'utf8'),
    readFile(receiptContractFile, 'utf8'),
    readFile(proofCountContractFile, 'utf8'),
    readFile(countReaderFile, 'utf8'),
    readFile(readmeFile, 'utf8'),
    readFile(envExampleFile, 'utf8'),
    readFile(runScriptFile, 'utf8'),
    readFile(dockerFile, 'utf8'),
    readFile(migrationsFile, 'utf8'),
    readFile(seedFile, 'utf8'),
    readFile(localProofGitignoreFile, 'utf8'),
  ])).map(normalizeLineEndings);
  assert.match(compose, /postgis\/postgis:16-3\.5/);
  assert.match(compose, /api:/);
  assert.match(compose, /caddy:/);
  assert.match(compose, /frontdoor:/);
  assert.match(compose, /local-proof-postgis-data/);
  assert.match(compose, /caddy:[\s\S]*network_mode: "service:api"/);
  assert.match(compose, /frontdoor:[\s\S]*ports:[\s\S]*published: "18080"[\s\S]*host_ip: 127\.0\.0\.1/);
  assert.match(compose, /tcp-frontdoor\.mjs/);
  assert.match(compose, /frontdoor:[\s\S]*networks: \[edge, proof\]/);
  assert.match(compose, /proof:\n    internal: true/);
  assert.match(compose, /edge: \{\}/);
  assert.match(compose, /BSS_CYBERMAP_BIND_HOST=127\.0\.0\.1/);
  assert.match(compose, /DATABASE_URL=postgresql:\/\/\$\{POSTGRES_USER\}:\$\{POSTGRES_PASSWORD\}@postgres:5432\/\$\{POSTGRES_DB\}/);
  assert.doesNotMatch(compose, /:\*\*\*@postgres/);
  assert.doesNotMatch(compose, /(?:"|')?5432:5432(?:"|')?/);
  assert.doesNotMatch(compose, /(?:"|')?8080:8080(?:"|')?/);
  assert.match(dockerfile, /FROM node:24/);
  assert.match(caddy, /require_and_verify/);
  assert.match(caddy, /reverse_proxy 127\.0\.0\.1:8080/);
  assert.match(caddy, /trust_pool file \/certs\/desktop-client\.pem/);
  assert.match(caddy, /X-Blue-Swallow-Mtls-Proxy-Secret \{env\.BSS_MTLS_PROXY_SECRET\}/);
  assert.match(caddy, /X-Blue-Swallow-Mtls-Client-Fingerprint \{tls_client_fingerprint\}/);
  assert.match(frontdoor, /node:net/);
  assert.match(frontdoor, /createConnection/);
  assert.match(frontdoor, /client\.pipe\(upstream\)/);
  assert.match(frontdoor, /upstream\.pipe\(client\)/);
  assert.doesNotMatch(frontdoor, /(?:https?|tls|header[_-]?up|X-Blue-Swallow)/i);
  assert.match(verifier, /randomUUID/);
  assert.match(verifier, /BSS_LOCAL_PROOF_ENV_FILE/);
  assert.match(verifier, /loadProtectedEnvironmentFile/);
  assert.match(verifier, /MAX_LOCAL_JSON_RESPONSE_BYTES/);
  assert.match(verifier, /LOCAL_PROOF_ENVIRONMENT_KEYS/);
  assert.match(verifier, /EXPECTED_LOCAL_PROOF_ENV_FILE/);
  assert.match(verifier, /EXPECTED_LOCAL_CLIENT_P12/);
  assert.match(verifier, /readProtectedRegularFile/);
  assert.match(verifier, /assertProtectedDirectory/);
  assert.match(verifier, /protected-desktop-credential\.mjs/);
  assert.doesNotMatch(verifier, /async function assertProtectedRegularFile/);
  assert.match(verifier, /assertDesktopP12MatchesPublicCertificate/);
  assert.match(verifier, /assertExactReceiptReplayV1/);
  assert.match(verifier, /if \(!LOCAL_PROOF_ENVIRONMENT_KEYS\.has\(key\)\) continue;/);
  assert.match(verifier, /responseBytes > MAX_LOCAL_JSON_RESPONSE_BYTES/);
  assert.match(verifier, /Idempotent-Replayed/);
  assert.match(verifier, /schema_version: 'bss\.observation_batch\.v1'/);
  assert.match(verifier, /rejectUnauthorized: true/);
  assert.match(azureVerifier, /BSS_AZURE_MTLS_SMOKE_ORIGIN/);
  assert.match(azureVerifier, /BSS_AZURE_MTLS_CLIENT_P12/);
  assert.match(azureVerifier, /Idempotent-Replayed/);
  assert.match(azureVerifier, /rejectUnauthorized: true/);
  assert.match(azureVerifier, /synthetic_integration_marker/);
  assert.match(azureVerifier, /node:child_process/);
  assert.match(azureVerifier, /spawn\('curl'/);
  assert.match(azureVerifier, /MAX_AZURE_JSON_RESPONSE_BYTES/);
  assert.match(azureVerifier, /responseBytes \+= chunk\.length/);
  assert.match(azureVerifier, /responseBytes > MAX_AZURE_JSON_RESPONSE_BYTES/);
  assert.match(azureVerifier, /response\.destroy\(\)/);
  assert.match(azureVerifier, /--noproxy/);
  assert.match(azureVerifier, /readPasswordlessProtectedDesktopP12/);
  assert.match(azureVerifier, /assertExactReceiptReplayV1/);
  assert.match(protectedDesktopCredential, /assertDesktopP12MatchesPublicCertificate/);
  assert.match(protectedDesktopCredential, /assertRestrictedWindowsAcl/);
  assert.match(receiptContract, /duplicate_count/);
  assert.match(receiptContract, /server_clock/);
  assert.match(receiptContract, /assertExactFieldSet/);
  assert.match(receiptContract, /canonicalJson/);
  assert.match(proofCountContract, /desktop_source_count/);
  assert.match(proofCountContract, /desktop_credential_count/);
  assert.match(proofCountContract, /sync_batch_count/);
  assert.match(proofCountContract, /observation_count/);
  assert.match(countReader, /FROM source_catalog/);
  assert.match(countReader, /FROM device_ingest_credentials/);
  assert.match(countReader, /FROM sync_batches/);
  assert.match(countReader, /FROM observations/);
  assert.match(verifier, /readProofDatabaseCounts/);
  assert.match(verifier, /assertProofDatabaseCounts/);
  assert.match(verifier, /read-proof-counts\.mjs/);
  assert.match(runScript, /"\$\{1:-\}" == "proof"/);
  assert.match(runScript, /down --volumes --remove-orphans/);
  assert.match(runScript, /up --build --wait/);
  assert.match(runScript, /node local-proof\/verify-local-proof\.mjs/);
  assert.match(readme, /run-local-proof\.sh proof/);
  assert.match(azureSmokeOrigin, /APPROVED_AZURE_MTLS_SMOKE_HOST/);
  assert.doesNotMatch(azureSmokeOrigin, /\.endsWith\(/);
  assert.doesNotMatch(azureVerifier, /--insecure/);
  assert.doesNotMatch(azureVerifier, /rejectUnauthorized:\s*false/);
  assert.match(bootstrap, /DESKTOP_P12_NAME/);
  assert.match(bootstrap, /LOCAL_PROOF_ENVIRONMENT_FILE_NAME/);
  assert.doesNotMatch(bootstrap, /parser\.add_argument\('--desktop-p12'/);
  assert.match(bootstrap, /'--out',\s*required=True/);
  assert.match(bootstrap, /assert_no_reparse_components/);
  assert.match(bootstrap, /FILE_ATTRIBUTE_REPARSE_POINT/);
  assert.match(bootstrap, /assert_resolved_within_root/);
  assert.doesNotMatch(bootstrap, /assert_no_symlink_components/);
  assert.match(bootstrap, /expected_out = protected_env_root \/ LOCAL_PROOF_ENVIRONMENT_FILE_NAME/);
  assert.match(bootstrap, /os\.path\.normcase/);
  assert.doesNotMatch(bootstrap, /def assert_path_within/);
  assert.match(bootstrap, /assert_restricted_windows_acl/);
  assert.match(bootstrap, /open\('x', encoding='utf-8', newline='\\n'\)/);
  assert.match(bootstrap, /LOCALAPPDATA/);
  assert.match(bootstrap, /BSS_LOCAL_CLIENT_P12/);
  assert.match(bootstrap, /BSS_LOCAL_CA_CERT/);
  assert.match(bootstrap, /BSS_DESKTOP_CLIENT_CERT_PEM/);
  assert.match(bootstrap, /BSS_MTLS_PROXY_SECRET/);
  assert.match(bootstrap, /LOCAL_MTLS_CERT_FINGERPRINT/);
  assert.match(bootstrap, /assert_passwordless_p12_matches_desktop_certificate/);
  assert.doesNotMatch(bootstrap, /PROXY_SHARED_SECRET/);
  assert.doesNotMatch(bootstrap, /BSS_LOCAL_CERT_FINGERPRINT/);
  assert.match(envExample, /BSS_LOCAL_CLIENT_P12/);
  assert.match(envExample, /BSS_LOCAL_CA_CERT/);
  assert.match(readme, /adb -s emulator-5554 reverse tcp:18080 tcp:18080/);
  assert.match(readme, /closed v1 durable receipt schema/);
  assert.doesNotMatch(readme, /--lab-dir|--desktop-cert|--desktop-p12|--local-ca/);
  assert.match(readme, /passwordless PKCS#12/);
  assert.match(runScript, /cd -- "\$root\/\.\."/);
  assert.match(runScript, /-f local-proof\/compose\.yaml/);
  assert.doesNotMatch(runScript, /-f "\$root\/compose\.yaml"/);
  assert.match(migrations, /0006_best_effort_observation_progress\.sql/);
  assert.match(migrations, /connectWithRetry/);
  assert.match(migrations, /DATABASE_READY_TIMEOUT_MS/);
  assert.match(migrations, /ECONNREFUSED/);
  assert.match(seed, /assertDesktopSourcePolicy/);
  assert.match(seed, /assertDesktopCredentialPolicy/);
  assert.match(seed, /ON CONFLICT \(source_key\) DO NOTHING/);
  assert.match(seed, /FOR UPDATE OF credential/);
  assert.match(desktopCredentialPolicy, /mtls_certificate_fingerprint/);
  assert.match(seed, /retains_raw_payload/);
  assert.match(seed, /cache_ttl_seconds/);
  assert.match(seed, /terms_reviewed/);
  assert.doesNotMatch(seed, /\b(?:layer_id|display_order|terms_reviewed_at|attribution_text|fresh_after_seconds|stale_after_seconds|global_layer|normalizer_version)\b/);
  assert.match(desktopCredentialPolicy, /wardriver-desktop-dev-2026/);
  assert.match(desktopCredentialPolicy, /REQUIRED_DESKTOP_SCOPES/);
  assert.match(seed, /\^\[a-f0-9\]\{64\}\$/);
  assert.match(localProofGitignore, /^\*\.env$/m);
  assert.match(localProofGitignore, /^\*\.pfx$/m);
  assert.match(localProofGitignore, /^\*\.p12$/m);
  const distributableArtifacts = `${compose}\n${caddy}\n${frontdoor}\n${readme}\n${envExample}\n${runScript}\n${dockerfile}\n${migrations}\n${seed}\n${desktopCredentialPolicy}\n${receiptContract}\n${proofCountContract}\n${countReader}`;
  assert.doesNotMatch(distributableArtifacts, /BEGIN (?:ENCRYPTED )?PRIVATE KEY|\.pfx\b/i);
  assert.doesNotMatch(`${verifier}\n${azureVerifier}\n${bootstrap}\n${protectedDesktopCredential}\n${desktopCredentialPolicy}\n${receiptContract}\n${proofCountContract}\n${countReader}`, /BEGIN (?:ENCRYPTED )?PRIVATE KEY/i);
});
